import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import type { AppConfig } from '../src/config/app-config.ts';
import { syncAccountRegistry } from '../src/control/account-sync.ts';
import { DatabaseManager } from '../src/ledger/database.ts';
import { Logger } from '../src/logging/logger.ts';

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
    id_token: 'dummy-id-token',
    last_refresh: '2026-04-01T00:00:00.000Z',
    refresh_token: 'dummy-refresh-token',
    type: 'codex',
    ...overrides,
  };

  writeFileSync(join(directoryPath, fileName), JSON.stringify(payload, null, 2));
}

function setupSyncFixture() {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'codex-pool-v2-sync-'));
  const config = createTestConfig(rootDirectory);

  mkdirSync(config.dataDirectory, { recursive: true });
  mkdirSync(config.authSources.team, { recursive: true });
  mkdirSync(config.authSources.free, { recursive: true });

  const logger = new Logger('error', { test: 'account-sync' });
  const database = new DatabaseManager(config, logger);
  database.initialize();

  return {
    config,
    database,
    logger,
    rootDirectory,
  };
}

test('sync imports account metadata and derives the expected initial statuses', () => {
  const fixture = setupSyncFixture();

  try {
    writeAuthFixture(fixture.config.authSources.team, 'team-active.json');
    writeAuthFixture(fixture.config.authSources.team, 'team-disabled.json', {
      account_id: 'team-disabled',
      disabled: true,
      email: 'team-disabled@example.com',
    });
    writeAuthFixture(fixture.config.authSources.free, 'free-expired.json', {
      account_id: 'free-expired',
      email: 'free-expired@example.com',
      expired: '2000-01-01T00:00:00.000Z',
    });

    const summary = syncAccountRegistry(fixture.config, fixture.database, fixture.logger);
    const registryRows = fixture.database.db.prepare(`
      SELECT source_type, current_status, source_file
      FROM account_registry
      ORDER BY source_type, source_file
    `).all() as Array<{ current_status: string; source_file: string; source_type: string }>;
    const eventCount = (
      fixture.database.db.prepare('SELECT COUNT(*) AS count FROM account_status_events').get() as {
        count: number;
      }
    ).count;

    assert.equal(summary.scannedFiles, 3);
    assert.equal(summary.success, true);
    assert.equal(summary.importedAccounts, 3);
    assert.equal(summary.updatedAccounts, 0);
    assert.equal(summary.unchangedAccounts, 0);
    assert.equal(summary.statusEventsWritten, 3);
    assert.equal(summary.registryCounts.total, 3);
    assert.equal(summary.registryCounts.byStatus.active, 1);
    assert.equal(summary.registryCounts.byStatus.disabled, 1);
    assert.equal(summary.registryCounts.byStatus.expired, 1);
    assert.equal(eventCount, 3);
    assert.deepEqual(
      registryRows.map((row) => row.current_status),
      ['expired', 'active', 'disabled'],
    );
  } finally {
    fixture.database.close();
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test('sync is idempotent when source files do not change', () => {
  const fixture = setupSyncFixture();

  try {
    writeAuthFixture(fixture.config.authSources.team, 'team-active.json', {
      account_id: 'team-active',
      email: 'team-active@example.com',
    });
    writeAuthFixture(fixture.config.authSources.free, 'free-active.json', {
      account_id: 'free-active',
      email: 'free-active@example.com',
    });

    const firstRun = syncAccountRegistry(fixture.config, fixture.database, fixture.logger);
    const secondRun = syncAccountRegistry(fixture.config, fixture.database, fixture.logger);
    const registryCount = (
      fixture.database.db.prepare('SELECT COUNT(*) AS count FROM account_registry').get() as {
        count: number;
      }
    ).count;
    const eventCount = (
      fixture.database.db.prepare('SELECT COUNT(*) AS count FROM account_status_events').get() as {
        count: number;
      }
    ).count;

    assert.equal(firstRun.importedAccounts, 2);
    assert.equal(firstRun.success, true);
    assert.equal(secondRun.importedAccounts, 0);
    assert.equal(secondRun.success, true);
    assert.equal(secondRun.updatedAccounts, 0);
    assert.equal(secondRun.unchangedAccounts, 2);
    assert.equal(secondRun.statusEventsWritten, 0);
    assert.equal(registryCount, 2);
    assert.equal(eventCount, 2);
  } finally {
    fixture.database.close();
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test('stable account ids do not depend on the source file name', () => {
  const fixture = setupSyncFixture();

  try {
    writeAuthFixture(fixture.config.authSources.team, 'team-original.json', {
      account_id: 'team-rename-proof',
      email: 'rename-proof@example.com',
    });

    syncAccountRegistry(fixture.config, fixture.database, fixture.logger);

    const originalRow = fixture.database.db.prepare(`
      SELECT account_uid, source_file
      FROM account_registry
      WHERE source_account_id = ?
    `).get('team-rename-proof') as { account_uid: string; source_file: string };

    renameSync(
      join(fixture.config.authSources.team, 'team-original.json'),
      join(fixture.config.authSources.team, 'team-renamed.json'),
    );

    const secondRun = syncAccountRegistry(fixture.config, fixture.database, fixture.logger);
    const renamedRow = fixture.database.db.prepare(`
      SELECT account_uid, source_file
      FROM account_registry
      WHERE source_account_id = ?
    `).get('team-rename-proof') as { account_uid: string; source_file: string };
    const registryCount = (
      fixture.database.db.prepare('SELECT COUNT(*) AS count FROM account_registry').get() as {
        count: number;
      }
    ).count;

    assert.equal(secondRun.importedAccounts, 0);
    assert.equal(secondRun.updatedAccounts, 1);
    assert.equal(secondRun.statusEventsWritten, 0);
    assert.equal(originalRow.account_uid, renamedRow.account_uid);
    assert.notEqual(originalRow.source_file, renamedRow.source_file);
    assert.equal(registryCount, 1);
  } finally {
    fixture.database.close();
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});

test('sync failure rolls back account writes and records a failed sync run', () => {
  const fixture = setupSyncFixture();

  try {
    writeAuthFixture(fixture.config.authSources.team, 'team-valid.json', {
      account_id: 'team-valid',
      email: 'team-valid@example.com',
    });
    writeFileSync(join(fixture.config.authSources.free, 'free-invalid.json'), '{not-valid-json');

    assert.throws(() => syncAccountRegistry(fixture.config, fixture.database, fixture.logger));

    const registryCount = (
      fixture.database.db.prepare('SELECT COUNT(*) AS count FROM account_registry').get() as {
        count: number;
      }
    ).count;
    const statusEventCount = (
      fixture.database.db.prepare('SELECT COUNT(*) AS count FROM account_status_events').get() as {
        count: number;
      }
    ).count;
    const failedSyncRuns = (
      fixture.database.db.prepare(`
        SELECT COUNT(*) AS count
        FROM account_sync_runs
        WHERE success = 0
      `).get() as { count: number }
    ).count;

    assert.equal(registryCount, 0);
    assert.equal(statusEventCount, 0);
    assert.equal(failedSyncRuns, 1);
  } finally {
    fixture.database.close();
    rmSync(fixture.rootDirectory, { recursive: true, force: true });
  }
});
