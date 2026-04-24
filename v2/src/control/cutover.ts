import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type CutoverMode = 'legacy' | 'parallel' | 'canary' | 'primary';
export type CutoverTransitionOutcome = 'applied' | 'rejected';

export type CutoverModeFileState = {
  exists: boolean;
  mode: CutoverMode;
  path: string;
  reason: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ResolvedServiceBaseUrls = {
  inferredBaseUrl: string;
  publicBaseUrl: string;
  syntheticBaseUrl: string;
};

const DEFAULT_CUTOVER_MODE: CutoverMode = 'legacy';

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeEnvValue(value: string | null | undefined): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function buildCutoverModeFileContent(input: {
  mode: CutoverMode;
  reason: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}): string {
  const lines = [
    `V2_CUTOVER_MODE=${sanitizeEnvValue(input.mode)}`,
    `V2_CUTOVER_UPDATED_AT=${sanitizeEnvValue(input.updatedAt)}`,
    `V2_CUTOVER_UPDATED_BY=${sanitizeEnvValue(input.updatedBy)}`,
    `V2_CUTOVER_REASON=${sanitizeEnvValue(input.reason)}`,
  ];

  return `${lines.join('\n')}\n`;
}

function writeCutoverModeFileContent(modeFilePath: string, content: string): void {
  mkdirSync(dirname(modeFilePath), { recursive: true });

  const temporaryPath = `${modeFilePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporaryPath, content, 'utf8');
    renameSync(temporaryPath, modeFilePath);
  } finally {
    if (existsSync(temporaryPath)) {
      rmSync(temporaryPath, { force: true });
    }
  }
}

function normalizeMode(value: string | null | undefined): CutoverMode {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'parallel':
      return 'parallel';
    case 'canary':
      return 'canary';
    case 'primary':
      return 'primary';
    default:
      return DEFAULT_CUTOVER_MODE;
  }
}

export function resolveCutoverModeFilePath(workspaceRoot: string): string {
  const repoStyleV2Root = resolve(workspaceRoot, 'v2');
  if (existsSync(repoStyleV2Root)) {
    return resolve(repoStyleV2Root, 'data', 'cutover-mode.env');
  }

  return resolve(workspaceRoot, 'data', 'cutover-mode.env');
}

export function resolveCutoverRollbackLockFilePath(workspaceRoot: string): string {
  const repoStyleV2Root = resolve(workspaceRoot, 'v2');
  if (existsSync(repoStyleV2Root)) {
    return resolve(repoStyleV2Root, 'data', 'cutover-rollback.lock');
  }

  return resolve(workspaceRoot, 'data', 'cutover-rollback.lock');
}

export function readCutoverModeFile(workspaceRoot: string): CutoverModeFileState {
  const modeFilePath = resolveCutoverModeFilePath(workspaceRoot);

  if (!existsSync(modeFilePath)) {
    return {
      exists: false,
      mode: DEFAULT_CUTOVER_MODE,
      path: modeFilePath,
      reason: null,
      updatedAt: null,
      updatedBy: null,
    };
  }

  const values = new Map<string, string>();
  const rawContent = readFileSync(modeFilePath, 'utf8');

  for (const rawLine of rawContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values.set(key, value);
  }

  return {
    exists: true,
    mode: normalizeMode(values.get('V2_CUTOVER_MODE')),
    path: modeFilePath,
    reason: values.get('V2_CUTOVER_REASON') ?? null,
    updatedAt: values.get('V2_CUTOVER_UPDATED_AT') ?? null,
    updatedBy: values.get('V2_CUTOVER_UPDATED_BY') ?? null,
  };
}

export function writeCutoverModeFile(
  workspaceRoot: string,
  input: {
    mode: CutoverMode;
    reason: string;
    updatedAt: string;
    updatedBy: string;
  },
): CutoverModeFileState {
  const modeFilePath = resolveCutoverModeFilePath(workspaceRoot);
  writeCutoverModeFileContent(modeFilePath, buildCutoverModeFileContent(input));

  return {
    exists: true,
    mode: input.mode,
    path: modeFilePath,
    reason: input.reason,
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
  };
}

export function restoreCutoverModeFile(
  workspaceRoot: string,
  previousState: CutoverModeFileState,
): CutoverModeFileState {
  const modeFilePath = resolveCutoverModeFilePath(workspaceRoot);

  if (!previousState.exists) {
    rmSync(modeFilePath, { force: true });
    return {
      exists: false,
      mode: DEFAULT_CUTOVER_MODE,
      path: modeFilePath,
      reason: null,
      updatedAt: null,
      updatedBy: null,
    };
  }

  writeCutoverModeFileContent(modeFilePath, buildCutoverModeFileContent({
    mode: previousState.mode,
    reason: previousState.reason,
    updatedAt: previousState.updatedAt,
    updatedBy: previousState.updatedBy,
  }));

  return {
    exists: true,
    mode: previousState.mode,
    path: modeFilePath,
    reason: previousState.reason,
    updatedAt: previousState.updatedAt,
    updatedBy: previousState.updatedBy,
  };
}

export function requiresReadinessGate(mode: CutoverMode): boolean {
  return mode === 'canary' || mode === 'primary';
}

export function resolveServiceBaseUrls(input: {
  explicitPublicBaseUrl?: string | null;
  explicitSyntheticBaseUrl?: string | null;
  host: string;
  port: number;
}): ResolvedServiceBaseUrls {
  const normalizedHost = input.host.trim().toLowerCase();
  const inferredHost =
    normalizedHost === '0.0.0.0' || normalizedHost === '::' || normalizedHost === '[::]'
      ? '127.0.0.1'
      : input.host;
  const inferredBaseUrl = `http://${inferredHost}:${input.port}`;
  const publicBaseUrl =
    normalizeBaseUrl(input.explicitPublicBaseUrl) ?? inferredBaseUrl;
  const syntheticBaseUrl =
    normalizeBaseUrl(input.explicitSyntheticBaseUrl) ??
    normalizeBaseUrl(input.explicitPublicBaseUrl) ??
    inferredBaseUrl;

  return {
    inferredBaseUrl,
    publicBaseUrl,
    syntheticBaseUrl,
  };
}

export function buildCutoverRecommendation(
  mode: CutoverMode,
  readinessReady: boolean,
  blockerCount: number,
): string {
  if (!readinessReady) {
    if (mode === 'legacy') {
      return `Keep legacy mode until readiness blockers are cleared (${blockerCount} blocker${blockerCount === 1 ? '' : 's'}).`;
    }

    return `Rollback to legacy is recommended until readiness blockers are cleared (${blockerCount} blocker${blockerCount === 1 ? '' : 's'}).`;
  }

  switch (mode) {
    case 'legacy':
      return 'Readiness is green. Start V2 in parallel, then you can enter canary mode.';
    case 'parallel':
      return 'Parallel verification is ready. Canary mode can be entered when you are ready for controlled front-door validation.';
    case 'canary':
      return 'Canary mode is approved. Keep legacy available and only promote to primary after external entrypoint validation.';
    case 'primary':
      return 'Primary mode is active in the control plane. Keep rollback-to-legacy available until external traffic is stable.';
    default:
      return 'Review readiness evidence before changing cutover mode.';
  }
}

export function buildRollbackHint(mode: CutoverMode): string {
  if (mode === 'legacy') {
    return 'Legacy is already active. External entrypoints should keep using the legacy chain.';
  }

  return 'Run the legacy rollback script or switch cutover mode back to legacy. The legacy scripts remain unchanged and can resume as the front door.';
}
