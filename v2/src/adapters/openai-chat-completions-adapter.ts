import type { ServerResponse } from 'node:http';

import {
  normalizeOpenAIMessages,
  optionalBoolean,
  optionalNumber,
  optionalStopSequence,
  optionalString,
  requireObject,
  requireString,
} from './adapter-utils.ts';
import { GatewayError } from '../gateway/errors.ts';
import type {
  GatewayAdapter,
  GatewayAdapterContext,
  GatewayAdapterInput,
  GatewayJsonResponse,
  GatewayStreamResponse,
  NormalizedGatewayRequest,
} from '../gateway/models.ts';

type OpenAiCompletionChoice = {
  finish_reason?: string | null;
  index?: number;
  message?: {
    content?: string | null;
    role?: string | null;
    tool_calls?: unknown[] | null;
  } | null;
  native_finish_reason?: string | null;
};

type OpenAiCompletionPayload = {
  choices?: OpenAiCompletionChoice[];
  created?: number;
  id?: string;
  model?: string;
  object?: string;
  usage?: Record<string, unknown>;
};

type OpenAiChunkPayload = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      role?: string | null;
      tool_calls?: unknown[] | null;
    } | null;
    finish_reason?: string | null;
    index?: number;
    native_finish_reason?: string | null;
  }>;
  created?: number;
  id?: string;
  model?: string;
  object?: string;
  usage?: Record<string, unknown>;
};

async function pipeUpstreamStreamToResponse(response: Response, res: ServerResponse): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new GatewayError(502, 'api_error', 'Upstream stream body is empty', 'upstream_empty_stream');
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        res.write(Buffer.from(value));
      }
    }
  } finally {
    reader.releaseLock();
    if (!res.writableEnded) {
      res.end();
    }
  }
}

function parseJsonSafely(rawText: string): unknown | null {
  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function shouldRepairNullContent(payload: unknown): payload is OpenAiCompletionPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const parsed = payload as OpenAiCompletionPayload;
  const firstChoice = parsed.choices?.[0];
  const firstMessage = firstChoice?.message;

  return (
    parsed.object === 'chat.completion' &&
    Array.isArray(parsed.choices) &&
    parsed.choices.length > 0 &&
    firstMessage?.role === 'assistant' &&
    firstMessage.content == null &&
    !Array.isArray(firstMessage.tool_calls)
  );
}

function buildStreamingRepairBody(upstreamBody: string | null): string {
  const parsed = parseJsonSafely(upstreamBody ?? '');
  const requestBody =
    parsed && typeof parsed === 'object'
      ? { ...(parsed as Record<string, unknown>), stream: true }
      : { stream: true };

  return JSON.stringify(requestBody);
}

async function repairNullContentFromStream(
  request: NormalizedGatewayRequest,
  context: GatewayAdapterContext,
): Promise<GatewayJsonResponse | null> {
  const response = await context.upstreamClient.requestStream({
    body: buildStreamingRepairBody(request.upstreamBody),
    method: request.upstreamMethod,
    path: request.upstreamPath,
    target: context.runtimeConfig.upstream,
  });
  const streamText = await response.text();
  const lines = streamText.split(/\r?\n/);

  let content = '';
  let completionId = 'chatcmpl-repaired';
  let created = Math.floor(Date.now() / 1000);
  let model = request.upstreamModel ?? request.clientModel ?? 'unknown';
  let finishReason: string | null = 'stop';
  let nativeFinishReason: string | null = null;
  let role = 'assistant';
  let usage: Record<string, unknown> | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) {
      continue;
    }

    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') {
      continue;
    }

    const parsed = parseJsonSafely(data) as OpenAiChunkPayload | null;
    if (!parsed) {
      continue;
    }

    completionId = parsed.id ?? completionId;
    created = parsed.created ?? created;
    model = parsed.model ?? model;
    usage = parsed.usage ?? usage;

    const choice = parsed.choices?.[0];
    const delta = choice?.delta;
    if (typeof delta?.role === 'string' && delta.role.length > 0) {
      role = delta.role;
    }

    if (typeof delta?.content === 'string' && delta.content.length > 0) {
      content += delta.content;
    }

    if (choice?.finish_reason !== undefined) {
      finishReason = choice.finish_reason ?? finishReason;
    }

    if (choice?.native_finish_reason !== undefined) {
      nativeFinishReason = choice.native_finish_reason ?? nativeFinishReason;
    }
  }

  if (!content) {
    return null;
  }

  return {
    kind: 'json',
    statusCode: 200,
    body: {
      id: completionId,
      object: 'chat.completion',
      created,
      model,
      choices: [
        {
          index: 0,
          message: {
            role,
            content,
            reasoning_content: null,
            tool_calls: null,
          },
          finish_reason: finishReason,
          native_finish_reason: nativeFinishReason,
        },
      ],
      ...(usage ? { usage } : {}),
    },
  };
}

export class OpenAIChatCompletionsAdapter implements GatewayAdapter {
  id = 'openai.chat_completions';
  operation = 'chat_completions' as const;
  protocol = 'openai' as const;

  normalizeRequest(input: GatewayAdapterInput): NormalizedGatewayRequest {
    if (input.method !== 'POST') {
      throw new GatewayError(
        405,
        'invalid_request_error',
        'POST /v1/chat/completions only supports POST',
        'method_not_allowed',
      );
    }

    const body = requireObject(input.body, 'body');
    const model = requireString(body.model, 'model');
    const stream = optionalBoolean(body.stream, 'stream') ?? false;

    return {
      adapterId: this.id,
      clientModel: model,
      maxTokens: optionalNumber(body.max_tokens, 'max_tokens'),
      messages: normalizeOpenAIMessages(body.messages),
      operation: this.operation,
      protocol: 'openai',
      rawBody: body,
      requestId: input.requestId,
      routePath: input.path,
      stop: optionalStopSequence(body.stop, 'stop'),
      stream,
      systemPrompt: null,
      temperature: optionalNumber(body.temperature, 'temperature'),
      topP: optionalNumber(body.top_p, 'top_p'),
      upstreamBody: JSON.stringify(body),
      upstreamMethod: 'POST',
      upstreamModel: optionalString(body.model),
      upstreamPath: '/v1/chat/completions',
    };
  }

  async executeJson(
    request: NormalizedGatewayRequest,
    context: GatewayAdapterContext,
  ): Promise<GatewayJsonResponse> {
    const result = await context.upstreamClient.requestJson({
      body: request.upstreamBody,
      method: request.upstreamMethod,
      path: request.upstreamPath,
      target: context.runtimeConfig.upstream,
    });

    if (shouldRepairNullContent(result.json)) {
      const repaired = await repairNullContentFromStream(request, context);
      if (repaired) {
        context.logger.warn('gateway.openai_json_repaired_from_stream', {
          requestId: request.requestId,
          routePath: request.routePath,
          upstreamPath: request.upstreamPath,
        });
        return repaired;
      }
    }

    return {
      kind: 'json',
      statusCode: result.response.status,
      body: result.json,
    };
  }

  async executeStream(
    request: NormalizedGatewayRequest,
    context: GatewayAdapterContext,
  ): Promise<GatewayStreamResponse> {
    const response = await context.upstreamClient.requestStream({
      body: request.upstreamBody,
      method: request.upstreamMethod,
      path: request.upstreamPath,
      target: context.runtimeConfig.upstream,
    });

    return {
      contentType: response.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
      kind: 'stream',
      statusCode: response.status,
      writeToResponse: async (res) => pipeUpstreamStreamToResponse(response, res),
    };
  }
}
