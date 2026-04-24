import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

import { GatewayError } from './errors.ts';
import type { AuthContext, GatewayProtocol, GatewayRuntimeConfig } from './models.ts';

function normalizeHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

function fingerprintApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
}

export function authenticateGatewayRequest(
  headers: IncomingHttpHeaders,
  runtimeConfig: GatewayRuntimeConfig,
  protocol: GatewayProtocol,
): AuthContext {
  const xApiKey = normalizeHeaderValue(headers['x-api-key']);
  if (xApiKey && runtimeConfig.syntheticProbeApiKeys.includes(xApiKey)) {
    return {
      authenticated: true,
      keyFingerprint: fingerprintApiKey(xApiKey),
      principal: 'synthetic_client_key',
      protocol,
      scheme: 'x-api-key',
    };
  }

  if (xApiKey && runtimeConfig.inboundClientApiKeys.includes(xApiKey)) {
    return {
      authenticated: true,
      keyFingerprint: fingerprintApiKey(xApiKey),
      principal: 'accepted_client_key',
      protocol,
      scheme: 'x-api-key',
    };
  }

  const authorization = normalizeHeaderValue(headers.authorization);
  if (authorization?.startsWith('Bearer ')) {
    const bearerToken = authorization.slice(7).trim();
    if (runtimeConfig.syntheticProbeApiKeys.includes(bearerToken)) {
      return {
        authenticated: true,
        keyFingerprint: fingerprintApiKey(bearerToken),
        principal: 'synthetic_client_key',
        protocol,
        scheme: 'bearer',
      };
    }

    if (runtimeConfig.inboundClientApiKeys.includes(bearerToken)) {
      return {
        authenticated: true,
        keyFingerprint: fingerprintApiKey(bearerToken),
        principal: 'accepted_client_key',
        protocol,
        scheme: 'bearer',
      };
    }
  }

  throw new GatewayError(401, 'authentication_error', 'Invalid API key', 'invalid_api_key');
}
