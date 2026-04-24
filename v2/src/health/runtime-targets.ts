import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { repoRoot } from '../paths.ts';

export type ServiceProbeDefinition = {
  acceptableStatusCodes: number[];
  headers?: Record<string, string>;
  name: string;
  target: string;
  timeoutMs: number;
};

type TeamPoolRuntimeConfig = {
  apiKey: string | null;
  port: number;
};

type ProxyRuntimeConfig = {
  proxyPort: number;
};

const DEFAULT_HEALTH_PROBE_TIMEOUT_MS = 5000;
const DEFAULT_NEW_API_STATUS_URL = 'http://127.0.0.1:3001/api/status';
const DEFAULT_TEAM_POOL_PORT = 8317;
const DEFAULT_TUNNEL_PUBLIC_URL = 'https://team-api.codexapis.uk/v1/models';
const DEFAULT_PROXY_PORT = 8320;

function parsePositiveInteger(value: string | undefined, fallbackValue: number): number {
  if (!value) {
    return fallbackValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackValue;
}

function stripQuotes(value: string): string {
  return value.replace(/^["']/, '').replace(/["']$/, '');
}

function readTeamPoolRuntimeConfig(): TeamPoolRuntimeConfig {
  const configPath = resolve(repoRoot, 'config_team.yaml');

  if (!existsSync(configPath)) {
    return {
      apiKey: null,
      port: DEFAULT_TEAM_POOL_PORT,
    };
  }

  const content = readFileSync(configPath, 'utf8');
  const lines = content.split(/\r?\n/);
  let port = DEFAULT_TEAM_POOL_PORT;
  let apiKey: string | null = null;
  let inApiKeys = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const portMatch = trimmed.match(/^port:\s*(\d+)/);
    if (portMatch) {
      port = Number.parseInt(portMatch[1] ?? String(DEFAULT_TEAM_POOL_PORT), 10);
      continue;
    }

    if (trimmed.startsWith('api-keys:')) {
      inApiKeys = true;
      continue;
    }

    if (inApiKeys && trimmed.startsWith('- ')) {
      apiKey = stripQuotes(trimmed.slice(2).trim());
      break;
    }

    if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
      inApiKeys = false;
    }
  }

  return {
    apiKey,
    port,
  };
}

function readProxyRuntimeConfig(): ProxyRuntimeConfig {
  const configPath = resolve(repoRoot, 'proxy_config.json');

  if (!existsSync(configPath)) {
    return {
      proxyPort: DEFAULT_PROXY_PORT,
    };
  }

  const rawConfig = JSON.parse(readFileSync(configPath, 'utf8')) as {
    proxyPort?: number;
  };

  return {
    proxyPort: rawConfig.proxyPort ?? DEFAULT_PROXY_PORT,
  };
}

export function getAccountRefreshStaleHours(): number {
  return parsePositiveInteger(process.env.V2_ACCOUNT_REFRESH_STALE_HOURS, 168);
}

export function buildDefaultServiceProbeDefinitions(): ServiceProbeDefinition[] {
  const timeoutMs = parsePositiveInteger(process.env.V2_HEALTH_PROBE_TIMEOUT_MS, DEFAULT_HEALTH_PROBE_TIMEOUT_MS);
  const teamConfig = readTeamPoolRuntimeConfig();
  const proxyConfig = readProxyRuntimeConfig();
  const serviceDefinitions: ServiceProbeDefinition[] = [];

  serviceDefinitions.push({
    acceptableStatusCodes: [200],
    headers: teamConfig.apiKey
      ? {
          Authorization: `Bearer ${teamConfig.apiKey}`,
        }
      : undefined,
    name: 'team_pool',
    target: `http://127.0.0.1:${teamConfig.port}/v1/models`,
    timeoutMs,
  });

  serviceDefinitions.push({
    acceptableStatusCodes: [200],
    name: 'anthropic_proxy',
    target: `http://127.0.0.1:${proxyConfig.proxyPort}/health`,
    timeoutMs,
  });

  serviceDefinitions.push({
    acceptableStatusCodes: [200],
    name: 'new_api',
    target: process.env.V2_NEW_API_STATUS_URL ?? DEFAULT_NEW_API_STATUS_URL,
    timeoutMs,
  });

  serviceDefinitions.push({
    acceptableStatusCodes: [200, 401],
    name: 'tunnel_public',
    target: process.env.V2_TUNNEL_PUBLIC_URL ?? DEFAULT_TUNNEL_PUBLIC_URL,
    timeoutMs,
  });

  return serviceDefinitions;
}
