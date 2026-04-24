import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import type { AppConfig } from '../src/config/app-config.ts';
import { ControlPlaneRouter } from '../src/control/control-router.ts';
import { ControlPlaneService } from '../src/control/control-service.ts';
import { syncAccountRegistry } from '../src/control/account-sync.ts';
import { closeHttpServer, createHttpServer, listenHttpServer } from '../src/gateway/http-server.ts';
import { HealthService } from '../src/health/health-service.ts';
import { runHealthProbe } from '../src/health/probe-engine.ts';
import { DatabaseManager } from '../src/ledger/database.ts';
import { Logger } from '../src/logging/logger.ts';
import { ShadowScheduler } from '../src/routing/shadow-scheduler.ts';

type Harness = {
  cleanup: () => Promise<void>;
  database: DatabaseManager;
  rootDirectory: string;
  serviceUrl: string;
};

type CreateHarnessOptions = {
  platformRuntimeController?: any;
  rollbackHelperLauncher?: (...args: any[]) => any;
};

function createTestConfig(rootDirectory: string): AppConfig {
  const dataDirectory = join(rootDirectory, 'data');

  return {
    serviceName: 'codex-pool-v2',
    version: '0.7.0-phase6',
    stage: 'stage6',
    environment: 'test',
    host: '127.0.0.1',
    port: 0,
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

function writeAuthFixture(directoryPath: string, fileName: string): void {
  writeFileSync(
    join(directoryPath, fileName),
    JSON.stringify(
      {
        access_token: 'dummy-access-token',
        account_id: 'team-ops',
        disabled: false,
        email: 'team-ops@example.com',
        expired: '2099-01-01T00:00:00.000Z',
        id_token: 'dummy-id-token',
        last_refresh: '2026-04-09T00:00:00.000Z',
        refresh_token: 'dummy-refresh-token',
        type: 'codex',
      },
      null,
      2,
    ),
  );
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += Buffer.from(chunk).toString('utf8');
  }

  return body;
}

async function startServiceProbeServer(): Promise<Server> {
  const server = createServer(async (req, res) => {
    const rawBody = await readRequestBody(req);
    const body = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : null;

    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'gpt-5.4', object: 'model', created: 1, owned_by: 'openai' }] }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      if (body?.stream === true) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
        res.write(`data: ${JSON.stringify({
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'ready' }, finish_reason: null }],
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-json',
        object: 'chat.completion',
        created: 1,
        model: body?.model ?? 'gpt-5.4',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'ready',
            },
          },
        ],
      }));
      return;
    }

    if (req.url === '/health' || req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return server;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function createHarness(options: CreateHarnessOptions = {}): Promise<Harness> {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'codex-pool-v2-control-'));
  const config = createTestConfig(rootDirectory);
  const logger = new Logger('error', { test: 'control-plane' });

  mkdirSync(config.dataDirectory, { recursive: true });
  mkdirSync(config.authSources.team, { recursive: true });
  mkdirSync(config.authSources.free, { recursive: true });
  writeAuthFixture(config.authSources.team, 'team-ops.json');

  const serviceProbeServer = await startServiceProbeServer();
  const serviceProbePort = (serviceProbeServer.address() as AddressInfo).port;

  writeFileSync(
    join(rootDirectory, 'config_team.yaml'),
    `port: ${serviceProbePort}\napi-keys:\n  - "team-upstream-key"\n`,
  );
  writeFileSync(
    join(rootDirectory, 'proxy_config.json'),
    JSON.stringify(
      {
        acceptedApiKeys: ['client-key-1'],
        requestTimeout: 500,
        targetModel: 'gpt-5.4',
        teamPoolApiKey: 'team-upstream-key',
        teamPoolHost: '127.0.0.1',
        teamPoolPort: serviceProbePort,
      },
      null,
      2,
    ),
  );

  const previousOperatorKeys = process.env.V2_OPERATOR_API_KEYS;
  const previousNewApi = process.env.V2_NEW_API_STATUS_URL;
  const previousSyntheticKeys = process.env.V2_SYNTHETIC_CLIENT_API_KEYS;
  const previousTunnelUrl = process.env.V2_TUNNEL_PUBLIC_URL;
  process.env.V2_OPERATOR_API_KEYS = 'operator-key-1';
  process.env.V2_SYNTHETIC_CLIENT_API_KEYS = 'synthetic-key-1';
  process.env.V2_NEW_API_STATUS_URL = `http://127.0.0.1:${serviceProbePort}/api/status`;
  process.env.V2_TUNNEL_PUBLIC_URL = `http://127.0.0.1:${serviceProbePort}/v1/models`;

  const database = new DatabaseManager(config, logger);
  database.initialize();
  syncAccountRegistry(config, database, logger);
  await runHealthProbe(database, logger, undefined, {
    workspaceRoot: config.workspaceRoot,
  });

  const scheduler = new ShadowScheduler(config, database, logger);
  const healthService = new HealthService(config, database, scheduler);
  const controlPlaneService = new ControlPlaneService(
    {
      authSources: config.authSources,
      workspaceRoot: config.workspaceRoot,
    },
    database,
    healthService,
    scheduler,
    logger,
    options.rollbackHelperLauncher,
    options.platformRuntimeController,
  );
  const controlPlaneRouter = new ControlPlaneRouter(
    { workspaceRoot: config.workspaceRoot },
    controlPlaneService,
    logger,
  );
  const server = createHttpServer({
    config,
    healthService,
    logger,
    controlPlaneRouter,
  });

  await listenHttpServer(server, '127.0.0.1', 0);
  const port = (server.address() as AddressInfo).port;
  controlPlaneService.setServiceBaseUrl(`http://127.0.0.1:${port}`);

  return {
    cleanup: async () => {
      await closeHttpServer(server);
      await closeServer(serviceProbeServer);
      database.close();
      rmSync(rootDirectory, { recursive: true, force: true });

      if (previousOperatorKeys === undefined) {
        delete process.env.V2_OPERATOR_API_KEYS;
      } else {
        process.env.V2_OPERATOR_API_KEYS = previousOperatorKeys;
      }

      if (previousNewApi === undefined) {
        delete process.env.V2_NEW_API_STATUS_URL;
      } else {
        process.env.V2_NEW_API_STATUS_URL = previousNewApi;
      }

      if (previousSyntheticKeys === undefined) {
        delete process.env.V2_SYNTHETIC_CLIENT_API_KEYS;
      } else {
        process.env.V2_SYNTHETIC_CLIENT_API_KEYS = previousSyntheticKeys;
      }

      if (previousTunnelUrl === undefined) {
        delete process.env.V2_TUNNEL_PUBLIC_URL;
      } else {
        process.env.V2_TUNNEL_PUBLIC_URL = previousTunnelUrl;
      }
    },
    database,
    rootDirectory,
    serviceUrl: `http://127.0.0.1:${port}`,
  };
}

test('control GET endpoints are read-only, /ops loads, and client keys cannot access operator API', async () => {
  const harness = await createHarness();

  try {
    const runtimeStateCountBefore = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM account_runtime_state').get() as { count: number }
    ).count;
    const operatorActionCountBefore = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM operator_actions').get() as { count: number }
    ).count;
    const runtimeOverrideCountBefore = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM runtime_overrides').get() as { count: number }
    ).count;

    const opsResponse = await fetch(`${harness.serviceUrl}/ops`);
    const opsHtml = await opsResponse.text();
    const unauthorizedResponse = await fetch(`${harness.serviceUrl}/control/summary`, {
      headers: {
        Authorization: 'Bearer client-key-1',
      },
    });
    const unauthorizedPayload = await unauthorizedResponse.json() as { error: { code: string } };
    const headers = {
      'x-operator-id': 'local-admin',
      'x-operator-key': 'operator-key-1',
    };
    const summaryResponse = await fetch(`${harness.serviceUrl}/control/summary`, { headers });
    const platformResponse = await fetch(`${harness.serviceUrl}/control/platform`, { headers });
    const activityResponse = await fetch(`${harness.serviceUrl}/control/activity`, { headers });
    const accountsResponse = await fetch(`${harness.serviceUrl}/control/accounts`, { headers });
    const accountUid = (
      harness.database.db.prepare('SELECT account_uid FROM account_registry LIMIT 1').get() as { account_uid: string }
    ).account_uid;
    const detailResponse = await fetch(`${harness.serviceUrl}/control/accounts/${accountUid}`, { headers });
    const servicesResponse = await fetch(`${harness.serviceUrl}/control/services`, { headers });
    const cutoverResponse = await fetch(`${harness.serviceUrl}/control/cutover`, { headers });
    const decisionsResponse = await fetch(`${harness.serviceUrl}/control/routing/decisions`, { headers });
    const eventsResponse = await fetch(`${harness.serviceUrl}/control/events`, { headers });
    const activityPayload = await activityResponse.json() as {
      hasRecentExternalActivity: boolean;
      recentEntries: unknown[];
      totals: { external: number };
    };
    const detailPayloadText = await detailResponse.text();
    const runtimeStateCountAfter = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM account_runtime_state').get() as { count: number }
    ).count;
    const operatorActionCountAfter = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM operator_actions').get() as { count: number }
    ).count;
    const runtimeOverrideCountAfter = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM runtime_overrides').get() as { count: number }
    ).count;

    assert.equal(opsResponse.status, 200);
    assert.equal(opsHtml.includes('<html lang="zh-CN">'), true);
    assert.equal(opsHtml.includes('id="guidancePanel"'), true);
    assert.equal(opsHtml.includes('id="platformTable"'), true);
    assert.equal(opsHtml.includes('id="runLocalRefresh"'), true);
    assert.equal(opsHtml.includes('id="stopTeamPool"'), true);
    assert.equal(opsHtml.includes('本机自用工作台'), true);
    assert.equal(opsHtml.includes('sessionStorage'), false);
    assert.equal(opsHtml.includes('localStorage'), false);
    assert.equal(opsHtml.includes('.innerHTML ='), false);
    assert.equal(unauthorizedResponse.status, 401);
    assert.equal(unauthorizedPayload.error.code, 'invalid_operator_key');
    assert.equal(summaryResponse.status, 200);
    assert.equal(platformResponse.status, 200);
    assert.equal(activityResponse.status, 200);
    assert.equal(accountsResponse.status, 200);
    assert.equal(detailResponse.status, 200);
    assert.equal(servicesResponse.status, 200);
    assert.equal(cutoverResponse.status, 200);
    assert.equal(decisionsResponse.status, 200);
    assert.equal(eventsResponse.status, 200);
    assert.equal(typeof activityPayload.hasRecentExternalActivity, 'boolean');
    assert.equal(Array.isArray(activityPayload.recentEntries), true);
    assert.equal(typeof activityPayload.totals.external, 'number');
    assert.equal(runtimeStateCountBefore, runtimeStateCountAfter);
    assert.equal(operatorActionCountBefore, operatorActionCountAfter);
    assert.equal(runtimeOverrideCountBefore, runtimeOverrideCountAfter);
    assert.equal(detailPayloadText.includes('access_token'), false);
    assert.equal(detailPayloadText.includes('refresh_token'), false);
    assert.equal(detailPayloadText.includes('id_token'), false);
    assert.equal(detailPayloadText.includes('client-key-1'), false);
    assert.equal(detailPayloadText.includes('team-upstream-key'), false);
  } finally {
    await harness.cleanup();
  }
});

