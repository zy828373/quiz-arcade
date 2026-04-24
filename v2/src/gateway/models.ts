import type { IncomingHttpHeaders, ServerResponse } from 'node:http';

import type { Logger } from '../logging/logger.ts';
import type { UpstreamClient } from './upstream-client.ts';

export type GatewayMode = 'legacy' | 'parallel' | 'canary' | 'primary';
export type GatewayProtocol = 'openai' | 'anthropic';
export type GatewayOperation = 'list_models' | 'chat_completions' | 'messages';
export type GatewayDecisionSource = 'scheduler_cli' | 'gateway_proxy';
export type GatewayExecutionDisposition = 'dry_run' | 'observational_execution' | 'actual_execution';

export type AuthContext = {
  authenticated: true;
  keyFingerprint: string;
  principal: 'accepted_client_key' | 'synthetic_client_key';
  protocol: GatewayProtocol;
  scheme: 'bearer' | 'x-api-key';
};

export type OperatorAuthContext = {
  authenticated: true;
  keyFingerprint: string;
  operatorId: string;
  principal: 'operator_key';
  scheme: 'bearer' | 'x-operator-key';
};

export type UpstreamTargetConfig = {
  anthropicTargetModel: string;
  apiKey: string | null;
  baseUrl: string;
  name: string;
  timeoutMs: number;
};

export type GatewayRuntimeConfig = {
  inboundClientApiKeys: string[];
  mode: GatewayMode;
  operatorApiKeys: string[];
  syntheticProbeApiKeys: string[];
  upstream: UpstreamTargetConfig;
};

export type NormalizedTextMessage = {
  content: string;
  role: 'assistant' | 'system' | 'tool' | 'user';
};

export type NormalizedGatewayRequest = {
  adapterId: string;
  clientModel: string | null;
  maxTokens: number | null;
  messages: NormalizedTextMessage[];
  operation: GatewayOperation;
  protocol: GatewayProtocol;
  rawBody: Record<string, unknown> | null;
  requestId: string;
  routePath: string;
  stop: string | string[] | null;
  stream: boolean;
  systemPrompt: string | null;
  temperature: number | null;
  topP: number | null;
  upstreamBody: string | null;
  upstreamMethod: 'GET' | 'POST';
  upstreamModel: string | null;
  upstreamPath: string;
};

export type GatewayJsonResponse = {
  body: unknown;
  contentType?: string;
  kind: 'json';
  statusCode: number;
};

export type GatewayStreamResponse = {
  contentType: string;
  kind: 'stream';
  statusCode: number;
  writeToResponse: (res: ServerResponse) => Promise<void>;
};

export type GatewayAdapterResponse = GatewayJsonResponse | GatewayStreamResponse;

export type GatewayAdapterInput = {
  body: unknown | null;
  headers: IncomingHttpHeaders;
  method: string;
  path: string;
  protocol: GatewayProtocol;
  requestId: string;
  runtimeConfig: GatewayRuntimeConfig;
};

export type GatewayAdapterContext = {
  authContext: AuthContext;
  logger: Logger;
  runtimeConfig: GatewayRuntimeConfig;
  upstreamClient: UpstreamClient;
};

export interface GatewayAdapter {
  executeJson?(request: NormalizedGatewayRequest, context: GatewayAdapterContext): Promise<GatewayJsonResponse>;
  executeStream?(request: NormalizedGatewayRequest, context: GatewayAdapterContext): Promise<GatewayStreamResponse>;
  id: string;
  normalizeRequest(input: GatewayAdapterInput): NormalizedGatewayRequest;
  operation: GatewayOperation;
  protocol: GatewayProtocol | 'shared';
}
