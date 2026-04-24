import { GatewayError } from '../gateway/errors.ts';
import type {
  GatewayAdapter,
  GatewayAdapterContext,
  GatewayAdapterInput,
  GatewayJsonResponse,
  NormalizedGatewayRequest,
} from '../gateway/models.ts';

const ANTHROPIC_COMPATIBLE_MODELS = [
  'claude-sonnet-4-5-20250514',
  'claude-sonnet-4-6-20260320',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5-20250514',
  'claude-sonnet-4-5',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-opus-4-5',
  'claude-opus-4-6',
  'claude-opus-4-6-20260320',
];

type ModelsListPayload = {
  data: Array<Record<string, unknown>>;
  object: 'list';
};

function normalizeModelsPayload(rawValue: unknown): ModelsListPayload {
  const payload =
    typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue)
      ? rawValue as { data?: unknown; object?: unknown }
      : {};

  const upstreamModels = Array.isArray(payload.data)
    ? payload.data.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    : [];
  const knownIds = new Set<string>();
  const data: Array<Record<string, unknown>> = [];

  for (const entry of upstreamModels) {
    const id = typeof entry.id === 'string' ? entry.id : null;
    if (id) {
      knownIds.add(id);
    }

    data.push(entry);
  }

  const createdAt = Math.floor(Date.now() / 1000);
  for (const modelId of ANTHROPIC_COMPATIBLE_MODELS) {
    if (knownIds.has(modelId)) {
      continue;
    }

    data.push({
      id: modelId,
      object: 'model',
      created: createdAt,
      owned_by: 'anthropic_compat',
    });
  }

  return {
    object: 'list',
    data,
  };
}

export class SharedModelsAdapter implements GatewayAdapter {
  id = 'shared.models';
  operation = 'list_models' as const;
  protocol = 'shared' as const;

  normalizeRequest(input: GatewayAdapterInput): NormalizedGatewayRequest {
    if (input.method !== 'GET') {
      throw new GatewayError(405, 'invalid_request_error', 'GET /v1/models only supports GET', 'method_not_allowed');
    }

    return {
      adapterId: this.id,
      clientModel: null,
      maxTokens: null,
      messages: [],
      operation: this.operation,
      protocol: 'openai',
      rawBody: null,
      requestId: input.requestId,
      routePath: input.path,
      stop: null,
      stream: false,
      systemPrompt: null,
      temperature: null,
      topP: null,
      upstreamBody: null,
      upstreamMethod: 'GET',
      upstreamModel: null,
      upstreamPath: '/v1/models',
    };
  }

  async executeJson(
    request: NormalizedGatewayRequest,
    context: GatewayAdapterContext,
  ): Promise<GatewayJsonResponse> {
    const result = await context.upstreamClient.requestJson({
      method: request.upstreamMethod,
      path: request.upstreamPath,
      target: context.runtimeConfig.upstream,
    });

    return {
      kind: 'json',
      statusCode: result.response.status,
      body: normalizeModelsPayload(result.json),
    };
  }
}