test('legacy rollback endpoint accepts the request and delegates to the async helper without synchronously flipping mode', async () => {
  const rollbackLaunches: Array<{ graceDelayMs: number; operatorId: string; reason: string; workspaceRoot: string }> = [];
  const harness = await createHarness({
    rollbackHelperLauncher: (input: {
      graceDelayMs: number;
      operatorId: string;
      reason: string;
      requestedAt: string;
      workspaceRoot: string;
    }) => {
      rollbackLaunches.push({
        graceDelayMs: input.graceDelayMs,
        operatorId: input.operatorId,
        reason: input.reason,
        workspaceRoot: input.workspaceRoot,
      });

      return {
        graceDelayMs: input.graceDelayMs,
        helperPath: join(input.workspaceRoot, 'rollback_legacy.ps1'),
        lockPath: join(input.workspaceRoot, 'v2', 'data', 'cutover-rollback.lock'),
        requestedAt: input.requestedAt,
      };
    },
  });

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-operator-id': 'local-admin',
      'x-operator-key': 'operator-key-1',
    };

    const setParallelResponse = await fetch(`${harness.serviceUrl}/control/cutover/mode`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'parallel',
        reason: 'prepare_parallel_before_rollback',
      }),
    });
    const rollbackResponse = await fetch(`${harness.serviceUrl}/control/cutover/rollback`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: 'ops_console_legacy_rollback',
      }),
    });
    const rollbackPayload = await rollbackResponse.json() as {
      accepted: boolean;
      currentMode: string;
      note: string;
      operation: string;
    };
    const cutoverResponse = await fetch(`${harness.serviceUrl}/control/cutover`, { headers });
    const cutoverPayload = await cutoverResponse.json() as {
      currentMode: string;
    };

    assert.equal(setParallelResponse.status, 200);
    assert.equal(rollbackResponse.status, 202);
    assert.equal(rollbackPayload.accepted, true);
    assert.equal(rollbackPayload.currentMode, 'parallel');
    assert.equal(rollbackPayload.operation, 'legacy_rollback');
    assert.match(rollbackPayload.note, /accepted/i);
    assert.equal(cutoverResponse.status, 200);
    assert.equal(cutoverPayload.currentMode, 'parallel');
    assert.equal(rollbackLaunches.length, 1);
    assert.deepEqual(rollbackLaunches[0], {
      graceDelayMs: 750,
      operatorId: 'local-admin',
      reason: 'ops_console_legacy_rollback',
      workspaceRoot: harness.rootDirectory,
    });
  } finally {
    await harness.cleanup();
  }
});

