import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import type { AppConfig } from '../config/app-config.ts';
import type { DatabaseManager } from '../ledger/database.ts';
import { Logger } from '../logging/logger.ts';

export type AccountSourceType = 'team' | 'free';
export type AccountStatus = 'active' | 'disabled' | 'expired';
export type AccountIdentitySource =
  | 'account_id'
  | 'email'
  | 'id_token_hash'
  | 'refresh_token_hash';

export type AccountSyncSummary = {
  syncRunId: string;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  errorMessage: string | null;
  scannedFiles: number;
  importedAccounts: number;
  updatedAccounts: number;
  unchangedAccounts: number;
  statusEventsWritten: number;
  sourceCounts: Record<AccountSourceType, number>;
  statusCounts: Record<AccountStatus, number>;
  registryCounts: {
    total: number;
    bySource: Record<AccountSourceType, number>;
    byStatus: Record<AccountStatus, number>;
  };
};

type RawAuthFile = Record<string, unknown>;

type SyncSource = {
  directoryPath: string;
  sourceType: AccountSourceType;
};

type DerivedStatus = {
  reason: string;
  status: AccountStatus;
};

type StableIdentity = {
  accountUid: string;
  identitySource: AccountIdentitySource;
};

type SyncedAccount = {
  accountUid: string;
  authType: string | null;
  currentStatus: AccountStatus;
  currentStatusReason: string;
  disabled: boolean;
  email: string | null;
  emailNormalized: string | null;
  expiredRaw: string | null;
  expiresAt: string | null;
  identitySource: AccountIdentitySource;
  lastRefreshAt: string | null;
  sourceAccountId: string | null;
  sourceFile: string;
  sourceFileName: string;
  sourceFingerprint: string;
  sourceType: AccountSourceType;
};

