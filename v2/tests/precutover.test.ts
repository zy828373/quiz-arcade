import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import type { AppConfig } from '../src/config/app-config.ts';
import { syncAccountRegistry } from '../src/control/account-sync.ts';
import { ControlPlaneRouter } from '../src/control/control-router.ts';
import { ControlPlaneService } from '../src/control/control-service.ts';
import { closeHttpServer, createHttpServer, listenHttpServer } from '../src/gateway/http-server.ts';
import { ParallelGateway } from '../src/gateway/parallel-gateway.ts';
import { HealthService } from '../src/health/health-service.ts';
import { runHealthProbe } from '../src/health/probe-engine.ts';
import { DatabaseManager } from '../src/ledger/database.ts';
import { Logger } from '../src/logging/logger.ts';
import { ShadowScheduler } from '../src/routing/shadow-scheduler.ts';

type Harness = {
  cleanup: () => Promise<void>;
  database: DatabaseManager;
  serviceUrl: string;
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
        account_id: 'team-ready',
        disabled: false,
        email: 'team-ready@example.com',
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

async function startMockUpstreamServer(failChatCompletions: boolean): Promise<Server> {
  const server = createServer(async (req, res) => {
    const rawBody = await readRequestBody(req);
    const body = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : null;

    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'gpt-5.4', object: 'model', created: 1, owned_by: 'openai' }] }));
      return;
    }

    if (req.url === '/health' || req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      if (failChatCompletions) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'synthetic upstream failure' } }));
        return;
      }

      if (body?.stream === true) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
        res.write(`data: ${JSON.stringify({
          id: 'chatcmpl-stream',
          model: 'gpt-5.4',
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        })}\n\n`);
        res.write(`data: ${JSON.stringify({
          id: 'chatcmpl-stream',
          model: 'gpt-5.4',
          choices: [{ index: 0, delta: { content: 'ready' }, finish_reason: null }],
        })}\n\n`);
        res.write(`data: ${JSON.stringify({
          id: 'chatcmpl-stream',
          model: 'gpt-5.4',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-json',
        object: 'chat.completion',
        model: 'gpt-5.4',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ready' } }],
      }));
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

async function createHarness(failChatCompletions = false): Promise<Harness> {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'codex-pool-v2-precutover-'));
  const config = createTestConfig(rootDirectory);
  const logger = new Logger('error', { test: 'precutover' });

  mkdirSync(config.dataDirectory, { recursive: true });
  mkdirSync(config.authSources.team, { recursive: true });
  mkdirSync(config.authSources.free, { recursive: true });
  writeAuthFixture(config.authSources.team, 'team-ready.json');

  const upstreamServer = await startMockUpstreamServer(failChatCompletions);
  const upstreamPort = (upstreamServer.address() as AddressInfo).port;

  writeFileSync(
    join(rootDirectory, 'config_team.yaml'),
    `port: ${upstreamPort}\napi-keys:\n  - "team-upstream-key"\n`,
  );
  writeFileSync(
    join(rootDirectory, 'proxy_config.json'),
    JSON.stringify(
      {
        acceptedApiKeys: ['client-key-1'],
        proxyPort: upstreamPort,
        requestTimeout: 500,
        targetModel: 'gpt-5.4',
        teamPoolApiKey: 'team-upstream-key',
        teamPoolHost: '127.0.0.1',
        teamPoolPort: upstreamPort,
      },
      null,
      2,
    ),
  );

  const previousEnv = {
    operator: process.env.V2_OPERATOR_API_KEYS,
    synthetic: process.env.V2_SYNTHETIC_CLIENT_API_KEYS,
    newApi: process.env.V2_NEW_API_STATUS_URL,
    tunnel: process.env.V2_TUNNEL_PUBLIC_URL,
  };
  process.env.V2_OPERATOR_API_KEYS = 'operator-key-1';
  process.env.V2_SYNTHETIC_CLIENT_API_KEYS = 'synthetic-key-1';
  process.env.V2_NEW_API_STATUS_URL = `http://127.0.0.1:${upstreamPort}/api/status`;
  process.env.V2_TUNNEL_PUBLIC_URL = `http://127.0.0.1:${upstreamPort}/v1/models`;

  const database = new DatabaseManager(config, logger);
  database.initialize();
  syncAccountRegistry(config, database, logger);
  await runHealthProbe(database, logger, undefined, { workspaceRoot: config.workspaceRoot });

  const scheduler = new ShadowScheduler(config, database, logger);
  const healthService = new HealthService(config, database, scheduler);
  const controlPlaneService = new ControlPlaneService(
    { authSources: config.authSources, workspaceRoot: config.workspaceRoot },
    database,
    healthService,
    scheduler,
    logger,
  );
  const controlPlaneRouter = new ControlPlaneRouter({ workspaceRoot: config.workspaceRoot }, controlPlaneService, logger);
  const parallelGateway = new ParallelGateway({ workspaceRoot: config.workspaceRoot }, scheduler, logger);
  const server = createHttpServer({
    config,
    healthService,
    logger,
    controlPlaneRouter,
    parallelGateway,
  });

  await listenHttpServer(server, '127.0.0.1', 0);
  const servicePort = (server.address() as AddressInfo).port;
  const serviceUrl = `http://127.0.0.1:${servicePort}`;
  controlPlaneService.setServiceBaseUrl(serviceUrl);

  return {
    cleanup: async () => {
      await closeHttpServer(server);
      await closeServer(upstreamServer);
      database.close();
      rmSync(rootDirectory, { recursive: true, force: true });

      if (previousEnv.operator === undefined) delete process.env.V2_OPERATOR_API_KEYS;
      else process.env.V2_OPERATOR_API_KEYS = previousEnv.operator;
      if (previousEnv.synthetic === undefined) delete process.env.V2_SYNTHETIC_CLIENT_API_KEYS;
      else process.env.V2_SYNTHETIC_CLIENT_API_KEYS = previousEnv.synthetic;
      if (previousEnv.newApi === undefined) delete process.env.V2_NEW_API_STATUS_URL;
      else process.env.V2_NEW_API_STATUS_URL = previousEnv.newApi;
      if (previousEnv.tunnel === undefined) delete process.env.V2_TUNNEL_PUBLIC_URL;
      else process.env.V2_TUNNEL_PUBLIC_URL = previousEnv.tunnel;
    },
    database,
    serviceUrl,
  };
}

