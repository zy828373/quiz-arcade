import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { AnthropicMessagesAdapter } from '../adapters/anthropic-messages-adapter.ts';
import { OpenAIChatCompletionsAdapter } from '../adapters/openai-chat-completions-adapter.ts';
import { SharedModelsAdapter } from '../adapters/shared-models-adapter.ts';
import type { AppConfig } from '../config/app-config.ts';
import { Logger } from '../logging/logger.ts';
import type { ShadowScheduler } from '../routing/shadow-scheduler.ts';
import { authenticateGatewayRequest } from './auth.ts';
import { GatewayError, writeProtocolError } from './errors.ts';
import type {
  GatewayAdapter,
  GatewayExecutionDisposition,
  GatewayProtocol,
  GatewayAdapterContext,
  NormalizedGatewayRequest,
} from './models.ts';
import { readJsonBody } from './request-body.ts';
import { loadGatewayRuntimeConfig } from './runtime-config.ts';
import { UpstreamClient } from './upstream-client.ts';

type RouteDefinition = {
  adapter: GatewayAdapter;
  executionDisposition?: GatewayExecutionDisposition;
  method: 'GET' | 'POST';
  path: '/v1/models' | '/v1/chat/completions' | '/v1/messages';
  protocol: GatewayProtocol;
  persistShadowDecision: boolean;
};

function toGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) {
    return error;
  }

  return new GatewayError(500, 'api_error', 'Internal gateway error', 'internal_error');
}

function buildGatewayHeaders(
  mode: string,
  protocol: GatewayProtocol,
  decisionId: string | null,
  executionDisposition: GatewayExecutionDisposition | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-codex-gateway-mode': mode,
    'x-codex-gateway-protocol': protocol,
  };

  if (decisionId) {
    headers['x-codex-shadow-decision-id'] = decisionId;
  }

  if (executionDisposition) {
    headers['x-codex-execution-disposition'] = executionDisposition;
  }

  return headers;
}

export class ParallelGateway {
  config: Pick<AppConfig, 'workspaceRoot'>;
  logger: Logger;
  routes: RouteDefinition[];
  scheduler: ShadowScheduler;
  upstreamClient: UpstreamClient;

  constructor(
    config: Pick<AppConfig, 'workspaceRoot'>,
    scheduler: ShadowScheduler,
    logger: Logger,
  ) {
    this.config = config;
    this.scheduler = scheduler;
    this.logger = logger;
    this.upstreamClient = new UpstreamClient(logger.child({ component: 'gateway_upstream' }));
    this.routes = [
      {
        adapter: new SharedModelsAdapter(),
        method: 'GET',
        path: '/v1/models',
        protocol: 'openai',
        persistShadowDecision: false,
      },
      {
        adapter: new OpenAIChatCompletionsAdapter(),
        executionDisposition: 'observational_execution',
        method: 'POST',
        path: '/v1/chat/completions',
        protocol: 'openai',
        persistShadowDecision: true,
      },
      {
        adapter: new AnthropicMessagesAdapter(),
        executionDisposition: 'observational_execution',
        method: 'POST',
        path: '/v1/messages',
        protocol: 'anthropic',
        persistShadowDecision: true,
      },
    ];
  }

