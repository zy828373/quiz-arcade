import { createHash, randomUUID } from 'node:crypto';

import type { HealthService } from '../health/health-service.ts';
import type { DatabaseManager } from '../ledger/database.ts';
import type { Logger } from '../logging/logger.ts';
import type { ShadowScheduler } from '../routing/shadow-scheduler.ts';
import { loadGatewayRuntimeConfig } from '../gateway/runtime-config.ts';

type SyntheticCheckName = 'openai_json' | 'anthropic_json' | 'openai_stream';
type SyntheticTransportKind = 'json' | 'stream';

type SyntheticProbeRunRow = {
  anthropic_json_passed: number;
  base_url: string;
  client_key_fingerprint: string;
  error_message: string | null;
  failed_checks: number;
  finished_at: string;
  openai_json_passed: number;
  passed_checks: number;
  started_at: string;
  streaming_passed: number | null;
  success: number;
  synthetic_run_id: string;
  total_checks: number;
  trigger_reason: string;
  triggered_by: string;
};

type SyntheticProbeResultRow = {
  check_name: SyntheticCheckName;
  created_at: string;
  detail: string | null;
  evidence_json: string;
  http_status: number | null;
  latency_ms: number | null;
  observed_at: string;
  protocol: 'openai' | 'anthropic';
  request_model: string | null;
  response_kind: string;
  result_id: string;
  success: number;
  synthetic_run_id: string;
  target_path: string;
  transport_kind: SyntheticTransportKind;
};

type ReadinessSnapshotRow = {
  blocker_count: number;
  blockers_json: string;
  created_at: string;
  evaluated_at: string;
  evidence_json: string;
  readiness_snapshot_id: string;
  ready: number;
  trigger_reason: string;
  triggered_by: string;
  warning_count: number;
  warnings_json: string;
};

type ReadinessLatestRow = {
  finished_at: string;
  success: number;
} | null;

const DEFAULT_SYNTHETIC_TIMEOUT_MS = 15000;
const DEFAULT_SYNTHETIC_OPENAI_MODEL = 'gpt-5.4';
const DEFAULT_SYNTHETIC_ANTHROPIC_MODEL = 'claude-sonnet-4-5';
const DEFAULT_SYNC_MAX_AGE_MINUTES = 1440;
const DEFAULT_HEALTH_MAX_AGE_MINUTES = 30;
const DEFAULT_SYNTHETIC_MAX_AGE_MINUTES = 30;

export type SyntheticProbeResultView = {
  checkName: SyntheticCheckName;
  detail: string | null;
  evidence: unknown;
  httpStatus: number | null;
  latencyMs: number | null;
  observedAt: string;
  protocol: 'openai' | 'anthropic';
  requestModel: string | null;
  responseKind: string;
  resultId: string;
  success: boolean;
  targetPath: string;
  transportKind: SyntheticTransportKind;
};

export type SyntheticProbeRunView = {
  anthropicJsonPassed: boolean;
  baseUrl: string;
  clientKeyFingerprint: string;
  errorMessage: string | null;
  failedChecks: number;
  finishedAt: string;
  openaiJsonPassed: boolean;
  passedChecks: number;
  startedAt: string;
  streamingPassed: boolean | null;
  success: boolean;
  syntheticRunId: string;
  totalChecks: number;
  triggerReason: string;
  triggeredBy: string;
};

export type SyntheticProbeSummary = SyntheticProbeRunView & {
  results: SyntheticProbeResultView[];
};

export type ReadinessIssue = {
  code: string;
  message: string;
};

export type ReadinessEvaluation = {
  blockers: ReadinessIssue[];
  evaluatedAt: string;
  evidence: Record<string, unknown>;
  ready: boolean;
  warnings: ReadinessIssue[];
};

type SyntheticSettings = {
  anthropicModel: string;
  enableOpenAiStream: boolean;
  openAiModel: string;
  timeoutMs: number;
};

type ReadinessThresholds = {
  healthMaxAgeMinutes: number;
  syncMaxAgeMinutes: number;
  syntheticMaxAgeMinutes: number;
};