test('manual quarantine and release update runtime state and write operator audit', async () => {
  const harness = await createHarness();

  try {
    const accountUid = (
      harness.database.db.prepare('SELECT account_uid FROM account_registry LIMIT 1').get() as { account_uid: string }
    ).account_uid;
    const headers = {
      'Content-Type': 'application/json',
      'x-operator-id': 'local-admin',
      'x-operator-key': 'operator-key-1',
    };

    const quarantineResponse = await fetch(`${harness.serviceUrl}/control/runtime/quarantine`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        accountUid,
        reason: 'manual investigation',
      }),
    });
    const quarantinePayload = await quarantineResponse.json() as {
      after: { effectiveState: string; runtimeOverride: { quarantineActive: boolean } };
    };
    const auditCountAfterQuarantine = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM operator_actions').get() as { count: number }
    ).count;
    const overrideRow = harness.database.db.prepare(`
      SELECT quarantine_active, quarantine_reason
      FROM runtime_overrides
      WHERE account_uid = ?
    `).get(accountUid) as { quarantine_active: number; quarantine_reason: string };

    assert.equal(quarantineResponse.status, 200);
    assert.equal(quarantinePayload.after.effectiveState, 'quarantined');
    assert.equal(quarantinePayload.after.runtimeOverride.quarantineActive, true);
    assert.equal(auditCountAfterQuarantine, 1);
    assert.equal(overrideRow.quarantine_active, 1);
    assert.equal(overrideRow.quarantine_reason, 'manual investigation');

    const releaseResponse = await fetch(`${harness.serviceUrl}/control/runtime/release`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        accountUid,
        reason: 'manual release',
      }),
    });
    const releasePayload = await releaseResponse.json() as {
      after: { effectiveState: string; runtimeOverride: { quarantineActive: boolean } };
      before: { effectiveState: string };
    };
    const auditCountAfterRelease = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM operator_actions').get() as { count: number }
    ).count;
    const actions = harness.database.db.prepare(`
      SELECT action_type, target_id, reason
      FROM operator_actions
      ORDER BY created_at ASC
    `).all() as Array<{ action_type: string; reason: string; target_id: string }>;

    assert.equal(releaseResponse.status, 200);
    assert.equal(releasePayload.before.effectiveState, 'quarantined');
    assert.notEqual(releasePayload.after.effectiveState, 'quarantined');
    assert.equal(releasePayload.after.runtimeOverride.quarantineActive, false);
    assert.equal(auditCountAfterRelease, 2);
    assert.deepEqual(
      actions.map((entry) => ({ action: entry.action_type, reason: entry.reason, target: entry.target_id })),
      [
        { action: 'manual_quarantine', reason: 'manual investigation', target: accountUid },
        { action: 'manual_release', reason: 'manual release', target: accountUid },
      ],
    );
  } finally {
    await harness.cleanup();
  }
});

