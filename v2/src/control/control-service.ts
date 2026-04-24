import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { AppConfig } from '../config/app-config.ts';
import { syncAccountRegistry, type AccountSyncSummary } from './account-sync.ts';
import {
  buildCutoverRecommendation,
  buildRollbackHint,
  readCutoverModeFile,
  resolveCutoverRollbackLockFilePath,
  restoreCutoverModeFile,
  requiresReadinessGate,
  writeCutoverModeFile,
  type CutoverMode,
} from './cutover.ts';
import {
  evaluateCutoverReadiness,
  getReadinessHistory,
  getSyntheticProbeHistory,
  persistCutoverReadinessSnapshot,
  runSyntheticProbe,
  type ReadinessEvaluation,
  type SyntheticProbeSummary,
} from './precutover.ts';
import { HealthService } from '../health/health-service.ts';
import { runHealthProbe, type HealthProbeSummary } from '../health/probe-engine.ts';
import { buildDefaultServiceProbeDefinitions } from '../health/runtime-targets.ts';
import type { DatabaseManager } from '../ledger/database.ts';
import { Logger } from '../logging/logger.ts';
import {
  ShadowScheduler,
  type RuntimeControlAction,
  type RuntimeControlActionResult,
} from '../routing/shadow-scheduler.ts';
import type { OperatorAuthContext } from '../gateway/models.ts';
import { ControlError } from './control-errors.ts';
import {
  defaultPlatformRuntimeController,
  getDefaultLocalPlatformStatus,
  type PlatformRuntimeController,
} from './platform-runtime.ts';

type OperatorActionType =
  | RuntimeControlAction
  | 'run_accounts_sync'
  | 'run_health_probe'
  | 'ensure_team_pool_running'
  | 'restart_team_pool'
  | 'stop_team_pool'
  | 'run_local_refresh'
  | 'run_synthetic_probe'
  | 'run_readiness_check';

type LatestRunRow = {
  finished_at: string;
  probe_run_id?: string;
  success: number;
  sync_run_id?: string;
} | null;

type CutoverStateRow = {
  gate_blockers_json: string;
  gate_evaluated_at: string | null;
  gate_ready: number | null;
  gate_required: number;
  gate_warnings_json: string;
  last_transition_id: string | null;
  mode: CutoverMode;
  public_base_url: string | null;
  synthetic_base_url: string | null;
  updated_at: string;
  updated_by: string;
  updated_reason: string;
} | null;

type RollbackHelperLaunchInput = {
  graceDelayMs: number;
  operatorId: string;
  reason: string;
  requestedAt: string;
  workspaceRoot: string;
};

type RollbackHelperLaunchResult = {
  graceDelayMs: number;
  helperPath: string;
  lockPath: string;
  requestedAt: string;
};

type GatewayActivityRow = {
  activity_type: 'external' | 'synthetic' | 'unknown';
  auth_principal: string | null;
  auth_scheme: string | null;
  duration_ms: number | null;
  error_code: string | null;
  occurred_at: string;
  outcome: 'success' | 'failure';
  protocol: 'openai' | 'anthropic';
  request_model: string | null;
  route_path: string;
  status_code: number | null;
};

type RollbackHelperLauncher = (input: RollbackHelperLaunchInput) => RollbackHelperLaunchResult;

const DEFAULT_LEGACY_ROLLBACK_GRACE_MS = 750;

function launchLegacyRollbackHelper(
  input: RollbackHelperLaunchInput,
): RollbackHelperLaunchResult {
  const helperPath = resolve(input.workspaceRoot, 'rollback_legacy.ps1');
  if (!existsSync(helperPath)) {
    throw new Error(`Rollback helper is missing: ${helperPath}`);
  }

  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      helperPath,
      '-Reason',
      input.reason,
      '-OperatorId',
      input.operatorId,
      '-GraceDelayMs',
      String(input.graceDelayMs),
    ],
    {
      cwd: input.workspaceRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  child.unref();

  return {
    graceDelayMs: input.graceDelayMs,
    helperPath,
    lockPath: resolveCutoverRollbackLockFilePath(input.workspaceRoot),
    requestedAt: input.requestedAt,
  };
}

function parseJsonSafely(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function toBoolean(value: number | null): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value === 1;
}

function sanitizeOperatorActionRows(
  rows: Array<{
    action_id: string;
    action_type: string;
    after_json: string;
    before_json: string;
    created_at: string;
    operator_id: string;
    reason: string;
    target_id: string;
    target_type: string;
  }>,
) {
  return rows.map((row) => ({
    actionId: row.action_id,
    actionType: row.action_type,
    after: parseJsonSafely(row.after_json),
    before: parseJsonSafely(row.before_json),
    createdAt: row.created_at,
    operatorId: row.operator_id,
    reason: row.reason,
    targetId: row.target_id,
    targetType: row.target_type,
  }));
}

export class ControlPlaneService {
  config: Pick<AppConfig, 'authSources' | 'workspaceRoot'>;
  database: DatabaseManager;
  healthService: HealthService;
  logger: Logger;
  platformRuntimeController: PlatformRuntimeController;
  publicBaseUrl: string | null;
  rollbackHelperLauncher: RollbackHelperLauncher;
  scheduler: ShadowScheduler;
  serviceBaseUrl: string | null;
  syntheticBaseUrl: string | null;

  constructor(
    config: Pick<AppConfig, 'authSources' | 'workspaceRoot'>,
    database: DatabaseManager,
    healthService: HealthService,
    scheduler: ShadowScheduler,
    logger: Logger,
    rollbackHelperLauncher: RollbackHelperLauncher = launchLegacyRollbackHelper,
    platformRuntimeController: PlatformRuntimeController = defaultPlatformRuntimeController,
  ) {
    this.config = config;
    this.database = database;
    this.healthService = healthService;
    this.scheduler = scheduler;
    this.logger = logger;
    this.rollbackHelperLauncher = rollbackHelperLauncher;
    this.platformRuntimeController = platformRuntimeController;
    this.publicBaseUrl = null;
    this.serviceBaseUrl = null;
    this.syntheticBaseUrl = null;
  }

