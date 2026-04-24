import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { DatabaseManager } from '../ledger/database.ts';
import { Logger } from '../logging/logger.ts';
import { repoRoot } from '../paths.ts';
import {
  buildDefaultServiceProbeDefinitions,
  getAccountRefreshStaleHours,
  type ServiceProbeDefinition,
} from './runtime-targets.ts';

export type RuntimeHealth = 'healthy' | 'degraded' | 'unhealthy';
export type ServiceProbeOutcome = 'ok' | 'http_error' | 'timeout' | 'unreachable';

type RegistryRow = {
  account_uid: string;
  current_status: 'active' | 'disabled' | 'expired';
  expires_at: string | null;
  last_refresh_at: string | null;
  source_file: string;
};

type LatestSyncRun = {
  finished_at: string;
  success: number;
  sync_run_id: string;
} | null;

export type ServiceHealthSnapshot = {
  detail: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  observedAt: string;
  outcomeCode: ServiceProbeOutcome;
  reachable: boolean;
  serviceName: string;
  status: RuntimeHealth;
  target: string;
  timedOut: boolean;
};

export type AccountHealthSnapshot = {
  accountUid: string;
  expiredByTime: boolean;
  lastSyncRunId: string | null;
  lastSyncSuccess: boolean | null;
  observedAt: string;
  reasons: string[];
  refreshStale: boolean;
  registryStatus: 'active' | 'disabled' | 'expired';
  runtimeHealth: RuntimeHealth;
  sourceFilePresent: boolean;
  syncFailureSignal: boolean;
};

export type HealthProbeSummary = {
  accountAvailability: {
    available: number;
    degraded: number;
    healthy: number;
    unhealthy: number;
  };
  accountProbeCount: number;
  finishedAt: string;
  overallReady: boolean;
  probeCompleted: boolean;
  probeRunId: string;
  serviceHealth: {
    degraded: number;
    healthy: number;
    unhealthy: number;
  };
  serviceProbeCount: number;
  startedAt: string;
};

type HealthProbeOptions = {
  workspaceRoot?: string;
};

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 200);
  }

  return String(error).slice(0, 200);
}

