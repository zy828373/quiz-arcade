import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { AppConfig } from '../src/config/app-config.ts';
import { resolveServiceBaseUrls, readCutoverModeFile } from '../src/control/cutover.ts';
import { ControlError } from '../src/control/control-errors.ts';
import { ControlPlaneService } from '../src/control/control-service.ts';
import { loadGatewayRuntimeConfig } from '../src/gateway/runtime-config.ts';
import { HealthService } from '../src/health/health-service.ts';
import { DatabaseManager } from '../src/ledger/database.ts';
import { Logger } from '../src/logging/logger.ts';
import { ShadowScheduler } from '../src/routing/shadow-scheduler.ts';

type Harness = {
  cleanup: () => void;
  database: DatabaseManager;
  service: ControlPlaneService;
  workspaceRoot: string;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function createTestConfig(rootDirectory: string): AppConfig {
  const dataDirectory = join(rootDirectory, 'data');

  return {
    serviceName: 'codex-pool-v2',
    version: '0.8.0-phase7',
    stage: 'stage7',
    environment: 'test',
    host: '0.0.0.0',
    port: 18320,
    logLevel: 'error',
    dataDirectory,
    databasePath: join(dataDirectory, 'control-plane.sqlite'),
    workspaceRoot: rootDirectory,
    authSources: {
      team: join(rootDirectory, 'auths_team'),
      free: join(rootDirectory, 'auths_free'),
    },
    scheduler: {
      mode: 'shadow',
      sourceTypeBias: {
        team: 0,
        free: 0,
      },
      readyScoreBonus: 12,
      degradedScorePenalty: 18,
      latestHealthDegradedPenalty: 10,
      refreshStalePenalty: 14,
      recentSyncFailureSignalPenalty: 6,
      expiringSoonHours: 24,
      expiringSoonPenalty: 20,
      failurePenaltyPerFailure: 15,
      recoveryProbePenalty: 25,
      cooldownMinutes: 15,
      rateLimitCooldownMinutes: 30,
      authErrorQuarantineMinutes: 360,
      recoveryProbeDelayMinutes: 5,
      successesToReady: 2,
      failuresToCooldown: 2,
      failuresToQuarantine: 4,
    },
  };
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

function createHarness(): Harness {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'codex-pool-v2-cutover-'));
  const config = createTestConfig(workspaceRoot);
  const logger = new Logger('error', { test: 'cutover' });

  mkdirSync(config.dataDirectory, { recursive: true });
  mkdirSync(config.authSources.team, { recursive: true });
  mkdirSync(config.authSources.free, { recursive: true });

  writeFileSync(
    join(workspaceRoot, 'config_team.yaml'),
    'port: 8317\napi-keys:\n  - "team-upstream-key"\n',
  );
  writeFileSync(
    join(workspaceRoot, 'proxy_config.json'),
    JSON.stringify(
      {
        acceptedApiKeys: ['client-key-1'],
        requestTimeout: 500,
        targetModel: 'gpt-5.4',
        teamPoolApiKey: 'team-upstream-key',
        teamPoolHost: '127.0.0.1',
        teamPoolPort: 8317,
      },
      null,
      2,
    ),
  );

  const database = new DatabaseManager(config, logger);
  database.initialize();

  const scheduler = new ShadowScheduler(config, database, logger);
  const healthService = new HealthService(config, database, scheduler);
  const service = new ControlPlaneService(
    {
      authSources: config.authSources,
      workspaceRoot: config.workspaceRoot,
    },
    database,
    healthService,
    scheduler,
    logger,
  );

  service.setServiceBaseUrls(resolveServiceBaseUrls({
    explicitPublicBaseUrl: 'https://v2.example.test',
    explicitSyntheticBaseUrl: null,
    host: config.host,
    port: config.port,
  }));

  return {
    cleanup: () => {
      database.close();
      rmSync(workspaceRoot, { recursive: true, force: true });
    },
    database,
    service,
    workspaceRoot,
  };
}