  canHandle(method: string, path: string): boolean {
    return this.routes.some((route) => route.method === method && route.path === path);
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const method = (req.method ?? 'GET').toUpperCase();
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const route = this.routes.find((entry) => entry.method === method && entry.path === requestUrl.pathname);

    if (!route) {
      return false;
    }

    const requestId = randomUUID();
    const runtimeConfig = loadGatewayRuntimeConfig(this.config.workspaceRoot);
    const baseHeaders = buildGatewayHeaders(runtimeConfig.mode, route.protocol, null, route.executionDisposition);
    const startedAt = Date.now();
    let resolvedAuthPrincipal: string | null = null;
    let resolvedAuthScheme: string | null = null;
    let decisionId: string | null = null;
    let requestModel: string | null = null;

    try {
      const authContext = authenticateGatewayRequest(
        req.headers,
        runtimeConfig,
        route.protocol,
      );
      resolvedAuthPrincipal = authContext.principal;
      resolvedAuthScheme = authContext.scheme;
      const body = route.method === 'POST' ? await readJsonBody(req) : null;
      const normalizedRequest = route.adapter.normalizeRequest({
        body,
        headers: req.headers,
        method: route.method,
        path: route.path,
        protocol: route.protocol,
        requestId,
        runtimeConfig,
      });

      const decision = route.persistShadowDecision
        ? this.scheduler.persistDecision({
            model: normalizedRequest.clientModel ?? normalizedRequest.upstreamModel,
            protocol: normalizedRequest.protocol,
            requestContext: {
              adapterId: normalizedRequest.adapterId,
              authPrincipal: authContext.principal,
              authScheme: authContext.scheme,
              decisionSource: 'gateway_proxy',
              executionDisposition: route.executionDisposition ?? 'dry_run',
              gatewayMode: runtimeConfig.mode,
              operation: normalizedRequest.operation,
              requestId: normalizedRequest.requestId,
              routePath: normalizedRequest.routePath,
              upstreamTarget: runtimeConfig.upstream.name,
            },
          })
        : null;
      decisionId = decision?.decisionId ?? null;
      requestModel = normalizedRequest.clientModel ?? normalizedRequest.upstreamModel ?? null;
      const responseHeaders = buildGatewayHeaders(
        runtimeConfig.mode,
        route.protocol,
        decisionId,
        route.executionDisposition,
      );
      const adapterContext = {
        authContext,
        logger: this.logger.child({
          adapter: route.adapter.id,
          operation: normalizedRequest.operation,
          protocol: normalizedRequest.protocol,
          requestId,
        }),
        runtimeConfig,
        upstreamClient: this.upstreamClient,
      };

      await this.respond(
        res,
        normalizedRequest,
        route.adapter,
        adapterContext,
        responseHeaders,
      );

      this.logger.info('gateway.request_completed', {
        decisionId,
        method: route.method,
        operation: normalizedRequest.operation,
        path: route.path,
        protocol: route.protocol,
        requestId,
        stream: normalizedRequest.stream,
      });
      this.recordGatewayRequestActivity({
        activityType: this.resolveActivityType(resolvedAuthPrincipal),
        authPrincipal: resolvedAuthPrincipal,
        authScheme: resolvedAuthScheme,
        decisionId,
        durationMs: Date.now() - startedAt,
        errorCode: null,
        outcome: 'success',
        protocol: route.protocol,
        requestId,
        requestModel,
        routePath: route.path,
        statusCode: 200,
      });
    } catch (error) {
      const gatewayError = toGatewayError(error);

      this.logger.error('gateway.request_failed', {
        code: gatewayError.code,
        method: route.method,
        path: route.path,
        protocol: route.protocol,
        requestId,
        statusCode: gatewayError.statusCode,
      });
      this.recordGatewayRequestActivity({
        activityType: this.resolveActivityType(resolvedAuthPrincipal),
        authPrincipal: resolvedAuthPrincipal,
        authScheme: resolvedAuthScheme,
        decisionId,
        durationMs: Date.now() - startedAt,
        errorCode: gatewayError.code,
        outcome: 'failure',
        protocol: route.protocol,
        requestId,
        requestModel,
        routePath: route.path,
        statusCode: gatewayError.statusCode,
      });

      if (!res.headersSent) {
        writeProtocolError(res, route.protocol, gatewayError, baseHeaders);
      } else if (!res.writableEnded) {
        res.end();
      }
    }

    return true;
  }

  private resolveActivityType(authPrincipal: string | null): 'external' | 'synthetic' | 'unknown' {
    if (authPrincipal === 'accepted_client_key') {
      return 'external';
    }

    if (authPrincipal === 'synthetic_client_key') {
      return 'synthetic';
    }

    return 'unknown';
  }

  private recordGatewayRequestActivity(input: {
    activityType: 'external' | 'synthetic' | 'unknown';
    authPrincipal: string | null;
    authScheme: string | null;
    decisionId: string | null;
    durationMs: number;
    errorCode: string | null;
    outcome: 'success' | 'failure';
    protocol: GatewayProtocol;
    requestId: string;
    requestModel: string | null;
    routePath: string;
    statusCode: number;
  }): void {
    try {
      const occurredAt = new Date().toISOString();
      this.scheduler.database.db.prepare(`
        INSERT INTO gateway_request_activity (
          activity_id,
          occurred_at,
          request_id,
          decision_id,
          protocol,
          route_path,
          request_model,
          activity_type,
          auth_principal,
          auth_scheme,
          outcome,
          status_code,
          error_code,
          duration_ms,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        occurredAt,
        input.requestId,
        input.decisionId,
        input.protocol,
        input.routePath,
        input.requestModel,
        input.activityType,
        input.authPrincipal,
        input.authScheme,
        input.outcome,
        input.statusCode,
        input.errorCode,
        input.durationMs,
        occurredAt,
      );
    } catch (error) {
      this.logger.error('gateway.request_activity_persist_failed', {
        error: error instanceof Error ? error.message : String(error),
        requestId: input.requestId,
        routePath: input.routePath,
      });
    }
  }

  private async respond(
    res: ServerResponse,
    request: NormalizedGatewayRequest,
    adapter: GatewayAdapter,
    context: GatewayAdapterContext,
    headers: Record<string, string>,
  ): Promise<void> {
    if (request.stream) {
      if (!adapter.executeStream) {
        throw new GatewayError(400, 'invalid_request_error', 'Streaming is not supported for this route', 'unsupported_stream');
      }

      const response = await adapter.executeStream(request, context);
      res.writeHead(response.statusCode, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': response.contentType,
        'X-Accel-Buffering': 'no',
        ...headers,
      });
      await response.writeToResponse(res);
      return;
    }

    if (!adapter.executeJson) {
      throw new GatewayError(500, 'api_error', 'Adapter is missing JSON execution support', 'adapter_misconfigured');
    }

    const response = await adapter.executeJson(request, context);
    res.writeHead(response.statusCode, {
      'Content-Type': response.contentType ?? 'application/json; charset=utf-8',
      ...headers,
    });
    res.end(JSON.stringify(response.body));
  }
}
