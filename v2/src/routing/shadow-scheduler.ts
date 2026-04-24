import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { AppConfig, SchedulerConfig } from '../config/app-config.ts';
import type { RuntimeHealth } from '../health/probe-engine.ts';
import type { DatabaseManager } from '../ledger/database.ts';
import { Logger } from '../logging/logger.ts';

export type RuntimeRoutingState = 'ready' | 'degraded' | 'cooldown' | 'quarantined' | 'unroutable';
export type FeedbackOutcome = 'success' | 'failure' | 'rate_limit' | 'auth_error';
export type RuntimeControlAction =
  | 'manual_quarantine'
  | 'manual_release'
  | 'clear_cooldown'
  | 'annotate_reason';
type AccountSourceType = 'team' | 'free';
type RegistryStatus = 'active' | 'disabled' | 'expired';

type LatestSyncRun = {
  success: number;
  sync_run_id: string;
} | null;

type SchedulerAccountRow = {
  account_uid: string;
  source_type: AccountSourceType;
  current_status: RegistryStatus;
  current_status_reason: string;
  source_file: string;
  expires_at: string | null;
  last_refresh_at: string | null;
  health_runtime_health: RuntimeHealth | null;
  health_source_file_present: number | null;
  health_expired_by_time: number | null;
  health_refresh_stale: number | null;
  health_last_sync_success: number | null;
  health_last_sync_run_id: string | null;
  health_reasons_json: string | null;
  health_observed_at: string | null;
  health_sync_failure_signal: number | null;
  runtime_state: RuntimeRoutingState | null;
  state_reason: string | null;
  consecutive_failures: number | null;
  consecutive_successes: number | null;
  total_feedback_count: number | null;
  recovery_probe_attempts: number | null;
  last_feedback_outcome: FeedbackOutcome | null;
  last_feedback_at: string | null;
  last_failure_at: string | null;
  last_success_at: string | null;
  cooldown_until: string | null;
  quarantined_until: string | null;
  recovery_probe_due_at: string | null;
  last_decision_id: string | null;
  last_decision_at: string | null;
  runtime_created_at: string | null;
  runtime_updated_at: string | null;
  override_quarantine_active: number | null;
  override_quarantine_reason: string | null;
  override_operator_note: string | null;
  override_updated_by: string | null;
  override_created_at: string | null;
  override_updated_at: string | null;
};