type SyntheticProbeInput = {
  baseUrl: string | null;
  database: DatabaseManager;
  logger: Logger;
  triggerReason: string;
  triggeredBy: string;
  workspaceRoot: string;
};

type ReadinessInput = {
  database: DatabaseManager;
  healthService: HealthService;
  scheduler: ShadowScheduler;
  serviceBaseUrl: string | null;
  workspaceRoot: string;
};

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

function parsePositiveInteger(rawValue: string | undefined, fallback: number): number {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(baseUrl: string | null): string | null {
  if (!baseUrl) {
    return null;
  }

  return baseUrl.trim().replace(/\/+$/, '');
}

function createFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
}

function getSyntheticSettings(): SyntheticSettings {
  return {
    anthropicModel:
      process.env.V2_SYNTHETIC_ANTHROPIC_MODEL?.trim() || DEFAULT_SYNTHETIC_ANTHROPIC_MODEL,
    enableOpenAiStream: process.env.V2_SYNTHETIC_ENABLE_OPENAI_STREAM !== '0',
    openAiModel: process.env.V2_SYNTHETIC_OPENAI_MODEL?.trim() || DEFAULT_SYNTHETIC_OPENAI_MODEL,
    timeoutMs: parsePositiveInteger(
      process.env.V2_SYNTHETIC_TIMEOUT_MS,
      DEFAULT_SYNTHETIC_TIMEOUT_MS,
    ),
  };
}

function getReadinessThresholds(): ReadinessThresholds {
  return {
    healthMaxAgeMinutes: parsePositiveInteger(
      process.env.V2_READINESS_HEALTH_MAX_AGE_MINUTES,
      DEFAULT_HEALTH_MAX_AGE_MINUTES,
    ),
    syncMaxAgeMinutes: parsePositiveInteger(
      process.env.V2_READINESS_SYNC_MAX_AGE_MINUTES,
      DEFAULT_SYNC_MAX_AGE_MINUTES,
    ),
    syntheticMaxAgeMinutes: parsePositiveInteger(
      process.env.V2_READINESS_SYNTHETIC_MAX_AGE_MINUTES,
      DEFAULT_SYNTHETIC_MAX_AGE_MINUTES,
    ),
  };
}

function sanitizeGatewayHeaders(response: Response): Record<string, string | null> {
  return {
    contentType: response.headers.get('content-type'),
    executionDisposition: response.headers.get('x-codex-execution-disposition'),
    gatewayMode: response.headers.get('x-codex-gateway-mode'),
    shadowDecisionId: response.headers.get('x-codex-shadow-decision-id'),
  };
}

function mapSyntheticProbeRun(row: SyntheticProbeRunRow): SyntheticProbeRunView {
  return {
    anthropicJsonPassed: row.anthropic_json_passed === 1,
    baseUrl: row.base_url,
    clientKeyFingerprint: row.client_key_fingerprint,
    errorMessage: row.error_message,
    failedChecks: row.failed_checks,
    finishedAt: row.finished_at,
    openaiJsonPassed: row.openai_json_passed === 1,
    passedChecks: row.passed_checks,
    startedAt: row.started_at,
    streamingPassed: toBoolean(row.streaming_passed),
    success: row.success === 1,
    syntheticRunId: row.synthetic_run_id,
    totalChecks: row.total_checks,
    triggerReason: row.trigger_reason,
    triggeredBy: row.triggered_by,
  };
}

function mapSyntheticProbeResult(row: SyntheticProbeResultRow): SyntheticProbeResultView {
  return {
    checkName: row.check_name,
    detail: row.detail,
    evidence: parseJsonSafely(row.evidence_json),
    httpStatus: row.http_status,
    latencyMs: row.latency_ms,
    observedAt: row.observed_at,
    protocol: row.protocol,
    requestModel: row.request_model,
    responseKind: row.response_kind,
    resultId: row.result_id,
    success: row.success === 1,
    targetPath: row.target_path,
    transportKind: row.transport_kind,
  };
}