function createOperator() {
  return {
    authenticated: true as const,
    keyFingerprint: 'operator-fingerprint',
    operatorId: 'local-admin',
    principal: 'operator_key' as const,
    scheme: 'x-operator-key' as const,
  };
}

async function allocateFreePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to allocate a free port for rollback regression test.'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(port);
      });
    });
    server.on('error', reject);
  });
}

async function waitForReadyLine(child: ReturnType<typeof spawn>, expectedLine: string): Promise<void> {
  await new Promise<void>((resolveReady, reject) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;

    const cleanup = () => {
      child.stdout?.removeListener('data', onStdout);
      child.stderr?.removeListener('data', onStderr);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
    };

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const onStdout = (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      if (stdoutBuffer.includes(expectedLine)) {
        finish(resolveReady);
      }
    };

    const onStderr = (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    };

    const onExit = (code: number | null) => {
      finish(() => reject(new Error(
        `Listener process exited before becoming ready (code=${String(code)} stderr=${stderrBuffer.trim()})`,
      )));
    };

    const onError = (error: Error) => {
      finish(() => reject(error));
    };

    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

async function waitForExit(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<number | null> {
  if (child.exitCode !== null) {
    return child.exitCode;
  }

  return await new Promise<number | null>((resolveExit) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.removeListener('exit', onExit);
      resolveExit(null);
    }, timeoutMs);

    const onExit = (code: number | null) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolveExit(code);
    };

    child.once('exit', onExit);
  });
}

test('service base URLs honor explicit configuration and safe loopback fallback for 0.0.0.0', () => {
  const resolved = resolveServiceBaseUrls({
    explicitPublicBaseUrl: 'https://v2.example.test/',
    explicitSyntheticBaseUrl: undefined,
    host: '0.0.0.0',
    port: 18320,
  });

  assert.equal(resolved.inferredBaseUrl, 'http://127.0.0.1:18320');
  assert.equal(resolved.publicBaseUrl, 'https://v2.example.test');
  assert.equal(resolved.syntheticBaseUrl, 'https://v2.example.test');
});

test('legacy mode stays default until an explicit parallel cutover is applied', () => {
  withEnv(
    {
      V2_GATEWAY_CLIENT_API_KEYS: undefined,
      V2_OPERATOR_API_KEYS: undefined,
      V2_SYNTHETIC_CLIENT_API_KEYS: undefined,
      V2_GATEWAY_UPSTREAM_API_KEY: undefined,
    },
    () => {
      const harness = createHarness();

      try {
        const initialCutover = harness.service.getCutover();

        assert.equal(initialCutover.currentMode, 'legacy');
        assert.equal(readCutoverModeFile(harness.workspaceRoot).exists, false);
        assert.equal(loadGatewayRuntimeConfig(harness.workspaceRoot).mode, 'legacy');

        const updated = harness.service.setCutoverMode(createOperator(), {
          mode: 'parallel',
          reason: 'enable_parallel_mode',
        });
        const latestTransition = harness.database.db.prepare(`
          SELECT requested_mode, resulting_mode, outcome
          FROM cutover_transitions
          ORDER BY created_at DESC
          LIMIT 1
        `).get() as { outcome: string; requested_mode: string; resulting_mode: string };

        assert.equal(updated.currentMode, 'parallel');
        assert.equal(readCutoverModeFile(harness.workspaceRoot).mode, 'parallel');
        assert.equal(loadGatewayRuntimeConfig(harness.workspaceRoot).mode, 'parallel');
        assert.deepEqual({ ...latestTransition }, {
          outcome: 'applied',
          requested_mode: 'parallel',
          resulting_mode: 'parallel',
        });
      } finally {
        harness.cleanup();
      }
    },
  );
});