  setServiceBaseUrl(baseUrl: string): void {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    this.publicBaseUrl = normalized;
    this.serviceBaseUrl = normalized;
    this.syntheticBaseUrl = normalized;
  }

  setServiceBaseUrls(input: { publicBaseUrl: string; syntheticBaseUrl: string }): void {
    this.publicBaseUrl = input.publicBaseUrl.trim().replace(/\/+$/, '');
    this.syntheticBaseUrl = input.syntheticBaseUrl.trim().replace(/\/+$/, '');
    this.serviceBaseUrl = this.syntheticBaseUrl;
  }

  getSummary(referenceTimestamp?: string | null) {
    const accountRegistryCounts = this.database.db.prepare(`
      SELECT current_status, COUNT(*) AS count
      FROM account_registry
      GROUP BY current_status
    `).all() as Array<{ count: number; current_status: string }>;
    const sourceCounts = this.database.db.prepare(`
      SELECT source_type, COUNT(*) AS count
      FROM account_registry
      GROUP BY source_type
    `).all() as Array<{ count: number; source_type: string }>;
    const totalAccounts = (
      this.database.db.prepare('SELECT COUNT(*) AS count FROM account_registry').get() as { count: number }
    ).count;
    const runtimeAvailability = this.scheduler.getAvailabilitySummary(referenceTimestamp);

    return {
      accountRegistry: {
        bySourceType: Object.fromEntries(sourceCounts.map((row) => [row.source_type, row.count])),
        byStaticStatus: Object.fromEntries(accountRegistryCounts.map((row) => [row.current_status, row.count])),
        total: totalAccounts,
      },
      currentCutover: this.getCutover(),
      currentReadiness: this.getReadiness().current,
      health: this.healthService.getHealthSummary(referenceTimestamp),
      gatewayActivity: this.getGatewayActivity(10, 6),
      recentOperatorActions: this.getRecentOperatorActions(10),
      recentProbeRuns: this.getRecentProbeRuns(5),
      recentReadinessSnapshots: this.getRecentReadinessSnapshots(5),
      recentRoutingDecisions: this.getRoutingDecisions(10).decisions,
      recentRoutingFeedback: this.getRecentRoutingFeedback(10),
      recentSyncRuns: this.getRecentSyncRuns(5),
      recentSyntheticRuns: this.getRecentSyntheticRuns(5),
      runtimeAvailability,
    };
  }

  getGatewayActivity(windowMinutes = 10, limit = 6) {
    const recentRows = this.database.db.prepare(`
      SELECT
        occurred_at,
        protocol,
        route_path,
        request_model,
        activity_type,
        auth_principal,
        auth_scheme,
        outcome,
        status_code,
        error_code,
        duration_ms
      FROM gateway_request_activity
      WHERE activity_type IN ('external', 'unknown')
      ORDER BY occurred_at DESC
      LIMIT ?
    `).all(limit) as GatewayActivityRow[];

    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    const windowRows = this.database.db.prepare(`
      SELECT
        occurred_at,
        protocol,
        route_path,
        request_model,
        activity_type,
        auth_principal,
        auth_scheme,
        outcome,
        status_code,
        error_code,
        duration_ms
      FROM gateway_request_activity
      WHERE activity_type IN ('external', 'unknown')
        AND occurred_at >= ?
      ORDER BY occurred_at DESC
    `).all(windowStart) as GatewayActivityRow[];

    const latestRow = recentRows[0] ?? null;
    const errorCounts = new Map<string, number>();
    let externalCount = 0;
    let successCount = 0;
    let failureCount = 0;
    let openAiCount = 0;
    let anthropicCount = 0;

    for (const row of windowRows) {
      externalCount += 1;
      if (row.outcome === 'success') {
        successCount += 1;
      } else {
        failureCount += 1;
      }

      if (row.protocol === 'openai') {
        openAiCount += 1;
      } else if (row.protocol === 'anthropic') {
        anthropicCount += 1;
      }

      if (row.error_code) {
        errorCounts.set(row.error_code, (errorCounts.get(row.error_code) ?? 0) + 1);
      } else if (row.status_code && row.status_code >= 400) {
        const key = `http_${row.status_code}`;
        errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
      }
    }

    const topErrors = Array.from(errorCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([code, count]) => ({
        code,
        count,
      }));

    return {
      hasRecentExternalActivity: externalCount > 0,
      latestExternalAttemptAt: latestRow?.occurred_at ?? null,
      latestWindowMinutes: windowMinutes,
      protocolCounts: {
        anthropic: anthropicCount,
        openai: openAiCount,
      },
      recentEntries: recentRows.map((row) => ({
        activityType: row.activity_type,
        authPrincipal: row.auth_principal,
        authScheme: row.auth_scheme,
        durationMs: row.duration_ms,
        errorCode: row.error_code,
        occurredAt: row.occurred_at,
        outcome: row.outcome,
        protocol: row.protocol,
        requestModel: row.request_model,
        routePath: row.route_path,
        statusCode: row.status_code,
      })),
      totals: {
        external: externalCount,
        failed: failureCount,
        successful: successCount,
      },
      topErrors,
    };
  }

  getAccounts(referenceTimestamp?: string | null) {
    return {
      accounts: this.scheduler.getRuntimeAccounts(referenceTimestamp),
    };
  }

