import type { ServerResponse } from 'node:http';

export class ControlError extends Error {
  code: string;
  statusCode: number;
  type: 'api_error' | 'authentication_error' | 'invalid_request_error' | 'not_found_error';

  constructor(
    statusCode: number,
    type: 'api_error' | 'authentication_error' | 'invalid_request_error' | 'not_found_error',
    message: string,
    code: string,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.type = type;
  }
}

export function writeControlError(
  res: ServerResponse,
  error: ControlError,
): void {
  res.writeHead(error.statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify({
    error: {
      code: error.code,
      message: error.message,
      type: error.type,
    },
  }));
}