test('readiness and synthetic control endpoints stay read-only and become ready after a passing synthetic probe', async () => {
  const harness = await createHarness(false);

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-operator-id': 'local-admin',
      'x-operator-key': 'operator-key-1',
    };
    const initialReadinessResponse = await fetch(`${harness.serviceUrl}/control/readiness`, { headers });
    const initialReadinessPayload = await initialReadinessResponse.json() as {
      current: { blockers: Array<{ code: string }>; ready: boolean };
    };

    assert.equal(initialReadinessResponse.status, 200);
    assert.equal(initialReadinessPayload.current.ready, false);
    assert.equal(initialReadinessPayload.current.blockers.some((entry) => entry.code === 'synthetic_probe_missing'), true);

    const syntheticResponse = await fetch(`${harness.serviceUrl}/control/jobs/synthetic-probe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'stage6 synthetic success' }),
    });
    const syntheticPayload = await syntheticResponse.json() as {
      anthropicJsonPassed: boolean;
      openaiJsonPassed: boolean;
      success: boolean;
      syntheticRunId: string;
    };
    const readinessCheckResponse = await fetch(`${harness.serviceUrl}/control/jobs/readiness-check`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'stage6 readiness snapshot' }),
    });
    const readinessCheckPayload = await readinessCheckResponse.json() as {
      blockers: Array<{ code: string }>;
      readinessSnapshotId: string;
      ready: boolean;
    };

    assert.equal(syntheticResponse.status, 200);
    assert.equal(syntheticPayload.success, true);
    assert.equal(syntheticPayload.openaiJsonPassed, true);
    assert.equal(syntheticPayload.anthropicJsonPassed, true);
    assert.equal(readinessCheckResponse.status, 200);
    assert.equal(readinessCheckPayload.ready, true);
    assert.equal(readinessCheckPayload.readinessSnapshotId.length > 0, true);
    assert.equal(readinessCheckPayload.blockers.length, 0);

    const operatorActions = harness.database.db.prepare(`
      SELECT action_type, target_id, reason, before_json, after_json
      FROM operator_actions
      ORDER BY created_at DESC
      LIMIT 2
    `).all() as Array<{
      action_type: string;
      after_json: string;
      before_json: string;
      reason: string;
      target_id: string;
    }>;
    const syntheticAudit = operatorActions.find((entry) => entry.action_type === 'run_synthetic_probe');
    const readinessAudit = operatorActions.find((entry) => entry.action_type === 'run_readiness_check');
    const syntheticBefore = JSON.parse(syntheticAudit?.before_json ?? 'null') as {
      latestSyntheticRun: unknown;
    } | null;
    const syntheticAfter = JSON.parse(syntheticAudit?.after_json ?? 'null') as {
      latestSyntheticRun: { syntheticRunId: string };
      result: { success: boolean; syntheticRunId: string };
    } | null;
    const readinessBefore = JSON.parse(readinessAudit?.before_json ?? 'null') as {
      latestReadinessSnapshot: unknown;
    } | null;
    const readinessAfter = JSON.parse(readinessAudit?.after_json ?? 'null') as {
      latestReadinessSnapshot: { readinessSnapshotId: string };
      result: { ready: boolean; readinessSnapshotId: string };
    } | null;

    const routingDecisionRow = harness.database.db.prepare(`
      SELECT request_context_json
      FROM routing_decisions
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as { request_context_json: string };
    const routingContext = JSON.parse(routingDecisionRow.request_context_json) as Record<string, unknown>;
    assert.equal(routingContext.authPrincipal, 'synthetic_client_key');

    const syntheticRunCountBefore = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM synthetic_probe_runs').get() as { count: number }
    ).count;
    const readinessSnapshotCountBefore = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM cutover_readiness_snapshots').get() as { count: number }
    ).count;
    const runtimeStateCountBefore = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM account_runtime_state').get() as { count: number }
    ).count;

    const syntheticReadResponse = await fetch(`${harness.serviceUrl}/control/synthetic`, { headers });
    const syntheticReadPayload = await syntheticReadResponse.json() as {
      latestRun: { results: unknown[]; success: boolean };
    };
    const readinessReadResponse = await fetch(`${harness.serviceUrl}/control/readiness`, { headers });
    const readinessReadPayload = await readinessReadResponse.json() as {
      current: { ready: boolean };
      latestSnapshot: { ready: boolean } | null;
    };

    const syntheticRunCountAfter = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM synthetic_probe_runs').get() as { count: number }
    ).count;
    const readinessSnapshotCountAfter = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM cutover_readiness_snapshots').get() as { count: number }
    ).count;
    const runtimeStateCountAfter = (
      harness.database.db.prepare('SELECT COUNT(*) AS count FROM account_runtime_state').get() as { count: number }
    ).count;

    assert.equal(operatorActions.length, 2);
    assert.equal(syntheticAudit?.target_id, 'synthetic_probe');
    assert.equal(syntheticAudit?.reason, 'stage6 synthetic success');
    assert.equal(syntheticBefore?.latestSyntheticRun ?? null, null);
    assert.equal(syntheticAfter?.result.success, true);
    assert.equal(syntheticAfter?.result.syntheticRunId, syntheticPayload.syntheticRunId);
    assert.equal(syntheticAfter?.latestSyntheticRun.syntheticRunId, syntheticPayload.syntheticRunId);
    assert.equal(readinessAudit?.target_id, 'readiness_check');
    assert.equal(readinessAudit?.reason, 'stage6 readiness snapshot');
    assert.equal(readinessBefore?.latestReadinessSnapshot ?? null, null);
    assert.equal(readinessAfter?.result.ready, true);
    assert.equal(readinessAfter?.result.readinessSnapshotId, readinessCheckPayload.readinessSnapshotId);
    assert.equal(
      readinessAfter?.latestReadinessSnapshot.readinessSnapshotId,
      readinessCheckPayload.readinessSnapshotId,
    );
    assert.equal(syntheticReadResponse.status, 200);
    assert.equal(readinessReadResponse.status, 200);
    assert.equal(syntheticReadPayload.latestRun.success, true);
    assert.equal(syntheticReadPayload.latestRun.results.length >= 2, true);
    assert.equal(readinessReadPayload.current.ready, true);
    assert.equal(readinessReadPayload.latestSnapshot?.ready, true);
    assert.equal(syntheticRunCountBefore, syntheticRunCountAfter);
    assert.equal(readinessSnapshotCountBefore, readinessSnapshotCountAfter);
    assert.equal(runtimeStateCountBefore, runtimeStateCountAfter);
  } finally {
    await harness.cleanup();
  }
});

