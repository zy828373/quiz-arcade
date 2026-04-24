import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readCutoverModeFile } from '../control/cutover.ts';
import { repoRoot } from '../paths.ts';
import type { GatewayRuntimeConfig } from './models.ts';

type TeamPoolConfig = {
  apiKeys: string[];
  port: number;
};

type ProxyConfig = {
  acceptedApiKeys: string[];
  requestTimeout: number;
  targetModel: string;
  teamPoolApiKey: string | null;
  teamPoolHost: string;
  teamPoolPort: number | null;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 300000;
const DEFAULT_TARGET_MODEL = 'gpt-5.4';
const DEFAULT_TEAM_POOL_HOST = '127.0.0.1';
const DEFAULT_TEAM_POOL_PORT = 8317;

function stripQuotes(value: string): string {
  return value.replace(/^["']/, '').replace(/["']$/, '');
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readTeamPoolConfig(workspaceRoot: string): TeamPoolConfig {
  const configPath = resolve(workspaceRoot, 'config_team.yaml');

  if (!existsSync(configPath)) {
    return {
      apiKeys: [],
      port: DEFAULT_TEAM_POOL_PORT,
    };
  }

  const apiKeys: string[] = [];
  const lines = readFileSync(configPath, 'utf8').split(/\r?\n/);
  let port = DEFAULT_TEAM_POOL_PORT;
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
      apiKeys.push(stripQuotes(trimmed.slice(2).trim()));
      continue;
    }

    if (!rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
      inApiKeys = false;
    }
  }

  return {
    apiKeys,
    port,
  };
}

function readProxyConfig(workspaceRoot: string): ProxyConfig {
  const configPath = resolve(workspaceRoot, 'proxy_config.json');

  if (!existsSync(configPath)) {
    return {
      acceptedApiKeys: [],
      requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
      targetModel: DEFAULT_TARGET_MODEL,
      teamPoolApiKey: null,
      teamPoolHost: DEFAULT_TEAM_POOL_HOST,
      teamPoolPort: null,
    };
  }

  const rawConfig = JSON.parse(readFileSync(configPath, 'utf8')) as {
    acceptedApiKeys?: string[];
    requestTimeout?: number;
    targetModel?: string;
    teamPoolApiKey?: string;
    teamPoolHost?: string;
    teamPoolPort?: number;
  };

  return {
    acceptedApiKeys: rawConfig.acceptedApiKeys ?? [],
    requestTimeout: rawConfig.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT_MS,
    targetModel: rawConfig.targetModel ?? DEFAULT_TARGET_MODEL,
    teamPoolApiKey: rawConfig.teamPoolApiKey ?? null,
    teamPoolHost: rawConfig.teamPoolHost ?? DEFAULT_TEAM_POOL_HOST,
    teamPoolPort: rawConfig.teamPoolPort ?? null,
  };
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

function parseEnvApiKeys(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  return unique(rawValue.split(',').map((value) => value.trim()));
}

function findFirstOverlap(left: string[], right: string[]): string | null {
  const leftSet = new Set(left);
  for (const value of right) {
    if (leftSet.has(value)) {
      return value;
    }
  }

  return null;
}

function validateApiKeyIsolation(
  inboundClientApiKeys: string[],
  operatorApiKeys: string[],
  syntheticProbeApiKeys: string[],
  upstreamApiKey: string | null,
): void {
  if (upstreamApiKey && inboundClientApiKeys.includes(upstreamApiKey)) {
    throw new Error(
      'Inbound client API keys must not overlap with the upstream API key. Configure a dedicated client key set.',
    );
  }

  const operatorClientOverlap = findFirstOverlap(operatorApiKeys, inboundClientApiKeys);
  if (operatorClientOverlap) {
    throw new Error(
      'Operator API keys must not overlap with inbound client API keys. Configure operator keys independently.',
    );
  }

  if (upstreamApiKey && operatorApiKeys.includes(upstreamApiKey)) {
    throw new Error(
      'Operator API keys must not overlap with the upstream API key. Configure operator keys independently.',
    );
  }

  const syntheticClientOverlap = findFirstOverlap(syntheticProbeApiKeys, inboundClientApiKeys);
  if (syntheticClientOverlap) {
    throw new Error(
      'Synthetic probe API keys must be dedicated and must not overlap with inbound client API keys.',
    );
  }

  const syntheticOperatorOverlap = findFirstOverlap(syntheticProbeApiKeys, operatorApiKeys);
  if (syntheticOperatorOverlap) {
    throw new Error(
      'Synthetic probe API keys must not overlap with operator API keys. Configure synthetic probes independently.',
    );
  }

  if (upstreamApiKey && syntheticProbeApiKeys.includes(upstreamApiKey)) {
    throw new Error(
      'Synthetic probe API keys must not overlap with the upstream API key. Configure synthetic probes independently.',
    );
  }
}

export function loadGatewayRuntimeConfig(workspaceRoot = repoRoot): GatewayRuntimeConfig {
  const teamPoolConfig = readTeamPoolConfig(workspaceRoot);
  const proxyConfig = readProxyConfig(workspaceRoot);
  const cutoverMode = readCutoverModeFile(workspaceRoot).mode;
  const teamPoolHost = process.env.V2_GATEWAY_TEAM_POOL_HOST ?? proxyConfig.teamPoolHost;
  const teamPoolPort = parsePositiveInteger(
    process.env.V2_GATEWAY_TEAM_POOL_PORT,
    proxyConfig.teamPoolPort ?? teamPoolConfig.port ?? DEFAULT_TEAM_POOL_PORT,
  );
  const configuredClientApiKeys = parseEnvApiKeys(process.env.V2_GATEWAY_CLIENT_API_KEYS);
  const configuredOperatorApiKeys = parseEnvApiKeys(process.env.V2_OPERATOR_API_KEYS);
  const configuredSyntheticProbeApiKeys = parseEnvApiKeys(process.env.V2_SYNTHETIC_CLIENT_API_KEYS);
  const upstreamApiKey =
    process.env.V2_GATEWAY_UPSTREAM_API_KEY ??
    proxyConfig.teamPoolApiKey ??
    teamPoolConfig.apiKeys[0] ??
    null;
  const inboundClientApiKeys =
    configuredClientApiKeys.length > 0
      ? configuredClientApiKeys
      : unique(proxyConfig.acceptedApiKeys);

  validateApiKeyIsolation(
    inboundClientApiKeys,
    configuredOperatorApiKeys,
    configuredSyntheticProbeApiKeys,
    upstreamApiKey,
  );

  return {
    inboundClientApiKeys,
    mode: cutoverMode,
    operatorApiKeys: configuredOperatorApiKeys,
    syntheticProbeApiKeys: configuredSyntheticProbeApiKeys,
    upstream: {
      anthropicTargetModel: process.env.V2_GATEWAY_TARGET_MODEL ?? proxyConfig.targetModel,
      apiKey: upstreamApiKey,
      baseUrl: `http://${teamPoolHost}:${teamPoolPort}`,
      name: 'team_pool_openai',
      timeoutMs: parsePositiveInteger(
        process.env.V2_GATEWAY_UPSTREAM_TIMEOUT_MS,
        proxyConfig.requestTimeout,
      ),
    },
  };
}
