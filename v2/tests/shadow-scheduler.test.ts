import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import type { AppConfig } from '../src/config/app-config.ts';
import { syncAccountRegistry } from '../src/control/account-sync.ts';
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
): void {
  const payload = {
    access_token: 'dummy-access-token',
    account_id: `account-${fileName}`,
    disabled: false,
    email: `${fileName}@example.com`,
    expired: '2099-01-01T00:00:00.000Z',
    id_token: `dummy-id-token-${fileName}`,
    last_refresh: '2099-01-01T00:00:00.000Z',
    refresh_token: `dummy-refresh-token-${fileName}`,
    type: 'codex',
    ...overrides,
  };

  writeFileSync(join(directoryPath, fileName), JSON.stringify(payload, null, 2));
}

async function startJsonServer(statusCode: number): Promise<Server> {
  const server = createServer((_, res) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: statusCode === 200 }));
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

async function runHealthyProbe(
  config: AppConfig,
  database: DatabaseManager,
  logger: Logger,
): Promise<void> {
  const healthyServer = await startJsonServer(200);

  try {
    const serviceDefinitions: ServiceProbeDefinition[] = [
      {
        acceptableStatusCodes: [200],
        name: 'healthy_service',
        target: `http://127.0.0.1:${(healthyServer.address() as AddressInfo).port}/health`,
        timeoutMs: 100,
      },
    ];

    await runHealthProbe(database, logger, serviceDefinitions, {
      workspaceRoot: config.workspaceRoot,
    });
  } finally {
    await closeServer(healthyServer);
  }
}

function setupFixture() {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'codex-pool-v2-scheduler-'));
  const config = createTestConfig(rootDirectory);
  const logger = new Logger('error', { test: 'shadow-scheduler' });

  mkdirSync(config.dataDirectory, { recursive: true });
  mkdirSync(config.authSources.team, { recursive: true });
  mkdirSync(config.authSources.free, { recursive: true });

  const database = new DatabaseManager(config, logger);
  database.initialize();

  return {
    config,
    database,
    logger,
    rootDirectory,
  };
}

