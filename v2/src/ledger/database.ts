import { DatabaseSync } from 'node:sqlite';

import type { AppConfig } from '../config/app-config.ts';
import { Logger } from '../logging/logger.ts';

type MetadataRow = {
  value: string;
};

type TableColumnRow = {
  name: string;
};

export type DatabaseHealth = {
  ready: boolean;
  path: string;
  baselineStage: string | null;
  schemaVersion: string | null;
};

export class DatabaseManager {
  db: DatabaseSync;
  initialized = false;
  config: Pick<AppConfig, 'databasePath' | 'stage'>;
  logger: Logger;

  constructor(config: Pick<AppConfig, 'databasePath' | 'stage'>, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.db = new DatabaseSync(config.databasePath);
  }

  initialize(): void {
    const initializedAt = new Date().toISOString();

    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS system_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.recordMigration('000_stage0_baseline');
    this.initializeMetadataIfMissing('baseline_stage', this.config.stage);
    this.initializeMetadataIfMissing('schema_version', '0');
    this.applyPhaseOneSchema();
    this.applyPhaseTwoSchema();
    this.applyPhaseThreeSchema();
    this.applyPhaseFourSchema();
    this.applyPhaseFiveSchema();
    this.applyPhaseSixSchema();
    this.applyGatewayActivitySchema();
    this.upsertMetadata('bootstrap_status', 'ready');
    this.upsertMetadata('last_initialized_at', initializedAt);

    this.initialized = true;

    this.logger.info('database.initialized', {
      databasePath: this.config.databasePath,
      stage: this.config.stage,
    });
  }

  getHealth(): DatabaseHealth {
    return {
      ready: this.initialized,
      path: this.config.databasePath,
      baselineStage: this.getMetadataValue('baseline_stage'),
      schemaVersion: this.getMetadataValue('schema_version'),
    };
  }

  close(): void {
    this.db.close();
  }

  runInTransaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');

    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  recordMigration(name: string): void {
    if (this.hasMigration(name)) {
      return;
    }

    this.db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
      name,
      new Date().toISOString(),
    );
  }

  upsertMetadata(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO system_metadata (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(key, value, new Date().toISOString());
  }

  initializeMetadataIfMissing(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO system_metadata (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO NOTHING
    `).run(key, value, new Date().toISOString());
  }

  hasMigration(name: string): boolean {
    const existing = this.db.prepare('SELECT name FROM schema_migrations WHERE name = ?').get(name) as
      | { name: string }
      | undefined;

    return Boolean(existing);
  }

  hasColumn(tableName: string, columnName: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as TableColumnRow[];
    return rows.some((row) => row.name === columnName);
  }

  bumpSchemaVersion(targetVersion: number): void {
    const currentRaw = this.getMetadataValue('schema_version');
    const currentVersion = currentRaw === null ? Number.NaN : Number.parseInt(currentRaw, 10);

    if (!Number.isFinite(currentVersion) || currentVersion < targetVersion) {
      this.upsertMetadata('schema_version', String(targetVersion));
    }
  }

  applyPhaseOneSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS account_registry (
        account_uid TEXT PRIMARY KEY,
        identity_source TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('team', 'free')),
        source_file TEXT NOT NULL,
        source_file_name TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        auth_type TEXT,
        source_account_id TEXT,
        email TEXT,
        email_normalized TEXT,
        disabled INTEGER NOT NULL CHECK (disabled IN (0, 1)),
        expired_raw TEXT,
        expires_at TEXT,
        last_refresh_at TEXT,
        current_status TEXT NOT NULL CHECK (current_status IN ('active', 'disabled', 'expired')),
        current_status_reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_account_registry_status
        ON account_registry (current_status);

      CREATE INDEX IF NOT EXISTS idx_account_registry_source_type
        ON account_registry (source_type);

      CREATE INDEX IF NOT EXISTS idx_account_registry_source_account_id
        ON account_registry (source_type, source_account_id);

      CREATE INDEX IF NOT EXISTS idx_account_registry_email_normalized
        ON account_registry (email_normalized);

      CREATE INDEX IF NOT EXISTS idx_account_registry_source_file
        ON account_registry (source_type, source_file);

      CREATE TABLE IF NOT EXISTS account_status_events (
        event_id TEXT PRIMARY KEY,
        account_uid TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('imported', 'status_changed')),
        from_status TEXT,
        to_status TEXT NOT NULL CHECK (to_status IN ('active', 'disabled', 'expired')),
        reason TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        sync_run_id TEXT NOT NULL,
        source_fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (account_uid) REFERENCES account_registry (account_uid)
      );

      CREATE INDEX IF NOT EXISTS idx_account_status_events_account_uid
        ON account_status_events (account_uid, observed_at);

      CREATE INDEX IF NOT EXISTS idx_account_status_events_sync_run
        ON account_status_events (sync_run_id);
    `);

    if (!this.hasMigration('001_account_registry_and_status_events')) {
      this.recordMigration('001_account_registry_and_status_events');
      this.logger.info('database.migration_applied', {
        migration: '001_account_registry_and_status_events',
      });
    }

    this.bumpSchemaVersion(1);
  }

  applyPhaseTwoSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS account_sync_runs (
        sync_run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        success INTEGER NOT NULL CHECK (success IN (0, 1)),
        scanned_files INTEGER NOT NULL,
        imported_accounts INTEGER NOT NULL,
        updated_accounts INTEGER NOT NULL,
        unchanged_accounts INTEGER NOT NULL,
        status_events_written INTEGER NOT NULL,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_account_sync_runs_finished_at
        ON account_sync_runs (finished_at DESC);

      CREATE TABLE IF NOT EXISTS health_probe_runs (
        probe_run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        success INTEGER NOT NULL CHECK (success IN (0, 1)),
        service_probe_count INTEGER NOT NULL,
        account_probe_count INTEGER NOT NULL,
        unhealthy_service_count INTEGER NOT NULL,
        unhealthy_account_count INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_health_probe_runs_finished_at
        ON health_probe_runs (finished_at DESC);

      CREATE TABLE IF NOT EXISTS service_health_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        probe_run_id TEXT NOT NULL,
        service_name TEXT NOT NULL,
        target TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
        outcome_code TEXT NOT NULL,
        http_status INTEGER,
        latency_ms INTEGER,
        reachable INTEGER NOT NULL CHECK (reachable IN (0, 1)),
        timed_out INTEGER NOT NULL CHECK (timed_out IN (0, 1)),
        detail TEXT,
        observed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (probe_run_id) REFERENCES health_probe_runs (probe_run_id)
      );

      CREATE INDEX IF NOT EXISTS idx_service_health_snapshots_run
        ON service_health_snapshots (probe_run_id, service_name);

      CREATE INDEX IF NOT EXISTS idx_service_health_snapshots_service
        ON service_health_snapshots (service_name, observed_at DESC);

      CREATE TABLE IF NOT EXISTS account_health_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        probe_run_id TEXT NOT NULL,
        account_uid TEXT NOT NULL,
        registry_status TEXT NOT NULL CHECK (registry_status IN ('active', 'disabled', 'expired')),
        runtime_health TEXT NOT NULL CHECK (runtime_health IN ('healthy', 'degraded', 'unhealthy')),
        source_file_present INTEGER NOT NULL CHECK (source_file_present IN (0, 1)),
        expired_by_time INTEGER NOT NULL CHECK (expired_by_time IN (0, 1)),
        refresh_stale INTEGER NOT NULL CHECK (refresh_stale IN (0, 1)),
        last_sync_success INTEGER,
        last_sync_run_id TEXT,
        reasons_json TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (probe_run_id) REFERENCES health_probe_runs (probe_run_id),
        FOREIGN KEY (account_uid) REFERENCES account_registry (account_uid)
      );

      CREATE INDEX IF NOT EXISTS idx_account_health_snapshots_run
        ON account_health_snapshots (probe_run_id, account_uid);

      CREATE INDEX IF NOT EXISTS idx_account_health_snapshots_account
        ON account_health_snapshots (account_uid, observed_at DESC);

      CREATE TABLE IF NOT EXISTS health_events (
        event_id TEXT PRIMARY KEY,
        probe_run_id TEXT NOT NULL,
        subject_type TEXT NOT NULL CHECK (subject_type IN ('service', 'account')),
        subject_id TEXT NOT NULL,
        previous_health TEXT,
        current_health TEXT NOT NULL,
        event_kind TEXT NOT NULL CHECK (event_kind IN ('health_changed', 'probe_failure')),
        reason TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (probe_run_id) REFERENCES health_probe_runs (probe_run_id)
      );

      CREATE INDEX IF NOT EXISTS idx_health_events_subject
        ON health_events (subject_type, subject_id, observed_at DESC);

      CREATE INDEX IF NOT EXISTS idx_health_events_run
        ON health_events (probe_run_id);
    `);

    if (!this.hasMigration('002_health_probe_engine_and_metrics')) {
      this.recordMigration('002_health_probe_engine_and_metrics');
      this.logger.info('database.migration_applied', {
        migration: '002_health_probe_engine_and_metrics',
      });
    }

    this.bumpSchemaVersion(2);
  }

  applyPhaseThreeSchema(): void {
    if (!this.hasColumn('health_probe_runs', 'probe_completed')) {
      this.db.exec(`
        ALTER TABLE health_probe_runs
        ADD COLUMN probe_completed INTEGER NOT NULL DEFAULT 1
      `);
    }

    if (!this.hasColumn('health_probe_runs', 'available_account_count')) {
      this.db.exec(`
        ALTER TABLE health_probe_runs
        ADD COLUMN available_account_count INTEGER NOT NULL DEFAULT 0
      `);
    }

    if (!this.hasColumn('health_probe_runs', 'overall_ready')) {
      this.db.exec(`
        ALTER TABLE health_probe_runs
        ADD COLUMN overall_ready INTEGER NOT NULL DEFAULT 0
      `);
    }

    if (!this.hasColumn('account_health_snapshots', 'sync_failure_signal')) {
      this.db.exec(`
        ALTER TABLE account_health_snapshots
        ADD COLUMN sync_failure_signal INTEGER NOT NULL DEFAULT 0
      `);
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS account_runtime_state (
        account_uid TEXT PRIMARY KEY,
        runtime_state TEXT NOT NULL CHECK (
          runtime_state IN ('ready', 'degraded', 'cooldown', 'quarantined', 'unroutable')
        ),
        state_reason TEXT NOT NULL,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        consecutive_successes INTEGER NOT NULL DEFAULT 0,
        total_feedback_count INTEGER NOT NULL DEFAULT 0,
        recovery_probe_attempts INTEGER NOT NULL DEFAULT 0,
        last_feedback_outcome TEXT,
        last_feedback_at TEXT,
        last_failure_at TEXT,
        last_success_at TEXT,
        cooldown_until TEXT,
        quarantined_until TEXT,
        recovery_probe_due_at TEXT,
        last_decision_id TEXT,
        last_decision_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_uid) REFERENCES account_registry (account_uid)
      );

      CREATE INDEX IF NOT EXISTS idx_account_runtime_state_state
        ON account_runtime_state (runtime_state, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_account_runtime_state_recovery_probe_due
        ON account_runtime_state (recovery_probe_due_at);

      CREATE TABLE IF NOT EXISTS routing_decisions (
        decision_id TEXT PRIMARY KEY,
        decision_mode TEXT NOT NULL CHECK (decision_mode IN ('shadow')),
        requested_protocol TEXT NOT NULL,
        requested_model TEXT,
        requested_at TEXT NOT NULL,
        available_candidate_count INTEGER NOT NULL,
        evaluated_candidate_count INTEGER NOT NULL,
        selected_account_uid TEXT,
        selected_runtime_state TEXT,
        selected_score REAL,
        overall_ready INTEGER NOT NULL CHECK (overall_ready IN (0, 1)),
        request_context_json TEXT NOT NULL,
        explanation_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (selected_account_uid) REFERENCES account_registry (account_uid)
      );

      CREATE INDEX IF NOT EXISTS idx_routing_decisions_created_at
        ON routing_decisions (created_at DESC);

      CREATE TABLE IF NOT EXISTS routing_decision_candidates (
        decision_candidate_id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL,
        account_uid TEXT NOT NULL,
        eligible INTEGER NOT NULL CHECK (eligible IN (0, 1)),
        runtime_state TEXT NOT NULL,
        recovery_probe_eligible INTEGER NOT NULL CHECK (recovery_probe_eligible IN (0, 1)),
        final_score REAL NOT NULL,
        rank_order INTEGER,
        eligibility_reason TEXT NOT NULL,
        reasons_json TEXT NOT NULL,
        score_breakdown_json TEXT NOT NULL,
        explanation_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (decision_id) REFERENCES routing_decisions (decision_id),
        FOREIGN KEY (account_uid) REFERENCES account_registry (account_uid)
      );

      CREATE INDEX IF NOT EXISTS idx_routing_decision_candidates_decision
        ON routing_decision_candidates (decision_id, eligible, rank_order);

      CREATE TABLE IF NOT EXISTS routing_feedback (
        feedback_id TEXT PRIMARY KEY,
        decision_id TEXT,
        account_uid TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'rate_limit', 'auth_error')),
        detail TEXT,
        state_before TEXT NOT NULL,
        state_after TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (decision_id) REFERENCES routing_decisions (decision_id),
        FOREIGN KEY (account_uid) REFERENCES account_registry (account_uid)
      );

      CREATE INDEX IF NOT EXISTS idx_routing_feedback_account
        ON routing_feedback (account_uid, observed_at DESC);
    `);

    if (!this.hasMigration('003_shadow_scheduler_and_runtime_state')) {
      this.db.exec(`
        UPDATE health_probe_runs
        SET
          probe_completed = COALESCE(probe_completed, 1),
          available_account_count = CASE
            WHEN account_probe_count - unhealthy_account_count > 0
              THEN account_probe_count - unhealthy_account_count
            ELSE 0
          END,
          overall_ready = CASE
            WHEN COALESCE(probe_completed, 1) = 1
              AND unhealthy_service_count = 0
              AND (
                CASE
                  WHEN account_probe_count - unhealthy_account_count > 0
                    THEN account_probe_count - unhealthy_account_count
                  ELSE 0
                END
              ) > 0
              THEN 1
            ELSE 0
          END
      `);

      this.recordMigration('003_shadow_scheduler_and_runtime_state');
      this.logger.info('database.migration_applied', {
        migration: '003_shadow_scheduler_and_runtime_state',
      });
    }

    this.bumpSchemaVersion(3);
  }

  applyPhaseFourSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runtime_overrides (
        account_uid TEXT PRIMARY KEY,
        quarantine_active INTEGER NOT NULL CHECK (quarantine_active IN (0, 1)),
        quarantine_reason TEXT,
        operator_note TEXT,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_uid) REFERENCES account_registry (account_uid)
      );

      CREATE INDEX IF NOT EXISTS idx_runtime_overrides_quarantine
        ON runtime_overrides (quarantine_active, updated_at DESC);

      CREATE TABLE IF NOT EXISTS operator_actions (
        action_id TEXT PRIMARY KEY,
        operator_id TEXT NOT NULL,
        operator_key_fingerprint TEXT NOT NULL,
        action_type TEXT NOT NULL CHECK (
          action_type IN (
            'manual_quarantine',
            'manual_release',
            'clear_cooldown',
            'annotate_reason',
            'run_accounts_sync',
            'run_health_probe',
            'ensure_team_pool_running',
            'restart_team_pool',
            'stop_team_pool',
            'run_local_refresh',
            'run_synthetic_probe',
            'run_readiness_check'
          )
        ),
        target_type TEXT NOT NULL CHECK (target_type IN ('account', 'job')),
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        before_json TEXT NOT NULL,
        after_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_operator_actions_created_at
        ON operator_actions (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_operator_actions_target
        ON operator_actions (target_type, target_id, created_at DESC);
    `);

    if (!this.hasMigration('004_control_plane_api_and_ops_console')) {
      this.recordMigration('004_control_plane_api_and_ops_console');
      this.logger.info('database.migration_applied', {
        migration: '004_control_plane_api_and_ops_console',
      });
    }

    this.bumpSchemaVersion(4);
  }

  applyPhaseFiveSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS synthetic_probe_runs (
        synthetic_run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        success INTEGER NOT NULL CHECK (success IN (0, 1)),
        base_url TEXT NOT NULL,
        client_key_fingerprint TEXT NOT NULL,
        triggered_by TEXT NOT NULL,
        trigger_reason TEXT NOT NULL,
        total_checks INTEGER NOT NULL,
        passed_checks INTEGER NOT NULL,
        failed_checks INTEGER NOT NULL,
        openai_json_passed INTEGER NOT NULL CHECK (openai_json_passed IN (0, 1)),
        anthropic_json_passed INTEGER NOT NULL CHECK (anthropic_json_passed IN (0, 1)),
        streaming_passed INTEGER,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_synthetic_probe_runs_finished_at
        ON synthetic_probe_runs (finished_at DESC);

      CREATE TABLE IF NOT EXISTS synthetic_probe_results (
        result_id TEXT PRIMARY KEY,
        synthetic_run_id TEXT NOT NULL,
        check_name TEXT NOT NULL CHECK (
          check_name IN ('openai_json', 'anthropic_json', 'openai_stream')
        ),
        protocol TEXT NOT NULL CHECK (protocol IN ('openai', 'anthropic')),
        transport_kind TEXT NOT NULL CHECK (transport_kind IN ('json', 'stream')),
        target_path TEXT NOT NULL,
        request_model TEXT,
        success INTEGER NOT NULL CHECK (success IN (0, 1)),
        http_status INTEGER,
        latency_ms INTEGER,
        response_kind TEXT NOT NULL,
        detail TEXT,
        evidence_json TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (synthetic_run_id) REFERENCES synthetic_probe_runs (synthetic_run_id)
      );

      CREATE INDEX IF NOT EXISTS idx_synthetic_probe_results_run
        ON synthetic_probe_results (synthetic_run_id, observed_at ASC);

      CREATE INDEX IF NOT EXISTS idx_synthetic_probe_results_check
        ON synthetic_probe_results (check_name, observed_at DESC);

      CREATE TABLE IF NOT EXISTS cutover_readiness_snapshots (
        readiness_snapshot_id TEXT PRIMARY KEY,
        evaluated_at TEXT NOT NULL,
        ready INTEGER NOT NULL CHECK (ready IN (0, 1)),
        blocker_count INTEGER NOT NULL,
        warning_count INTEGER NOT NULL,
        triggered_by TEXT NOT NULL,
        trigger_reason TEXT NOT NULL,
        blockers_json TEXT NOT NULL,
        warnings_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cutover_readiness_snapshots_created_at
        ON cutover_readiness_snapshots (created_at DESC);
    `);

    if (!this.hasMigration('005_pre_cutover_verification')) {
      this.recordMigration('005_pre_cutover_verification');
      this.logger.info('database.migration_applied', {
        migration: '005_pre_cutover_verification',
      });
    }

    this.applyPhaseFiveAuditRework();
    this.applyPhaseSixPlatformAuditRework();
    this.bumpSchemaVersion(5);
  }

  applyPhaseFiveAuditRework(): void {
    if (this.hasMigration('005a_pre_cutover_operator_action_audit')) {
      return;
    }

    this.runInTransaction(() => {
      this.db.exec(`
        ALTER TABLE operator_actions RENAME TO operator_actions_legacy;

        CREATE TABLE operator_actions (
          action_id TEXT PRIMARY KEY,
          operator_id TEXT NOT NULL,
          operator_key_fingerprint TEXT NOT NULL,
          action_type TEXT NOT NULL CHECK (
            action_type IN (
              'manual_quarantine',
              'manual_release',
              'clear_cooldown',
              'annotate_reason',
              'run_accounts_sync',
              'run_health_probe',
              'ensure_team_pool_running',
              'restart_team_pool',
              'stop_team_pool',
              'run_local_refresh',
              'run_synthetic_probe',
              'run_readiness_check'
            )
          ),
          target_type TEXT NOT NULL CHECK (target_type IN ('account', 'job')),
          target_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          before_json TEXT NOT NULL,
          after_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

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
        )
        SELECT
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
        FROM operator_actions_legacy;

        DROP TABLE operator_actions_legacy;

        CREATE INDEX IF NOT EXISTS idx_operator_actions_created_at
          ON operator_actions (created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_operator_actions_target
          ON operator_actions (target_type, target_id, created_at DESC);
      `);

      this.recordMigration('005a_pre_cutover_operator_action_audit');
    });

    this.logger.info('database.migration_applied', {
      migration: '005a_pre_cutover_operator_action_audit',
    });
  }

  applyPhaseSixSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cutover_state (
        state_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('legacy', 'parallel', 'canary', 'primary')),
        gate_required INTEGER NOT NULL CHECK (gate_required IN (0, 1)),
        gate_ready INTEGER CHECK (gate_ready IN (0, 1)),
        gate_evaluated_at TEXT,
        gate_blockers_json TEXT NOT NULL,
        gate_warnings_json TEXT NOT NULL,
        public_base_url TEXT,
        synthetic_base_url TEXT,
        updated_by TEXT NOT NULL,
        updated_reason TEXT NOT NULL,
        last_transition_id TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cutover_transitions (
        transition_id TEXT PRIMARY KEY,
        previous_mode TEXT NOT NULL CHECK (previous_mode IN ('legacy', 'parallel', 'canary', 'primary')),
        requested_mode TEXT NOT NULL CHECK (requested_mode IN ('legacy', 'parallel', 'canary', 'primary')),
        resulting_mode TEXT NOT NULL CHECK (resulting_mode IN ('legacy', 'parallel', 'canary', 'primary')),
        outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'rejected')),
        gate_required INTEGER NOT NULL CHECK (gate_required IN (0, 1)),
        gate_ready INTEGER CHECK (gate_ready IN (0, 1)),
        gate_blockers_json TEXT NOT NULL,
        gate_warnings_json TEXT NOT NULL,
        before_json TEXT NOT NULL,
        after_json TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        operator_key_fingerprint TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cutover_transitions_created_at
        ON cutover_transitions (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_cutover_transitions_requested_mode
        ON cutover_transitions (requested_mode, created_at DESC);
    `);

    this.db.prepare(`
      INSERT INTO cutover_state (
        state_id,
        mode,
        gate_required,
        gate_ready,
        gate_evaluated_at,
        gate_blockers_json,
        gate_warnings_json,
        public_base_url,
        synthetic_base_url,
        updated_by,
        updated_reason,
        last_transition_id,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(state_id) DO NOTHING
    `).run(
      'active',
      'legacy',
      0,
      null,
      null,
      '[]',
      '[]',
      null,
      null,
      'system',
      'default_legacy_mode',
      null,
      new Date().toISOString(),
    );

    if (!this.hasMigration('006_controlled_cutover_and_rollback_guardrails')) {
      this.recordMigration('006_controlled_cutover_and_rollback_guardrails');
      this.logger.info('database.migration_applied', {
        migration: '006_controlled_cutover_and_rollback_guardrails',
      });
    }

    this.applyPhaseSixPlatformAuditRework();
    this.applyPhaseSixLocalSelfUseAuditRework();
    this.bumpSchemaVersion(6);
  }

  applyGatewayActivitySchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gateway_request_activity (
        activity_id TEXT PRIMARY KEY,
        occurred_at TEXT NOT NULL,
        request_id TEXT,
        decision_id TEXT,
        protocol TEXT NOT NULL CHECK (protocol IN ('openai', 'anthropic')),
        route_path TEXT NOT NULL,
        request_model TEXT,
        activity_type TEXT NOT NULL CHECK (activity_type IN ('external', 'synthetic', 'unknown')),
        auth_principal TEXT,
        auth_scheme TEXT,
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
        status_code INTEGER,
        error_code TEXT,
        duration_ms INTEGER,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_gateway_request_activity_occurred_at
        ON gateway_request_activity (occurred_at DESC);

      CREATE INDEX IF NOT EXISTS idx_gateway_request_activity_type
        ON gateway_request_activity (activity_type, occurred_at DESC);

      CREATE INDEX IF NOT EXISTS idx_gateway_request_activity_outcome
        ON gateway_request_activity (outcome, occurred_at DESC);
    `);

    if (!this.hasMigration('006c_gateway_request_activity')) {
      this.recordMigration('006c_gateway_request_activity');
      this.logger.info('database.migration_applied', {
        migration: '006c_gateway_request_activity',
      });
    }
  }

  applyPhaseSixPlatformAuditRework(): void {
    if (this.hasMigration('006a_single_platform_operator_action_audit')) {
      return;
    }

    this.runInTransaction(() => {
      this.db.exec(`
        ALTER TABLE operator_actions RENAME TO operator_actions_platform_legacy;

        CREATE TABLE operator_actions (
          action_id TEXT PRIMARY KEY,
          operator_id TEXT NOT NULL,
          operator_key_fingerprint TEXT NOT NULL,
          action_type TEXT NOT NULL CHECK (
            action_type IN (
              'manual_quarantine',
              'manual_release',
              'clear_cooldown',
              'annotate_reason',
              'run_accounts_sync',
              'run_health_probe',
              'ensure_team_pool_running',
              'restart_team_pool',
              'stop_team_pool',
              'run_local_refresh',
              'run_synthetic_probe',
              'run_readiness_check'
            )
          ),
          target_type TEXT NOT NULL CHECK (target_type IN ('account', 'job')),
          target_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          before_json TEXT NOT NULL,
          after_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

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
        )
        SELECT
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
        FROM operator_actions_platform_legacy;

        DROP TABLE operator_actions_platform_legacy;

        CREATE INDEX IF NOT EXISTS idx_operator_actions_created_at
          ON operator_actions (created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_operator_actions_target
          ON operator_actions (target_type, target_id, created_at DESC);
      `);

      this.recordMigration('006a_single_platform_operator_action_audit');
    });

    this.logger.info('database.migration_applied', {
      migration: '006a_single_platform_operator_action_audit',
    });
  }

  applyPhaseSixLocalSelfUseAuditRework(): void {
    if (this.hasMigration('006b_local_self_use_operator_action_audit')) {
      return;
    }

    this.runInTransaction(() => {
      this.db.exec(`
        ALTER TABLE operator_actions RENAME TO operator_actions_local_self_use_legacy;

        CREATE TABLE operator_actions (
          action_id TEXT PRIMARY KEY,
          operator_id TEXT NOT NULL,
          operator_key_fingerprint TEXT NOT NULL,
          action_type TEXT NOT NULL CHECK (
            action_type IN (
              'manual_quarantine',
              'manual_release',
              'clear_cooldown',
              'annotate_reason',
              'run_accounts_sync',
              'run_health_probe',
              'ensure_team_pool_running',
              'restart_team_pool',
              'stop_team_pool',
              'run_local_refresh',
              'run_synthetic_probe',
              'run_readiness_check'
            )
          ),
          target_type TEXT NOT NULL CHECK (target_type IN ('account', 'job')),
          target_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          before_json TEXT NOT NULL,
          after_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

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
        )
        SELECT
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
        FROM operator_actions_local_self_use_legacy;

        DROP TABLE operator_actions_local_self_use_legacy;

        CREATE INDEX IF NOT EXISTS idx_operator_actions_created_at
          ON operator_actions (created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_operator_actions_target
          ON operator_actions (target_type, target_id, created_at DESC);
      `);

      this.recordMigration('006b_local_self_use_operator_action_audit');
    });

    this.logger.info('database.migration_applied', {
      migration: '006b_local_self_use_operator_action_audit',
    });
  }

  getMetadataValue(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM system_metadata WHERE key = ?').get(key) as
      | MetadataRow
      | undefined;

    return row?.value ?? null;
  }
}
