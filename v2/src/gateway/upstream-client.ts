import type { Logger } from '../logging/logger.ts';
import { GatewayError } from './errors.ts';
import type { UpstreamTargetConfig } from './models.ts';

export type UpstreamRequest = {
  body?: string | null;
  headers?: Record<string, string>;
  method: 'GET' | 'POST';
  path: string;
  target: UpstreamTargetConfig;
};

export type UpstreamJsonResult = {
  json: unknown;
  response: Response;
};

function sanitizeUpstreamMessage(rawBody: string, statusCode: number): string {
  if (!rawBody.trim()) {
    return `Upstream returned HTTP ${statusCode}`;
  }

  try {
    const parsed = JSON.parse(rawBody) as {
      error?: {
        message?: string;
      };
      message?: string;
    };

    const message = parsed.error?.message ?? parsed.message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim().slice(0, 200);
    }
  } catch {
    // Ignore JSON parse errors and fall back to plain text.
  }

  return rawBody.trim().slice(0, 200);
}

export class UpstreamClient {
  logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async fetch(request: UpstreamRequest): Promise<Response> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), request.target.timeoutMs);

    try {
      const response = await fetch(`${request.target.baseUrl}${request.path}`, {
        method: request.method,
        headers: {
          ...(request.body
            ? {
                'Content-Type': 'application/json',
              }
            : {}),
          ...(request.target.apiKey
            ? {
                Authorization: `Bearer ${request.target.apiKey}`,
              }
            : {}),
          ...request.headers,
        },
        body: request.body ?? undefined,
        signal: controller.signal,
      });

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayError(504, 'api_error', 'Upstream request timed out', 'upstream_timeout');
      }

      throw new GatewayError(502, 'api_error', 'Upstream service unavailable', 'upstream_unavailable');
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async requestJson(request: UpstreamRequest): Promise<UpstreamJsonResult> {
    const response = await this.fetch(request);
    const rawBody = await response.text();

    if (!response.ok) {
      throw new GatewayError(
        response.status,
        'api_error',
        sanitizeUpstreamMessage(rawBody, response.status),
        'upstream_http_error',
      );
    }

    try {
      return {
        json: rawBody ? JSON.parse(rawBody) : {},
        response,
      };
    } catch {
      this.logger.error('gateway.upstream.invalid_json', {
        path: request.path,
        statusCode: response.status,
        target: request.target.name,
      });

      throw new GatewayError(502, 'api_error', 'Failed to parse upstream response', 'upstream_invalid_json');
    }
  }

  async requestStream(request: UpstreamRequest): Promise<Response> {
    const response = await this.fetch(request);

    if (!response.ok) {
      const rawBody = await response.text();
      throw new GatewayError(
        response.status,
        'api_error',
        sanitizeUpstreamMessage(rawBody, response.status),
        'upstream_http_error',
      );
    }

    if (!response.body) {
      throw new GatewayError(502, 'api_error', 'Upstream stream body is empty', 'upstream_empty_stream');
    }

    return response;
  }
}
