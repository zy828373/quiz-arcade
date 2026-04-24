import type { IncomingMessage } from 'node:http';

import { GatewayError } from './errors.ts';

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

export async function readJsonBody(
  req: IncomingMessage,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      throw new GatewayError(413, 'invalid_request_error', 'Request body is too large', 'body_too_large');
    }

    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new GatewayError(400, 'invalid_request_error', 'Invalid JSON body', 'invalid_json_body');
  }
}
