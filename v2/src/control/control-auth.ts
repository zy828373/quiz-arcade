import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

import type { OperatorAuthContext } from '../gateway/models.ts';
import { ControlError } from './control-errors.ts';

function normalizeHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

function fingerprintApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
}

function sanitizeOperatorId(value: string | null, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
  return sanitized.length > 0 ? sanitized : fallback;
}

export function authenticateOperatorRequest(
  headers: IncomingHttpHeaders,
  operatorApiKeys: string[],
): OperatorAuthContext {
  if (operatorApiKeys.length === 0) {
    throw new ControlError(
      503,
      'authentication_error',
      'Operator API is not configured',
      'operator_auth_unconfigured',
    );
  }

  const presentedOperatorId = normalizeHeaderValue(headers['x-operator-id']);
  const xOperatorKey = normalizeHeaderValue(headers['x-operator-key']);
  if (xOperatorKey && operatorApiKeys.includes(xOperatorKey)) {
    const keyFingerprint = fingerprintApiKey(xOperatorKey);
    return {
      authenticated: true,
      keyFingerprint,
      operatorId: sanitizeOperatorId(presentedOperatorId, `operator_${keyFingerprint}`),
      principal: 'operator_key',
      scheme: 'x-operator-key',
    };
  }

  const authorization = normalizeHeaderValue(headers.authorization);
  if (authorization?.startsWith('Bearer ')) {
    const bearerToken = authorization.slice(7).trim();
    if (operatorApiKeys.includes(bearerToken)) {
      const keyFingerprint = fingerprintApiKey(bearerToken);
      return {
        authenticated: true,
        keyFingerprint,
        operatorId: sanitizeOperatorId(presentedOperatorId, `operator_${keyFingerprint}`),
        principal: 'operator_key',
        scheme: 'bearer',
      };
    }
  }

  throw new ControlError(401, 'authentication_error', 'Invalid operator API key', 'invalid_operator_key');
}
