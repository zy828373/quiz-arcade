import type { AppConfig } from '../config/app-config.ts';
import type { DatabaseManager } from '../ledger/database.ts';
import type { ShadowScheduler } from '../routing/shadow-scheduler.ts';

export class HealthService {
  startedAt: number;
  config: AppConfig;
  database: DatabaseManager;
  scheduler: ShadowScheduler;

  constructor(config: AppConfig, database: DatabaseManager, scheduler: ShadowScheduler) {
    this.startedAt = Date.now();
    this.config = config;
    this.database = database;
    this.scheduler = scheduler;
  }

  snapshot() {
    return {
      status: 'ok',
      service: this.config.serviceName,
      version: this.config.version,
      stage: this.config.stage,
      environment: this.config.environment,
      timestamp: new Date().toISOString(),
      uptimeMs: Date.now() - this.startedAt,
      database: this.database.getHealth(),
      capabilities: {
        config: true,
        logging: true,
        sqlite: true,
        http: true,
        accountRegistry: true,
        healthProbeLedger: true,
        scheduler: true,
        gatewayRouting: true,
        controlApi: true,
        opsConsole: true,
        syntheticProbes: true,
        cutoverReadiness: true,
        cutoverControl: true,
      },
    };
  }

  getHealthSummary(referenceTimestamp?: string | null) {
    const latestRun = this.database.db.prepare(`
      SELECT
        probe_run_id,
        started_at,
        finished_at,
        service_probe_count,
        account_probe_count,
        unhealthy_service_count,
        unhealthy_account_count,
        probe_completed,
        available_account_count,
        overall_ready
      FROM health_probe_runs
      ORDER BY finished_at DESC
      LIMIT 1
    `).get() as
      | {
          account_probe_count: number;
          available_account_count: number;
          finished_at: string;
          overall_ready: number;
          probe_completed: number;
          probe_run_id: string;
          service_probe_count: number;
          started_at: string;
          unhealthy_account_count: number;
          unhealthy_service_count: number;
        }
      | undefined;
    const latestSyncRun = this.database.db.prepare(`
      SELECT sync_run_id, success, finished_at
      FROM account_sync_runs
      ORDER BY finished_at DESC
      LIMIT 1
    `).get() as
      | {
          finished_at: string;
          success: number;
          sync_run_id: string;
        }
      | undefined;
    const runtimeAvailability = this.scheduler.getAvailabilitySummary(referenceTimestamp);
    const currentRuntimeReadiness = {
      availableForRouting: runtimeAvailability.availableForRouting,
      overallReadyNow: runtimeAvailability.overallReady,
      referenceTimestamp: runtimeAvailability.referenceTimestamp,
    };

    if (!latestRun) {
      return {
        latestProbeRun: null,
        serviceHealth: {
          allHealthy: false,
          anyUnhealthy: false,
          degraded: 0,
          healthy: 0,
          total: 0,
          unhealthy: 0,
        },
        accountAvailability: {
          availableForRouting: runtimeAvailability.availableForRouting,
          blockedCount: runtimeAvailability.blockedCount,
          byRegistryStatus: {},
          byRuntimeHealth: {},
          byRuntimeState: runtimeAvailability.byRuntimeState,
          total: runtimeAvailability.total,
        },
        currentRuntimeReadiness,
        overallReady: currentRuntimeReadiness.overallReadyNow,
        signals: {
          latestSyncFailureSignal: latestSyncRun?.success === 0,
          latestSyncRunId: latestSyncRun?.sync_run_id ?? null,
        },
      };
    }

    const serviceCounts = this.database.db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM service_health_snapshots
      WHERE probe_run_id = ?
      GROUP BY status
    `).all(latestRun.probe_run_id) as Array<{ count: number; status: string }>;
    const accountRuntimeCounts = this.database.db.prepare(`
      SELECT runtime_health, COUNT(*) AS count
      FROM account_health_snapshots
      WHERE probe_run_id = ?
      GROUP BY runtime_health
    `).all(latestRun.probe_run_id) as Array<{ count: number; runtime_health: string }>;
    const accountRegistryCounts = this.database.db.prepare(`
      SELECT registry_status, COUNT(*) AS count
      FROM account_health_snapshots
      WHERE probe_run_id = ?
      GROUP BY registry_status
    `).all(latestRun.probe_run_id) as Array<{ count: number; registry_status: string }>;
    const serviceHealth = Object.fromEntries(serviceCounts.map((entry) => [entry.status, entry.count]));

    return {
      latestProbeRun: {
        accountProbeCount: latestRun.account_probe_count,
        finishedAt: latestRun.finished_at,
        probeCompleted: latestRun.probe_completed === 1,
        probeReadiness: {
          availableAccountCountAtProbe: latestRun.available_account_count,
          overallReadyAtProbe: latestRun.overall_ready === 1,
        },
        probeRunId: latestRun.probe_run_id,
        serviceProbeCount: latestRun.service_probe_count,
        startedAt: latestRun.started_at,
        unhealthyAccountCount: latestRun.unhealthy_account_count,
        unhealthyServiceCount: latestRun.unhealthy_service_count,
      },
      serviceHealth: {
        allHealthy: (serviceHealth.healthy ?? 0) === latestRun.service_probe_count,
        anyUnhealthy: (serviceHealth.unhealthy ?? 0) > 0,
        degraded: serviceHealth.degraded ?? 0,
        healthy: serviceHealth.healthy ?? 0,
        total: latestRun.service_probe_count,
        unhealthy: serviceHealth.unhealthy ?? 0,
      },
      accountAvailability: {
        availableForRouting: runtimeAvailability.availableForRouting,
        blockedCount: runtimeAvailability.blockedCount,
        byRegistryStatus: Object.fromEntries(
          accountRegistryCounts.map((entry) => [entry.registry_status, entry.count]),
        ),
        byRuntimeHealth: Object.fromEntries(
          accountRuntimeCounts.map((entry) => [entry.runtime_health, entry.count]),
        ),
        byRuntimeState: runtimeAvailability.byRuntimeState,
        total: runtimeAvailability.total,
      },
      currentRuntimeReadiness,
      overallReady: currentRuntimeReadiness.overallReadyNow,
      signals: {
        latestSyncFailureSignal: latestSyncRun?.success === 0,
        latestSyncRunId: latestSyncRun?.sync_run_id ?? null,
      },
    };
  }

  getLatestServiceSnapshots() {
    const latestRun = this.database.db.prepare(`
      SELECT probe_run_id
      FROM health_probe_runs
      ORDER BY finished_at DESC
      LIMIT 1
    `).get() as { probe_run_id: string } | undefined;

    if (!latestRun) {
      return [];
    }

    return this.database.db.prepare(`
      SELECT
        service_name,
        target,
        status,
        outcome_code,
        http_status,
        latency_ms,
        reachable,
        timed_out,
        detail,
        observed_at
      FROM service_health_snapshots
      WHERE probe_run_id = ?
      ORDER BY service_name
    `).all(latestRun.probe_run_id);
  }

  getLatestAccountSnapshots() {
    const latestRun = this.database.db.prepare(`
      SELECT probe_run_id
      FROM health_probe_runs
      ORDER BY finished_at DESC
      LIMIT 1
    `).get() as { probe_run_id: string } | undefined;

    if (!latestRun) {
      return [];
    }

    return this.database.db.prepare(`
      SELECT
        account_uid,
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
      WHERE probe_run_id = ?
      ORDER BY account_uid
    `).all(latestRun.probe_run_id);
  }
}