function mapReadinessSnapshot(row: ReadinessSnapshotRow) {
  return {
    blockerCount: row.blocker_count,
    blockers: parseJsonSafely(row.blockers_json),
    createdAt: row.created_at,
    evaluatedAt: row.evaluated_at,
    evidence: parseJsonSafely(row.evidence_json),
    readinessSnapshotId: row.readiness_snapshot_id,
    ready: row.ready === 1,
    triggerReason: row.trigger_reason,
    triggeredBy: row.triggered_by,
    warningCount: row.warning_count,
    warnings: parseJsonSafely(row.warnings_json),
  };
}

function isStale(finishedAt: string | null, maxAgeMinutes: number, nowMs: number): boolean {
  if (!finishedAt) {
    return true;
  }

  const finishedAtMs = new Date(finishedAt).valueOf();
  if (!Number.isFinite(finishedAtMs)) {
    return true;
  }

  return nowMs - finishedAtMs > maxAgeMinutes * 60 * 1000;
}

function buildOpenAiJsonBody(model: string): string {
  return JSON.stringify({
    max_tokens: 32,
    messages: [
      {
        content: 'Respond with exactly: ready',
        role: 'user',
      },
    ],
    model,
    temperature: 0,
  });
}

function buildAnthropicJsonBody(model: string): string {
  return JSON.stringify({
    max_tokens: 32,
    messages: [
      {
        content: [
          {
            text: 'Respond with exactly: ready',
            type: 'text',
          },
        ],
        role: 'user',
      },
    ],
    model,
    temperature: 0,
  });
}

