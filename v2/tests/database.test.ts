import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { DatabaseManager } from '../src/ledger/database.ts';
import { Logger } from '../src/logging/logger.ts';

test('initialize does not reset schema_version when metadata already exists', () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'codex-pool-v2-db-'));
  const databasePath = join(tempDirectory, 'test.sqlite');
  const logger = new Logger('error', { test: 'database' });
  const database = new DatabaseManager(
    {
      databasePath,
      stage: 'stage6',
    },
    logger,
  );

  try {
    database.initialize();
    database.upsertMetadata('schema_version', '7');

    database.db.prepare(`
      INSERT INTO operator_actions (
        action_id,
        operator_id,
        operator_key_fingerprint,
        action_type,
        target_type,
        target_id,
        reason,
        before_json,
        after_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'action-synthetic',
      'operator-1',
      'fp-1',
      'run_synthetic_probe',
      'job',
      'synthetic_probe',
      'schema validation',
      '{}',
      '{}',
      '2026-04-09T00:00:00.000Z',
    );
    database.db.prepare(`
      INSERT INTO operator_actions (
        action_id,
        operator_id,
        operator_key_fingerprint,
        action_type,
        target_type,
        target_id,
        reason,
        before_json,
        after_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'action-readiness',
      'operator-1',
      'fp-1',
      'run_readiness_check',
      'job',
      'readiness_check',
      'schema validation',
      '{}',
      '{}',
      '2026-04-09T00:01:00.000Z',
    );
    database.db.prepare(`
      INSERT INTO operator_actions (
        action_id,
        operator_id,
        operator_key_fingerprint,
        action_type,
        target_type,
        target_id,
        reason,
        before_json,
        after_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'action-platform',
      'operator-1',
      'fp-1',
      'ensure_team_pool_running',
      'job',
      'team_pool',
      'schema validation',
      '{}',
      '{}',
      '2026-04-09T00:02:00.000Z',
    );
    database.db.prepare(`
      INSERT INTO operator_actions (
        action_id,
        operator_id,
        operator_key_fingerprint,
        action_type,
        target_type,
        target_id,
        reason,
        before_json,
        after_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'action-local-refresh',
      'operator-1',
      'fp-1',
      'run_local_refresh',
      'job',
      'local_platform',
      'schema validation',
      '{}',
      '{}',
      '2026-04-09T00:03:00.000Z',
    );
    database.db.prepare(`
      INSERT INTO operator_actions (
        action_id,
        operator_id,
        operator_key_fingerprint,
        action_type,
        target_type,
        target_id,
        reason,
        before_json,
        after_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'action-stop-team-pool',
      'operator-1',
      'fp-1',
      'stop_team_pool',
      'job',
      'team_pool',
      'schema validation',
      '{}',
      '{}',
      '2026-04-09T00:04:00.000Z',
    );

    database.initialize();

    const actionTypes = database.db.prepare(`
      SELECT action_type
      FROM operator_actions
      ORDER BY created_at ASC
    `).all() as Array<{ action_type: string }>;

    assert.equal(database.getMetadataValue('schema_version'), '7');
    assert.equal(database.getMetadataValue('baseline_stage'), 'stage6');
    assert.equal(database.hasMigration('001_account_registry_and_status_events'), true);
    assert.equal(database.hasMigration('002_health_probe_engine_and_metrics'), true);
    assert.equal(database.hasMigration('003_shadow_scheduler_and_runtime_state'), true);
    assert.equal(database.hasMigration('004_control_plane_api_and_ops_console'), true);
    assert.equal(database.hasMigration('005_pre_cutover_verification'), true);
    assert.equal(database.hasMigration('005a_pre_cutover_operator_action_audit'), true);
    assert.equal(database.hasMigration('006_controlled_cutover_and_rollback_guardrails'), true);
    assert.equal(database.hasMigration('006a_single_platform_operator_action_audit'), true);
    assert.equal(database.hasMigration('006b_local_self_use_operator_action_audit'), true);
    assert.deepEqual(actionTypes.map((row) => row.action_type), [
      'run_synthetic_probe',
      'run_readiness_check',
      'ensure_team_pool_running',
      'run_local_refresh',
      'stop_team_pool',
    ]);
  } finally {
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