async function probeService(definition: ServiceProbeDefinition): Promise<ServiceHealthSnapshot> {
  const startedAt = Date.now();
  const observedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), definition.timeoutMs);

  try {
    const response = await fetch(definition.target, {
      headers: definition.headers,
      method: 'GET',
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    const healthy = definition.acceptableStatusCodes.includes(response.status);

    return {
      detail: healthy ? null : `Unexpected HTTP ${response.status}`,
      httpStatus: response.status,
      latencyMs,
      observedAt,
      outcomeCode: healthy ? 'ok' : 'http_error',
      reachable: true,
      serviceName: definition.name,
      status: healthy ? 'healthy' : 'degraded',
      target: definition.target,
      timedOut: false,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';

    return {
      detail: sanitizeErrorMessage(error),
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      observedAt,
      outcomeCode: timedOut ? 'timeout' : 'unreachable',
      reachable: false,
      serviceName: definition.name,
      status: 'unhealthy',
      target: definition.target,
      timedOut,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function loadLatestSyncRun(database: DatabaseManager): LatestSyncRun {
  return database.db.prepare(`
    SELECT sync_run_id, success, finished_at
    FROM account_sync_runs
    ORDER BY finished_at DESC
    LIMIT 1
  `).get() as LatestSyncRun;
}

function deriveAccountHealth(
  row: RegistryRow,
  latestSyncRun: LatestSyncRun,
  observedAt: string,
  refreshStaleAfterHours: number,
  workspaceRoot: string,
): AccountHealthSnapshot {
  const reasons: string[] = [];
  const observedAtMs = new Date(observedAt).valueOf();
  const expiresAtMs = row.expires_at ? new Date(row.expires_at).valueOf() : Number.NaN;
  const expiredByTime = Number.isFinite(expiresAtMs) && expiresAtMs <= observedAtMs;
  const refreshStaleThresholdMs = refreshStaleAfterHours * 60 * 60 * 1000;
  const refreshAtMs = row.last_refresh_at ? new Date(row.last_refresh_at).valueOf() : Number.NaN;
  const refreshStale =
    !Number.isFinite(refreshAtMs) ||
    observedAtMs - refreshAtMs >= refreshStaleThresholdMs;
  const sourceFilePresent = existsSync(join(workspaceRoot, row.source_file));
  const lastSyncSuccess = latestSyncRun ? latestSyncRun.success === 1 : null;
  const syncFailureSignal = lastSyncSuccess === false;

  if (!sourceFilePresent) {
    reasons.push('source_file_missing');
  }

  if (row.current_status !== 'active') {
    reasons.push(`registry_status_${row.current_status}`);
  }

  if (expiredByTime) {
    reasons.push('expires_at_reached');
  }

  if (syncFailureSignal) {
    reasons.push('recent_sync_failed_signal');
  }

  if (lastSyncSuccess === null) {
    reasons.push('no_sync_run');
  }

  if (!Number.isFinite(refreshAtMs)) {
    reasons.push('missing_last_refresh');
  } else if (refreshStale) {
    reasons.push('stale_last_refresh');
  }

  let runtimeHealth: RuntimeHealth = 'healthy';

  if (!sourceFilePresent || row.current_status !== 'active' || expiredByTime) {
    runtimeHealth = 'unhealthy';
  } else if (refreshStale || lastSyncSuccess === null || syncFailureSignal) {
    runtimeHealth = 'degraded';
  }

  return {
    accountUid: row.account_uid,
    expiredByTime,
    lastSyncRunId: latestSyncRun?.sync_run_id ?? null,
    lastSyncSuccess,
    observedAt,
    reasons,
    refreshStale,
    registryStatus: row.current_status,
    runtimeHealth,
    sourceFilePresent,
    syncFailureSignal,
  };
}

function insertHealthChangeEvent(
  database: DatabaseManager,
  probeRunId: string,
  subjectType: 'service' | 'account',
  subjectId: string,
  previousHealth: string | null,
  currentHealth: string,
  eventKind: 'health_changed' | 'probe_failure',
  reason: string,
  observedAt: string,
): void {
  database.db.prepare(`
    INSERT INTO health_events (
      event_id,
      probe_run_id,
      subject_type,
      subject_id,
      previous_health,
      current_health,
      event_kind,
      reason,
      observed_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    probeRunId,
    subjectType,
    subjectId,
    previousHealth,
    currentHealth,
    eventKind,
    reason,
    observedAt,
    observedAt,
  );
}

export async function runHealthProbe(
  database: DatabaseManager,
  logger: Logger,
  serviceDefinitions: ServiceProbeDefinition[] = buildDefaultServiceProbeDefinitions(),
  options: HealthProbeOptions = {},
): Promise<HealthProbeSummary> {
  const startedAt = new Date().toISOString();
  const probeRunId = randomUUID();
  const serviceSnapshots = await Promise.all(serviceDefinitions.map((definition) => probeService(definition)));
  const latestSyncRun = loadLatestSyncRun(database);
  const observedAt = new Date().toISOString();
  const workspaceRoot = options.workspaceRoot ?? repoRoot;
  const refreshStaleAfterHours = getAccountRefreshStaleHours();
  const accountRows = database.db.prepare(`
    SELECT account_uid, current_status, expires_at, last_refresh_at, source_file
    FROM account_registry
    ORDER BY account_uid
  `).all() as RegistryRow[];
  const accountSnapshots = accountRows.map((row) =>
    deriveAccountHealth(row, latestSyncRun, observedAt, refreshStaleAfterHours, workspaceRoot),
  );
  const serviceHealth = {
    healthy: serviceSnapshots.filter((snapshot) => snapshot.status === 'healthy').length,
    degraded: serviceSnapshots.filter((snapshot) => snapshot.status === 'degraded').length,
    unhealthy: serviceSnapshots.filter((snapshot) => snapshot.status === 'unhealthy').length,
  };
  const accountAvailability = {
    healthy: accountSnapshots.filter((snapshot) => snapshot.runtimeHealth === 'healthy').length,
    degraded: accountSnapshots.filter((snapshot) => snapshot.runtimeHealth === 'degraded').length,
    unhealthy: accountSnapshots.filter((snapshot) => snapshot.runtimeHealth === 'unhealthy').length,
    available: accountSnapshots.filter((snapshot) => snapshot.runtimeHealth !== 'unhealthy').length,
  };
  const summary: HealthProbeSummary = {
    accountAvailability,
    accountProbeCount: accountSnapshots.length,
    finishedAt: new Date().toISOString(),
    overallReady: serviceHealth.unhealthy === 0 && accountAvailability.available > 0,
    probeCompleted: true,
    probeRunId,
    serviceHealth,
    serviceProbeCount: serviceSnapshots.length,
    startedAt,
  };

  database.runInTransaction(() => {
    database.db.prepare(`
      INSERT INTO health_probe_runs (
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      summary.probeRunId,
      summary.startedAt,
      summary.finishedAt,
      summary.probeCompleted ? 1 : 0,
      summary.serviceProbeCount,
      summary.accountProbeCount,
      summary.serviceHealth.unhealthy,
      summary.accountAvailability.unhealthy,
      summary.probeCompleted ? 1 : 0,
      summary.accountAvailability.available,
      summary.overallReady ? 1 : 0,
    );

    const previousServiceStatusQuery = database.db.prepare(`
      SELECT status
      FROM service_health_snapshots
      WHERE service_name = ?
      ORDER BY observed_at DESC
      LIMIT 1
    `);
    const previousAccountHealthQuery = database.db.prepare(`
      SELECT runtime_health
      FROM account_health_snapshots
      WHERE account_uid = ?
      ORDER BY observed_at DESC
      LIMIT 1
    `);

    for (const snapshot of serviceSnapshots) {
      const previous = previousServiceStatusQuery.get(snapshot.serviceName) as { status: RuntimeHealth } | undefined;

      database.db.prepare(`
        INSERT INTO service_health_snapshots (
          snapshot_id,
          probe_run_id,
          service_name,
          target,
          status,
          outcome_code,
          http_status,
          latency_ms,
          reachable,
          timed_out,
          detail,
          observed_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        probeRunId,
        snapshot.serviceName,
        snapshot.target,
        snapshot.status,
        snapshot.outcomeCode,
        snapshot.httpStatus,
        snapshot.latencyMs,
        snapshot.reachable ? 1 : 0,
        snapshot.timedOut ? 1 : 0,
        snapshot.detail,
        snapshot.observedAt,
        snapshot.observedAt,
      );

      if ((previous?.status ?? null) !== snapshot.status) {
        insertHealthChangeEvent(
          database,
          probeRunId,
          'service',
          snapshot.serviceName,
          previous?.status ?? null,
          snapshot.status,
          'health_changed',
          snapshot.outcomeCode,
          snapshot.observedAt,
        );
      }

      if (snapshot.outcomeCode !== 'ok') {
        insertHealthChangeEvent(
          database,
          probeRunId,
          'service',
          snapshot.serviceName,
          previous?.status ?? null,
          snapshot.status,
          'probe_failure',
          snapshot.outcomeCode,
          snapshot.observedAt,
        );
      }
    }

    for (const snapshot of accountSnapshots) {
      const previous = previousAccountHealthQuery.get(snapshot.accountUid) as
        | { runtime_health: RuntimeHealth }
        | undefined;

      database.db.prepare(`
        INSERT INTO account_health_snapshots (
          snapshot_id,
          probe_run_id,
          account_uid,
          registry_status,
          runtime_health,
          source_file_present,
          expired_by_time,
          refresh_stale,
          last_sync_success,
          last_sync_run_id,
          reasons_json,
          observed_at,
          created_at,
          sync_failure_signal
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        probeRunId,
        snapshot.accountUid,
        snapshot.registryStatus,
        snapshot.runtimeHealth,
        snapshot.sourceFilePresent ? 1 : 0,
        snapshot.expiredByTime ? 1 : 0,
        snapshot.refreshStale ? 1 : 0,
        snapshot.lastSyncSuccess === null ? null : snapshot.lastSyncSuccess ? 1 : 0,
        snapshot.lastSyncRunId,
        JSON.stringify(snapshot.reasons),
        snapshot.observedAt,
        snapshot.observedAt,
        snapshot.syncFailureSignal ? 1 : 0,
      );

      if ((previous?.runtime_health ?? null) !== snapshot.runtimeHealth) {
        insertHealthChangeEvent(
          database,
          probeRunId,
          'account',
          snapshot.accountUid,
          previous?.runtime_health ?? null,
          snapshot.runtimeHealth,
          'health_changed',
          snapshot.reasons.join(',') || 'healthy',
          snapshot.observedAt,
        );
      }
    }
  });

  logger.info('health.probe.completed', {
    ...summary,
    availableAccountCount: summary.accountAvailability.available,
    unhealthyAccountCount: summary.accountAvailability.unhealthy,
    unhealthyServiceCount: summary.serviceHealth.unhealthy,
  });

  return summary;
}