type ExistingAccountRow = {
  account_uid: string;
  auth_type: string | null;
  current_status: AccountStatus;
  current_status_reason: string;
  disabled: number;
  email: string | null;
  email_normalized: string | null;
  expired_raw: string | null;
  expires_at: string | null;
  identity_source: AccountIdentitySource;
  last_refresh_at: string | null;
  source_account_id: string | null;
  source_file: string;
  source_file_name: string;
  source_fingerprint: string;
  source_type: AccountSourceType;
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalScalar(value: unknown): string | null {
  if (typeof value === 'string') {
    return normalizeOptionalString(value);
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }

  return null;
}

function normalizeOptionalBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeTimestamp(value: unknown): string | null {
  const normalized = normalizeOptionalScalar(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return parsed.toISOString();
}

function toRepoRelativePath(workspaceRoot: string, fullPath: string): string {
  return relative(workspaceRoot, fullPath).replace(/\\/g, '/');
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function createStableIdentity(
  sourceType: AccountSourceType,
  rawAuthFile: RawAuthFile,
  sourceAccountId: string | null,
  emailNormalized: string | null,
): StableIdentity {
  let identitySource: AccountIdentitySource | null = null;
  let identitySeed: string | null = null;

  if (sourceAccountId) {
    identitySource = 'account_id';
    identitySeed = sourceAccountId;
  } else if (emailNormalized) {
    identitySource = 'email';
    identitySeed = emailNormalized;
  } else {
    const idToken = normalizeOptionalString(rawAuthFile.id_token);
    const refreshToken = normalizeOptionalString(rawAuthFile.refresh_token);

    if (idToken) {
      identitySource = 'id_token_hash';
      identitySeed = sha256(idToken);
    } else if (refreshToken) {
      identitySource = 'refresh_token_hash';
      identitySeed = sha256(refreshToken);
    }
  }

  if (!identitySource || !identitySeed) {
    throw new Error(`Unable to derive a stable identity for source=${sourceType}`);
  }

  return {
    accountUid: `acct_${sha256(`codex-pool-v2\n${sourceType}\n${identitySource}\n${identitySeed}`).slice(0, 24)}`,
    identitySource,
  };
}

function determineInitialStatus(
  disabled: boolean,
  expiredRaw: string | null,
  expiresAt: string | null,
  observedAt: string,
): DerivedStatus {
  if (disabled) {
    return {
      status: 'disabled',
      reason: 'source.disabled=true',
    };
  }

  if (expiredRaw && expiredRaw.toLowerCase() === 'true') {
    return {
      status: 'expired',
      reason: 'source.expired=true',
    };
  }

  if (expiresAt) {
    const expiresAtMs = new Date(expiresAt).valueOf();
    const observedAtMs = new Date(observedAt).valueOf();

    if (expiresAtMs <= observedAtMs) {
      return {
        status: 'expired',
        reason: 'source.expired_at<=observed_at',
      };
    }
  }

  return {
    status: 'active',
    reason: 'source.default_active',
  };
}

function createSourceFingerprint(account: Omit<SyncedAccount, 'accountUid'>): string {
  return sha256(JSON.stringify(account));
}

function parseAuthFile(
  workspaceRoot: string,
  sourceType: AccountSourceType,
  filePath: string,
  observedAt: string,
): SyncedAccount {
  const rawAuthFile = JSON.parse(readFileSync(filePath, 'utf8')) as RawAuthFile;
  const sourceAccountId = normalizeOptionalString(rawAuthFile.account_id);
  const email = normalizeOptionalString(rawAuthFile.email);
  const emailNormalized = normalizeEmail(rawAuthFile.email);
  const authType = normalizeOptionalString(rawAuthFile.type);
  const disabled = normalizeOptionalBoolean(rawAuthFile.disabled);
  const expiredRaw = normalizeOptionalScalar(rawAuthFile.expired);
  const expiresAt = normalizeTimestamp(rawAuthFile.expired);
  const lastRefreshAt = normalizeTimestamp(rawAuthFile.last_refresh);
  const stableIdentity = createStableIdentity(sourceType, rawAuthFile, sourceAccountId, emailNormalized);
  const derivedStatus = determineInitialStatus(disabled, expiredRaw, expiresAt, observedAt);
  const sourceFile = toRepoRelativePath(workspaceRoot, filePath);
  const sourceFileName = basename(filePath);

  const accountWithoutFingerprint = {
    authType,
    currentStatus: derivedStatus.status,
    currentStatusReason: derivedStatus.reason,
    disabled,
    email,
    emailNormalized,
    expiredRaw,
    expiresAt,
    identitySource: stableIdentity.identitySource,
    lastRefreshAt,
    sourceAccountId,
    sourceFile,
    sourceFileName,
    sourceType,
  };

  return {
    accountUid: stableIdentity.accountUid,
    ...accountWithoutFingerprint,
    sourceFingerprint: createSourceFingerprint(accountWithoutFingerprint),
  };
}

function listSourceFiles(directoryPath: string): string[] {
  if (!existsSync(directoryPath)) {
    return [];
  }

  return readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(directoryPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function hasAccountChanged(existing: ExistingAccountRow, incoming: SyncedAccount): boolean {
  return (
    existing.identity_source !== incoming.identitySource ||
    existing.source_type !== incoming.sourceType ||
    existing.source_file !== incoming.sourceFile ||
    existing.source_file_name !== incoming.sourceFileName ||
    existing.source_fingerprint !== incoming.sourceFingerprint ||
    existing.auth_type !== incoming.authType ||
    existing.source_account_id !== incoming.sourceAccountId ||
    existing.email !== incoming.email ||
    existing.email_normalized !== incoming.emailNormalized ||
    existing.disabled !== (incoming.disabled ? 1 : 0) ||
    existing.expired_raw !== incoming.expiredRaw ||
    existing.expires_at !== incoming.expiresAt ||
    existing.last_refresh_at !== incoming.lastRefreshAt ||
    existing.current_status !== incoming.currentStatus ||
    existing.current_status_reason !== incoming.currentStatusReason
  );
}

function countBySingleColumn(
  database: DatabaseManager,
  tableName: string,
  columnName: string,
): Record<string, number> {
  const rows = database.db.prepare(`
    SELECT ${columnName} AS value, COUNT(*) AS count
    FROM ${tableName}
    GROUP BY ${columnName}
  `).all() as Array<{ count: number; value: string | null }>;

  const counts: Record<string, number> = {};

  for (const row of rows) {
    const key = row.value ?? 'null';
    counts[key] = row.count;
  }

  return counts;
}

function getRegistryCounts(database: DatabaseManager) {
  const totalRow = database.db.prepare('SELECT COUNT(*) AS count FROM account_registry').get() as {
    count: number;
  };
  const bySource = countBySingleColumn(database, 'account_registry', 'source_type');
  const byStatus = countBySingleColumn(database, 'account_registry', 'current_status');

  return {
    total: totalRow.count,
    bySource: {
      team: bySource.team ?? 0,
      free: bySource.free ?? 0,
    },
    byStatus: {
      active: byStatus.active ?? 0,
      disabled: byStatus.disabled ?? 0,
      expired: byStatus.expired ?? 0,
    },
  };
}

function insertSyncRun(database: DatabaseManager, summary: AccountSyncSummary): void {
  database.db.prepare(`
    INSERT INTO account_sync_runs (
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    summary.syncRunId,
    summary.startedAt,
    summary.finishedAt,
    summary.success ? 1 : 0,
    summary.scannedFiles,
    summary.importedAccounts,
    summary.updatedAccounts,
    summary.unchangedAccounts,
    summary.statusEventsWritten,
    summary.errorMessage,
  );
}

export function syncAccountRegistry(
  config: Pick<AppConfig, 'authSources' | 'workspaceRoot'>,
  database: DatabaseManager,
  logger: Logger,
): AccountSyncSummary {
  const startedAt = new Date().toISOString();
  const syncRunId = randomUUID();
  const sources: SyncSource[] = [
    {
      sourceType: 'team',
      directoryPath: config.authSources.team,
    },
    {
      sourceType: 'free',
      directoryPath: config.authSources.free,
    },
  ];

  const selectAccount = database.db.prepare(`
    SELECT
      account_uid,
      identity_source,
      source_type,
      source_file,
      source_file_name,
      source_fingerprint,
      auth_type,
      source_account_id,
      email,
      email_normalized,
      disabled,
      expired_raw,
      expires_at,
      last_refresh_at,
      current_status,
      current_status_reason
    FROM account_registry
    WHERE account_uid = ?
  `);
  const insertAccount = database.db.prepare(`
    INSERT INTO account_registry (
      account_uid,
      identity_source,
      source_type,
      source_file,
      source_file_name,
      source_fingerprint,
      auth_type,
      source_account_id,
      email,
      email_normalized,
      disabled,
      expired_raw,
      expires_at,
      last_refresh_at,
      current_status,
      current_status_reason,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateAccount = database.db.prepare(`
    UPDATE account_registry
    SET
      identity_source = ?,
      source_type = ?,
      source_file = ?,
      source_file_name = ?,
      source_fingerprint = ?,
      auth_type = ?,
      source_account_id = ?,
      email = ?,
      email_normalized = ?,
      disabled = ?,
      expired_raw = ?,
      expires_at = ?,
      last_refresh_at = ?,
      current_status = ?,
      current_status_reason = ?,
      updated_at = ?
    WHERE account_uid = ?
  `);
  const insertStatusEvent = database.db.prepare(`
    INSERT INTO account_status_events (
      event_id,
      account_uid,
      event_type,
      from_status,
      to_status,
      reason,
      observed_at,
      sync_run_id,
      source_fingerprint,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const fileMap = new Map<AccountSourceType, string[]>();
  const summary: AccountSyncSummary = {
    syncRunId,
    startedAt,
    finishedAt: startedAt,
    success: false,
    errorMessage: null,
    scannedFiles: 0,
    importedAccounts: 0,
    updatedAccounts: 0,
    unchangedAccounts: 0,
    statusEventsWritten: 0,
    sourceCounts: {
      team: 0,
      free: 0,
    },
    statusCounts: {
      active: 0,
      disabled: 0,
      expired: 0,
    },
    registryCounts: {
      total: 0,
      bySource: {
        team: 0,
        free: 0,
      },
      byStatus: {
        active: 0,
        disabled: 0,
        expired: 0,
      },
    },
  };

  for (const source of sources) {
    const files = listSourceFiles(source.directoryPath);
    fileMap.set(source.sourceType, files);
    summary.sourceCounts[source.sourceType] = files.length;
  }

  try {
    database.runInTransaction(() => {
      const observedAt = new Date().toISOString();

      for (const source of sources) {
        const files = fileMap.get(source.sourceType) ?? [];

        for (const filePath of files) {
          summary.scannedFiles += 1;

          const syncedAccount = parseAuthFile(config.workspaceRoot, source.sourceType, filePath, observedAt);
          summary.statusCounts[syncedAccount.currentStatus] += 1;

          const existing = selectAccount.get(syncedAccount.accountUid) as ExistingAccountRow | undefined;

          if (!existing) {
            insertAccount.run(
              syncedAccount.accountUid,
              syncedAccount.identitySource,
              syncedAccount.sourceType,
              syncedAccount.sourceFile,
              syncedAccount.sourceFileName,
              syncedAccount.sourceFingerprint,
              syncedAccount.authType,
              syncedAccount.sourceAccountId,
              syncedAccount.email,
              syncedAccount.emailNormalized,
              syncedAccount.disabled ? 1 : 0,
              syncedAccount.expiredRaw,
              syncedAccount.expiresAt,
              syncedAccount.lastRefreshAt,
              syncedAccount.currentStatus,
              syncedAccount.currentStatusReason,
              observedAt,
              observedAt,
            );

            insertStatusEvent.run(
              randomUUID(),
              syncedAccount.accountUid,
              'imported',
              null,
              syncedAccount.currentStatus,
              syncedAccount.currentStatusReason,
              observedAt,
              syncRunId,
              syncedAccount.sourceFingerprint,
              observedAt,
            );

            summary.importedAccounts += 1;
            summary.statusEventsWritten += 1;
            continue;
          }

          if (!hasAccountChanged(existing, syncedAccount)) {
            summary.unchangedAccounts += 1;
            continue;
          }

          updateAccount.run(
            syncedAccount.identitySource,
            syncedAccount.sourceType,
            syncedAccount.sourceFile,
            syncedAccount.sourceFileName,
            syncedAccount.sourceFingerprint,
            syncedAccount.authType,
            syncedAccount.sourceAccountId,
            syncedAccount.email,
            syncedAccount.emailNormalized,
            syncedAccount.disabled ? 1 : 0,
            syncedAccount.expiredRaw,
            syncedAccount.expiresAt,
            syncedAccount.lastRefreshAt,
            syncedAccount.currentStatus,
            syncedAccount.currentStatusReason,
            observedAt,
            syncedAccount.accountUid,
          );

          summary.updatedAccounts += 1;

          if (existing.current_status !== syncedAccount.currentStatus) {
            insertStatusEvent.run(
              randomUUID(),
              syncedAccount.accountUid,
              'status_changed',
              existing.current_status,
              syncedAccount.currentStatus,
              syncedAccount.currentStatusReason,
              observedAt,
              syncRunId,
              syncedAccount.sourceFingerprint,
              observedAt,
            );

            summary.statusEventsWritten += 1;
          }
        }
      }

      summary.registryCounts = getRegistryCounts(database);
    });

    summary.success = true;
    summary.finishedAt = new Date().toISOString();
    insertSyncRun(database, summary);

    logger.info('accounts.sync.completed', summary);

    return summary;
  } catch (error) {
    summary.finishedAt = new Date().toISOString();
    summary.errorMessage = error instanceof Error ? error.message : String(error);
    summary.registryCounts = getRegistryCounts(database);

    insertSyncRun(database, summary);

    logger.error('accounts.sync.failed', {
      error: summary.errorMessage,
      scannedFiles: summary.scannedFiles,
      syncRunId,
    });

    throw error;
  }
}