test('shadow scheduler ranks healthier accounts higher and persists explainable decisions', async () => {
  const fixture = setupFixture();

  try {
    writeAuthFixture(fixture.config.authSources.team, 'team-ready.json', {
      account_id: 'team-ready',
      email: 'team-ready@example.com',
      last_refresh: '2099-01-01T00:00:00.000Z',
    });
    writeAuthFixture(fixture.config.authSources.free, 'free-stale.json', {
      account_id: 'free-stale',
      email: 'free-stale@example.com',
      last_refresh: '2025-01-01T00:00:00.000Z',
    });
    writeAuthFixture(fixture.config.authSources.free, 'free-disabled.json', {
      account_id: 'free-disabled',
      disabled: true,
      email: 'free-disabled@example.com',
    });

    syncAccountRegistry(fixture.config, fixture.database, fixture.logger);
    await runHealthyProbe(fixture.config, fixture.database, fixture.logger);

    const scheduler = new ShadowScheduler(fixture.config, fixture.database, fixture.logger);
    const decision = scheduler.persistDecision({
      model: 'gpt-4.1',
      protocol: 'openai',
      timestamp: '2026-04-09T00:30:00.000Z',
    });
    const selectedAccount = fixture.database.db.prepare(`
      SELECT source_account_id
      FROM account_registry
      WHERE account_uid = ?
    `).get(decision.selectedAccountUid) as { source_account_id: string };
    const decisionCount = (
      fixture.database.db.prepare('SELECT COUNT(*) AS count FROM routing_decisions').get() as { count: number }
    ).count;
    const candidateCount = (
      fixture.database.db.prepare('SELECT COUNT(*) AS count FROM routing_decision_candidates').get() as {
        count: number;
      }
    ).count;
    const runtimeAccounts = scheduler.getRuntimeAccounts('2026-04-09T00:30:00.000Z');

    assert.equal(decision.decisionMode, 'shadow');
    assert.equal(decision.persistence, 'persisted');
    assert.equal(decision.availableCandidateCount, 2);
    assert.equal(decision.candidates.length, 3);
    assert.equal(selectedAccount.source_account_id, 'team-ready');
    assert.equal(decisionCount, 1);
    assert.equal(candidateCount, 3);
    assert.equal(
      decision.candidates.some((candidate) => candidate.accountUid === decision.selectedAccountUid && candidate.rank === 1),
      true,
    );
    assert.equal(
      decision.candidates.some(
        (candidate) =>
          candidate.eligibilityReason === 'registry_status_disabled' &&
          candidate.eligible === false,
      ),
      true,
    );
    assert.equal(
      runtimeAccounts.some((account) => account.sourceType === 'team' && account.effectiveState === 'ready'),
      true,
    );
    assert.equal(
      runtimeAccounts.some((account) => account.sourceType === 'free' && account.effectiveState === 'degraded'),
      true,
    );
  } finally {
    fixture.database.close();
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test('feedback drives degraded, cooldown, recovery probe, and quarantined runtime states', async () => {
  const fixture = setupFixture();

  try {
    writeAuthFixture(fixture.config.authSources.team, 'team-runtime.json', {
      account_id: 'team-runtime',
      email: 'team-runtime@example.com',
    });

    syncAccountRegistry(fixture.config, fixture.database, fixture.logger);
    await runHealthyProbe(fixture.config, fixture.database, fixture.logger);

    const scheduler = new ShadowScheduler(fixture.config, fixture.database, fixture.logger);
    const firstDecision = scheduler.persistDecision({
      protocol: 'openai',
      timestamp: '2026-04-09T01:00:00.000Z',
    });

    const firstFailure = scheduler.recordFeedback({
      decisionId: firstDecision.decisionId,
      outcome: 'failure',
      observedAt: '2026-04-09T01:01:00.000Z',
    });
    const secondFailure = scheduler.recordFeedback({
      accountUid: firstDecision.selectedAccountUid,
      outcome: 'failure',
      observedAt: '2026-04-09T01:02:00.000Z',
    });
    const healthService = new HealthService(fixture.config, fixture.database, scheduler);
    const cooldownSummary = healthService.getHealthSummary('2026-04-09T01:03:00.000Z') as {
      accountAvailability: { availableForRouting: number };
      currentRuntimeReadiness: { overallReadyNow: boolean };
      overallReady: boolean;
    };

    fixture.database.db.prepare(`
      UPDATE account_runtime_state
      SET cooldown_until = ?, recovery_probe_due_at = ?
      WHERE account_uid = ?
    `).run(
      '2026-04-09T01:00:00.000Z',
      '2026-04-09T01:00:00.000Z',
      firstDecision.selectedAccountUid,
    );

    const recoveryDecision = scheduler.preview({
      protocol: 'openai',
      timestamp: '2026-04-09T01:10:00.000Z',
    });
    const recoveryCandidate = recoveryDecision.candidates.find(
      (candidate) => candidate.accountUid === firstDecision.selectedAccountUid,
    );
    const recoverySuccess = scheduler.recordFeedback({
      accountUid: firstDecision.selectedAccountUid,
      outcome: 'success',
      observedAt: '2026-04-09T01:11:00.000Z',
    });
    const authError = scheduler.recordFeedback({
      accountUid: firstDecision.selectedAccountUid,
      outcome: 'auth_error',
      observedAt: '2026-04-09T01:12:00.000Z',
    });

    assert.equal(firstFailure.runtimeStateBefore, 'ready');
    assert.equal(firstFailure.runtimeStateAfter, 'degraded');
    assert.equal(secondFailure.runtimeStateAfter, 'cooldown');
    assert.equal(cooldownSummary.accountAvailability.availableForRouting, 0);
    assert.equal(cooldownSummary.currentRuntimeReadiness.overallReadyNow, false);
    assert.equal(cooldownSummary.overallReady, false);
    assert.equal(recoveryDecision.availableCandidateCount, 1);
    assert.equal(recoveryCandidate?.recoveryProbeEligible, true);
    assert.equal(recoverySuccess.runtimeStateAfter, 'degraded');
    assert.equal(authError.runtimeStateAfter, 'quarantined');
    assert.equal(authError.quarantinedUntil !== null, true);
  } finally {
    fixture.database.close();
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test('recent sync failure remains a signal and does not make the whole pool unroutable', async () => {
  const fixture = setupFixture();

  try {
    writeAuthFixture(fixture.config.authSources.team, 'team-signal.json', {
      account_id: 'team-signal',
      email: 'team-signal@example.com',
    });

    syncAccountRegistry(fixture.config, fixture.database, fixture.logger);
    writeFileSync(join(fixture.config.authSources.free, 'free-invalid.json'), '{not-valid-json');
    assert.throws(() => syncAccountRegistry(fixture.config, fixture.database, fixture.logger));

    await runHealthyProbe(fixture.config, fixture.database, fixture.logger);

    const accountSnapshot = fixture.database.db.prepare(`
      SELECT runtime_health, sync_failure_signal
      FROM account_health_snapshots
      ORDER BY observed_at DESC
      LIMIT 1
    `).get() as { runtime_health: string; sync_failure_signal: number };
    const scheduler = new ShadowScheduler(fixture.config, fixture.database, fixture.logger);
    const healthService = new HealthService(fixture.config, fixture.database, scheduler);
    const summary = healthService.getHealthSummary() as {
      accountAvailability: { availableForRouting: number };
      latestProbeRun: Record<string, unknown>;
      overallReady: boolean;
      signals: { latestSyncFailureSignal: boolean };
    };

    assert.notEqual(accountSnapshot.runtime_health, 'unhealthy');
    assert.equal(accountSnapshot.sync_failure_signal, 1);
    assert.equal(summary.signals.latestSyncFailureSignal, true);
    assert.equal(summary.accountAvailability.availableForRouting, 1);
    assert.equal(summary.overallReady, true);
    assert.equal(summary.latestProbeRun.probeCompleted, true);
    assert.equal('success' in summary.latestProbeRun, false);
  } finally {
    fixture.database.close();
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});