test('canary and primary cutover are rejected when readiness is false', () => {
  withEnv(
    {
      V2_GATEWAY_CLIENT_API_KEYS: undefined,
      V2_OPERATOR_API_KEYS: undefined,
      V2_SYNTHETIC_CLIENT_API_KEYS: undefined,
      V2_GATEWAY_UPSTREAM_API_KEY: undefined,
    },
    () => {
      const harness = createHarness();

      try {
        assert.throws(
          () => harness.service.setCutoverMode(createOperator(), {
            mode: 'canary',
            reason: 'attempt_canary',
          }),
          (error: unknown) => error instanceof ControlError && error.code === 'cutover_readiness_blocked',
        );
        assert.throws(
          () => harness.service.setCutoverMode(createOperator(), {
            mode: 'primary',
            reason: 'attempt_primary',
          }),
          (error: unknown) => error instanceof ControlError && error.code === 'cutover_readiness_blocked',
        );

        const currentCutover = harness.service.getCutover();
        const transitions = harness.database.db.prepare(`
          SELECT requested_mode, resulting_mode, outcome
          FROM cutover_transitions
          ORDER BY created_at ASC
        `).all() as Array<{ outcome: string; requested_mode: string; resulting_mode: string }>;

        assert.equal(currentCutover.currentMode, 'legacy');
        assert.deepEqual(transitions.map((entry) => ({ ...entry })), [
          { outcome: 'rejected', requested_mode: 'canary', resulting_mode: 'legacy' },
          { outcome: 'rejected', requested_mode: 'primary', resulting_mode: 'legacy' },
        ]);
      } finally {
        harness.cleanup();
      }
    },
  );
});

test('rollback to legacy restores the legacy cutover state and mirror file', () => {
  withEnv(
    {
      V2_GATEWAY_CLIENT_API_KEYS: undefined,
      V2_OPERATOR_API_KEYS: undefined,
      V2_SYNTHETIC_CLIENT_API_KEYS: undefined,
      V2_GATEWAY_UPSTREAM_API_KEY: undefined,
    },
    () => {
      const harness = createHarness();

      try {
        harness.service.setCutoverMode(createOperator(), {
          mode: 'parallel',
          reason: 'parallel_validation',
        });
        const rolledBack = harness.service.setCutoverMode(createOperator(), {
          mode: 'legacy',
          reason: 'rollback_to_legacy',
        });
        const latestTransition = harness.database.db.prepare(`
          SELECT requested_mode, resulting_mode, outcome
          FROM cutover_transitions
          ORDER BY created_at DESC
          LIMIT 1
        `).get() as { outcome: string; requested_mode: string; resulting_mode: string };

        assert.equal(rolledBack.currentMode, 'legacy');
        assert.equal(readCutoverModeFile(harness.workspaceRoot).mode, 'legacy');
        assert.equal(loadGatewayRuntimeConfig(harness.workspaceRoot).mode, 'legacy');
        assert.deepEqual({ ...latestTransition }, {
          outcome: 'applied',
          requested_mode: 'legacy',
          resulting_mode: 'legacy',
        });
      } finally {
        harness.cleanup();
      }
    },
  );
});