  getAccountDetails(accountUid: string, referenceTimestamp?: string | null) {
    const account = this.scheduler.getRuntimeAccount(accountUid, referenceTimestamp);
    if (!account) {
      throw new ControlError(404, 'not_found_error', `Unknown account: ${accountUid}`, 'account_not_found');
    }

    const latestHealthSnapshot = this.database.db.prepare(`
      SELECT
        registry_status,
        runtime_health,
        source_file_present,
        expired_by_time,
        refresh_stale,
        last_sync_success,
        last_sync_run_id,
        sync_failure_signal,
        reasons_json,
        observed_at
      FROM account_health_snapshots
      WHERE account_uid = ?
      ORDER BY observed_at DESC
      LIMIT 1
    `).get(accountUid) as
      | {
          expired_by_time: number;
          last_sync_run_id: string | null;
          last_sync_success: number | null;
          observed_at: string;
          reasons_json: string;
          refresh_stale: number;
          registry_status: string;
          runtime_health: string;
          source_file_present: number;
          sync_failure_signal: number;
        }
      | undefined;
    const statusEvents = this.database.db.prepare(`
      SELECT event_type, from_status, to_status, reason, observed_at
      FROM account_status_events
      WHERE account_uid = ?
      ORDER BY observed_at DESC
      LIMIT 20
    `).all(accountUid);
    const routingFeedback = this.database.db.prepare(`
      SELECT outcome, detail, state_before, state_after, observed_at, decision_id
      FROM routing_feedback
      WHERE account_uid = ?
      ORDER BY observed_at DESC
      LIMIT 20
    `).all(accountUid);
    const operatorActions = sanitizeOperatorActionRows(
      this.database.db.prepare(`
        SELECT
          action_id,
          action_type,
          target_type,
          target_id,
          reason,
          before_json,
          after_json,
          operator_id,
          created_at
        FROM operator_actions
        WHERE target_type = 'account' AND target_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(accountUid) as Array<{
        action_id: string;
        action_type: string;
        after_json: string;
        before_json: string;
        created_at: string;
        operator_id: string;
        reason: string;
        target_id: string;
        target_type: string;
      }>,
    );

    const reasons = latestHealthSnapshot
      ? parseJsonSafely(latestHealthSnapshot.reasons_json)
      : null;

    return {
      account,
      latestHealthSnapshot: latestHealthSnapshot
        ? {
            expiredByTime: latestHealthSnapshot.expired_by_time === 1,
            lastSyncRunId: latestHealthSnapshot.last_sync_run_id,
            lastSyncSuccess: toBoolean(latestHealthSnapshot.last_sync_success),
            observedAt: latestHealthSnapshot.observed_at,
            reasons: Array.isArray(reasons) ? reasons : [],
            refreshStale: latestHealthSnapshot.refresh_stale === 1,
            registryStatus: latestHealthSnapshot.registry_status,
            runtimeHealth: latestHealthSnapshot.runtime_health,
            sourceFilePresent: latestHealthSnapshot.source_file_present === 1,
            syncFailureSignal: latestHealthSnapshot.sync_failure_signal === 1,
          }
        : null,
      operatorActions,
      recentRoutingFeedback: routingFeedback,
      recentStatusEvents: statusEvents,
    };
  }

  getServices() {
    return {
      latestSnapshots: this.healthService.getLatestServiceSnapshots(),
      recentProbeRuns: this.getRecentProbeRuns(10),
    };
  }

  async getPlatform() {
    const cutover = this.getCutover();
    const readiness = this.evaluateReadiness();
    const runtimeAvailability = this.scheduler.getAvailabilitySummary();
    const teamPoolService = this.healthService
      .getLatestServiceSnapshots()
      .find((snapshot) => snapshot.service_name === 'team_pool');

    return getDefaultLocalPlatformStatus({
      availableForRouting: runtimeAvailability.availableForRouting,
      currentMode: cutover.currentMode,
      gatewayBaseUrl: this.publicBaseUrl ?? this.serviceBaseUrl,
      gatewayReady: readiness.ready,
      latestSyntheticRun: this.getLatestSyntheticRun(),
      teamPoolServiceStatus: teamPoolService?.status ?? null,
      workspaceRoot: this.config.workspaceRoot,
    });
  }

  getSynthetic(limit = 10) {
    return getSyntheticProbeHistory(this.database, limit);
  }

  getReadiness() {
    return {
      current: this.evaluateReadiness(),
      ...getReadinessHistory(this.database, 10),
    };
  }

  getCutover() {
    const currentReadiness = this.evaluateReadiness();
    const currentState = this.getCurrentCutoverState();
    const modeFile = readCutoverModeFile(this.config.workspaceRoot);
    const recentTransitions = this.database.db.prepare(`
      SELECT
        transition_id,
        previous_mode,
        requested_mode,
        resulting_mode,
        outcome,
        gate_required,
        gate_ready,
        gate_blockers_json,
        gate_warnings_json,
        operator_id,
        reason,
        created_at
      FROM cutover_transitions
      ORDER BY created_at DESC
      LIMIT 10
    `).all() as Array<{
      created_at: string;
      gate_blockers_json: string;
      gate_ready: number | null;
      gate_required: number;
      gate_warnings_json: string;
      operator_id: string;
      outcome: string;
      previous_mode: string;
      reason: string;
      requested_mode: string;
      resulting_mode: string;
      transition_id: string;
    }>;

    const currentMode = currentState?.mode ?? 'legacy';
    const lastAppliedGate = currentState
      ? {
          blockers: Array.isArray(parseJsonSafely(currentState.gate_blockers_json))
            ? parseJsonSafely(currentState.gate_blockers_json)
            : [],
          evaluatedAt: currentState.gate_evaluated_at,
          gateRequired: currentState.gate_required === 1,
          ready: toBoolean(currentState.gate_ready),
          warnings: Array.isArray(parseJsonSafely(currentState.gate_warnings_json))
            ? parseJsonSafely(currentState.gate_warnings_json)
            : [],
        }
      : null;

    return {
      baseUrls: {
        publicBaseUrl: this.publicBaseUrl,
        syntheticBaseUrl: this.syntheticBaseUrl,
      },
      currentMode,
      lastAppliedGate,
      modeMirror: {
        exists: modeFile.exists,
        inSync: modeFile.mode === currentMode,
        mode: modeFile.mode,
        path: modeFile.path,
        reason: modeFile.reason,
        updatedAt: modeFile.updatedAt,
        updatedBy: modeFile.updatedBy,
      },
      readinessGate: {
        current: currentReadiness,
        requiredFor: ['canary', 'primary'],
      },
      recentTransitions: recentTransitions.map((row) => ({
        blockers: Array.isArray(parseJsonSafely(row.gate_blockers_json))
          ? parseJsonSafely(row.gate_blockers_json)
          : [],
        createdAt: row.created_at,
        gateRequired: row.gate_required === 1,
        operatorId: row.operator_id,
        outcome: row.outcome,
        previousMode: row.previous_mode,
        ready: toBoolean(row.gate_ready),
        reason: row.reason,
        requestedMode: row.requested_mode,
        resultingMode: row.resulting_mode,
        transitionId: row.transition_id,
        warnings: Array.isArray(parseJsonSafely(row.gate_warnings_json))
          ? parseJsonSafely(row.gate_warnings_json)
          : [],
      })),
      recommendedNextStep: buildCutoverRecommendation(
        currentMode,
        currentReadiness.ready,
        currentReadiness.blockers.length,
      ),
      rollbackHint: buildRollbackHint(currentMode),
      stateUpdatedAt: currentState?.updated_at ?? null,
      stateUpdatedBy: currentState?.updated_by ?? null,
      stateUpdateReason: currentState?.updated_reason ?? null,
    };
  }

  requestLegacyRollback(
    operator: OperatorAuthContext,
    reason: string,
  ) {
    const requestedAt = new Date().toISOString();
    const currentMode = this.getCurrentCutoverState()?.mode ?? 'legacy';

    let launchResult: RollbackHelperLaunchResult;
    try {
      launchResult = this.rollbackHelperLauncher({
        graceDelayMs: DEFAULT_LEGACY_ROLLBACK_GRACE_MS,
        operatorId: operator.operatorId,
        reason,
        requestedAt,
        workspaceRoot: this.config.workspaceRoot,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('cutover.legacy_rollback_launch_failed', {
        currentMode,
        error: errorMessage,
        operatorId: operator.operatorId,
        requestedAt,
      });
      throw new ControlError(
        500,
        'api_error',
        'Unable to launch the legacy rollback helper',
        'cutover_rollback_launch_failed',
      );
    }

    this.logger.warn('cutover.legacy_rollback_requested', {
      currentMode,
      graceDelayMs: launchResult.graceDelayMs,
      helperPath: launchResult.helperPath,
      operatorId: operator.operatorId,
      requestedAt,
    });

    return {
      accepted: true,
      currentMode,
      graceDelayMs: launchResult.graceDelayMs,
      helperPath: launchResult.helperPath,
      lockPath: launchResult.lockPath,
      note: 'Legacy rollback has been accepted. The V2 gateway listener will stop asynchronously, and this page may disconnect.',
      operation: 'legacy_rollback',
      requestedAt,
    };
  }

  setCutoverMode(
    operator: OperatorAuthContext,
    input: {
      mode: CutoverMode;
      reason: string;
    },
  ) {
    const previousState = this.getCurrentCutoverState();
    const previousMode = previousState?.mode ?? 'legacy';
    const gateRequired = requiresReadinessGate(input.mode);
    const readiness = gateRequired ? this.evaluateReadiness() : null;
    const createdAt = new Date().toISOString();
    const transitionId = randomUUID();
    const previousModeMirror = readCutoverModeFile(this.config.workspaceRoot);
    const before = {
      currentMode: previousMode,
      lastAppliedGate: previousState
        ? {
            blockers: Array.isArray(parseJsonSafely(previousState.gate_blockers_json))
              ? parseJsonSafely(previousState.gate_blockers_json)
              : [],
            evaluatedAt: previousState.gate_evaluated_at,
            gateRequired: previousState.gate_required === 1,
            ready: toBoolean(previousState.gate_ready),
            warnings: Array.isArray(parseJsonSafely(previousState.gate_warnings_json))
              ? parseJsonSafely(previousState.gate_warnings_json)
              : [],
          }
        : null,
      modeMirror: previousModeMirror,
    };

    if (gateRequired && readiness && !readiness.ready) {
      const after = {
        blockers: readiness.blockers,
        gateRequired,
        modeUnchanged: previousMode,
        ready: readiness.ready,
        requestedMode: input.mode,
        warnings: readiness.warnings,
      };

      this.insertCutoverTransition({
        after,
        before,
        createdAt,
        gateBlockers: readiness.blockers,
        gateReady: false,
        gateRequired: true,
        gateWarnings: readiness.warnings,
        operator,
        outcome: 'rejected',
        previousMode,
        reason: input.reason,
        requestedMode: input.mode,
        resultingMode: previousMode,
        transitionId,
      });

      this.logger.warn('cutover.mode_change_rejected', {
        blockerCount: readiness.blockers.length,
        mode: input.mode,
        previousMode,
        transitionId,
      });

      throw new ControlError(
        409,
        'api_error',
        `Readiness gate rejected cutover to ${input.mode}`,
        'cutover_readiness_blocked',
      );
    }

    let modeMirror;
    try {
      modeMirror = writeCutoverModeFile(this.config.workspaceRoot, {
        mode: input.mode,
        reason: input.reason,
        updatedAt: createdAt,
        updatedBy: operator.operatorId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.insertCutoverTransition({
        after: {
          error: errorMessage,
          gateRequired,
          mirrorWriteFailed: true,
          modeUnchanged: previousMode,
          requestedMode: input.mode,
        },
        before,
        createdAt,
        gateBlockers: readiness?.blockers ?? [],
        gateReady: readiness?.ready ?? null,
        gateRequired,
        gateWarnings: readiness?.warnings ?? [],
        operator,
        outcome: 'rejected',
        previousMode,
        reason: input.reason,
        requestedMode: input.mode,
        resultingMode: previousMode,
        transitionId,
      });

      this.logger.error('cutover.mode_mirror_write_failed', {
        error: errorMessage,
        mode: input.mode,
        previousMode,
        transitionId,
      });

      throw new ControlError(
        500,
        'api_error',
        `Unable to persist the cutover mode mirror for ${input.mode}`,
        'cutover_mode_mirror_write_failed',
      );
    }

    try {
      this.database.runInTransaction(() => {
        this.insertCutoverTransition({
          after: {
            currentMode: input.mode,
            gateRequired,
            modeMirror,
            publicBaseUrl: this.publicBaseUrl,
            ready: readiness?.ready ?? null,
            syntheticBaseUrl: this.syntheticBaseUrl,
          },
          before,
          createdAt,
          gateBlockers: readiness?.blockers ?? [],
          gateReady: readiness ? readiness.ready : null,
          gateRequired,
          gateWarnings: readiness?.warnings ?? [],
          operator,
          outcome: 'applied',
          previousMode,
          reason: input.reason,
          requestedMode: input.mode,
          resultingMode: input.mode,
          transitionId,
        });

        this.database.db.prepare(`
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
          ON CONFLICT(state_id) DO UPDATE SET
            mode = excluded.mode,
            gate_required = excluded.gate_required,
            gate_ready = excluded.gate_ready,
            gate_evaluated_at = excluded.gate_evaluated_at,
            gate_blockers_json = excluded.gate_blockers_json,
            gate_warnings_json = excluded.gate_warnings_json,
            public_base_url = excluded.public_base_url,
            synthetic_base_url = excluded.synthetic_base_url,
            updated_by = excluded.updated_by,
            updated_reason = excluded.updated_reason,
            last_transition_id = excluded.last_transition_id,
            updated_at = excluded.updated_at
        `).run(
          'active',
          input.mode,
          gateRequired ? 1 : 0,
          readiness ? (readiness.ready ? 1 : 0) : null,
          readiness?.evaluatedAt ?? null,
          JSON.stringify(readiness?.blockers ?? []),
          JSON.stringify(readiness?.warnings ?? []),
          this.publicBaseUrl,
          this.syntheticBaseUrl,
          operator.operatorId,
          input.reason,
          transitionId,
          createdAt,
        );
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      let mirrorRollbackSucceeded = false;
      let mirrorRollbackError: string | null = null;

      try {
        restoreCutoverModeFile(this.config.workspaceRoot, previousModeMirror);
        mirrorRollbackSucceeded = true;
      } catch (rollbackError) {
        mirrorRollbackError =
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      }

      try {
        this.insertCutoverTransition({
          after: {
            error: errorMessage,
            mirrorRollbackError,
            mirrorRollbackSucceeded,
            modeUnchanged: previousMode,
            requestedMode: input.mode,
            statePersistFailed: true,
          },
          before,
          createdAt: new Date().toISOString(),
          gateBlockers: readiness?.blockers ?? [],
          gateReady: readiness?.ready ?? null,
          gateRequired,
          gateWarnings: readiness?.warnings ?? [],
          operator,
          outcome: 'rejected',
          previousMode,
          reason: input.reason,
          requestedMode: input.mode,
          resultingMode: previousMode,
          transitionId,
        });
      } catch (transitionError) {
        this.logger.error('cutover.mode_state_persist_failure_audit_failed', {
          error: transitionError instanceof Error ? transitionError.message : String(transitionError),
          mode: input.mode,
          previousMode,
          transitionId,
        });
      }

      this.logger.error('cutover.mode_state_persist_failed', {
        error: errorMessage,
        mirrorRollbackError,
        mirrorRollbackSucceeded,
        mode: input.mode,
        previousMode,
        transitionId,
      });

      throw new ControlError(
        500,
        'api_error',
        `Unable to persist the cutover state for ${input.mode}`,
        'cutover_state_persist_failed',
      );
    }

    this.logger.info('cutover.mode_changed', {
      gateRequired,
      mode: input.mode,
      mirrorPath: modeMirror.path,
      previousMode,
      transitionId,
    });

    return this.getCutover();
  }

  getRoutingDecisions(limit = 25) {
    const decisions = this.database.db.prepare(`
      SELECT
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
        explanation_json
      FROM routing_decisions
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      available_candidate_count: number;
      decision_id: string;
      decision_mode: string;
      evaluated_candidate_count: number;
      explanation_json: string;
      overall_ready: number;
      request_context_json: string;
      requested_at: string;
      requested_model: string | null;
      requested_protocol: string;
      selected_account_uid: string | null;
      selected_runtime_state: string | null;
      selected_score: number | null;
    }>;

    return {
      decisions: decisions.map((row) => ({
        availableCandidateCount: row.available_candidate_count,
        decisionId: row.decision_id,
        decisionMode: row.decision_mode,
        evaluatedCandidateCount: row.evaluated_candidate_count,
        explanation: parseJsonSafely(row.explanation_json),
        overallReady: row.overall_ready === 1,
        requestedAt: row.requested_at,
        requestedModel: row.requested_model,
        requestedProtocol: row.requested_protocol,
        requestContext: parseJsonSafely(row.request_context_json),
        selectedAccountUid: row.selected_account_uid,
        selectedRuntimeState: row.selected_runtime_state,
        selectedScore: row.selected_score,
      })),
      feedback: this.getRecentRoutingFeedback(Math.min(limit, 20)),
    };
  }

  getEvents(limit = 50) {
    const healthEvents = this.database.db.prepare(`
      SELECT subject_type, subject_id, event_kind, reason, observed_at
      FROM health_events
      ORDER BY observed_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      event_kind: string;
      observed_at: string;
      reason: string;
      subject_id: string;
      subject_type: string;
    }>;
    const statusEvents = this.database.db.prepare(`
      SELECT account_uid, event_type, to_status, reason, observed_at
      FROM account_status_events
      ORDER BY observed_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      account_uid: string;
      event_type: string;
      observed_at: string;
      reason: string;
      to_status: string;
    }>;
    const feedbackEvents = this.database.db.prepare(`
      SELECT account_uid, outcome, state_before, state_after, observed_at
      FROM routing_feedback
      ORDER BY observed_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      account_uid: string;
      observed_at: string;
      outcome: string;
      state_after: string;
      state_before: string;
    }>;
    const operatorActions = this.getRecentOperatorActions(limit);
    const syntheticRuns = this.getRecentSyntheticRuns(limit);
    const readinessSnapshots = this.getRecentReadinessSnapshots(limit);

    const events = [
      ...healthEvents.map((event) => ({
        action: event.event_kind,
        category: 'health',
        target: `${event.subject_type}:${event.subject_id}`,
        timestamp: event.observed_at,
      })),
      ...statusEvents.map((event) => ({
        action: `${event.event_type}:${event.to_status}`,
        category: 'account_status',
        target: `account:${event.account_uid}`,
        timestamp: event.observed_at,
      })),
      ...feedbackEvents.map((event) => ({
        action: `${event.outcome}:${event.state_before}->${event.state_after}`,
        category: 'routing_feedback',
        target: `account:${event.account_uid}`,
        timestamp: event.observed_at,
      })),
      ...operatorActions.map((event) => ({
        action: event.actionType,
        category: 'operator_action',
        target: `${event.targetType}:${event.targetId}`,
        timestamp: event.createdAt,
      })),
      ...syntheticRuns.map((run) => ({
        action: run.success ? 'synthetic_probe:success' : 'synthetic_probe:failed',
        category: 'synthetic_probe',
        target: `synthetic:${run.syntheticRunId}`,
        timestamp: run.finishedAt,
      })),
      ...readinessSnapshots.map((snapshot) => ({
        action: snapshot.ready ? 'readiness:ready' : 'readiness:blocked',
        category: 'readiness',
        target: `readiness:${snapshot.readinessSnapshotId}`,
        timestamp: snapshot.createdAt,
      })),
    ].sort((left, right) => right.timestamp.localeCompare(left.timestamp));

    return {
      events: events.slice(0, limit),
    };
  }

  applyRuntimeAction(
    operator: OperatorAuthContext,
    input: {
      accountUid: string;
      action: RuntimeControlAction;
      observedAt?: string | null;
      reason: string;
    },
  ): RuntimeControlActionResult {
    return this.scheduler.applyRuntimeControlAction(
      {
        accountUid: input.accountUid,
        action: input.action,
        observedAt: input.observedAt,
        operatorId: operator.operatorId,
        reason: input.reason,
      },
      (result) => {
        this.insertOperatorAction({
          actionType: input.action,
          after: result.after,
          before: result.before,
          createdAt: result.observedAt,
          operator,
          reason: input.reason,
          targetId: input.accountUid,
          targetType: 'account',
        });
      },
    );
  }

  runAccountsSyncJob(
    operator: OperatorAuthContext,
    reason: string,
  ): AccountSyncSummary {
    const before = this.getLatestSyncRun();

    try {
      const result = syncAccountRegistry(this.config, this.database, this.logger);
      this.insertOperatorAction({
        actionType: 'run_accounts_sync',
        after: {
          latestSyncRun: this.getLatestSyncRun(),
          result,
        },
        before: {
          latestSyncRun: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'accounts_sync',
        targetType: 'job',
      });
      return result;
    } catch (error) {
      this.insertOperatorAction({
        actionType: 'run_accounts_sync',
        after: {
          error: error instanceof Error ? error.message : String(error),
          latestSyncRun: this.getLatestSyncRun(),
          success: false,
        },
        before: {
          latestSyncRun: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'accounts_sync',
        targetType: 'job',
      });
      throw error;
    }
  }

  async runHealthProbeJob(
    operator: OperatorAuthContext,
    reason: string,
  ): Promise<HealthProbeSummary> {
    const before = this.getLatestProbeRun();

    try {
      const result = await runHealthProbe(
        this.database,
        this.logger,
        buildDefaultServiceProbeDefinitions(),
        {
          workspaceRoot: this.config.workspaceRoot,
        },
      );
      this.insertOperatorAction({
        actionType: 'run_health_probe',
        after: {
          latestProbeRun: this.getLatestProbeRun(),
          result,
        },
        before: {
          latestProbeRun: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'health_probe',
        targetType: 'job',
      });
      return result;
    } catch (error) {
      this.insertOperatorAction({
        actionType: 'run_health_probe',
        after: {
          error: error instanceof Error ? error.message : String(error),
          latestProbeRun: this.getLatestProbeRun(),
          success: false,
        },
        before: {
          latestProbeRun: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'health_probe',
        targetType: 'job',
      });
      throw error;
    }
  }

  async runSyntheticProbeJob(
    operator: OperatorAuthContext,
    reason: string,
  ): Promise<SyntheticProbeSummary> {
    const before = this.getLatestSyntheticRun();

    try {
      const result = await runSyntheticProbe({
        baseUrl: this.serviceBaseUrl,
        database: this.database,
        logger: this.logger,
        triggerReason: reason,
        triggeredBy: operator.operatorId,
        workspaceRoot: this.config.workspaceRoot,
      });

      this.insertOperatorAction({
        actionType: 'run_synthetic_probe',
        after: {
          latestSyntheticRun: this.getLatestSyntheticRun(),
          result,
        },
        before: {
          latestSyntheticRun: before,
        },
        createdAt: result.finishedAt,
        operator,
        reason,
        targetId: 'synthetic_probe',
        targetType: 'job',
      });

      return result;
    } catch (error) {
      this.insertOperatorAction({
        actionType: 'run_synthetic_probe',
        after: {
          error: error instanceof Error ? error.message : String(error),
          latestSyntheticRun: this.getLatestSyntheticRun(),
          success: false,
        },
        before: {
          latestSyntheticRun: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'synthetic_probe',
        targetType: 'job',
      });
      throw error;
    }
  }

  async ensureTeamPoolRunningJob(
    operator: OperatorAuthContext,
    reason: string,
  ) {
    const before = await this.getPlatform();

    try {
      const result = await this.platformRuntimeController.ensureTeamPoolRunning(this.config.workspaceRoot);
      const platform = await this.getPlatform();
      this.insertOperatorAction({
        actionType: 'ensure_team_pool_running',
        after: {
          platform,
          result,
        },
        before: {
          platform: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'team_pool',
        targetType: 'job',
      });

      return {
        platform,
        result,
      };
    } catch (error) {
      this.insertOperatorAction({
        actionType: 'ensure_team_pool_running',
        after: {
          error: error instanceof Error ? error.message : String(error),
          platform: await this.getPlatform(),
          success: false,
        },
        before: {
          platform: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'team_pool',
        targetType: 'job',
      });
      throw error;
    }
  }

  async restartTeamPoolJob(
    operator: OperatorAuthContext,
    reason: string,
  ) {
    const before = await this.getPlatform();

    try {
      const result = await this.platformRuntimeController.restartTeamPool(this.config.workspaceRoot);
      const platform = await this.getPlatform();
      this.insertOperatorAction({
        actionType: 'restart_team_pool',
        after: {
          platform,
          result,
        },
        before: {
          platform: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'team_pool',
        targetType: 'job',
      });

      return {
        platform,
        result,
      };
    } catch (error) {
      this.insertOperatorAction({
        actionType: 'restart_team_pool',
        after: {
          error: error instanceof Error ? error.message : String(error),
          platform: await this.getPlatform(),
          success: false,
        },
        before: {
          platform: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'team_pool',
        targetType: 'job',
      });
      throw error;
    }
  }

  async stopTeamPoolJob(
    operator: OperatorAuthContext,
    reason: string,
  ) {
    const before = await this.getPlatform();

    try {
      const result = await this.platformRuntimeController.stopTeamPool(this.config.workspaceRoot);
      const platform = await this.getPlatform();
      this.insertOperatorAction({
        actionType: 'stop_team_pool',
        after: {
          platform,
          result,
        },
        before: {
          platform: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'team_pool',
        targetType: 'job',
      });

      return {
        platform,
        result,
      };
    } catch (error) {
      this.insertOperatorAction({
        actionType: 'stop_team_pool',
        after: {
          error: error instanceof Error ? error.message : String(error),
          platform: await this.getPlatform(),
          success: false,
        },
        before: {
          platform: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'team_pool',
        targetType: 'job',
      });
      throw error;
    }
  }

  async runLocalRefreshJob(
    operator: OperatorAuthContext,
    reason: string,
  ) {
    const before = {
      latestProbeRun: this.getLatestProbeRun(),
      latestReadinessSnapshot: this.getLatestReadinessSnapshot(),
      latestSyncRun: this.getLatestSyncRun(),
      latestSyntheticRun: this.getLatestSyntheticRun(),
      platform: await this.getPlatform(),
    };

    try {
      const teamPool = await this.platformRuntimeController.ensureTeamPoolRunning(this.config.workspaceRoot);
      const accountSync = this.runAccountsSyncJob(operator, `${reason}::accounts_sync`);
      const healthProbe = await this.runHealthProbeJob(operator, `${reason}::health_probe`);
      const syntheticProbe = await this.runSyntheticProbeJob(operator, `${reason}::synthetic_probe`);
      const readiness = this.runReadinessCheckJob(operator, `${reason}::readiness_check`);
      const platform = await this.getPlatform();
      const result = {
        accountSync,
        healthProbe,
        platform,
        readiness,
        syntheticProbe,
        teamPool,
      };

      this.insertOperatorAction({
        actionType: 'run_local_refresh',
        after: result,
        before,
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'local_platform',
        targetType: 'job',
      });

      return result;
    } catch (error) {
      this.insertOperatorAction({
        actionType: 'run_local_refresh',
        after: {
          error: error instanceof Error ? error.message : String(error),
          platform: await this.getPlatform(),
          success: false,
        },
        before,
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'local_platform',
        targetType: 'job',
      });
      throw error;
    }
  }

  runReadinessCheckJob(
    operator: OperatorAuthContext,
    reason: string,
  ): ReadinessEvaluation & { readinessSnapshotId: string } {
    const before = this.getLatestReadinessSnapshot();

    try {
      const evaluation = this.evaluateReadiness();
      const readinessSnapshotId = persistCutoverReadinessSnapshot({
        database: this.database,
        evaluation,
        triggerReason: reason,
        triggeredBy: operator.operatorId,
      });
      const result = {
        ...evaluation,
        readinessSnapshotId,
      };

      this.insertOperatorAction({
        actionType: 'run_readiness_check',
        after: {
          latestReadinessSnapshot: this.getLatestReadinessSnapshot(),
          result,
        },
        before: {
          latestReadinessSnapshot: before,
        },
        createdAt: evaluation.evaluatedAt,
        operator,
        reason,
        targetId: 'readiness_check',
        targetType: 'job',
      });

      return result;
    } catch (error) {
      this.insertOperatorAction({
        actionType: 'run_readiness_check',
        after: {
          error: error instanceof Error ? error.message : String(error),
          latestReadinessSnapshot: this.getLatestReadinessSnapshot(),
          success: false,
        },
        before: {
          latestReadinessSnapshot: before,
        },
        createdAt: new Date().toISOString(),
        operator,
        reason,
        targetId: 'readiness_check',
        targetType: 'job',
      });
      throw error;
    }
  }

  getRecentOperatorActions(limit = 20) {
    return sanitizeOperatorActionRows(
      this.database.db.prepare(`
        SELECT
          action_id,
          action_type,
          target_type,
          target_id,
          reason,
          before_json,
          after_json,
          operator_id,
          created_at
        FROM operator_actions
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit) as Array<{
        action_id: string;
        action_type: string;
        after_json: string;
        before_json: string;
        created_at: string;
        operator_id: string;
        reason: string;
        target_id: string;
        target_type: string;
      }>,
    );
  }

