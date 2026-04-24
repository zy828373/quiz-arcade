import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import type { AppConfig } from '../src/config/app-config.ts';
import { syncAccountRegistry } from '../src/control/account-sync.ts';
import { closeHttpServer, createHttpServer, listenHttpServer } from '../src/gateway/http-server.ts';
import { HealthService } from '../src/health/health-service.ts';
import { runHealthProbe } from '../src/health/probe-engine.ts';
import type { ServiceProbeDefinition } from '../src/health/runtime-targets.ts';
import { DatabaseManager } from '../src/ledger/database.ts';
import { Logger } from '../src/logging/logger.ts';
import { ShadowScheduler } from '../src/routing/shadow-scheduler.ts';

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

function writeAuthFixture(
  directoryPath: string,
  fileName: string,
  overrides: Record<string, unknown> = {},
): string {
  const filePath = join(directoryPath, fileName);
  const payload = {
    access_token: 'dummy-access-token',
    account_id: `account-${fileName}`,
    disabled: false,
    email: `${fileName}@example.com`,
    expired: '2099-01-01T00:00:00.000Z',
    id_token: 'dummy-id-token',
    last_refresh: '2026-04-09T00:00:00.000Z',
    refresh_token: 'dummy-refresh-token',
    type: 'codex',
    ...overrides,
  };

  writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

async function startJsonServer(statusCode: number, payload: unknown, delayMs = 0): Promise<Server> {
  const server = createServer((_, res) => {
    setTimeout(() => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    }, delayMs);
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

test('health probe persists service/account snapshots and exposes query endpoints', async () => {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'codex-pool-v2-health-'));
  const config = createTestConfig(rootDirectory);
  const logger = new Logger('error', { test: 'health-probe' });

  mkdirSync(config.dataDirectory, { recursive: true });
  mkdirSync(config.authSources.team, { recursive: true });
  mkdirSync(config.authSources.free, { recursive: true });

  const activeFilePath = writeAuthFixture(config.authSources.team, 'team-active.json', {
    account_id: 'team-active',
    email: 'team-active@example.com',
  });
  writeAuthFixture(config.authSources.free, 'free-expired.json', {
    account_id: 'free-expired',
    email: 'free-expired@example.com',
    expired: '2000-01-01T00:00:00.000Z',
  });

  const database = new DatabaseManager(config, logger);
  database.initialize();
  syncAccountRegistry(config, database, logger);
  unlinkSync(activeFilePath);

  const healthyServer = await startJsonServer(200, { ok: true });
  const errorServer = await startJsonServer(503, { ok: false });
  const timeoutServer = await startJsonServer(200, { slow: true }, 200);
  const unreachablePort = 1;
  const serviceDefinitions: ServiceProbeDefinition[] = [
    {
      acceptableStatusCodes: [200],
      name: 'healthy_service',
      target: `http://127.0.0.1:${(healthyServer.address() as AddressInfo).port}/health`,
      timeoutMs: 100,
    },
    {
      acceptableStatusCodes: [200],
      name: 'error_service',
      target: `http://127.0.0.1:${(errorServer.address() as AddressInfo).port}/health`,
      timeoutMs: 100,
    },
    {
      acceptableStatusCodes: [200],
      name: 'timeout_service',
      target: `http://127.0.0.1:${(timeoutServer.address() as AddressInfo).port}/health`,
      timeoutMs: 50,
    },
    {
      acceptableStatusCodes: [200],
      name: 'unreachable_service',
      target: `http://127.0.0.1:${unreachablePort}/health`,
      timeoutMs: 100,
    },
  ];

  let apiServer: Server | null = null;

  try {
    const probeSummary = await runHealthProbe(database, logger, serviceDefinitions, {
      workspaceRoot: config.workspaceRoot,
    });
    const serviceCount = (
      database.db.prepare('SELECT COUNT(*) AS count FROM service_health_snapshots').get() as { count: number }
    ).count;
    const accountCount = (
      database.db.prepare('SELECT COUNT(*) AS count FROM account_health_snapshots').get() as { count: number }
    ).count;
    const healthEventCount = (
      database.db.prepare('SELECT COUNT(*) AS count FROM health_events').get() as { count: number }
    ).count;
    const failureCount = (
      database.db.prepare(`
        SELECT COUNT(*) AS count
        FROM service_health_snapshots
        WHERE outcome_code IN ('http_error', 'timeout', 'unreachable')
      `).get() as { count: number }
    ).count;

    assert.equal(probeSummary.serviceProbeCount, 4);
    assert.equal(probeSummary.accountProbeCount, 2);
    assert.equal(probeSummary.probeCompleted, true);
    assert.equal(probeSummary.serviceHealth.unhealthy >= 2, true);
    assert.equal(probeSummary.accountAvailability.unhealthy, 2);
    assert.equal(serviceCount, 4);
    assert.equal(accountCount, 2);
    assert.equal(healthEventCount > 0, true);
    assert.equal(failureCount >= 3, true);

    const scheduler = new ShadowScheduler(config, database, logger);
    const runtimeStateCountBefore = (
      database.db.prepare('SELECT COUNT(*) AS count FROM account_runtime_state').get() as { count: number }
    ).count;
    const routingDecisionCountBefore = (
      database.db.prepare('SELECT COUNT(*) AS count FROM routing_decisions').get() as { count: number }
    ).count;
    const healthService = new HealthService(config, database, scheduler);
    apiServer = createHttpServer({
      config,
      healthService,
      logger,
    });

    await listenHttpServer(apiServer, '127.0.0.1', 0);
    const port = (apiServer.address() as AddressInfo).port;

    const summaryResponse = await fetch(`http://127.0.0.1:${port}/health/summary`);
    const servicesResponse = await fetch(`http://127.0.0.1:${port}/health/services`);
    const accountsResponse = await fetch(`http://127.0.0.1:${port}/health/accounts`);
    const previewResponse = await fetch(`http://127.0.0.1:${port}/scheduler/preview?protocol=openai&model=gpt-4.1`);
    const runtimeResponse = await fetch(`http://127.0.0.1:${port}/runtime/accounts`);

    const summaryPayload = (await summaryResponse.json()) as Record<string, unknown>;
    const servicesPayload = (await servicesResponse.json()) as Array<Record<string, unknown>>;
    const accountsPayload = (await accountsResponse.json()) as Array<Record<string, unknown>>;
    const previewPayload = (await previewResponse.json()) as Record<string, unknown>;
    const runtimePayload = (await runtimeResponse.json()) as Array<Record<string, unknown>>;
    const runtimeStateCountAfter = (
      database.db.prepare('SELECT COUNT(*) AS count FROM account_runtime_state').get() as { count: number }
    ).count;
    const routingDecisionCountAfter = (
      database.db.prepare('SELECT COUNT(*) AS count FROM routing_decisions').get() as { count: number }
    ).count;

    assert.equal(summaryResponse.status, 200);
    assert.equal(servicesResponse.status, 200);
    assert.equal(accountsResponse.status, 200);
    assert.equal(previewResponse.status, 200);
    assert.equal(runtimeResponse.status, 200);
    assert.equal((summaryPayload.latestProbeRun as Record<string, unknown>).serviceProbeCount, 4);
    assert.equal((summaryPayload.latestProbeRun as Record<string, unknown>).probeCompleted, true);
    assert.equal(((summaryPayload.serviceHealth as Record<string, unknown>).unhealthy as number) >= 2, true);
    assert.equal((summaryPayload.accountAvailability as Record<string, unknown>).availableForRouting, 0);
    assert.equal((summaryPayload.currentRuntimeReadiness as Record<string, unknown>).overallReadyNow, false);
    assert.equal(summaryPayload.overallReady, false);
    assert.equal(servicesPayload.length, 4);
    assert.equal(accountsPayload.length, 2);
    assert.equal((previewPayload.request as Record<string, unknown>).protocol, 'openai');
    assert.equal(previewPayload.persistence, 'dry_run');
    assert.equal(runtimePayload.length, 2);
    assert.equal(runtimeStateCountBefore, runtimeStateCountAfter);
    assert.equal(routingDecisionCountBefore, routingDecisionCountAfter);
    assert.equal(
      accountsPayload.some((entry) => entry.runtime_health === 'unhealthy'),
      true,
    );
    assert.equal(
      servicesPayload.some((entry) => entry.outcome_code === 'timeout'),
      true,
    );
    assert.equal(
      servicesPayload.some((entry) => entry.outcome_code === 'unreachable'),
      true,
    );
    assert.equal(
      runtimePayload.some((entry) => entry.effectiveState === 'unroutable'),
      true,
    );
  } finally {
    if (apiServer) {
      await closeHttpServer(apiServer);
    }

    await closeServer(healthyServer);
    await closeServer(errorServer);
    await closeServer(timeoutServer);
    database.close();
    rmSync(rootDirectory, { recursive: true, force: true });
  }
});