type PersistedRuntimeState = {
  accountUid: string;
  runtimeState: RuntimeRoutingState;
  stateReason: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalFeedbackCount: number;
  recoveryProbeAttempts: number;
  lastFeedbackOutcome: FeedbackOutcome | null;
  lastFeedbackAt: string | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  cooldownUntil: string | null;
  quarantinedUntil: string | null;
  recoveryProbeDueAt: string | null;
  lastDecisionId: string | null;
  lastDecisionAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StaticSignals = {
  expiredByTime: boolean;
  healthObservedAt: string | null;
  lastSyncRunId: string | null;
  lastSyncSuccess: boolean | null;
  latestHealthReasons: string[];
  latestHealthRuntime: RuntimeHealth | null;
  refreshStale: boolean;
  sourceFilePresent: boolean;
  syncFailureSignal: boolean;
};

type ResolvedRuntimeAccount = {
  accountUid: string;
  sourceType: AccountSourceType;
  registryStatus: RegistryStatus;
  registryStatusReason: string;
  sourceFile: string;
  expiresAt: string | null;
  lastRefreshAt: string | null;
  staticSignals: StaticSignals;
  persistedState: PersistedRuntimeState;
  runtimeOverride: RuntimeOverrideView;
  effectiveState: RuntimeRoutingState;
  effectiveStateReason: string;
  recoveryProbeEligible: boolean;
  stateNeedsPersist: boolean;
};

export type RuntimeOverrideView = {
  operatorNote: string | null;
  quarantineActive: boolean;
  quarantineReason: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type RuntimeAccountView = {
  accountUid: string;
  cooldownUntil: string | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  effectiveState: RuntimeRoutingState;
  effectiveStateReason: string;
  expiresAt: string | null;
  latestHealthObservedAt: string | null;
  latestHealthReasons: string[];
  latestHealthRuntime: RuntimeHealth | null;
  lastFeedbackAt: string | null;
  lastFeedbackOutcome: FeedbackOutcome | null;
  lastRefreshAt: string | null;
  lastSyncRunId: string | null;
  lastSyncSuccess: boolean | null;
  quarantinedUntil: string | null;
  recoveryProbeAttempts: number;
  recoveryProbeDueAt: string | null;
  recoveryProbeEligible: boolean;
  refreshStale: boolean;
  registryStatus: RegistryStatus;
  registryStatusReason: string;
  runtimeOverride: RuntimeOverrideView;
  runtimeState: RuntimeRoutingState;
  runtimeStateReason: string;
  sourceFile: string;
  sourceFilePresent: boolean;
  sourceType: AccountSourceType;
  syncFailureSignal: boolean;
  totalFeedbackCount: number;
};

export type ScoreComponent = {
  code: string;
  delta: number;
  detail: string;
};

export type ShadowCandidate = {
  accountUid: string;
  eligibilityReason: string;
  eligible: boolean;
  explanation: {
    effectiveState: RuntimeRoutingState;
    effectiveStateReason: string;
    latestHealthRuntime: RuntimeHealth | null;
    recoveryProbeEligible: boolean;
    registryStatus: RegistryStatus;
  };
  finalScore: number;
  rank: number | null;
  reasons: string[];
  recoveryProbeEligible: boolean;
  runtimeState: RuntimeRoutingState;
  scoreBreakdown: ScoreComponent[];
  sourceType: AccountSourceType;
};

const INELIGIBLE_SCORE = -999999;

export type ShadowDecision = {
  availableCandidateCount: number;
  candidates: ShadowCandidate[];
  decisionId: string;
  decisionMode: 'shadow';
  evaluatedCandidateCount: number;
  explanation: {
    filteredOutCount: number;
    selectedBecause: string | null;
    shadowMode: true;
  };
  overallReady: boolean;
  request: {
    context: SchedulerRequestContext;
    model: string | null;
    protocol: string;
    requestedAt: string;
  };
  persistence: 'dry_run' | 'persisted';
  selectedAccountUid: string | null;
  selectedRuntimeState: RuntimeRoutingState | null;
  selectedScore: number | null;
};

export type SchedulerRequestContext = Record<string, boolean | number | string | null>;

export type SchedulerPreviewInput = {
  model?: string | null;
  protocol?: string | null;
  requestContext?: SchedulerRequestContext;
  timestamp?: string | null;
};

export type RoutingFeedbackInput = {
  accountUid?: string | null;
  decisionId?: string | null;
  detail?: string | null;
  observedAt?: string | null;
  outcome: FeedbackOutcome;
};

export type RoutingFeedbackResult = {
  accountUid: string;
  cooldownUntil: string | null;
  decisionId: string | null;
  feedbackId: string;
  observedAt: string;
  outcome: FeedbackOutcome;
  quarantinedUntil: string | null;
  recoveryProbeDueAt: string | null;
  runtimeStateAfter: RuntimeRoutingState;
  runtimeStateBefore: RuntimeRoutingState;
  totalFeedbackCount: number;
};

export type RuntimeControlActionInput = {
  accountUid: string;
  action: RuntimeControlAction;
  observedAt?: string | null;
  operatorId: string;
  reason: string;
};

export type RuntimeControlActionResult = {
  accountUid: string;
  action: RuntimeControlAction;
  after: RuntimeAccountView;
  before: RuntimeAccountView;
  observedAt: string;
};

type FeedbackTarget = {
  accountUid: string;
  decisionId: string | null;
};

type AvailabilitySummary = {
  availableForRouting: number;
  blockedCount: number;
  byRuntimeState: Record<RuntimeRoutingState, number>;
  overallReady: boolean;
  referenceTimestamp: string;
  total: number;
};

function parseReasons(rawValue: string | null): string[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function toBoolean(value: number | null): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value === 1;
}

function toIsoTimestamp(rawValue: string | null | undefined, fallback: string): string {
  if (!rawValue) {
    return fallback;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.valueOf()) ? fallback : parsed.toISOString();
}

function addMinutes(timestamp: string, minutes: number): string {
  return new Date(new Date(timestamp).valueOf() + minutes * 60 * 1000).toISOString();
}

function hasExpired(timestamp: string | null, referenceMs: number): boolean {
  if (!timestamp) {
    return false;
  }

  const parsed = new Date(timestamp).valueOf();
  return Number.isFinite(parsed) && parsed <= referenceMs;
}

function isFuture(timestamp: string | null, referenceMs: number): boolean {
  if (!timestamp) {
    return false;
  }

  const parsed = new Date(timestamp).valueOf();
  return Number.isFinite(parsed) && parsed > referenceMs;
}

function isExpiringSoon(
  expiresAt: string | null,
  observedAt: string,
  expiringSoonHours: number,
): boolean {
  if (!expiresAt) {
    return false;
  }

  const expiresAtMs = new Date(expiresAt).valueOf();
  const observedAtMs = new Date(observedAt).valueOf();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= observedAtMs) {
    return false;
  }

  return expiresAtMs - observedAtMs <= expiringSoonHours * 60 * 60 * 1000;
}

function loadLatestSyncRun(database: DatabaseManager): LatestSyncRun {
  return database.db.prepare(`
    SELECT sync_run_id, success
    FROM account_sync_runs
    ORDER BY finished_at DESC
    LIMIT 1
  `).get() as LatestSyncRun;
}

function loadSchedulerRows(database: DatabaseManager): SchedulerAccountRow[] {
  return database.db.prepare(`
    SELECT
      ar.account_uid,
      ar.source_type,
      ar.current_status,
      ar.current_status_reason,
      ar.source_file,
      ar.expires_at,
      ar.last_refresh_at,
      ah.runtime_health AS health_runtime_health,
      ah.source_file_present AS health_source_file_present,
      ah.expired_by_time AS health_expired_by_time,
      ah.refresh_stale AS health_refresh_stale,
      ah.last_sync_success AS health_last_sync_success,
      ah.last_sync_run_id AS health_last_sync_run_id,
      ah.reasons_json AS health_reasons_json,
      ah.observed_at AS health_observed_at,
      ah.sync_failure_signal AS health_sync_failure_signal,
      ars.runtime_state,
      ars.state_reason,
      ars.consecutive_failures,
      ars.consecutive_successes,
      ars.total_feedback_count,
      ars.recovery_probe_attempts,
      ars.last_feedback_outcome,
      ars.last_feedback_at,
      ars.last_failure_at,
      ars.last_success_at,
      ars.cooldown_until,
      ars.quarantined_until,
      ars.recovery_probe_due_at,
      ars.last_decision_id,
      ars.last_decision_at,
      ars.created_at AS runtime_created_at,
      ars.updated_at AS runtime_updated_at,
      ro.quarantine_active AS override_quarantine_active,
      ro.quarantine_reason AS override_quarantine_reason,
      ro.operator_note AS override_operator_note,
      ro.updated_by AS override_updated_by,
      ro.created_at AS override_created_at,
      ro.updated_at AS override_updated_at
    FROM account_registry ar
    LEFT JOIN account_health_snapshots ah
      ON ah.snapshot_id = (
        SELECT snapshot_id
        FROM account_health_snapshots
        WHERE account_uid = ar.account_uid
        ORDER BY observed_at DESC
        LIMIT 1
      )
    LEFT JOIN account_runtime_state ars
      ON ars.account_uid = ar.account_uid
    LEFT JOIN runtime_overrides ro
      ON ro.account_uid = ar.account_uid
    ORDER BY ar.account_uid
  `).all() as SchedulerAccountRow[];
}

function upsertRuntimeState(database: DatabaseManager, state: PersistedRuntimeState): void {
  database.db.prepare(`
    INSERT INTO account_runtime_state (
      account_uid,
      runtime_state,
      state_reason,
      consecutive_failures,
      consecutive_successes,
      total_feedback_count,
      recovery_probe_attempts,
      last_feedback_outcome,
      last_feedback_at,
      last_failure_at,
      last_success_at,
      cooldown_until,
      quarantined_until,
      recovery_probe_due_at,
      last_decision_id,
      last_decision_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_uid) DO UPDATE SET
      runtime_state = excluded.runtime_state,
      state_reason = excluded.state_reason,
      consecutive_failures = excluded.consecutive_failures,
      consecutive_successes = excluded.consecutive_successes,
      total_feedback_count = excluded.total_feedback_count,
      recovery_probe_attempts = excluded.recovery_probe_attempts,
      last_feedback_outcome = excluded.last_feedback_outcome,
      last_feedback_at = excluded.last_feedback_at,
      last_failure_at = excluded.last_failure_at,
      last_success_at = excluded.last_success_at,
      cooldown_until = excluded.cooldown_until,
      quarantined_until = excluded.quarantined_until,
      recovery_probe_due_at = excluded.recovery_probe_due_at,
      last_decision_id = excluded.last_decision_id,
      last_decision_at = excluded.last_decision_at,
      updated_at = excluded.updated_at
  `).run(
    state.accountUid,
    state.runtimeState,
    state.stateReason,
    state.consecutiveFailures,
    state.consecutiveSuccesses,
    state.totalFeedbackCount,
    state.recoveryProbeAttempts,
    state.lastFeedbackOutcome,
    state.lastFeedbackAt,
    state.lastFailureAt,
    state.lastSuccessAt,
    state.cooldownUntil,
    state.quarantinedUntil,
    state.recoveryProbeDueAt,
    state.lastDecisionId,
    state.lastDecisionAt,
    state.createdAt,
    state.updatedAt,
  );
}

function upsertRuntimeOverride(
  database: DatabaseManager,
  input: {
    accountUid: string;
    createdAt: string;
    operatorNote: string | null;
    quarantineActive: boolean;
    quarantineReason: string | null;
    updatedAt: string;
    updatedBy: string;
  },
): void {
  database.db.prepare(`
    INSERT INTO runtime_overrides (
      account_uid,
      quarantine_active,
      quarantine_reason,
      operator_note,
      updated_by,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_uid) DO UPDATE SET
      quarantine_active = excluded.quarantine_active,
      quarantine_reason = excluded.quarantine_reason,
      operator_note = excluded.operator_note,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(
    input.accountUid,
    input.quarantineActive ? 1 : 0,
    input.quarantineReason,
    input.operatorNote,
    input.updatedBy,
    input.createdAt,
    input.updatedAt,
  );
}

function deleteRuntimeOverride(database: DatabaseManager, accountUid: string): void {
  database.db.prepare('DELETE FROM runtime_overrides WHERE account_uid = ?').run(accountUid);
}

function buildPersistedState(
  row: SchedulerAccountRow,
  runtimeState: RuntimeRoutingState,
  stateReason: string,
  observedAt: string,
): PersistedRuntimeState {
  return {
    accountUid: row.account_uid,
    runtimeState,
    stateReason,
    consecutiveFailures: row.consecutive_failures ?? 0,
    consecutiveSuccesses: row.consecutive_successes ?? 0,
    totalFeedbackCount: row.total_feedback_count ?? 0,
    recoveryProbeAttempts: row.recovery_probe_attempts ?? 0,
    lastFeedbackOutcome: row.last_feedback_outcome ?? null,
    lastFeedbackAt: row.last_feedback_at ?? null,
    lastFailureAt: row.last_failure_at ?? null,
    lastSuccessAt: row.last_success_at ?? null,
    cooldownUntil: row.cooldown_until ?? null,
    quarantinedUntil: row.quarantined_until ?? null,
    recoveryProbeDueAt: row.recovery_probe_due_at ?? null,
    lastDecisionId: row.last_decision_id ?? null,
    lastDecisionAt: row.last_decision_at ?? null,
    createdAt: row.runtime_created_at ?? observedAt,
    updatedAt: observedAt,
  };
}

function createRuntimeOverrideView(row: SchedulerAccountRow): RuntimeOverrideView {
  return {
    operatorNote: row.override_operator_note ?? null,
    quarantineActive: toBoolean(row.override_quarantine_active) ?? false,
    quarantineReason: row.override_quarantine_reason ?? null,
    updatedAt: row.override_updated_at ?? null,
    updatedBy: row.override_updated_by ?? null,
  };
}

function deriveStaticSignals(
  row: SchedulerAccountRow,
  workspaceRoot: string,
  observedAt: string,
  latestSyncRun: LatestSyncRun,
): StaticSignals {
  const sourceFilePresent = existsSync(join(workspaceRoot, row.source_file));
  const expiredByTime = hasExpired(row.expires_at, new Date(observedAt).valueOf());
  const refreshStale = toBoolean(row.health_refresh_stale) ?? false;
  const lastSyncSuccess =
    toBoolean(row.health_last_sync_success) ??
    (latestSyncRun ? latestSyncRun.success === 1 : null);

  return {
    expiredByTime,
    healthObservedAt: row.health_observed_at,
    lastSyncRunId: row.health_last_sync_run_id ?? latestSyncRun?.sync_run_id ?? null,
    lastSyncSuccess,
    latestHealthReasons: parseReasons(row.health_reasons_json),
    latestHealthRuntime: row.health_runtime_health,
    refreshStale,
    sourceFilePresent,
    syncFailureSignal:
      toBoolean(row.health_sync_failure_signal) ?? (latestSyncRun ? latestSyncRun.success === 0 : false),
  };
}

function deriveBaselineState(
  row: SchedulerAccountRow,
  signals: StaticSignals,
): {
  reason: string;
  state: RuntimeRoutingState;
} {
  if (!signals.sourceFilePresent) {
    return {
      state: 'unroutable',
      reason: 'source_file_missing',
    };
  }

  if (row.current_status === 'disabled') {
    return {
      state: 'unroutable',
      reason: 'registry_status_disabled',
    };
  }

  if (row.current_status === 'expired' || signals.expiredByTime) {
    return {
      state: 'unroutable',
      reason: signals.expiredByTime ? 'expires_at_reached' : 'registry_status_expired',
    };
  }

  if (
    signals.latestHealthRuntime === 'degraded' ||
    signals.refreshStale ||
    signals.syncFailureSignal ||
    signals.healthObservedAt === null
  ) {
    return {
      state: 'degraded',
      reason:
        signals.latestHealthRuntime === 'degraded'
          ? 'latest_health_degraded'
          : signals.refreshStale
            ? 'refresh_stale'
            : signals.syncFailureSignal
              ? 'recent_sync_failed_signal'
              : 'no_health_snapshot',
    };
  }

  return {
    state: 'ready',
    reason: 'baseline_ready',
  };
}

function resolveRuntimeState(
  row: SchedulerAccountRow,
  scheduler: SchedulerConfig,
  workspaceRoot: string,
  observedAt: string,
  latestSyncRun: LatestSyncRun,
): ResolvedRuntimeAccount {
  const observedAtMs = new Date(observedAt).valueOf();
  const signals = deriveStaticSignals(row, workspaceRoot, observedAt, latestSyncRun);
  const baseline = deriveBaselineState(row, signals);
  const runtimeOverride = createRuntimeOverrideView(row);
  let stateNeedsPersist = false;
  let recoveryProbeEligible = false;
  let effectiveState = baseline.state;
  let effectiveStateReason = baseline.reason;
  let persistedState = buildPersistedState(row, baseline.state, baseline.reason, observedAt);

  if (!row.runtime_state) {
    stateNeedsPersist = true;
  } else {
    persistedState = {
      ...persistedState,
      runtimeState: row.runtime_state,
      stateReason: row.state_reason ?? baseline.reason,
      updatedAt: row.runtime_updated_at ?? observedAt,
    };

    if (runtimeOverride.quarantineActive) {
      effectiveState = 'quarantined';
      effectiveStateReason = runtimeOverride.quarantineReason
        ? `manual_override.quarantine:${runtimeOverride.quarantineReason}`
        : 'manual_override.quarantine';
      recoveryProbeEligible = false;

      if (
        row.runtime_state !== 'quarantined' ||
        row.state_reason !== effectiveStateReason ||
        row.cooldown_until !== null ||
        row.quarantined_until !== null ||
        row.recovery_probe_due_at !== null
      ) {
        persistedState.runtimeState = 'quarantined';
        persistedState.stateReason = effectiveStateReason;
        persistedState.cooldownUntil = null;
        persistedState.quarantinedUntil = null;
        persistedState.recoveryProbeDueAt = null;
        stateNeedsPersist = true;
      }
    } else if (baseline.state === 'unroutable') {
      effectiveState = 'unroutable';
      effectiveStateReason = baseline.reason;
      if (row.runtime_state !== 'unroutable' || row.state_reason !== baseline.reason) {
        persistedState.runtimeState = 'unroutable';
        persistedState.stateReason = baseline.reason;
        persistedState.cooldownUntil = null;
        persistedState.quarantinedUntil = null;
        persistedState.recoveryProbeDueAt = null;
        stateNeedsPersist = true;
      }
    } else if (row.runtime_state === 'cooldown' && isFuture(row.cooldown_until, observedAtMs)) {
      effectiveState = 'cooldown';
      effectiveStateReason = row.state_reason ?? 'feedback.cooldown_active';
    } else if (row.runtime_state === 'quarantined' && isFuture(row.quarantined_until, observedAtMs)) {
      effectiveState = 'quarantined';
      effectiveStateReason = row.state_reason ?? 'feedback.quarantine_active';
    } else if (row.runtime_state === 'cooldown' || row.runtime_state === 'quarantined') {
      effectiveState = row.runtime_state;
      effectiveStateReason = row.state_reason ?? baseline.reason;
      recoveryProbeEligible = !isFuture(
        row.recovery_probe_due_at ?? row.cooldown_until ?? row.quarantined_until ?? observedAt,
        observedAtMs,
      );

      if (!row.recovery_probe_due_at) {
        persistedState.recoveryProbeDueAt = row.cooldown_until ?? row.quarantined_until ?? observedAt;
        stateNeedsPersist = true;
      }
    } else if (row.runtime_state === 'degraded') {
      effectiveState =
        baseline.state === 'ready' && (row.consecutive_successes ?? 0) >= scheduler.successesToReady
          ? 'ready'
          : 'degraded';
      effectiveStateReason =
        effectiveState === 'ready' ? 'feedback.success_promoted_ready' : row.state_reason ?? baseline.reason;

      if (effectiveState !== row.runtime_state || effectiveStateReason !== row.state_reason) {
        persistedState.runtimeState = effectiveState;
        persistedState.stateReason = effectiveStateReason;
        stateNeedsPersist = true;
      }
    } else if (row.runtime_state === 'ready' && baseline.state === 'degraded') {
      effectiveState = 'degraded';
      effectiveStateReason = baseline.reason;
      persistedState.runtimeState = 'degraded';
      persistedState.stateReason = baseline.reason;
      stateNeedsPersist = true;
    } else if (row.runtime_state === 'unroutable') {
      effectiveState = baseline.state;
      effectiveStateReason = baseline.reason;
      if (baseline.state !== 'unroutable') {
        persistedState.runtimeState = baseline.state;
        persistedState.stateReason = baseline.reason;
        stateNeedsPersist = true;
      }
    } else {
      effectiveState = row.runtime_state;
      effectiveStateReason = row.state_reason ?? baseline.reason;
    }
  }

  if (stateNeedsPersist) {
    persistedState.runtimeState = effectiveState;
    persistedState.stateReason = effectiveStateReason;
    persistedState.updatedAt = observedAt;
  }

  return {
    accountUid: row.account_uid,
    sourceType: row.source_type,
    registryStatus: row.current_status,
    registryStatusReason: row.current_status_reason,
    sourceFile: row.source_file,
    expiresAt: row.expires_at,
    lastRefreshAt: row.last_refresh_at,
    staticSignals: signals,
    persistedState,
    runtimeOverride,
    effectiveState,
    effectiveStateReason,
    recoveryProbeEligible,
    stateNeedsPersist,
  };
}

function createRuntimeAccountView(account: ResolvedRuntimeAccount): RuntimeAccountView {
  return {
    accountUid: account.accountUid,
    cooldownUntil: account.persistedState.cooldownUntil,
    consecutiveFailures: account.persistedState.consecutiveFailures,
    consecutiveSuccesses: account.persistedState.consecutiveSuccesses,
    effectiveState: account.effectiveState,
    effectiveStateReason: account.effectiveStateReason,
    expiresAt: account.expiresAt,
    latestHealthObservedAt: account.staticSignals.healthObservedAt,
    latestHealthReasons: account.staticSignals.latestHealthReasons,
    latestHealthRuntime: account.staticSignals.latestHealthRuntime,
    lastFeedbackAt: account.persistedState.lastFeedbackAt,
    lastFeedbackOutcome: account.persistedState.lastFeedbackOutcome,
    lastRefreshAt: account.lastRefreshAt,
    lastSyncRunId: account.staticSignals.lastSyncRunId,
    lastSyncSuccess: account.staticSignals.lastSyncSuccess,
    quarantinedUntil: account.persistedState.quarantinedUntil,
    recoveryProbeAttempts: account.persistedState.recoveryProbeAttempts,
    recoveryProbeDueAt: account.persistedState.recoveryProbeDueAt,
    recoveryProbeEligible: account.recoveryProbeEligible,
    refreshStale: account.staticSignals.refreshStale,
    registryStatus: account.registryStatus,
    registryStatusReason: account.registryStatusReason,
    runtimeOverride: account.runtimeOverride,
    runtimeState: account.persistedState.runtimeState,
    runtimeStateReason: account.persistedState.stateReason,
    sourceFile: account.sourceFile,
    sourceFilePresent: account.staticSignals.sourceFilePresent,
    sourceType: account.sourceType,
    syncFailureSignal: account.staticSignals.syncFailureSignal,
    totalFeedbackCount: account.persistedState.totalFeedbackCount,
  };
}

function deriveTargetRuntimeStateFromView(
  account: RuntimeAccountView,
  observedAt: string,
): {
  reason: string;
  state: RuntimeRoutingState;
} {
  if (!account.sourceFilePresent) {
    return {
      state: 'unroutable',
      reason: 'source_file_missing',
    };
  }

  if (account.registryStatus === 'disabled') {
    return {
      state: 'unroutable',
      reason: 'registry_status_disabled',
    };
  }

  if (
    account.registryStatus === 'expired' ||
    (account.expiresAt !== null && new Date(account.expiresAt).valueOf() <= new Date(observedAt).valueOf())
  ) {
    return {
      state: 'unroutable',
      reason:
        account.registryStatus === 'expired'
          ? 'registry_status_expired'
          : 'expires_at_reached',
    };
  }

  if (
    account.latestHealthRuntime === 'degraded' ||
    account.refreshStale ||
    account.syncFailureSignal ||
    account.latestHealthObservedAt === null
  ) {
    return {
      state: 'degraded',
      reason:
        account.latestHealthRuntime === 'degraded'
          ? 'latest_health_degraded'
          : account.refreshStale
            ? 'refresh_stale'
            : account.syncFailureSignal
              ? 'recent_sync_failed_signal'
              : 'no_health_snapshot',
    };
  }

  return {
    state: 'ready',
    reason: 'baseline_ready',
  };
}

function findResolvedAccount(
  accounts: ResolvedRuntimeAccount[],
  accountUid: string,
): ResolvedRuntimeAccount {
  const account = accounts.find((entry) => entry.accountUid === accountUid);
  if (!account) {
    throw new Error(`Unknown account: ${accountUid}`);
  }

  return account;
}

function buildScoreBreakdown(
  account: ResolvedRuntimeAccount,
  scheduler: SchedulerConfig,
  requestedAt: string,
): ScoreComponent[] {
  const breakdown: ScoreComponent[] = [
    {
      code: 'base',
      delta: 100,
      detail: 'shadow scheduler base score',
    },
  ];

  if (account.effectiveState === 'ready') {
    breakdown.push({
      code: 'runtime_ready_bonus',
      delta: scheduler.readyScoreBonus,
      detail: 'runtime state is ready',
    });
  }

  if (account.effectiveState === 'degraded') {
    breakdown.push({
      code: 'runtime_degraded_penalty',
      delta: -scheduler.degradedScorePenalty,
      detail: 'runtime state is degraded',
    });
  }

  if (account.staticSignals.latestHealthRuntime === 'degraded') {
    breakdown.push({
      code: 'latest_health_degraded_penalty',
      delta: -scheduler.latestHealthDegradedPenalty,
      detail: 'latest account health snapshot is degraded',
    });
  }

  if (account.staticSignals.refreshStale) {
    breakdown.push({
      code: 'refresh_stale_penalty',
      delta: -scheduler.refreshStalePenalty,
      detail: 'last refresh timestamp is stale or missing',
    });
  }

  if (account.staticSignals.syncFailureSignal) {
    breakdown.push({
      code: 'recent_sync_failed_signal_penalty',
      delta: -scheduler.recentSyncFailureSignalPenalty,
      detail: 'latest sync run failed, treated as a signal only',
    });
  }

  if (isExpiringSoon(account.expiresAt, requestedAt, scheduler.expiringSoonHours)) {
    breakdown.push({
      code: 'expiring_soon_penalty',
      delta: -scheduler.expiringSoonPenalty,
      detail: `expires within ${scheduler.expiringSoonHours} hours`,
    });
  }

  if (account.persistedState.consecutiveFailures > 0) {
    breakdown.push({
      code: 'recent_failure_penalty',
      delta: -scheduler.failurePenaltyPerFailure * account.persistedState.consecutiveFailures,
      detail: `consecutive failures=${account.persistedState.consecutiveFailures}`,
    });
  }

  const sourceBias = scheduler.sourceTypeBias[account.sourceType];
  if (sourceBias !== 0) {
    breakdown.push({
      code: 'source_type_bias',
      delta: sourceBias,
      detail: `config bias for ${account.sourceType}`,
    });
  }

  if (account.recoveryProbeEligible) {
    breakdown.push({
      code: 'recovery_probe_penalty',
      delta: -scheduler.recoveryProbePenalty,
      detail: 'recovery probe candidate from cooldown/quarantine',
    });
  }

  return breakdown;
}

function sumScore(breakdown: ScoreComponent[]): number {
  return breakdown.reduce((sum, component) => sum + component.delta, 0);
}

function evaluateCandidate(
  account: ResolvedRuntimeAccount,
  scheduler: SchedulerConfig,
  requestedAt: string,
): ShadowCandidate {
  const reasons = [...account.staticSignals.latestHealthReasons];

  if (!account.staticSignals.sourceFilePresent) {
    reasons.push('source_file_missing');
  }

  if (account.registryStatus !== 'active') {
    reasons.push(`registry_status_${account.registryStatus}`);
  }

  if (account.staticSignals.expiredByTime) {
    reasons.push('expires_at_reached');
  }

  let eligible = true;
  let eligibilityReason = 'eligible';

  if (account.effectiveState === 'unroutable') {
    eligible = false;
    eligibilityReason = account.effectiveStateReason;
  } else if (
    (account.effectiveState === 'cooldown' || account.effectiveState === 'quarantined') &&
    !account.recoveryProbeEligible
  ) {
    eligible = false;
    eligibilityReason = account.effectiveStateReason;
  }

  const scoreBreakdown = eligible ? buildScoreBreakdown(account, scheduler, requestedAt) : [];
  const finalScore = eligible ? sumScore(scoreBreakdown) : INELIGIBLE_SCORE;

  return {
    accountUid: account.accountUid,
    eligibilityReason,
    eligible,
    explanation: {
      effectiveState: account.effectiveState,
      effectiveStateReason: account.effectiveStateReason,
      latestHealthRuntime: account.staticSignals.latestHealthRuntime,
      recoveryProbeEligible: account.recoveryProbeEligible,
      registryStatus: account.registryStatus,
    },
    finalScore,
    rank: null,
    reasons,
    recoveryProbeEligible: account.recoveryProbeEligible,
    runtimeState: account.effectiveState,
    scoreBreakdown,
    sourceType: account.sourceType,
  };
}

function buildShadowDecision(
  accounts: ResolvedRuntimeAccount[],
  scheduler: SchedulerConfig,
  request: {
    context: SchedulerRequestContext;
    model: string | null;
    protocol: string;
    requestedAt: string;
  },
  persistence: 'dry_run' | 'persisted',
): ShadowDecision {
  const candidates = accounts.map((account) =>
    evaluateCandidate(account, scheduler, request.requestedAt),
  );
  const eligibleCandidates = candidates
    .filter((candidate) => candidate.eligible)
    .sort((left, right) => {
      if (left.finalScore !== right.finalScore) {
        return right.finalScore - left.finalScore;
      }

      return left.accountUid.localeCompare(right.accountUid);
    })
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
  const rankedCandidates = candidates.map((candidate) =>
    eligibleCandidates.find((entry) => entry.accountUid === candidate.accountUid) ?? candidate,
  );
  const selectedCandidate = eligibleCandidates[0] ?? null;

  return {
    availableCandidateCount: eligibleCandidates.length,
    candidates: rankedCandidates,
    decisionId: randomUUID(),
    decisionMode: 'shadow',
    evaluatedCandidateCount: candidates.length,
    explanation: {
      filteredOutCount: candidates.length - eligibleCandidates.length,
      selectedBecause: selectedCandidate
        ? `highest_score=${selectedCandidate.finalScore}`
        : null,
      shadowMode: true,
    },
    overallReady: eligibleCandidates.length > 0,
    persistence,
    request,
    selectedAccountUid: selectedCandidate?.accountUid ?? null,
    selectedRuntimeState: selectedCandidate?.runtimeState ?? null,
    selectedScore: selectedCandidate?.finalScore ?? null,
  };
}

function persistShadowDecision(
  database: DatabaseManager,
  decision: ShadowDecision,
  selectedAccountUid: string | null,
  selectedRuntimeState: RuntimeRoutingState | null,
): void {
  const requestContext = {
    ...decision.request.context,
    model: decision.request.model,
    protocol: decision.request.protocol,
    requestedAt: decision.request.requestedAt,
  };

  database.db.prepare(`
    INSERT INTO routing_decisions (
      decision_id,
      decision_mode,
      requested_protocol,
      requested_model,
      requested_at,
      available_candidate_count,
      evaluated_candidate_count,
      selected_account_uid,
      selected_runtime_state,
      selected_score,
      overall_ready,
      request_context_json,
      explanation_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    decision.decisionId,
    decision.decisionMode,
    decision.request.protocol,
    decision.request.model,
    decision.request.requestedAt,
    decision.availableCandidateCount,
    decision.evaluatedCandidateCount,
    selectedAccountUid,
    selectedRuntimeState,
    decision.selectedScore,
    decision.overallReady ? 1 : 0,
    JSON.stringify(requestContext),
    JSON.stringify(decision.explanation),
    decision.request.requestedAt,
  );

  const insertCandidate = database.db.prepare(`
    INSERT INTO routing_decision_candidates (
      decision_candidate_id,
      decision_id,
      account_uid,
      eligible,
      runtime_state,
      recovery_probe_eligible,
      final_score,
      rank_order,
      eligibility_reason,
      reasons_json,
      score_breakdown_json,
      explanation_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const candidate of decision.candidates) {
    insertCandidate.run(
      randomUUID(),
      decision.decisionId,
      candidate.accountUid,
      candidate.eligible ? 1 : 0,
      candidate.runtimeState,
      candidate.recoveryProbeEligible ? 1 : 0,
      candidate.finalScore,
      candidate.rank,
      candidate.eligibilityReason,
      JSON.stringify(candidate.reasons),
      JSON.stringify(candidate.scoreBreakdown),
      JSON.stringify(candidate.explanation),
      decision.request.requestedAt,
    );
  }
}

function recordDecisionOnRuntimeState(
  database: DatabaseManager,
  account: ResolvedRuntimeAccount,
  decisionId: string,
  decidedAt: string,
): void {
  upsertRuntimeState(database, {
    ...account.persistedState,
    lastDecisionId: decisionId,
    lastDecisionAt: decidedAt,
    updatedAt: decidedAt,
  });
}

function resolveFeedbackTarget(database: DatabaseManager, input: RoutingFeedbackInput): FeedbackTarget {
  if (input.accountUid) {
    return {
      accountUid: input.accountUid,
      decisionId: input.decisionId ?? null,
    };
  }

  if (!input.decisionId) {
    throw new Error('scheduler feedback requires either --account or --decision');
  }

  const row = database.db.prepare(`
    SELECT selected_account_uid
    FROM routing_decisions
    WHERE decision_id = ?
  `).get(input.decisionId) as { selected_account_uid: string | null } | undefined;

  if (!row?.selected_account_uid) {
    throw new Error(`No selected account found for decision ${input.decisionId}`);
  }

  return {
    accountUid: row.selected_account_uid,
    decisionId: input.decisionId,
  };
}

function applyFeedbackTransition(
  current: PersistedRuntimeState,
  outcome: FeedbackOutcome,
  observedAt: string,
  scheduler: SchedulerConfig,
): PersistedRuntimeState {
  const nextState: PersistedRuntimeState = {
    ...current,
    totalFeedbackCount: current.totalFeedbackCount + 1,
    lastFeedbackOutcome: outcome,
    lastFeedbackAt: observedAt,
    updatedAt: observedAt,
  };

  if (outcome === 'success') {
    nextState.consecutiveFailures = 0;
    nextState.consecutiveSuccesses = current.consecutiveSuccesses + 1;
    nextState.lastSuccessAt = observedAt;
    nextState.cooldownUntil = null;
    nextState.quarantinedUntil = null;
    nextState.recoveryProbeDueAt = null;
    nextState.recoveryProbeAttempts =
      current.runtimeState === 'cooldown' || current.runtimeState === 'quarantined'
        ? current.recoveryProbeAttempts + 1
        : current.recoveryProbeAttempts;

    if (
      current.runtimeState === 'cooldown' ||
      current.runtimeState === 'quarantined' ||
      current.runtimeState === 'unroutable'
    ) {
      nextState.runtimeState = 'degraded';
      nextState.stateReason = 'feedback.success_recovery_probe';
    } else if (nextState.consecutiveSuccesses >= scheduler.successesToReady) {
      nextState.runtimeState = 'ready';
      nextState.stateReason = 'feedback.success_ready';
    } else {
      nextState.runtimeState = 'degraded';
      nextState.stateReason = 'feedback.success_partial_recovery';
    }

    return nextState;
  }

  nextState.consecutiveFailures = current.consecutiveFailures + 1;
  nextState.consecutiveSuccesses = 0;
  nextState.lastFailureAt = observedAt;

  if (outcome === 'auth_error') {
    nextState.runtimeState = 'quarantined';
    nextState.stateReason = 'feedback.auth_error';
    nextState.quarantinedUntil = addMinutes(observedAt, scheduler.authErrorQuarantineMinutes);
    nextState.recoveryProbeDueAt = addMinutes(
      nextState.quarantinedUntil,
      scheduler.recoveryProbeDelayMinutes,
    );
    nextState.recoveryProbeAttempts += 1;
    nextState.cooldownUntil = null;
    return nextState;
  }

  if (outcome === 'rate_limit') {
    nextState.runtimeState = 'cooldown';
    nextState.stateReason = 'feedback.rate_limit';
    nextState.cooldownUntil = addMinutes(observedAt, scheduler.rateLimitCooldownMinutes);
    nextState.recoveryProbeDueAt = addMinutes(
      nextState.cooldownUntil,
      scheduler.recoveryProbeDelayMinutes,
    );
    nextState.recoveryProbeAttempts += 1;
    nextState.quarantinedUntil = null;
    return nextState;
  }

  if (nextState.consecutiveFailures >= scheduler.failuresToQuarantine) {
    nextState.runtimeState = 'quarantined';
    nextState.stateReason = 'feedback.failure_quarantined';
    nextState.quarantinedUntil = addMinutes(observedAt, scheduler.authErrorQuarantineMinutes);
    nextState.recoveryProbeDueAt = addMinutes(
      nextState.quarantinedUntil,
      scheduler.recoveryProbeDelayMinutes,
    );
    nextState.recoveryProbeAttempts += 1;
    nextState.cooldownUntil = null;
    return nextState;
  }

  if (nextState.consecutiveFailures >= scheduler.failuresToCooldown) {
    nextState.runtimeState = 'cooldown';
    nextState.stateReason = 'feedback.failure_cooldown';
    nextState.cooldownUntil = addMinutes(observedAt, scheduler.cooldownMinutes);
    nextState.recoveryProbeDueAt = addMinutes(
      nextState.cooldownUntil,
      scheduler.recoveryProbeDelayMinutes,
    );
    nextState.recoveryProbeAttempts += 1;
    nextState.quarantinedUntil = null;
    return nextState;
  }

  nextState.runtimeState = 'degraded';
  nextState.stateReason = 'feedback.failure_degraded';
  nextState.cooldownUntil = null;
  nextState.quarantinedUntil = null;
  nextState.recoveryProbeDueAt = null;
  return nextState;
}

export class ShadowScheduler {
  config: Pick<AppConfig, 'scheduler' | 'workspaceRoot'>;
  database: DatabaseManager;
  logger: Logger;

  constructor(
    config: Pick<AppConfig, 'scheduler' | 'workspaceRoot'>,
    database: DatabaseManager,
    logger: Logger,
  ) {
    this.config = config;
    this.database = database;
    this.logger = logger;
  }

  resolveRuntimeAccounts(observedAt: string): ResolvedRuntimeAccount[] {
    const latestSyncRun = loadLatestSyncRun(this.database);
    const rows = loadSchedulerRows(this.database);
    return rows.map((row) =>
      resolveRuntimeState(
        row,
        this.config.scheduler,
        this.config.workspaceRoot,
        observedAt,
        latestSyncRun,
      ),
    );
  }

  persistResolvedRuntimeAccounts(accounts: ResolvedRuntimeAccount[]): void {
    for (const account of accounts) {
      if (account.stateNeedsPersist) {
        upsertRuntimeState(this.database, account.persistedState);
      }
    }
  }

  getRuntimeAccounts(referenceTimestamp?: string | null): RuntimeAccountView[] {
    const observedAt = toIsoTimestamp(referenceTimestamp, new Date().toISOString());

    return this.resolveRuntimeAccounts(observedAt).map((account) => createRuntimeAccountView(account));
  }

  getRuntimeAccount(accountUid: string, referenceTimestamp?: string | null): RuntimeAccountView | null {
    const observedAt = toIsoTimestamp(referenceTimestamp, new Date().toISOString());
    const account = this.resolveRuntimeAccounts(observedAt).find((entry) => entry.accountUid === accountUid);
    return account ? createRuntimeAccountView(account) : null;
  }

  getAvailabilitySummary(referenceTimestamp?: string | null): AvailabilitySummary {
    const observedAt = toIsoTimestamp(referenceTimestamp, new Date().toISOString());
    const accounts = this.resolveRuntimeAccounts(observedAt).map((account) => createRuntimeAccountView(account));
    const byRuntimeState: Record<RuntimeRoutingState, number> = {
      ready: 0,
      degraded: 0,
      cooldown: 0,
      quarantined: 0,
      unroutable: 0,
    };

    for (const account of accounts) {
      byRuntimeState[account.effectiveState] += 1;
    }

    const availableForRouting = accounts.filter((account) => {
      if (account.effectiveState === 'ready' || account.effectiveState === 'degraded') {
        return true;
      }

      return (
        (account.effectiveState === 'cooldown' || account.effectiveState === 'quarantined') &&
        account.recoveryProbeEligible
      );
    }).length;

    return {
      availableForRouting,
      blockedCount: accounts.length - availableForRouting,
      byRuntimeState,
      overallReady: availableForRouting > 0,
      referenceTimestamp: observedAt,
      total: accounts.length,
    };
  }

  applyRuntimeControlAction(
    input: RuntimeControlActionInput,
    auditRecorder?: (result: RuntimeControlActionResult) => void,
  ): RuntimeControlActionResult {
    const observedAt = toIsoTimestamp(input.observedAt, new Date().toISOString());
    const reason = input.reason.trim();

    if (!reason) {
      throw new Error(`runtime control action ${input.action} requires a reason`);
    }

    return this.database.runInTransaction(() => {
      const beforeResolved = findResolvedAccount(this.resolveRuntimeAccounts(observedAt), input.accountUid);
      const before = createRuntimeAccountView(beforeResolved);
      const manualQuarantineReason = before.runtimeOverride.quarantineReason
        ? `manual_override.quarantine:${before.runtimeOverride.quarantineReason}`
        : 'manual_override.quarantine';

      switch (input.action) {
        case 'manual_quarantine':
          upsertRuntimeOverride(this.database, {
            accountUid: input.accountUid,
            createdAt: observedAt,
            operatorNote: before.runtimeOverride.operatorNote,
            quarantineActive: true,
            quarantineReason: reason,
            updatedAt: observedAt,
            updatedBy: input.operatorId,
          });
          upsertRuntimeState(this.database, {
            ...beforeResolved.persistedState,
            cooldownUntil: null,
            quarantinedUntil: null,
            recoveryProbeDueAt: null,
            runtimeState: 'quarantined',
            stateReason: `manual_override.quarantine:${reason}`,
            updatedAt: observedAt,
          });
          break;
        case 'manual_release': {
          if (before.runtimeOverride.operatorNote) {
            upsertRuntimeOverride(this.database, {
              accountUid: input.accountUid,
              createdAt: observedAt,
              operatorNote: before.runtimeOverride.operatorNote,
              quarantineActive: false,
              quarantineReason: null,
              updatedAt: observedAt,
              updatedBy: input.operatorId,
            });
          } else {
            deleteRuntimeOverride(this.database, input.accountUid);
          }

          const releasedState = deriveTargetRuntimeStateFromView(before, observedAt);
          upsertRuntimeState(this.database, {
            ...beforeResolved.persistedState,
            cooldownUntil: null,
            quarantinedUntil: null,
            recoveryProbeDueAt: null,
            runtimeState: releasedState.state,
            stateReason: releasedState.reason,
            updatedAt: observedAt,
          });
          break;
        }
        case 'clear_cooldown': {
          const targetState =
            before.runtimeOverride.quarantineActive
              ? {
                  state: 'quarantined' as const,
                  reason: manualQuarantineReason,
                }
              : before.effectiveState === 'cooldown' || before.runtimeState === 'cooldown'
                ? deriveTargetRuntimeStateFromView(before, observedAt)
                : {
                    state: before.runtimeState,
                    reason: before.runtimeStateReason,
                  };
          upsertRuntimeState(this.database, {
            ...beforeResolved.persistedState,
            cooldownUntil: null,
            quarantinedUntil:
              targetState.state === 'quarantined' ? beforeResolved.persistedState.quarantinedUntil : null,
            recoveryProbeDueAt: null,
            runtimeState: targetState.state,
            stateReason: targetState.reason,
            updatedAt: observedAt,
          });
          break;
        }
        case 'annotate_reason':
          upsertRuntimeOverride(this.database, {
            accountUid: input.accountUid,
            createdAt: observedAt,
            operatorNote: reason,
            quarantineActive: before.runtimeOverride.quarantineActive,
            quarantineReason: before.runtimeOverride.quarantineReason,
            updatedAt: observedAt,
            updatedBy: input.operatorId,
          });
          break;
      }

      let afterResolved = findResolvedAccount(this.resolveRuntimeAccounts(observedAt), input.accountUid);
      if (afterResolved.stateNeedsPersist) {
        upsertRuntimeState(this.database, afterResolved.persistedState);
        afterResolved = findResolvedAccount(this.resolveRuntimeAccounts(observedAt), input.accountUid);
      }

      const result: RuntimeControlActionResult = {
        accountUid: input.accountUid,
        action: input.action,
        after: createRuntimeAccountView(afterResolved),
        before,
        observedAt,
      };

      auditRecorder?.(result);

      this.logger.info('scheduler.runtime_control.recorded', {
        accountUid: input.accountUid,
        action: input.action,
        effectiveStateAfter: result.after.effectiveState,
        effectiveStateBefore: result.before.effectiveState,
        observedAt,
        operatorId: input.operatorId,
      });

      return result;
    });
  }

  preview(input: SchedulerPreviewInput = {}): ShadowDecision {
    const requestedAt = toIsoTimestamp(input.timestamp, new Date().toISOString());
    const protocol = (input.protocol ?? 'openai').trim() || 'openai';
    const model = input.model?.trim() ? input.model.trim() : null;
    const decision = buildShadowDecision(
      this.resolveRuntimeAccounts(requestedAt),
      this.config.scheduler,
      {
        context: input.requestContext ?? {},
        model,
        protocol,
        requestedAt,
      },
      'dry_run',
    );

    this.logger.info('scheduler.shadow.preview_dry_run', {
      availableCandidateCount: decision.availableCandidateCount,
      decisionId: decision.decisionId,
      model,
      protocol,
      selectedAccountUid: decision.selectedAccountUid,
    });

    return decision;
  }

  persistDecision(input: SchedulerPreviewInput = {}): ShadowDecision {
    const requestedAt = toIsoTimestamp(input.timestamp, new Date().toISOString());
    const protocol = (input.protocol ?? 'openai').trim() || 'openai';
    const model = input.model?.trim() ? input.model.trim() : null;

    return this.database.runInTransaction(() => {
      const accounts = this.resolveRuntimeAccounts(requestedAt);
      this.persistResolvedRuntimeAccounts(accounts);

      const decision = buildShadowDecision(
        accounts,
        this.config.scheduler,
        {
          context: input.requestContext ?? {},
          model,
          protocol,
          requestedAt,
        },
        'persisted',
      );

      persistShadowDecision(
        this.database,
        decision,
        decision.selectedAccountUid,
        decision.selectedRuntimeState,
      );

      if (decision.selectedAccountUid) {
        const selectedAccount = accounts.find((account) => account.accountUid === decision.selectedAccountUid);
        if (selectedAccount) {
          recordDecisionOnRuntimeState(
            this.database,
            selectedAccount,
            decision.decisionId,
            requestedAt,
          );
        }
      }

      this.logger.info('scheduler.shadow.persisted_decision', {
        availableCandidateCount: decision.availableCandidateCount,
        decisionId: decision.decisionId,
        model,
        protocol,
        selectedAccountUid: decision.selectedAccountUid,
      });

      return decision;
    });
  }

  recordFeedback(input: RoutingFeedbackInput): RoutingFeedbackResult {
    const observedAt = toIsoTimestamp(input.observedAt, new Date().toISOString());

    return this.database.runInTransaction(() => {
      const target = resolveFeedbackTarget(this.database, input);
      const accounts = this.resolveRuntimeAccounts(observedAt);
      const account = accounts.find((entry) => entry.accountUid === target.accountUid);

      if (!account) {
        throw new Error(`Unknown account: ${target.accountUid}`);
      }

      const nextState = applyFeedbackTransition(
        account.persistedState,
        input.outcome,
        observedAt,
        this.config.scheduler,
      );

      upsertRuntimeState(this.database, nextState);

      const feedbackId = randomUUID();
      this.database.db.prepare(`
        INSERT INTO routing_feedback (
          feedback_id,
          decision_id,
          account_uid,
          outcome,
          detail,
          state_before,
          state_after,
          observed_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        feedbackId,
        target.decisionId,
        target.accountUid,
        input.outcome,
        input.detail ?? null,
        account.persistedState.runtimeState,
        nextState.runtimeState,
        observedAt,
        observedAt,
      );

      this.logger.info('scheduler.feedback.recorded', {
        accountUid: target.accountUid,
        decisionId: target.decisionId,
        feedbackId,
        outcome: input.outcome,
        runtimeStateAfter: nextState.runtimeState,
        runtimeStateBefore: account.persistedState.runtimeState,
      });

      return {
        accountUid: target.accountUid,
        cooldownUntil: nextState.cooldownUntil,
        decisionId: target.decisionId,
        feedbackId,
        observedAt,
        outcome: input.outcome,
        quarantinedUntil: nextState.quarantinedUntil,
        recoveryProbeDueAt: nextState.recoveryProbeDueAt,
        runtimeStateAfter: nextState.runtimeState,
        runtimeStateBefore: account.persistedState.runtimeState,
        totalFeedbackCount: nextState.totalFeedbackCount,
      };
    });
  }
}