async function executeSyntheticJsonCheck(input: {
  apiKey: string;
  baseUrl: string;
  body: string;
  checkName: Extract<SyntheticCheckName, 'openai_json' | 'anthropic_json'>;
  model: string;
  path: '/v1/chat/completions' | '/v1/messages';
  protocol: 'openai' | 'anthropic';
  timeoutMs: number;
}): Promise<SyntheticProbeResultView> {
  const startedAt = Date.now();
  const observedAt = new Date(startedAt).toISOString();

  try {
    const response = await fetch(`${input.baseUrl}${input.path}`, {
      body: input.body,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': input.apiKey,
      },
      method: 'POST',
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    const latencyMs = Date.now() - startedAt;
    const gatewayHeaders = sanitizeGatewayHeaders(response);
    const responseText = await response.text();
    const parsed = responseText ? parseJsonSafely(responseText) : null;
    let success = response.ok;
    let detail: string | null = null;
    let evidence: Record<string, unknown> = {
      gatewayHeaders,
      parsed: false,
    };

    if (input.protocol === 'openai') {
      const payload = parsed as
        | {
            choices?: Array<{ message?: { content?: string } }>;
            object?: string;
          }
        | null;
      success =
        success &&
        payload?.object === 'chat.completion' &&
        Array.isArray(payload.choices) &&
        typeof payload.choices[0]?.message?.content === 'string';
      evidence = {
        choiceCount: Array.isArray(payload?.choices) ? payload.choices.length : 0,
        gatewayHeaders,
        object: payload?.object ?? null,
        parsed: payload !== null,
      };
      detail = success ? 'openai_json_ok' : 'openai_json_invalid_shape';
    } else {
      const payload = parsed as
        | {
            content?: Array<{ text?: string; type?: string }>;
            type?: string;
          }
        | null;
      success =
        success &&
        payload?.type === 'message' &&
        Array.isArray(payload.content) &&
        payload.content.some((entry) => entry?.type === 'text' && typeof entry?.text === 'string');
      evidence = {
        contentBlockCount: Array.isArray(payload?.content) ? payload.content.length : 0,
        gatewayHeaders,
        parsed: payload !== null,
        type: payload?.type ?? null,
      };
      detail = success ? 'anthropic_json_ok' : 'anthropic_json_invalid_shape';
    }

    if (!response.ok) {
      detail = detail ?? `http_${response.status}`;
    }

    return {
      checkName: input.checkName,
      detail,
      evidence,
      httpStatus: response.status,
      latencyMs,
      observedAt,
      protocol: input.protocol,
      requestModel: input.model,
      responseKind: 'json',
      resultId: randomUUID(),
      success,
      targetPath: input.path,
      transportKind: 'json',
    };
  } catch (error) {
    return {
      checkName: input.checkName,
      detail:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'request_timed_out'
          : error instanceof Error
            ? error.message
            : String(error),
      evidence: {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      observedAt,
      protocol: input.protocol,
      requestModel: input.model,
      responseKind: 'error',
      resultId: randomUUID(),
      success: false,
      targetPath: input.path,
      transportKind: 'json',
    };
  }
}

async function executeOpenAiStreamCheck(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}): Promise<SyntheticProbeResultView> {
  const startedAt = Date.now();
  const observedAt = new Date(startedAt).toISOString();

  try {
    const response = await fetch(`${input.baseUrl}/v1/chat/completions`, {
      body: JSON.stringify({
        messages: [
          {
            content: 'Stream a short ready acknowledgement.',
            role: 'user',
          },
        ],
        model: input.model,
        stream: true,
        temperature: 0,
      }),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': input.apiKey,
      },
      method: 'POST',
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    const latencyMs = Date.now() - startedAt;
    const gatewayHeaders = sanitizeGatewayHeaders(response);
    const responseText = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    const success =
      response.ok &&
      contentType.includes('text/event-stream') &&
      responseText.includes('data: [DONE]');

    return {
      checkName: 'openai_stream',
      detail: success ? 'openai_stream_ok' : 'openai_stream_invalid_shape',
      evidence: {
        contentType,
        doneSeen: responseText.includes('data: [DONE]'),
        gatewayHeaders,
      },
      httpStatus: response.status,
      latencyMs,
      observedAt,
      protocol: 'openai',
      requestModel: input.model,
      responseKind: 'stream',
      resultId: randomUUID(),
      success,
      targetPath: '/v1/chat/completions',
      transportKind: 'stream',
    };
  } catch (error) {
    return {
      checkName: 'openai_stream',
      detail:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'request_timed_out'
          : error instanceof Error
            ? error.message
            : String(error),
      evidence: {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      observedAt,
      protocol: 'openai',
      requestModel: input.model,
      responseKind: 'error',
      resultId: randomUUID(),
      success: false,
      targetPath: '/v1/chat/completions',
      transportKind: 'stream',
    };
  }
}

function insertSyntheticProbeRun(database: DatabaseManager, summary: SyntheticProbeSummary): void {
  database.db.prepare(`
    INSERT INTO synthetic_probe_runs (
      synthetic_run_id,
      started_at,
      finished_at,
      success,
      base_url,
      client_key_fingerprint,
      triggered_by,
      trigger_reason,
      total_checks,
      passed_checks,
      failed_checks,
      openai_json_passed,
      anthropic_json_passed,
      streaming_passed,
      error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    summary.syntheticRunId,
    summary.startedAt,
    summary.finishedAt,
    summary.success ? 1 : 0,
    summary.baseUrl,
    summary.clientKeyFingerprint,
    summary.triggeredBy,
    summary.triggerReason,
    summary.totalChecks,
    summary.passedChecks,
    summary.failedChecks,
    summary.openaiJsonPassed ? 1 : 0,
    summary.anthropicJsonPassed ? 1 : 0,
    summary.streamingPassed === null ? null : summary.streamingPassed ? 1 : 0,
    summary.errorMessage,
  );

  const insertResult = database.db.prepare(`
    INSERT INTO synthetic_probe_results (
      result_id,
      synthetic_run_id,
      check_name,
      protocol,
      transport_kind,
      target_path,
      request_model,
      success,
      http_status,
      latency_ms,
      response_kind,
      detail,
      evidence_json,
      observed_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const result of summary.results) {
    insertResult.run(
      result.resultId,
      summary.syntheticRunId,
      result.checkName,
      result.protocol,
      result.transportKind,
      result.targetPath,
      result.requestModel,
      result.success ? 1 : 0,
      result.httpStatus,
      result.latencyMs,
      result.responseKind,
      result.detail,
      JSON.stringify(result.evidence),
      result.observedAt,
      result.observedAt,
    );
  }
}

export async function runSyntheticProbe(input: SyntheticProbeInput): Promise<SyntheticProbeSummary> {
  const startedAt = new Date().toISOString();
  const settings = getSyntheticSettings();
  const syntheticRunId = randomUUID();
  const results: SyntheticProbeResultView[] = [];
  let baseUrl = normalizeBaseUrl(input.baseUrl) ?? 'unconfigured';
  let clientKeyFingerprint = 'unconfigured';
  let errorMessage: string | null = null;

  try {
    const runtimeConfig = loadGatewayRuntimeConfig(input.workspaceRoot);
    const syntheticKey = runtimeConfig.syntheticProbeApiKeys[0] ?? null;

    if (!syntheticKey) {
      throw new Error('Synthetic probe API key is not configured');
    }

    clientKeyFingerprint = createFingerprint(syntheticKey);

    if (!input.baseUrl) {
      throw new Error('Synthetic probe base URL is not available');
    }

    baseUrl = normalizeBaseUrl(input.baseUrl) ?? 'unconfigured';

    results.push(await executeSyntheticJsonCheck({
      apiKey: syntheticKey,
      baseUrl,
      body: buildOpenAiJsonBody(settings.openAiModel),
      checkName: 'openai_json',
      model: settings.openAiModel,
      path: '/v1/chat/completions',
      protocol: 'openai',
      timeoutMs: settings.timeoutMs,
    }));
    results.push(await executeSyntheticJsonCheck({
      apiKey: syntheticKey,
      baseUrl,
      body: buildAnthropicJsonBody(settings.anthropicModel),
      checkName: 'anthropic_json',
      model: settings.anthropicModel,
      path: '/v1/messages',
      protocol: 'anthropic',
      timeoutMs: settings.timeoutMs,
    }));

    if (settings.enableOpenAiStream) {
      results.push(await executeOpenAiStreamCheck({
        apiKey: syntheticKey,
        baseUrl,
        model: settings.openAiModel,
        timeoutMs: settings.timeoutMs,
      }));
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    input.logger.error('synthetic_probe.failed', {
      error: errorMessage,
      syntheticRunId,
    });
  }

  const openAiJsonPassed = results.find((entry) => entry.checkName === 'openai_json')?.success ?? false;
  const anthropicJsonPassed = results.find((entry) => entry.checkName === 'anthropic_json')?.success ?? false;
  const streamingResult = results.find((entry) => entry.checkName === 'openai_stream');
  const passedChecks = results.filter((entry) => entry.success).length;
  const finishedAt = new Date().toISOString();
  const summary: SyntheticProbeSummary = {
    anthropicJsonPassed,
    baseUrl,
    clientKeyFingerprint,
    errorMessage,
    failedChecks: results.length - passedChecks,
    finishedAt,
    openaiJsonPassed: openAiJsonPassed,
    passedChecks,
    results,
    startedAt,
    streamingPassed: streamingResult ? streamingResult.success : null,
    success: openAiJsonPassed && anthropicJsonPassed,
    syntheticRunId,
    totalChecks: results.length,
    triggerReason: input.triggerReason,
    triggeredBy: input.triggeredBy,
  };

  insertSyntheticProbeRun(input.database, summary);

  input.logger.info('synthetic_probe.completed', {
    anthropicJsonPassed,
    openAiJsonPassed,
    streamingPassed: summary.streamingPassed,
    success: summary.success,
    syntheticRunId,
  });

  return summary;
}

function insertReadinessSnapshot(
  database: DatabaseManager,
  evaluation: ReadinessEvaluation,
  triggeredBy: string,
  triggerReason: string,
) {
  const readinessSnapshotId = randomUUID();
  database.db.prepare(`
    INSERT INTO cutover_readiness_snapshots (
      readiness_snapshot_id,
      evaluated_at,
      ready,
      blocker_count,
      warning_count,
      triggered_by,
      trigger_reason,
      blockers_json,
      warnings_json,
      evidence_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    readinessSnapshotId,
    evaluation.evaluatedAt,
    evaluation.ready ? 1 : 0,
    evaluation.blockers.length,
    evaluation.warnings.length,
    triggeredBy,
    triggerReason,
    JSON.stringify(evaluation.blockers),
    JSON.stringify(evaluation.warnings),
    JSON.stringify(evaluation.evidence),
    evaluation.evaluatedAt,
  );

  return readinessSnapshotId;
}

function getLatestSyncRun(database: DatabaseManager): ReadinessLatestRow {
  return database.db.prepare(`
    SELECT finished_at, success
    FROM account_sync_runs
    ORDER BY finished_at DESC
    LIMIT 1
  `).get() as ReadinessLatestRow;
}

function getLatestHealthRun(database: DatabaseManager) {
  return database.db.prepare(`
    SELECT
      finished_at,
      success,
      probe_completed,
      probe_run_id,
      available_account_count,
      overall_ready
    FROM health_probe_runs
    ORDER BY finished_at DESC
    LIMIT 1
  `).get() as
    | {
        available_account_count: number;
        finished_at: string;
        overall_ready: number;
        probe_completed: number;
        probe_run_id: string;
        success: number;
      }
    | undefined;
}

function getLatestSyntheticRun(database: DatabaseManager): SyntheticProbeRunView | null {
  const row = database.db.prepare(`
    SELECT
      synthetic_run_id,
      started_at,
      finished_at,
      success,
      base_url,
      client_key_fingerprint,
      triggered_by,
      trigger_reason,
      total_checks,
      passed_checks,
      failed_checks,
      openai_json_passed,
      anthropic_json_passed,
      streaming_passed,
      error_message
    FROM synthetic_probe_runs
    ORDER BY finished_at DESC
    LIMIT 1
  `).get() as SyntheticProbeRunRow | undefined;

  return row ? mapSyntheticProbeRun(row) : null;
}

function getLatestSyntheticResults(database: DatabaseManager, syntheticRunId: string | null) {
  if (!syntheticRunId) {
    return [];
  }

  return database.db.prepare(`
    SELECT
      result_id,
      synthetic_run_id,
      check_name,
      protocol,
      transport_kind,
      target_path,
      request_model,
      success,
      http_status,
      latency_ms,
      response_kind,
      detail,
      evidence_json,
      observed_at,
      created_at
    FROM synthetic_probe_results
    WHERE synthetic_run_id = ?
    ORDER BY observed_at ASC
  `).all(syntheticRunId).map((row) => mapSyntheticProbeResult(row as SyntheticProbeResultRow));
}

export function getSyntheticProbeHistory(database: DatabaseManager, limit = 10) {
  const runs = database.db.prepare(`
    SELECT
      synthetic_run_id,
      started_at,
      finished_at,
      success,
      base_url,
      client_key_fingerprint,
      triggered_by,
      trigger_reason,
      total_checks,
      passed_checks,
      failed_checks,
      openai_json_passed,
      anthropic_json_passed,
      streaming_passed,
      error_message
    FROM synthetic_probe_runs
    ORDER BY finished_at DESC
    LIMIT ?
  `).all(limit).map((row) => mapSyntheticProbeRun(row as SyntheticProbeRunRow));
  const latestRun = runs[0] ?? null;

  return {
    latestRun: latestRun
      ? {
          ...latestRun,
          results: getLatestSyntheticResults(database, latestRun.syntheticRunId),
        }
      : null,
    recentRuns: runs,
  };
}

export function evaluateCutoverReadiness(input: ReadinessInput): ReadinessEvaluation {
  const evaluatedAt = new Date().toISOString();
  const evaluatedAtMs = new Date(evaluatedAt).valueOf();
  const blockers: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  const thresholds = getReadinessThresholds();
  const databaseHealth = input.database.getHealth();
  const schemaVersion = Number.parseInt(databaseHealth.schemaVersion ?? '0', 10);

  if (!databaseHealth.ready) {
    blockers.push({
      code: 'database_not_ready',
      message: 'SQLite control plane has not finished initialization.',
    });
  }

  if (!input.database.hasMigration('006_controlled_cutover_and_rollback_guardrails') || schemaVersion < 6) {
    blockers.push({
      code: 'schema_version_outdated',
      message: 'Schema version 6 migration is not fully applied.',
    });
  }

  let runtimeConfigError: string | null = null;
  let runtimeConfig: ReturnType<typeof loadGatewayRuntimeConfig> | null = null;

  try {
    runtimeConfig = loadGatewayRuntimeConfig(input.workspaceRoot);
  } catch (error) {
    runtimeConfigError = error instanceof Error ? error.message : String(error);
    blockers.push({
      code: 'gateway_config_invalid',
      message: `Gateway key isolation validation failed: ${runtimeConfigError}`,
    });
  }

  if (runtimeConfig && runtimeConfig.syntheticProbeApiKeys.length === 0) {
    blockers.push({
      code: 'synthetic_key_missing',
      message: 'Synthetic probe API key is not configured.',
    });
  }

  if (runtimeConfig && runtimeConfig.inboundClientApiKeys.length === 0) {
    warnings.push({
      code: 'inbound_client_keys_missing',
      message: 'No inbound client API keys are configured for the parallel gateway.',
    });
  }

  if (!normalizeBaseUrl(input.serviceBaseUrl)) {
    blockers.push({
      code: 'synthetic_base_url_missing',
      message: 'Synthetic probe base URL is not available from the running service.',
    });
  }

  const latestSyncRun = getLatestSyncRun(input.database);
  if (!latestSyncRun) {
    blockers.push({
      code: 'accounts_sync_missing',
      message: 'No successful account sync has been recorded yet.',
    });
  } else if (latestSyncRun.success !== 1) {
    blockers.push({
      code: 'accounts_sync_failed',
      message: 'The latest accounts sync run failed.',
    });
  } else if (isStale(latestSyncRun.finished_at, thresholds.syncMaxAgeMinutes, evaluatedAtMs)) {
    blockers.push({
      code: 'accounts_sync_stale',
      message: `The latest accounts sync run is older than ${thresholds.syncMaxAgeMinutes} minutes.`,
    });
  }

  const latestHealthRun = getLatestHealthRun(input.database);
  if (!latestHealthRun) {
    blockers.push({
      code: 'health_probe_missing',
      message: 'No health probe run has been recorded yet.',
    });
  } else if (latestHealthRun.success !== 1 || latestHealthRun.probe_completed !== 1) {
    blockers.push({
      code: 'health_probe_failed',
      message: 'The latest health probe did not complete successfully.',
    });
  } else if (isStale(latestHealthRun.finished_at, thresholds.healthMaxAgeMinutes, evaluatedAtMs)) {
    blockers.push({
      code: 'health_probe_stale',
      message: `The latest health probe run is older than ${thresholds.healthMaxAgeMinutes} minutes.`,
    });
  }

  const runtimeAvailability = input.scheduler.getAvailabilitySummary();
  if (runtimeAvailability.availableForRouting <= 0) {
    blockers.push({
      code: 'runtime_unavailable',
      message: 'No account is currently available for routing.',
    });
  }

  const serviceSnapshots = input.healthService.getLatestServiceSnapshots() as Array<{
    outcome_code: string;
    service_name: string;
    status: string;
  }>;
  const serviceStatusMap = Object.fromEntries(
    serviceSnapshots.map((snapshot) => [
      snapshot.service_name,
      {
        outcomeCode: snapshot.outcome_code,
        status: snapshot.status,
      },
    ]),
  );

  const teamPoolService = serviceStatusMap.team_pool as { outcomeCode: string; status: string } | undefined;
  if (!teamPoolService || teamPoolService.status !== 'healthy') {
    blockers.push({
      code: 'team_pool_unhealthy',
      message: 'The team pool service is not healthy in the latest health probe.',
    });
  }

  for (const serviceName of ['anthropic_proxy', 'new_api', 'tunnel_public']) {
    const snapshot = serviceStatusMap[serviceName] as { outcomeCode: string; status: string } | undefined;
    if (!snapshot || snapshot.status !== 'healthy') {
      warnings.push({
        code: `${serviceName}_not_healthy`,
        message: `${serviceName} is not healthy in the latest health probe.`,
      });
    }
  }

  const latestSyntheticRun = getLatestSyntheticRun(input.database);
  if (!latestSyntheticRun) {
    blockers.push({
      code: 'synthetic_probe_missing',
      message: 'No synthetic probe run has been recorded yet.',
    });
  } else if (isStale(latestSyntheticRun.finishedAt, thresholds.syntheticMaxAgeMinutes, evaluatedAtMs)) {
    blockers.push({
      code: 'synthetic_probe_stale',
      message: `The latest synthetic probe run is older than ${thresholds.syntheticMaxAgeMinutes} minutes.`,
    });
  } else {
    if (!latestSyntheticRun.openaiJsonPassed) {
      blockers.push({
        code: 'synthetic_openai_failed',
        message: 'The latest OpenAI JSON synthetic probe did not pass.',
      });
    }

    if (!latestSyntheticRun.anthropicJsonPassed) {
      blockers.push({
        code: 'synthetic_anthropic_failed',
        message: 'The latest Anthropic JSON synthetic probe did not pass.',
      });
    }

    if (latestSyntheticRun.streamingPassed === false) {
      warnings.push({
        code: 'synthetic_stream_failed',
        message: 'The latest OpenAI streaming synthetic probe did not pass.',
      });
    }
  }

  const latestSyntheticResults = getLatestSyntheticResults(
    input.database,
    latestSyntheticRun?.syntheticRunId ?? null,
  );
  const healthSummary = input.healthService.getHealthSummary();

  return {
    blockers,
    evaluatedAt,
    evidence: {
      database: {
        baselineStage: databaseHealth.baselineStage,
        ready: databaseHealth.ready,
        schemaVersion: databaseHealth.schemaVersion,
      },
      gatewayConfig: {
        inboundClientKeyCount: runtimeConfig?.inboundClientApiKeys.length ?? 0,
        keyIsolationValid: runtimeConfigError === null,
        operatorKeyCount: runtimeConfig?.operatorApiKeys.length ?? 0,
        syntheticBaseUrl: normalizeBaseUrl(input.serviceBaseUrl),
        syntheticClientKeyCount: runtimeConfig?.syntheticProbeApiKeys.length ?? 0,
        upstreamConfigured: Boolean(runtimeConfig?.upstream.apiKey),
        validationError: runtimeConfigError,
      },
      health: {
        currentSummary: healthSummary,
        latestRun: latestHealthRun
          ? {
              availableAccountCount: latestHealthRun.available_account_count,
              finishedAt: latestHealthRun.finished_at,
              overallReadyAtProbe: latestHealthRun.overall_ready === 1,
              probeCompleted: latestHealthRun.probe_completed === 1,
              success: latestHealthRun.success === 1,
            }
          : null,
        serviceStatuses: serviceStatusMap,
        staleThresholdMinutes: thresholds.healthMaxAgeMinutes,
      },
      runtime: runtimeAvailability,
      sync: {
        latestRun: latestSyncRun
          ? {
              finishedAt: latestSyncRun.finished_at,
              success: latestSyncRun.success === 1,
            }
          : null,
        staleThresholdMinutes: thresholds.syncMaxAgeMinutes,
      },
      synthetic: {
        latestResults: latestSyntheticResults,
        latestRun: latestSyntheticRun,
        staleThresholdMinutes: thresholds.syntheticMaxAgeMinutes,
      },
    },
    ready: blockers.length === 0,
    warnings,
  };
}

export function persistCutoverReadinessSnapshot(input: {
  database: DatabaseManager;
  evaluation: ReadinessEvaluation;
  triggerReason: string;
  triggeredBy: string;
}) {
  return insertReadinessSnapshot(
    input.database,
    input.evaluation,
    input.triggeredBy,
    input.triggerReason,
  );
}

export function getReadinessHistory(database: DatabaseManager, limit = 10) {
  const snapshots = database.db.prepare(`
    SELECT
      readiness_snapshot_id,
      evaluated_at,
      ready,
      blocker_count,
      warning_count,
      triggered_by,
      trigger_reason,
      blockers_json,
      warnings_json,
      evidence_json,
      created_at
    FROM cutover_readiness_snapshots
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit).map((row) => mapReadinessSnapshot(row as ReadinessSnapshotRow));

  return {
    latestSnapshot: snapshots[0] ?? null,
    recentSnapshots: snapshots,
  };
}