test('manual jobs run through existing sync/probe logic and leave audit records', async () => {
  const harness = await createHarness();

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-operator-id': 'local-admin',
      'x-operator-key': 'operator-key-1',
    };

    const accountsSyncResponse = await fetch(`${harness.serviceUrl}/control/jobs/accounts-sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: 'manual sync run',
      }),
    });
    const accountsSyncPayload = await accountsSyncResponse.json() as { success: boolean; syncRunId: string };
    const healthProbeResponse = await fetch(`${harness.serviceUrl}/control/jobs/health-probe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: 'manual probe run',
      }),
    });
    const healthProbePayload = await healthProbeResponse.json() as { probeCompleted: boolean; probeRunId: string };
    const actions = harness.database.db.prepare(`
      SELECT action_type, target_id, reason
      FROM operator_actions
      ORDER BY created_at DESC
      LIMIT 2
    `).all() as Array<{ action_type: string; reason: string; target_id: string }>;

    assert.equal(accountsSyncResponse.status, 200);
    assert.equal(accountsSyncPayload.success, true);
    assert.equal(accountsSyncPayload.syncRunId.length > 0, true);
    assert.equal(healthProbeResponse.status, 200);
    assert.equal(healthProbePayload.probeCompleted, true);
    assert.equal(healthProbePayload.probeRunId.length > 0, true);
    assert.deepEqual(
      actions.map((entry) => ({ action: entry.action_type, reason: entry.reason, target: entry.target_id })),
      [
        { action: 'run_health_probe', reason: 'manual probe run', target: 'health_probe' },
        { action: 'run_accounts_sync', reason: 'manual sync run', target: 'accounts_sync' },
      ],
    );
  } finally {
    await harness.cleanup();
  }
});

