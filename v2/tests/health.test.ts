import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { closeHttpServer, createHttpServer, listenHttpServer } from '../src/gateway/http-server.ts';
import { HealthService } from '../src/health/health-service.ts';
import { DatabaseManager } from '../src/ledger/database.ts';
import { Logger } from '../src/logging/logger.ts';
import { ShadowScheduler } from '../src/routing/shadow-scheduler.ts';

test('health endpoint exposes the control-plane snapshot', async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'codex-pool-v2-'));
  const databasePath = join(tempDirectory, 'test.sqlite');
  const logger = new Logger('error', { test: 'health' });
  const database = new DatabaseManager(
    {
      databasePath,
      stage: 'stage6',
    },
    logger,
  );

  database.initialize();

  const config = {
    serviceName: 'codex-pool-v2',
    version: '0.7.0-phase6',
    stage: 'stage6',
    environment: 'test',
    host: '127.0.0.1',
    port: 0,
    logLevel: 'error',
    dataDirectory: tempDirectory,
    databasePath,
    workspaceRoot: tempDirectory,
    authSources: {
      team: join(tempDirectory, 'auths_team'),
      free: join(tempDirectory, 'auths_free'),
    },
    scheduler: {
      mode: 'shadow' as const,
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
  const scheduler = new ShadowScheduler(config, database, logger);
  const healthService = new HealthService(
    config,
    database,
    scheduler,
  );

  const server = createHttpServer({
    config: {
      serviceName: 'codex-pool-v2',
      version: '0.7.0-phase6',
      stage: 'stage6',
      host: '127.0.0.1',
      port: 0,
    },
    healthService,
    logger,
  });

  try {
    await listenHttpServer(server, '127.0.0.1', 0);

    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const payload = (await response.json()) as Record<string, unknown>;
    const databasePayload = payload.database as Record<string, unknown>;
    const capabilities = payload.capabilities as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'ok');
    assert.equal(payload.stage, 'stage6');
    assert.equal(databasePayload.ready, true);
    assert.equal(databasePayload.schemaVersion, '6');
    assert.equal(capabilities.accountRegistry, true);
    assert.equal(capabilities.healthProbeLedger, true);
    assert.equal(capabilities.scheduler, true);
    assert.equal(capabilities.gatewayRouting, true);
    assert.equal(capabilities.controlApi, true);
    assert.equal(capabilities.opsConsole, true);
    assert.equal(capabilities.syntheticProbes, true);
    assert.equal(capabilities.cutoverReadiness, true);
    assert.equal(capabilities.cutoverControl, true);
  } finally {
    await closeHttpServer(server);
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
