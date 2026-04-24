import type { ServerResponse } from 'node:http';

import {
  createAnthropicMessageId,
  extractTextContent,
  mapOpenAIFinishReason,
  normalizeAnthropicMessages,
  normalizeAnthropicSystem,
  numberOrZero,
  optionalBoolean,
  optionalNumber,
  optionalStopSequence,
  optionalString,
  requireObject,
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

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createUpstreamBody(request: {
  maxTokens: number | null;
  messages: Array<{ content: string; role: string }>;
  stop: string | string[] | null;
  stream: boolean;
  temperature: number | null;
  topP: number | null;
  upstreamModel: string;
}): string {
  const payload: Record<string, unknown> = {
    model: request.upstreamModel,
    messages: request.messages,
    stream: request.stream,
  };

  if (request.maxTokens !== null) {
    payload.max_tokens = request.maxTokens;
  }

  if (request.temperature !== null) {
    payload.temperature = request.temperature;
  }

  if (request.topP !== null) {
    payload.top_p = request.topP;
  }

  if (request.stop !== null) {
    payload.stop = request.stop;
  }

  return JSON.stringify(payload);
}

function convertOpenAIToAnthropicResponse(
  payload: unknown,
  clientModel: string | null,
): Record<string, unknown> {
  const response = isRecord(payload) ? payload : {};
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const firstChoice = isRecord(choices[0]) ? choices[0] : null;
  const message = isRecord(firstChoice?.message) ? firstChoice.message : null;
  const usage = isRecord(response.usage) ? response.usage : {};
  const responseModel = optionalString(response.model);

  return {
    id: createAnthropicMessageId(),
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: extractTextContent(message?.content ?? '', 'choices[0].message.content'),
      },
    ],
    model: clientModel ?? responseModel ?? 'unknown',
    stop_reason: mapOpenAIFinishReason(firstChoice?.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: numberOrZero(usage.prompt_tokens),
      output_tokens: numberOrZero(usage.completion_tokens),
    },
  };
}

function extractStreamDeltaText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is JsonRecord => isRecord(entry))
      .map((entry) => (typeof entry.text === 'string' ? entry.text : ''))
      .join('\n');
  }

  return '';
}

async function writeAnthropicStream(
  response: Response,
  res: ServerResponse,
  clientModel: string | null,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new GatewayError(502, 'api_error', 'Upstream stream body is empty', 'upstream_empty_stream');
  }

  const messageId = createAnthropicMessageId();
  let buffer = '';
  let outputTokens = 0;
  let sentMessageStart = false;
  let sentBlockStart = false;

  const sendSse = (event: string, payload: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  const finalize = (stopReason: 'end_turn' | 'max_tokens' | 'tool_use' = 'end_turn') => {
    if (sentBlockStart) {
      sendSse('content_block_stop', {
        type: 'content_block_stop',
        index: 0,
      });
      sentBlockStart = false;
    }

    if (sentMessageStart) {
      sendSse('message_delta', {
        type: 'message_delta',
        delta: {
          stop_reason: stopReason,
          stop_sequence: null,
        },
        usage: {
          output_tokens: outputTokens,
        },
      });
      sendSse('message_stop', { type: 'message_stop' });
    }

    if (!res.writableEnded) {
      res.end();
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += Buffer.from(value ?? new Uint8Array()).toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data: ')) {
          continue;
        }

        const data = line.slice(6);
        if (data === '[DONE]') {
          finalize();
          return;
        }

        let parsed: JsonRecord;
        try {
          parsed = requireObject(JSON.parse(data), 'upstream_sse_chunk');
        } catch {
          continue;
        }

        const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
        const firstChoice = isRecord(choices[0]) ? choices[0] : null;
        if (!firstChoice) {
          continue;
        }

        const delta = isRecord(firstChoice.delta) ? firstChoice.delta : null;
        const deltaText = extractStreamDeltaText(delta?.content);

        if (!sentMessageStart) {
          sendSse('message_start', {
            type: 'message_start',
            message: {
              id: messageId,
              type: 'message',
              role: 'assistant',
              content: [],
              model: clientModel ?? optionalString(parsed.model) ?? 'unknown',
              stop_reason: null,
              stop_sequence: null,
              usage: {
                input_tokens: 0,
                output_tokens: 0,
              },
            },
          });
          sentMessageStart = true;
        }

        if (!sentBlockStart && (deltaText !== '' || typeof delta?.role === 'string')) {
          sendSse('content_block_start', {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'text',
              text: '',
            },
          });
          sentBlockStart = true;
        }

        if (deltaText !== '') {
          outputTokens += 1;
          sendSse('content_block_delta', {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'text_delta',
              text: deltaText,
            },
          });
        }

        const finishReason =
          typeof firstChoice.finish_reason === 'string' ? mapOpenAIFinishReason(firstChoice.finish_reason) : null;
        if (finishReason) {
          finalize(finishReason);
          return;
        }
      }
    }

    finalize();
  } finally {
    reader.releaseLock();
  }
}

export class AnthropicMessagesAdapter implements GatewayAdapter {
  id = 'anthropic.messages';
  operation = 'messages' as const;
  protocol = 'anthropic' as const;

  normalizeRequest(input: GatewayAdapterInput): NormalizedGatewayRequest {
    if (input.method !== 'POST') {
      throw new GatewayError(405, 'invalid_request_error', 'POST /v1/messages only supports POST', 'method_not_allowed');
    }

    const body = requireObject(input.body, 'body');
    const messages = normalizeAnthropicMessages(body.messages);
    const systemPrompt = normalizeAnthropicSystem(body.system);
    const stream = optionalBoolean(body.stream, 'stream') ?? false;
    const clientModel = optionalString(body.model);
    const upstreamModel = input.runtimeConfig.upstream.anthropicTargetModel;
    const upstreamMessages = [
      ...(systemPrompt
        ? [
            {
              role: 'system',
              content: systemPrompt,
            },
          ]
        : []),
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ];

    return {
      adapterId: this.id,
      clientModel,
      maxTokens: optionalNumber(body.max_tokens, 'max_tokens'),
      messages,
      operation: this.operation,
      protocol: 'anthropic',
      rawBody: body,
      requestId: input.requestId,
      routePath: input.path,
      stop: optionalStopSequence(body.stop, 'stop'),
      stream,
      systemPrompt,
      temperature: optionalNumber(body.temperature, 'temperature'),
      topP: optionalNumber(body.top_p, 'top_p'),
      upstreamBody: createUpstreamBody({
        maxTokens: optionalNumber(body.max_tokens, 'max_tokens'),
        messages: upstreamMessages,
        stop: optionalStopSequence(body.stop, 'stop'),
        stream,
        temperature: optionalNumber(body.temperature, 'temperature'),
        topP: optionalNumber(body.top_p, 'top_p'),
        upstreamModel,
      }),
      upstreamMethod: 'POST',
      upstreamModel,
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

    return {
      kind: 'json',
      statusCode: result.response.status,
      body: convertOpenAIToAnthropicResponse(result.json, request.clientModel),
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
      contentType: 'text/event-stream; charset=utf-8',
      kind: 'stream',
      statusCode: response.status,
      writeToResponse: async (res) => writeAnthropicStream(response, res, request.clientModel),
    };
  }
}
