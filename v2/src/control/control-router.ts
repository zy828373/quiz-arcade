import type { IncomingMessage, ServerResponse } from 'node:http';

import type { AppConfig } from '../config/app-config.ts';
import { GatewayError } from '../gateway/errors.ts';
import { readJsonBody } from '../gateway/request-body.ts';
import { loadGatewayRuntimeConfig } from '../gateway/runtime-config.ts';
import type { Logger } from '../logging/logger.ts';
import { authenticateOperatorRequest } from './control-auth.ts';
import { ControlError, writeControlError } from './control-errors.ts';
import { renderOpsConsole } from './ops-page.ts';
import { ControlPlaneService } from './control-service.ts';

function writeJson(statusCode: number, payload: unknown, res: ServerResponse): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

function writeHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
  });
  res.end(html);
}

function toControlError(error: unknown): ControlError {
  if (error instanceof ControlError) {
    return error;
  }

  if (error instanceof GatewayError) {
    return new ControlError(error.statusCode, error.category, error.message, error.code);
  }

  return new ControlError(500, 'api_error', 'Internal control plane error', 'control_internal_error');
}

function requireStringField(body: Record<string, unknown>, fieldName: string): string {
  const value = body[fieldName];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ControlError(400, 'invalid_request_error', `Missing field: ${fieldName}`, 'invalid_request_body');
  }

  return value.trim();
}

function requireCutoverModeField(
  body: Record<string, unknown>,
  fieldName: string,
): 'legacy' | 'parallel' | 'canary' | 'primary' {
  const value = requireStringField(body, fieldName);

  if (value === 'legacy' || value === 'parallel' || value === 'canary' || value === 'primary') {
    return value;
  }

  throw new ControlError(
    400,
    'invalid_request_error',
    `Invalid cutover mode: ${value}`,
    'invalid_cutover_mode',
  );
}