test('platform endpoints expose local self-use status and audit team-pool/local refresh actions', async () => {
  const platformCalls: string[] = [];
  const harness = await createHarness({
    platformRuntimeController: {
      async ensureTeamPoolRunning() {
        platformCalls.push('ensure');
        return {
          action: 'already_running',
          detail: 'team_pool_already_running',
          probe: {
            baseUrl: 'http://127.0.0.1:8317',
            checkedAt: '2026-04-09T00:00:00.000Z',
            detail: 'models_ok',
            error: null,
            modelsReachable: true,
            port: 8317,
            statusCode: 200,
          },
          scriptPath: null,
          waitMs: 0,
        };
      },
      async restartTeamPool() {
        platformCalls.push('restart');
        return {
          detail: 'team_pool_restarted',
          killedProcessCount: 1,
          killedProcessIds: [4242],
          probe: {
            baseUrl: 'http://127.0.0.1:8317',
            checkedAt: '2026-04-09T00:00:05.000Z',
            detail: 'models_ok',
            error: null,
            modelsReachable: true,
            port: 8317,
            statusCode: 200,
          },
          scriptLaunched: false,
          targetPort: 8317,
          waitMs: 1000,
        };
      },
      async stopTeamPool() {
        platformCalls.push('stop');
        return {
          detail: 'team_pool_stopped',
          killedProcessCount: 1,
          killedProcessIds: [4242],
          probe: {
            baseUrl: 'http://127.0.0.1:8317',
            checkedAt: '2026-04-09T00:00:07.000Z',
            detail: 'models_unreachable',
            error: 'connect ECONNREFUSED',
            modelsReachable: false,
            port: 8317,
            statusCode: null,
          },
          targetPort: 8317,
          waitMs: 1000,
        };
      },
    },
  });

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-operator-id': 'local-admin',
      'x-operator-key': 'operator-key-1',
    };

    const platformResponse = await fetch(`${harness.serviceUrl}/control/platform`, { headers });
    const ensureResponse = await fetch(`${harness.serviceUrl}/control/platform/team-pool/ensure`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: 'ensure engine',
      }),
    });
    const restartResponse = await fetch(`${harness.serviceUrl}/control/platform/team-pool/restart`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: 'restart engine',
      }),
    });
    const stopResponse = await fetch(`${harness.serviceUrl}/control/platform/team-pool/stop`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: 'stop engine',
      }),
    });
    const localRefreshResponse = await fetch(`${harness.serviceUrl}/control/platform/local/prepare`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: 'refresh local stack',
      }),
    });
    const platformPayload = await platformResponse.json() as {
      gateway: { currentMode: string; ready: boolean };
      hiddenLegacyServices: Array<{ serviceName: string }>;
      localUse: { ready: boolean; status: string };
      primaryEntry: { baseUrl: string | null };
      teamPool: { completionProbeHealthy: boolean | null; status: string };
      workspaceMode: string;
    };
    const localRefreshPayload = await localRefreshResponse.json() as {
      accountSync: { success: boolean };
      healthProbe: { probeCompleted: boolean };
      platform: { teamPool: { completionProbeHealthy: boolean | null; status: string } };
      readiness: { ready: boolean };
      syntheticProbe: { success: boolean };
      teamPool: { action: string };
    };
    const actions = harness.database.db.prepare(`
      SELECT action_type, target_id, reason
      FROM operator_actions
      ORDER BY created_at DESC
      LIMIT 3
    `).all() as Array<{ action_type: string; reason: string; target_id: string }>;

    assert.equal(platformResponse.status, 200);
    assert.equal(platformPayload.workspaceMode, 'local_self_use');
    assert.equal(platformPayload.localUse.ready, false);
    assert.equal(platformPayload.localUse.status, 'attention');
    assert.equal(platformPayload.teamPool.status, 'attention');
    assert.equal(platformPayload.teamPool.completionProbeHealthy, null);
    assert.equal(platformPayload.gateway.currentMode, 'legacy');
    assert.equal(typeof platformPayload.primaryEntry.baseUrl, 'string');
    assert.deepEqual(
      platformPayload.hiddenLegacyServices.map((entry) => entry.serviceName),
      ['anthropic_proxy', 'new_api', 'tunnel_public'],
    );

    assert.equal(ensureResponse.status, 200);
    assert.equal(restartResponse.status, 200);
    assert.equal(stopResponse.status, 200);
    assert.equal(localRefreshResponse.status, 200);
    assert.equal(localRefreshPayload.teamPool.action, 'already_running');
    assert.equal(localRefreshPayload.accountSync.success, true);
    assert.equal(localRefreshPayload.healthProbe.probeCompleted, true);
    assert.equal(typeof localRefreshPayload.syntheticProbe.success, 'boolean');
    assert.equal(
      localRefreshPayload.platform.teamPool.completionProbeHealthy,
      localRefreshPayload.syntheticProbe.success,
    );
    assert.equal(
      localRefreshPayload.platform.teamPool.status,
      localRefreshPayload.syntheticProbe.success ? 'ready' : 'attention',
    );
    assert.equal(localRefreshPayload.platform.localUse.ready, localRefreshPayload.syntheticProbe.success);
    assert.equal(typeof localRefreshPayload.readiness.ready, 'boolean');
    assert.deepEqual(platformCalls, ['ensure', 'restart', 'stop', 'ensure']);
    assert.deepEqual(
      actions.map((entry) => ({ action: entry.action_type, reason: entry.reason, target: entry.target_id })),
      [
        { action: 'run_local_refresh', reason: 'refresh local stack', target: 'local_platform' },
        { action: 'run_readiness_check', reason: 'refresh local stack::readiness_check', target: 'readiness_check' },
        { action: 'run_synthetic_probe', reason: 'refresh local stack::synthetic_probe', target: 'synthetic_probe' },
      ],
    );

    const stopActions = harness.database.db.prepare(`
      SELECT action_type, target_id, reason
      FROM operator_actions
      WHERE action_type = 'stop_team_pool'
      LIMIT 1
    `).all() as Array<{ action_type: string; reason: string; target_id: string }>;
    assert.deepEqual(stopActions.map((entry) => ({
      action_type: entry.action_type,
      reason: entry.reason,
      target_id: entry.target_id,
    })), [
      { action_type: 'stop_team_pool', reason: 'stop engine', target_id: 'team_pool' },
    ]);
  } finally {
    await harness.cleanup();
  }
});