  getRecentSyncRuns(limit = 10) {
    return this.database.db.prepare(`
      SELECT
        sync_run_id,
        started_at,
        finished_at,
        success,
        scanned_files,
        imported_accounts,
        updated_accounts,
        unchanged_accounts,
        status_events_written,
        error_message
      FROM account_sync_runs
      ORDER BY finished_at DESC
      LIMIT ?
    `).all(limit);
  }

  getRecentProbeRuns(limit = 10) {
    return this.database.db.prepare(`
      SELECT
        probe_run_id,
        started_at,
        finished_at,
        success,
        service_probe_count,
        account_probe_count,
        unhealthy_service_count,
        unhealthy_account_count,
        probe_completed,
        available_account_count,
        overall_ready
      FROM health_probe_runs
      ORDER BY finished_at DESC
      LIMIT ?
    `).all(limit);
  }

  getRecentSyntheticRuns(limit = 10) {
    return getSyntheticProbeHistory(this.database, limit).recentRuns;
  }

  getRecentReadinessSnapshots(limit = 10) {
    return getReadinessHistory(this.database, limit).recentSnapshots;
  }

  getRecentRoutingFeedback(limit = 20) {
    return this.database.db.prepare(`
      SELECT
        feedback_id,
        decision_id,
        account_uid,
        outcome,
        detail,
        state_before,
        state_after,
        observed_at
      FROM routing_feedback
      ORDER BY observed_at DESC
      LIMIT ?
    `).all(limit);
  }

