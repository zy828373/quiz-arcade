import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import { repoRoot, v2Root } from '../paths.ts';
import { loadEnvFile } from './load-env.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type AppStage = 'stage0' | 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5' | 'stage6' | 'stage7';

export type AccountSourcePaths = {
  free: string;
  team: string;
};

export type SchedulerConfig = {
  mode: 'shadow';
  sourceTypeBias: Record<'team' | 'free', number>;
  readyScoreBonus: number;
  degradedScorePenalty: number;
  latestHealthDegradedPenalty: number;
  refreshStalePenalty: number;
  recentSyncFailureSignalPenalty: number;
  expiringSoonHours: number;
  expiringSoonPenalty: number;
  failurePenaltyPerFailure: number;
  recoveryProbePenalty: number;
  cooldownMinutes: number;
  rateLimitCooldownMinutes: number;
  authErrorQuarantineMinutes: number;
  recoveryProbeDelayMinutes: number;
  successesToReady: number;
  failuresToCooldown: number;
  failuresToQuarantine: number;
};

export type AppConfig = {
  serviceName: string;
  version: string;
  stage: AppStage;
  environment: string;
  host: string;
  port: number;
  logLevel: LogLevel;
  dataDirectory: string;
  databasePath: string;
  workspaceRoot: string;
  authSources: AccountSourcePaths;
  scheduler: SchedulerConfig;
};

const DEFAULT_PORT = 18320;
const DEFAULT_DATABASE_PATH = './data/control-plane.sqlite';
const DEFAULT_TEAM_AUTHS_PATH = 'auths_team';
const DEFAULT_FREE_AUTHS_PATH = 'auths_free';
const VALID_LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function parseInteger(
  rawValue: string | undefined,
  fallback: number,
  envName: string,
): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid ${envName} value: ${rawValue}`);
  }

  return parsed;
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid V2_PORT value: ${value}`);
  }

  return parsed;
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (!value) {
    return 'info';
  }

  if (!VALID_LOG_LEVELS.includes(value as LogLevel)) {
    throw new Error(`Invalid V2_LOG_LEVEL value: ${value}`);
  }

  return value as LogLevel;
}

function resolveDatabasePath(rawPath: string): string {
  if (isAbsolute(rawPath)) {
    return rawPath;
  }

  return resolve(v2Root, rawPath);
}

function resolveWorkspacePath(rawPath: string): string {
  if (isAbsolute(rawPath)) {
    return rawPath;
  }

  return resolve(repoRoot, rawPath);
}