test('failed synthetic probes are persisted and keep readiness blocked', async () => {
  const harness = await createHarness(true);

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-operator-id': 'local-admin',
      'x-operator-key': 'operator-key-1',
    };

    const syntheticResponse = await fetch(`${harness.serviceUrl}/control/jobs/synthetic-probe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'stage6 synthetic failure' }),
    });
    const syntheticPayload = await syntheticResponse.json() as {
      anthropicJsonPassed: boolean;
      openaiJsonPassed: boolean;
      success: boolean;
      totalChecks: number;
    };
    const readinessCheckResponse = await fetch(`${harness.serviceUrl}/control/jobs/readiness-check`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'stage6 readiness blocked' }),
    });
    const readinessCheckPayload = await readinessCheckResponse.json() as {
      blockers: Array<{ code: string }>;
      readinessSnapshotId: string;
      ready: boolean;
    };
    const readinessResponse = await fetch(`${harness.serviceUrl}/control/readiness`, { headers });
    const readinessPayload = await readinessResponse.json() as {
      current: { blockers: Array<{ code: string }>; ready: boolean };
    };
    const operatorActions = harness.database.db.prepare(`
      SELECT action_type, target_id, reason, before_json, after_json
      FROM operator_actions
      ORDER BY created_at DESC
      LIMIT 2
    `).all() as Array<{
      action_type: string;
      after_json: string;
      before_json: string;
      reason: string;
      target_id: string;
    }>;
    const syntheticAudit = operatorActions.find((entry) => entry.action_type === 'run_synthetic_probe');
    const readinessAudit = operatorActions.find((entry) => entry.action_type === 'run_readiness_check');
    const syntheticAfter = JSON.parse(syntheticAudit?.after_json ?? 'null') as {
      latestSyntheticRun: { syntheticRunId: string };
      result: { success: boolean; syntheticRunId: string };
    } | null;
    const readinessAfter = JSON.parse(readinessAudit?.after_json ?? 'null') as {
      latestReadinessSnapshot: { readinessSnapshotId: string };
      result: { blockers: Array<{ code: string }>; ready: boolean; readinessSnapshotId: string };
    } | null;

    assert.equal(syntheticResponse.status, 200);
    assert.equal(syntheticPayload.success, false);
    assert.equal(syntheticPayload.openaiJsonPassed, false);
    assert.equal(syntheticPayload.anthropicJsonPassed, false);
    assert.equal(syntheticPayload.totalChecks >= 2, true);
    assert.equal(readinessCheckResponse.status, 200);
    assert.equal(readinessCheckPayload.ready, false);
    assert.equal(readinessCheckPayload.readinessSnapshotId.length > 0, true);
    assert.equal(readinessResponse.status, 200);
    assert.equal(readinessPayload.current.ready, false);
    assert.equal(readinessPayload.current.blockers.some((entry) => entry.code === 'synthetic_openai_failed'), true);
    assert.equal(readinessPayload.current.blockers.some((entry) => entry.code === 'synthetic_anthropic_failed'), true);
    assert.equal(operatorActions.length, 2);
    assert.equal(syntheticAudit?.target_id, 'synthetic_probe');
    assert.equal(syntheticAudit?.reason, 'stage6 synthetic failure');
    assert.equal(syntheticAfter?.result.success, false);
    assert.equal(syntheticAfter?.result.syntheticRunId.length > 0, true);
    assert.equal(syntheticAfter?.latestSyntheticRun.syntheticRunId, syntheticAfter?.result.syntheticRunId);
    assert.equal(readinessAudit?.target_id, 'readiness_check');
    assert.equal(readinessAudit?.reason, 'stage6 readiness blocked');
    assert.equal(readinessAfter?.result.ready, false);
    assert.equal(readinessAfter?.result.readinessSnapshotId, readinessCheckPayload.readinessSnapshotId);
    assert.equal(
      readinessAfter?.result.blockers.some((entry) => entry.code === 'synthetic_openai_failed'),
      true,
    );
    assert.equal(
      readinessAfter?.latestReadinessSnapshot.readinessSnapshotId,
      readinessCheckPayload.readinessSnapshotId,
    );
  } finally {
    await harness.cleanup();
  }
});