function parseLimit(rawValue: string | null, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class ControlPlaneRouter {
  config: Pick<AppConfig, 'workspaceRoot'>;
  logger: Logger;
  service: ControlPlaneService;

  constructor(
    config: Pick<AppConfig, 'workspaceRoot'>,
    service: ControlPlaneService,
    logger: Logger,
  ) {
    this.config = config;
    this.service = service;
    this.logger = logger;
  }

  canHandle(path: string): boolean {
    return path === '/ops' || path.startsWith('/control/');
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const method = (req.method ?? 'GET').toUpperCase();
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = requestUrl.pathname;

    if (!this.canHandle(path)) {
      return false;
    }

    if (method === 'GET' && path === '/ops') {
      writeHtml(res, renderOpsConsole());
      return true;
    }

    try {
      const runtimeConfig = loadGatewayRuntimeConfig(this.config.workspaceRoot);
      const operator = authenticateOperatorRequest(req.headers, runtimeConfig.operatorApiKeys);

      if (method === 'GET' && path === '/control/summary') {
        writeJson(200, this.service.getSummary(requestUrl.searchParams.get('timestamp')), res);
        return true;
      }

      if (method === 'GET' && path === '/control/accounts') {
        writeJson(200, this.service.getAccounts(requestUrl.searchParams.get('timestamp')), res);
        return true;
      }

      if (method === 'GET' && path.startsWith('/control/accounts/')) {
        const accountUid = decodeURIComponent(path.slice('/control/accounts/'.length));
        writeJson(200, this.service.getAccountDetails(accountUid, requestUrl.searchParams.get('timestamp')), res);
        return true;
      }

      if (method === 'GET' && path === '/control/services') {
        writeJson(200, this.service.getServices(), res);
        return true;
      }

      if (method === 'GET' && path === '/control/platform') {
        writeJson(200, await this.service.getPlatform(), res);
        return true;
      }

      if (method === 'GET' && path === '/control/activity') {
        writeJson(
          200,
          this.service.getGatewayActivity(
            parseLimit(requestUrl.searchParams.get('windowMinutes'), 10),
            parseLimit(requestUrl.searchParams.get('limit'), 6),
          ),
          res,
        );
        return true;
      }

      if (method === 'GET' && path === '/control/readiness') {
        writeJson(200, this.service.getReadiness(), res);
        return true;
      }

      if (method === 'GET' && path === '/control/synthetic') {
        writeJson(200, this.service.getSynthetic(parseLimit(requestUrl.searchParams.get('limit'), 10)), res);
        return true;
      }

      if (method === 'GET' && path === '/control/cutover') {
        writeJson(200, this.service.getCutover(), res);
        return true;
      }

      if (method === 'GET' && path === '/control/routing/decisions') {
        writeJson(200, this.service.getRoutingDecisions(parseLimit(requestUrl.searchParams.get('limit'), 25)), res);
        return true;
      }

      if (method === 'GET' && path === '/control/events') {
        writeJson(200, this.service.getEvents(parseLimit(requestUrl.searchParams.get('limit'), 50)), res);
        return true;
      }

      if (method === 'POST' && path === '/control/runtime/quarantine') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, this.service.applyRuntimeAction(operator, {
          accountUid: requireStringField(requestBody, 'accountUid'),
          action: 'manual_quarantine',
          reason: requireStringField(requestBody, 'reason'),
        }), res);
        return true;
      }

      if (method === 'POST' && path === '/control/runtime/release') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, this.service.applyRuntimeAction(operator, {
          accountUid: requireStringField(requestBody, 'accountUid'),
          action: 'manual_release',
          reason: requireStringField(requestBody, 'reason'),
        }), res);
        return true;
      }

      if (method === 'POST' && path === '/control/runtime/clear-cooldown') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, this.service.applyRuntimeAction(operator, {
          accountUid: requireStringField(requestBody, 'accountUid'),
          action: 'clear_cooldown',
          reason: requireStringField(requestBody, 'reason'),
        }), res);
        return true;
      }

      if (method === 'POST' && path === '/control/runtime/annotate') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, this.service.applyRuntimeAction(operator, {
          accountUid: requireStringField(requestBody, 'accountUid'),
          action: 'annotate_reason',
          reason: requireStringField(requestBody, 'reason'),
        }), res);
        return true;
      }

      if (method === 'POST' && path === '/control/jobs/accounts-sync') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, this.service.runAccountsSyncJob(operator, requireStringField(requestBody, 'reason')), res);
        return true;
      }

      if (method === 'POST' && path === '/control/jobs/health-probe') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, await this.service.runHealthProbeJob(operator, requireStringField(requestBody, 'reason')), res);
        return true;
      }

      if (method === 'POST' && path === '/control/jobs/synthetic-probe') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, await this.service.runSyntheticProbeJob(operator, requireStringField(requestBody, 'reason')), res);
        return true;
      }

      if (method === 'POST' && path === '/control/jobs/readiness-check') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, this.service.runReadinessCheckJob(operator, requireStringField(requestBody, 'reason')), res);
        return true;
      }

      if (method === 'POST' && path === '/control/platform/team-pool/ensure') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, await this.service.ensureTeamPoolRunningJob(operator, requireStringField(requestBody, 'reason')), res);
        return true;
      }

      if (method === 'POST' && path === '/control/platform/team-pool/restart') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, await this.service.restartTeamPoolJob(operator, requireStringField(requestBody, 'reason')), res);
        return true;
      }

      if (method === 'POST' && path === '/control/platform/team-pool/stop') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, await this.service.stopTeamPoolJob(operator, requireStringField(requestBody, 'reason')), res);
        return true;
      }

      if (method === 'POST' && path === '/control/platform/local-refresh') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, await this.service.runLocalRefreshJob(operator, requireStringField(requestBody, 'reason')), res);
        return true;
      }

      if (method === 'POST' && path === '/control/platform/local/prepare') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, await this.service.runLocalRefreshJob(operator, requireStringField(requestBody, 'reason')), res);
        return true;
      }

      if (method === 'POST' && path === '/control/cutover/mode') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(200, this.service.setCutoverMode(operator, {
          mode: requireCutoverModeField(requestBody, 'mode'),
          reason: requireStringField(requestBody, 'reason'),
        }), res);
        return true;
      }

      if (method === 'POST' && path === '/control/cutover/rollback') {
        const body = await readJsonBody(req);
        const requestBody = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
        writeJson(202, this.service.requestLegacyRollback(
          operator,
          requireStringField(requestBody, 'reason'),
        ), res);
        return true;
      }

      throw new ControlError(404, 'not_found_error', `Unknown control endpoint: ${method} ${path}`, 'control_not_found');
    } catch (error) {
      const controlError = toControlError(error);
      this.logger.error('control.request_failed', {
        code: controlError.code,
        message: controlError.message,
        method,
        path,
        statusCode: controlError.statusCode,
      });
      writeControlError(res, controlError);
      return true;
    }
  }
}
