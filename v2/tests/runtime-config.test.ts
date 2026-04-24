import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { loadGatewayRuntimeConfig } from '../src/gateway/runtime-config.ts';

function withTemporaryWorkspace(
  files: {
    configTeamYaml: string;
    proxyConfigJson: Record<string, unknown>;
  },
  run: (workspaceRoot: string) => void,
): void {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'codex-pool-v2-runtime-config-'));

  try {
    writeFileSync(join(workspaceRoot, 'config_team.yaml'), files.configTeamYaml);
    writeFileSync(
      join(workspaceRoot, 'proxy_config.json'),
      JSON.stringify(files.proxyConfigJson, null, 2),
    );
    run(workspaceRoot);
  } finally {
    rmSync(workspaceRoot, { force: true, recursive: true });
  }
}

function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const previousEntries = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  ) as Record<string, string | undefined>;

  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    return run();
  } finally {
    for (const [key, value] of Object.entries(previousEntries)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('gateway runtime config rejects overlap between inbound client keys and the upstream key', () => {
  withTemporaryWorkspace(
    {
      configTeamYaml: 'port: 8317\napi-keys:\n  - "shared-secret"\n',
      proxyConfigJson: {
        acceptedApiKeys: ['shared-secret'],
        requestTimeout: 500,
        targetModel: 'gpt-5.4',
        teamPoolApiKey: 'shared-secret',
        teamPoolHost: '127.0.0.1',
        teamPoolPort: 8317,
      },
    },
    (workspaceRoot) => {
      withEnv(
        {
          V2_GATEWAY_CLIENT_API_KEYS: undefined,
          V2_GATEWAY_UPSTREAM_API_KEY: undefined,
          V2_OPERATOR_API_KEYS: undefined,
        },
        () => {
          assert.throws(
            () => loadGatewayRuntimeConfig(workspaceRoot),
            /Inbound client API keys must not overlap with the upstream API key/,
          );
        },
      );
    },
  );
});

test('gateway runtime config does not silently reuse the upstream key when client keys are not configured', () => {
  withTemporaryWorkspace(
    {
      configTeamYaml: 'port: 8317\napi-keys:\n  - "team-upstream-key"\n',
      proxyConfigJson: {
        acceptedApiKeys: [],
        requestTimeout: 500,
        targetModel: 'gpt-5.4',
        teamPoolHost: '127.0.0.1',
        teamPoolPort: 8317,
      },
    },
    (workspaceRoot) => {
      withEnv(
        {
          V2_GATEWAY_CLIENT_API_KEYS: undefined,
          V2_GATEWAY_UPSTREAM_API_KEY: undefined,
          V2_OPERATOR_API_KEYS: undefined,
        },
        () => {
          const runtimeConfig = loadGatewayRuntimeConfig(workspaceRoot);

          assert.deepEqual(runtimeConfig.inboundClientApiKeys, []);
          assert.deepEqual(runtimeConfig.operatorApiKeys, []);
          assert.equal(runtimeConfig.upstream.apiKey, 'team-upstream-key');
        },
      );
    },
  );
});

test('gateway runtime config rejects overlap between synthetic probe keys and the upstream key', () => {
  withTemporaryWorkspace(
    {
      configTeamYaml: 'port: 8317\napi-keys:\n  - "team-upstream-key"\n',
      proxyConfigJson: {
        acceptedApiKeys: ['client-key-1'],
        requestTimeout: 500,
        targetModel: 'gpt-5.4',
        teamPoolApiKey: 'team-upstream-key',
        teamPoolHost: '127.0.0.1',
        teamPoolPort: 8317,
      },
    },
    (workspaceRoot) => {
      withEnv(
        {
          V2_GATEWAY_CLIENT_API_KEYS: undefined,
          V2_GATEWAY_UPSTREAM_API_KEY: undefined,
          V2_OPERATOR_API_KEYS: undefined,
          V2_SYNTHETIC_CLIENT_API_KEYS: 'team-upstream-key',
        },
        () => {
          assert.throws(
            () => loadGatewayRuntimeConfig(workspaceRoot),
            /Synthetic probe API keys must not overlap with the upstream API key/,
          );
        },
      );
    },
  );
});

test('gateway runtime config rejects overlap between synthetic probe keys and operator keys', () => {
  withTemporaryWorkspace(
    {
      configTeamYaml: 'port: 8317\napi-keys:\n  - "team-upstream-key"\n',
      proxyConfigJson: {
        acceptedApiKeys: ['client-key-1'],
        requestTimeout: 500,
        targetModel: 'gpt-5.4',
        teamPoolApiKey: 'team-upstream-key',
        teamPoolHost: '127.0.0.1',
        teamPoolPort: 8317,
      },
    },
    (workspaceRoot) => {
      withEnv(
        {
          V2_GATEWAY_CLIENT_API_KEYS: undefined,
          V2_GATEWAY_UPSTREAM_API_KEY: undefined,
          V2_OPERATOR_API_KEYS: 'shared-operator',
          V2_SYNTHETIC_CLIENT_API_KEYS: 'shared-operator',
        },
        () => {
          assert.throws(
            () => loadGatewayRuntimeConfig(workspaceRoot),
            /Synthetic probe API keys must not overlap with operator API keys/,
          );
        },
      );
    },
  );
});
