import type { ServerResponse } from 'node:http';

import type { GatewayProtocol } from './models.ts';

export type GatewayErrorCategory =
  | 'api_error'
  | 'authentication_error'
  | 'invalid_request_error'
  | 'not_found_error';

export class GatewayError extends Error {
  category: GatewayErrorCategory;
  code: string;
  statusCode: number;

  constructor(
    statusCode: number,
    category: GatewayErrorCategory,
    message: string,
    code: string,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.category = category;
    this.code = code;
  }
}

export function createErrorPayload(protocol: GatewayProtocol, error: GatewayError) {
  if (protocol === 'anthropic') {
    return {
      type: 'error',
      error: {
        type: error.category,
        message: error.message,
      },
    };
  }

  return {
    error: {
      code: error.code,
      message: error.message,
      type: error.category,
    },
  };
}

export function writeProtocolError(
  res: ServerResponse,
  protocol: GatewayProtocol,
  error: GatewayError,
  headers: Record<string, string> = {},
): void {
  res.writeHead(error.statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(createErrorPayload(protocol, error)));
}