export function createAppConfig(): AppConfig {
  loadEnvFile(resolve(v2Root, '.env'));

  const databasePath = resolveDatabasePath(process.env.V2_DATABASE_PATH ?? DEFAULT_DATABASE_PATH);
  const dataDirectory = resolve(v2Root, 'data');

  mkdirSync(dataDirectory, { recursive: true });
  mkdirSync(dirname(databasePath), { recursive: true });

  return {
    serviceName: 'codex-pool-v2',
    version: '0.8.0-phase7',
    stage: 'stage7',
    environment: process.env.V2_ENV ?? 'development',
    host: process.env.V2_HOST ?? '127.0.0.1',
    port: parsePort(process.env.V2_PORT),
    logLevel: parseLogLevel(process.env.V2_LOG_LEVEL),
    dataDirectory,
    databasePath,
    workspaceRoot: repoRoot,
    authSources: {
      team: resolveWorkspacePath(process.env.V2_AUTHS_TEAM_DIR ?? DEFAULT_TEAM_AUTHS_PATH),
      free: resolveWorkspacePath(process.env.V2_AUTHS_FREE_DIR ?? DEFAULT_FREE_AUTHS_PATH),
    },
    scheduler: {
      mode: 'shadow',
      sourceTypeBias: {
        team: parseInteger(process.env.V2_SCHEDULER_TEAM_BIAS, 0, 'V2_SCHEDULER_TEAM_BIAS'),
        free: parseInteger(process.env.V2_SCHEDULER_FREE_BIAS, 0, 'V2_SCHEDULER_FREE_BIAS'),
      },
      readyScoreBonus: parseInteger(
        process.env.V2_SCHEDULER_READY_SCORE_BONUS,
        12,
        'V2_SCHEDULER_READY_SCORE_BONUS',
      ),
      degradedScorePenalty: parseInteger(
        process.env.V2_SCHEDULER_DEGRADED_SCORE_PENALTY,
        18,
        'V2_SCHEDULER_DEGRADED_SCORE_PENALTY',
      ),
      latestHealthDegradedPenalty: parseInteger(
        process.env.V2_SCHEDULER_LATEST_HEALTH_DEGRADED_PENALTY,
        10,
        'V2_SCHEDULER_LATEST_HEALTH_DEGRADED_PENALTY',
      ),
      refreshStalePenalty: parseInteger(
        process.env.V2_SCHEDULER_REFRESH_STALE_PENALTY,
        14,
        'V2_SCHEDULER_REFRESH_STALE_PENALTY',
      ),
      recentSyncFailureSignalPenalty: parseInteger(
        process.env.V2_SCHEDULER_SYNC_FAILURE_SIGNAL_PENALTY,
        6,
        'V2_SCHEDULER_SYNC_FAILURE_SIGNAL_PENALTY',
      ),
      expiringSoonHours: parseInteger(
        process.env.V2_SCHEDULER_EXPIRING_SOON_HOURS,
        24,
        'V2_SCHEDULER_EXPIRING_SOON_HOURS',
      ),
      expiringSoonPenalty: parseInteger(
        process.env.V2_SCHEDULER_EXPIRING_SOON_PENALTY,
        20,
        'V2_SCHEDULER_EXPIRING_SOON_PENALTY',
      ),
      failurePenaltyPerFailure: parseInteger(
        process.env.V2_SCHEDULER_FAILURE_PENALTY_PER_FAILURE,
        15,
        'V2_SCHEDULER_FAILURE_PENALTY_PER_FAILURE',
      ),
      recoveryProbePenalty: parseInteger(
        process.env.V2_SCHEDULER_RECOVERY_PROBE_PENALTY,
        25,
        'V2_SCHEDULER_RECOVERY_PROBE_PENALTY',
      ),
      cooldownMinutes: parseInteger(
        process.env.V2_SCHEDULER_COOLDOWN_MINUTES,
        15,
        'V2_SCHEDULER_COOLDOWN_MINUTES',
      ),
      rateLimitCooldownMinutes: parseInteger(
        process.env.V2_SCHEDULER_RATE_LIMIT_COOLDOWN_MINUTES,
        30,
        'V2_SCHEDULER_RATE_LIMIT_COOLDOWN_MINUTES',
      ),
      authErrorQuarantineMinutes: parseInteger(
        process.env.V2_SCHEDULER_AUTH_ERROR_QUARANTINE_MINUTES,
        360,
        'V2_SCHEDULER_AUTH_ERROR_QUARANTINE_MINUTES',
      ),
      recoveryProbeDelayMinutes: parseInteger(
        process.env.V2_SCHEDULER_RECOVERY_PROBE_DELAY_MINUTES,
        5,
        'V2_SCHEDULER_RECOVERY_PROBE_DELAY_MINUTES',
      ),
      successesToReady: parseInteger(
        process.env.V2_SCHEDULER_SUCCESSES_TO_READY,
        2,
        'V2_SCHEDULER_SUCCESSES_TO_READY',
      ),
      failuresToCooldown: parseInteger(
        process.env.V2_SCHEDULER_FAILURES_TO_COOLDOWN,
        2,
        'V2_SCHEDULER_FAILURES_TO_COOLDOWN',
      ),
      failuresToQuarantine: parseInteger(
        process.env.V2_SCHEDULER_FAILURES_TO_QUARANTINE,
        4,
        'V2_SCHEDULER_FAILURES_TO_QUARANTINE',
      ),
    },
  };
}
