import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  buildLocalPlatformStatus,
  defaultPlatformRuntimeController,
} from '../src/control/platform-runtime.ts';

async function withTemporaryWorkspace(
  files: {
    configTeamYaml: string;
    proxyConfigJson: Record<string, unknown>;
  },
  run: (workspaceRoot: string) => Promise<void> | void,
): Promise<void> {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'codex-pool-v2-platform-runtime-'));

  try {
    writeFileSync(join(workspaceRoot, 'config_team.yaml'), files.configTeamYaml);
    writeFileSync(
      join(workspaceRoot, 'proxy_config.json'),
      JSON.stringify(files.proxyConfigJson, null, 2),
    );
    await run(workspaceRoot);
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

test('platform status keeps Team Pool in attention when completion probes are failing', () => {
  const status = buildLocalPlatformStatus({
    availableForRouting: 4,
    currentMode: 'primary',
    gatewayBaseUrl: 'http://127.0.0.1:18320',
    gatewayReady: true,
    latestSyntheticRun: {
      anthropicJsonPassed: true,
      baseUrl: 'http://127.0.0.1:18320',
      clientKeyFingerprint: 'synthetic',
      errorMessage: 'openai_json_failed',
      failedChecks: 1,
      finishedAt: '2026-04-13T09:00:00.000Z',
      openaiJsonPassed: false,
      passedChecks: 2,
      startedAt: '2026-04-13T08:59:50.000Z',
      streamingPassed: true,
      success: false,
      syntheticRunId: 'synthetic-1',
      totalChecks: 3,
      triggerReason: 'test',
      triggeredBy: 'tester',
    },
    teamPoolProbe: {
      baseUrl: 'http://127.0.0.1:8317',
      checkedAt: '2026-04-13T09:00:05.000Z',
      detail: 'models_ok',
      error: null,
      modelsReachable: true,
      port: 8317,
      statusCode: 200,
    },
    teamPoolServiceStatus: 'healthy',
  });

  assert.equal(status.teamPool.status, 'attention');
  assert.equal(status.teamPool.completionProbeHealthy, false);
  assert.equal(status.teamPool.completionProbeSummary, 'completion_probe_failed');
  assert.equal(status.localUse.ready, false);
  assert.equal(status.localUse.status, 'attention');
  assert.equal(status.localUse.blockers.some((entry) => entry.includes('completion')), true);
  assert.deepEqual(
    status.hiddenLegacyServices.map((entry) => entry.serviceName),
    ['anthropic_proxy', 'new_api', 'tunnel_public'],
  );
  assert.equal(
    status.nextActions.some((entry) => entry.includes('completion')),
    true,
  );
});

test('platform status marks local self-use as ready when gateway and completion probes are healthy', () => {
  const status = buildLocalPlatformStatus({
    availableForRouting: 3,
    currentMode: 'primary',
    gatewayBaseUrl: 'http://127.0.0.1:18320',
    gatewayReady: true,
    latestSyntheticRun: {
      anthropicJsonPassed: true,
      baseUrl: 'http://127.0.0.1:18320',
      clientKeyFingerprint: 'synthetic',
      errorMessage: null,
      failedChecks: 0,
      finishedAt: '2026-04-13T09:00:00.000Z',
      openaiJsonPassed: true,
      passedChecks: 3,
      startedAt: '2026-04-13T08:59:50.000Z',
      streamingPassed: true,
      success: true,
      syntheticRunId: 'synthetic-2',
      totalChecks: 3,
      triggerReason: 'test',
      triggeredBy: 'tester',
    },
    teamPoolProbe: {
      baseUrl: 'http://127.0.0.1:8317',
      checkedAt: '2026-04-13T09:00:05.000Z',
      detail: 'models_ok',
      error: null,
      modelsReachable: true,
      port: 8317,
      statusCode: 200,
    },
    teamPoolServiceStatus: 'healthy',
  });

  assert.equal(status.localUse.ready, true);
  assert.equal(status.localUse.status, 'ready');
  assert.deepEqual(status.localUse.blockers, []);
  assert.equal(status.localUse.note.includes('客户端指向 V2 统一入口'), true);
});

test('restartTeamPool refuses to kill an unexpected process that owns the configured Team Pool port', async () => {
  const foreignListener = createServer();
  await new Promise<void>((resolve, reject) => {
    foreignListener.once('error', reject);
    foreignListener.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (foreignListener.address() as AddressInfo).port;

  try {
    await withTemporaryWorkspace(
      {
        configTeamYaml: `port: ${port}\napi-keys:\n  - "team-upstream-key"\n`,
        proxyConfigJson: {
          acceptedApiKeys: ['client-key-1'],
          requestTimeout: 500,
          targetModel: 'gpt-5.4',
          teamPoolApiKey: 'team-upstream-key',
          teamPoolHost: '127.0.0.1',
          teamPoolPort: port,
        },
      },
      async (workspaceRoot) => {
        await assert.rejects(
          withEnv(
            {
              V2_GATEWAY_CLIENT_API_KEYS: 'client-key-1',
              V2_GATEWAY_UPSTREAM_API_KEY: undefined,
              V2_OPERATOR_API_KEYS: 'operator-key-1',
              V2_SYNTHETIC_CLIENT_API_KEYS: 'synthetic-key-1',
            },
            () => defaultPlatformRuntimeController.restartTeamPool(workspaceRoot),
          ),
          /team_pool_port_owned_by_unexpected_process/i,
        );
      },
    );

    assert.equal(foreignListener.listening, true);
  } finally {
    await new Promise<void>((resolve) => foreignListener.close(() => resolve()));
  }
});