test('cutover mode change is rejected when the mirror file cannot be written', () => {
  withEnv(
    {
      V2_GATEWAY_CLIENT_API_KEYS: undefined,
      V2_OPERATOR_API_KEYS: undefined,
      V2_SYNTHETIC_CLIENT_API_KEYS: undefined,
      V2_GATEWAY_UPSTREAM_API_KEY: undefined,
    },
    () => {
      const harness = createHarness();

      try {
        writeFileSync(join(harness.workspaceRoot, 'v2'), 'not-a-directory');

        assert.throws(
          () => harness.service.setCutoverMode(createOperator(), {
            mode: 'parallel',
            reason: 'mirror_write_failure',
          }),
          (error: unknown) =>
            error instanceof ControlError && error.code === 'cutover_mode_mirror_write_failed',
        );

        const currentCutover = harness.service.getCutover();
        const latestTransition = harness.database.db.prepare(`
          SELECT requested_mode, resulting_mode, outcome, after_json
          FROM cutover_transitions
          ORDER BY created_at DESC
          LIMIT 1
        `).get() as {
          after_json: string;
          outcome: string;
          requested_mode: string;
          resulting_mode: string;
        };
        const failureSnapshot = JSON.parse(latestTransition.after_json) as {
          mirrorWriteFailed?: boolean;
          modeUnchanged?: string;
          requestedMode?: string;
        };

        assert.equal(currentCutover.currentMode, 'legacy');
        assert.equal(currentCutover.modeMirror.mode, 'legacy');
        assert.equal(currentCutover.modeMirror.exists, false);
        assert.deepEqual({ ...latestTransition, after_json: undefined }, {
          after_json: undefined,
          outcome: 'rejected',
          requested_mode: 'parallel',
          resulting_mode: 'legacy',
        });
        assert.equal(failureSnapshot.mirrorWriteFailed, true);
        assert.equal(failureSnapshot.modeUnchanged, 'legacy');
        assert.equal(failureSnapshot.requestedMode, 'parallel');
      } finally {
        harness.cleanup();
      }
    },
  );
});

test('rollback legacy script stops the listener without hitting the PowerShell $PID collision', { timeout: 60000 }, async () => {
  const tempScriptRoot = mkdtempSync(join(tmpdir(), 'codex-pool-v2-rollback-script-'));
  const rollbackScriptPath = join(tempScriptRoot, 'rollback_legacy.ps1');
  const setCutoverScriptPath = join(tempScriptRoot, 'set_cutover_mode.ps1');
  const npmStubPath = join(tempScriptRoot, 'npm.cmd');
  const v2Directory = join(tempScriptRoot, 'v2');
  const listenerPort = await allocateFreePort();
  const pathWithStub = `${tempScriptRoot};${process.env.PATH ?? ''}`;

  mkdirSync(v2Directory, { recursive: true });
  copyFileSync(join(repoRoot, 'rollback_legacy.ps1'), rollbackScriptPath);
  copyFileSync(join(repoRoot, 'set_cutover_mode.ps1'), setCutoverScriptPath);
  writeFileSync(npmStubPath, '@echo off\r\nexit /b 0\r\n', 'utf8');

  const listenerProcess = spawn(
    process.execPath,
    [
      '-e',
      [
        "const net = require('node:net');",
        'const port = Number(process.env.TEST_LISTENER_PORT);',
        "const server = net.createServer();",
        "server.listen(port, '127.0.0.1', () => process.stdout.write('listener-ready\\n'));",
        'setInterval(() => {}, 1000);',
      ].join(' '),
    ],
    {
      env: {
        ...process.env,
        TEST_LISTENER_PORT: String(listenerPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );

  try {
    await waitForReadyLine(listenerProcess, 'listener-ready');
    await delay(100);

    const rollbackResult = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        rollbackScriptPath,
        '-Reason',
        'test_rollback',
        '-OperatorId',
        'test-runner',
      ],
      {
        cwd: tempScriptRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: pathWithStub,
          V2_PORT: String(listenerPort),
        },
        timeout: 45000,
        windowsHide: true,
      },
    );

    const combinedOutput = `${rollbackResult.stdout ?? ''}\n${rollbackResult.stderr ?? ''}`;
    const listenerExitCode = await waitForExit(listenerProcess, 5000);

    assert.equal(rollbackResult.status, 0, combinedOutput);
    assert.match(rollbackResult.stdout ?? '', /Legacy rollback applied/i);
    assert.doesNotMatch(combinedOutput, /Cannot overwrite variable PID/i);
    assert.notEqual(listenerExitCode, null, 'listener process should be stopped by rollback_legacy.ps1');
  } finally {
    if (!listenerProcess.killed) {
      listenerProcess.kill();
    }

    rmSync(tempScriptRoot, { recursive: true, force: true });
  }
});