  private getLatestSyncRun(): LatestRunRow {
    return this.database.db.prepare(`
      SELECT sync_run_id, success, finished_at
      FROM account_sync_runs
      ORDER BY finished_at DESC
      LIMIT 1
    `).get() as LatestRunRow;
  }

  private getLatestProbeRun(): LatestRunRow {
    return this.database.db.prepare(`
      SELECT probe_run_id, success, finished_at
      FROM health_probe_runs
      ORDER BY finished_at DESC
      LIMIT 1
    `).get() as LatestRunRow;
  }

  private getLatestSyntheticRun() {
    return getSyntheticProbeHistory(this.database, 1).latestRun;
  }

  private getLatestReadinessSnapshot() {
    return getReadinessHistory(this.database, 1).latestSnapshot;
  }

  private getCurrentCutoverState(): CutoverStateRow {
    return this.database.db.prepare(`
      SELECT
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
      FROM cutover_state
      WHERE state_id = 'active'
      LIMIT 1
    `).get() as CutoverStateRow;
  }

  private insertCutoverTransition(input: {
    after: unknown;
    before: unknown;
    createdAt: string;
    gateBlockers: unknown[];
    gateReady: boolean | null;
    gateRequired: boolean;
    gateWarnings: unknown[];
    operator: OperatorAuthContext;
    outcome: 'applied' | 'rejected';
    previousMode: CutoverMode;
    reason: string;
    requestedMode: CutoverMode;
    resultingMode: CutoverMode;
    transitionId: string;
  }): void {
    this.database.db.prepare(`
      INSERT INTO cutover_transitions (
        transition_id,
        previous_mode,
        requested_mode,
        resulting_mode,
        outcome,
        gate_required,
        gate_ready,
        gate_blockers_json,
        gate_warnings_json,
        before_json,
        after_json,
        operator_id,
        operator_key_fingerprint,
        reason,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.transitionId,
      input.previousMode,
      input.requestedMode,
      input.resultingMode,
      input.outcome,
      input.gateRequired ? 1 : 0,
      input.gateReady === null ? null : input.gateReady ? 1 : 0,
      JSON.stringify(input.gateBlockers),
      JSON.stringify(input.gateWarnings),
      JSON.stringify(input.before),
      JSON.stringify(input.after),
      input.operator.operatorId,
      input.operator.keyFingerprint,
      input.reason,
      input.createdAt,
    );
  }

  private evaluateReadiness(): ReadinessEvaluation {
    return evaluateCutoverReadiness({
      database: this.database,
      healthService: this.healthService,
      scheduler: this.scheduler,
      serviceBaseUrl: this.syntheticBaseUrl ?? this.serviceBaseUrl,
      workspaceRoot: this.config.workspaceRoot,
    });
  }

  private insertOperatorAction(input: {
    actionType: OperatorActionType;
    after: unknown;
    before: unknown;
    createdAt: string;
    operator: OperatorAuthContext;
    reason: string;
    targetId: string;
    targetType: 'account' | 'job';
  }): void {
    this.database.db.prepare(`
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
      randomUUID(),
      input.operator.operatorId,
      input.operator.keyFingerprint,
      input.actionType,
      input.targetType,
      input.targetId,
      input.reason,
      JSON.stringify(input.before),
      JSON.stringify(input.after),
      input.createdAt,
    );
  }
}
