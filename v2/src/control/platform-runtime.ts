import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadGatewayRuntimeConfig } from '../gateway/runtime-config.ts';
import type { SyntheticProbeRunView } from './precutover.ts';

export type PlatformStatusLevel = 'ready' | 'attention' | 'down';

export type TeamPoolProbeResult = {
  baseUrl: string;
  checkedAt: string;
  detail: string;
  error: string | null;
  modelsReachable: boolean;
  port: number;
  statusCode: number | null;
};

export type LocalPlatformStatus = {
  gateway: {
    availableForRouting: number;
    baseUrl: string | null;
    currentMode: string;
    note: string;
    port: number | null;
    ready: boolean;
    status: PlatformStatusLevel;
  };
  hiddenLegacyServices: Array<{
    label: string;
    reason: string;
    serviceName: string;
  }>;
  localUse: {
    blockers: string[];
    checkedAt: string | null;
    note: string;
    ready: boolean;
    status: PlatformStatusLevel;
  };
  nextActions: string[];
  primaryEntry: {
    anthropicMessagesUrl: string | null;
    baseUrl: string | null;
    openAiChatUrl: string | null;
    opsUrl: string | null;
  };
  teamPool: {
    baseUrl: string;
    checkedAt: string;
    completionProbeCheckedAt: string | null;
    completionProbeHealthy: boolean | null;
    completionProbeSummary: string;
    detail: string;
    lastServiceStatus: string | null;
    modelsReachable: boolean;
    note: string;
    port: number;
    status: PlatformStatusLevel;
    statusCode: number | null;
  };
  workspaceMode: 'local_self_use';
};

export type EnsureTeamPoolRunningResult = {
  action: 'already_running' | 'started';
  detail: string;
  probe: TeamPoolProbeResult;
  scriptPath: string | null;
  waitMs: number;
};

export type RestartTeamPoolResult = {
  detail: string;
  killedProcessCount: number;
  killedProcessIds: number[];
  probe: TeamPoolProbeResult;
  scriptLaunched: boolean;
  targetPort: number;
  waitMs: number;
};

export type StopTeamPoolResult = {
  detail: string;
  killedProcessCount: number;
  killedProcessIds: number[];
  probe: TeamPoolProbeResult;
  targetPort: number;
  waitMs: number;
};

export type PlatformRuntimeController = {
  ensureTeamPoolRunning: (workspaceRoot: string) => Promise<EnsureTeamPoolRunningResult>;
  restartTeamPool: (workspaceRoot: string) => Promise<RestartTeamPoolResult>;
  stopTeamPool: (workspaceRoot: string) => Promise<StopTeamPoolResult>;
};

const TEAM_POOL_WAIT_STEP_MS = 1000;
const TEAM_POOL_ENSURE_WAIT_MS = 12000;
const TEAM_POOL_RESTART_WAIT_MS = 8000;
const TEAM_POOL_PROBE_TIMEOUT_MS = 2500;
const TEAM_POOL_STOP_REQUEST_FILE = 'team-pool-stop.requested';

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function escapePowerShellString(value: string): string {
  return value.replace(/'/g, "''");
}

function resolvePlatformDataDirectory(workspaceRoot: string): string {
  return resolve(workspaceRoot, 'v2', 'data');
}

export function resolveTeamPoolStopRequestFilePath(workspaceRoot: string): string {
  return resolve(resolvePlatformDataDirectory(workspaceRoot), TEAM_POOL_STOP_REQUEST_FILE);
}

function ensurePlatformDataDirectory(workspaceRoot: string): string {
  const dataDirectory = resolvePlatformDataDirectory(workspaceRoot);
  mkdirSync(dataDirectory, { recursive: true });
  return dataDirectory;
}

function markTeamPoolStopRequested(workspaceRoot: string): string {
  ensurePlatformDataDirectory(workspaceRoot);
  const filePath = resolveTeamPoolStopRequestFilePath(workspaceRoot);
  writeFileSync(filePath, new Date().toISOString(), 'utf8');
  return filePath;
}

function clearTeamPoolStopRequested(workspaceRoot: string): void {
  const filePath = resolveTeamPoolStopRequestFilePath(workspaceRoot);
  if (existsSync(filePath)) {
    rmSync(filePath, { force: true });
  }
}

function parsePortFromBaseUrl(baseUrl: string): number {
  const url = new URL(baseUrl);
  if (url.port) {
    return Number.parseInt(url.port, 10);
  }

  return url.protocol === 'https:' ? 443 : 80;
}

function describeSyntheticCompletionState(
  latestSyntheticRun: SyntheticProbeRunView | null,
): {
  checkedAt: string | null;
  healthy: boolean | null;
  summary: string;
} {
  if (!latestSyntheticRun) {
    return {
      checkedAt: null,
      healthy: null,
      summary: 'completion_probe_missing',
    };
  }

  return {
    checkedAt: latestSyntheticRun.finishedAt,
    healthy: latestSyntheticRun.success,
    summary: latestSyntheticRun.success ? 'completion_probe_ok' : 'completion_probe_failed',
  };
}

async function probeTeamPoolModels(workspaceRoot: string): Promise<TeamPoolProbeResult> {
  const runtimeConfig = loadGatewayRuntimeConfig(workspaceRoot);
  const baseUrl = runtimeConfig.upstream.baseUrl;
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: runtimeConfig.upstream.apiKey
        ? {
            Authorization: `Bearer ${runtimeConfig.upstream.apiKey}`,
          }
        : undefined,
      signal: AbortSignal.timeout(TEAM_POOL_PROBE_TIMEOUT_MS),
    });

    return {
      baseUrl,
      checkedAt,
      detail: response.ok ? 'models_ok' : `models_http_${response.status}`,
      error: null,
      modelsReachable: response.ok,
      port: parsePortFromBaseUrl(baseUrl),
      statusCode: response.status,
    };
  } catch (error) {
    return {
      baseUrl,
      checkedAt,
      detail: 'models_unreachable',
      error: error instanceof Error ? error.message : String(error),
      modelsReachable: false,
      port: parsePortFromBaseUrl(baseUrl),
      statusCode: null,
    };
  }
}

function launchBatchScriptDetached(scriptPath: string, workspaceRoot: string): void {
  if (!existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }

  const command = `Start-Process -FilePath '${escapePowerShellString(scriptPath)}' -WorkingDirectory '${escapePowerShellString(workspaceRoot)}'`;
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      cwd: workspaceRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  child.unref();
}

function stopTeamPoolProcesses(workspaceRoot: string): {
  killedProcessCount: number;
  killedProcessIds: number[];
  targetPort: number;
} {
  const runtimeConfig = loadGatewayRuntimeConfig(workspaceRoot);
  const targetPort = parsePortFromBaseUrl(runtimeConfig.upstream.baseUrl);
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      [
        `$port = ${targetPort};`,
        '$listenerPids = @();',
        'try {',
        '  $listenerPids = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique);',
        '} catch {',
        '  $listenerPids = @(',
        '    netstat -ano -p tcp |',
        '      Select-String -Pattern (":$port\\s") |',
        '      ForEach-Object {',
        '        $line = $_.Line.Trim();',
        "        $parts = $line -split '\\s+';",
        "        if ($parts.Length -ge 5 -and $parts[1] -like \"*:$port\" -and $parts[3] -eq 'LISTENING') { [int]$parts[4] }",
        '      } |',
        '      Where-Object { $_ -ne $null } |',
        '      Select-Object -Unique',
        '  );',
        '}',
        '$killedPids = @();',
        'foreach ($listenerPid in $listenerPids) {',
        '  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $listenerPid" -ErrorAction Stop;',
        '  $processName = [System.IO.Path]::GetFileNameWithoutExtension($process.Name);',
        "  if ($processName -ne 'cli-proxy-api') { throw \"team_pool_port_owned_by_unexpected_process:$listenerPid:$($process.Name)\" }",
        '  Stop-Process -Id $listenerPid -Force -ErrorAction Stop;',
        '  $killedPids += $listenerPid;',
        '}',
        '[PSCustomObject]@{',
        '  targetPort = $port;',
        '  killedProcessIds = @($killedPids);',
        '} | ConvertTo-Json -Compress;',
      ].join(' '),
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    const stdout = String(result.stdout ?? '').trim();
    throw new Error(stderr || stdout || `Failed to stop Team Pool listener on port ${targetPort}`);
  }

  const rawPayload = String(result.stdout ?? '').trim();
  if (!rawPayload) {
    return {
      killedProcessCount: 0,
      killedProcessIds: [],
      targetPort,
    };
  }

  const payload = JSON.parse(rawPayload) as {
    killedProcessIds?: number[];
    targetPort?: number;
  };
  const killedProcessIds = Array.isArray(payload.killedProcessIds)
    ? payload.killedProcessIds.filter((value) => Number.isInteger(value))
    : [];

  return {
    killedProcessCount: killedProcessIds.length,
    killedProcessIds,
    targetPort: Number.isInteger(payload.targetPort) ? Number(payload.targetPort) : targetPort,
  };
}

async function waitForReachableTeamPool(
  workspaceRoot: string,
  totalWaitMs: number,
): Promise<{ probe: TeamPoolProbeResult; waitMs: number }> {
  let elapsedMs = 0;
  let latestProbe = await probeTeamPoolModels(workspaceRoot);

  while (!latestProbe.modelsReachable && elapsedMs < totalWaitMs) {
    await sleep(TEAM_POOL_WAIT_STEP_MS);
    elapsedMs += TEAM_POOL_WAIT_STEP_MS;
    latestProbe = await probeTeamPoolModels(workspaceRoot);
  }

  return {
    probe: latestProbe,
    waitMs: elapsedMs,
  };
}

async function waitForUnreachableTeamPool(
  workspaceRoot: string,
  totalWaitMs: number,
): Promise<{ probe: TeamPoolProbeResult; waitMs: number }> {
  let elapsedMs = 0;
  let latestProbe = await probeTeamPoolModels(workspaceRoot);

  while (latestProbe.modelsReachable && elapsedMs < totalWaitMs) {
    await sleep(TEAM_POOL_WAIT_STEP_MS);
    elapsedMs += TEAM_POOL_WAIT_STEP_MS;
    latestProbe = await probeTeamPoolModels(workspaceRoot);
  }

  return {
    probe: latestProbe,
    waitMs: elapsedMs,
  };
}

export function buildLocalPlatformStatus(input: {
  availableForRouting: number;
  currentMode: string;
  gatewayBaseUrl: string | null;
  gatewayReady: boolean;
  latestSyntheticRun: SyntheticProbeRunView | null;
  teamPoolProbe: TeamPoolProbeResult;
  teamPoolServiceStatus: string | null;
}): LocalPlatformStatus {
  const gatewayPort = input.gatewayBaseUrl ? parsePortFromBaseUrl(input.gatewayBaseUrl) : null;
  const gatewayStatus: PlatformStatusLevel = input.gatewayReady ? 'ready' : 'attention';
  const completionProbe = describeSyntheticCompletionState(input.latestSyntheticRun);
  const localBlockers: string[] = [];

  if (!input.teamPoolProbe.modelsReachable) {
    localBlockers.push('底层引擎 Team Pool 当前没有响应，先点“重新拉起底层引擎”。');
  } else if (completionProbe.healthy === null) {
    localBlockers.push('还没有最近一轮真实 completion 体检结果，先点“一键准备本机环境”或“运行链路体检”。');
  } else if (completionProbe.healthy === false) {
    localBlockers.push('底层引擎虽然能返回模型列表，但最近一轮真实 completion 体检没有通过。');
  }

  if (!input.gatewayReady) {
    localBlockers.push('V2 网关当前没有通过本机使用门禁，建议先重新做健康巡检和链路体检。');
  }

  if (input.availableForRouting <= 0) {
    localBlockers.push('当前没有可路由账号，先看账号同步、健康巡检和链路体检结果。');
  }

  const localReady = localBlockers.length === 0;
  const localStatus: PlatformStatusLevel = !input.teamPoolProbe.modelsReachable
    ? 'down'
    : localReady
      ? 'ready'
      : 'attention';
  const teamPoolStatus: PlatformStatusLevel = !input.teamPoolProbe.modelsReachable
    ? 'down'
    : completionProbe.healthy === true && (input.teamPoolServiceStatus === 'healthy' || input.teamPoolServiceStatus === null)
      ? 'ready'
      : 'attention';

  const nextActions: string[] = [];
  if (!input.teamPoolProbe.modelsReachable) {
    nextActions.push('底层引擎 Team Pool 当前没有响应，先点击“重新拉起底层引擎”。');
  } else if (completionProbe.healthy === null) {
    nextActions.push('底层引擎虽然能返回模型列表，但还没有最近一次真实 completion 体检结果，先点击“一键准备本机环境”。');
  } else if (completionProbe.healthy === false) {
    nextActions.push('底层引擎模型列表能通，但最近一次真实 completion 体检没有通过，先看链路体检结果再决定是否重启底层引擎。');
  }
  if (!input.gatewayReady) {
    nextActions.push('切流门禁当前没有通过，优先点击“一键准备本机环境”。');
  }
  if (input.availableForRouting <= 0) {
    nextActions.push('当前没有可路由账号，先看账号同步、健康巡检和链路体检结果。');
  }
  if (nextActions.length === 0) {
    nextActions.push('当前本机环境整体正常，后续主要看最近一次链路体检和可路由账号数量。');
  }

  return {
    gateway: {
      availableForRouting: input.availableForRouting,
      baseUrl: input.gatewayBaseUrl,
      currentMode: input.currentMode,
      note: input.gatewayReady
        ? 'V2 网关当前正在提供本机统一入口。'
        : 'V2 网关还在运行，但切流门禁没有通过，建议先重新体检。',
      port: gatewayPort,
      ready: input.gatewayReady,
      status: gatewayStatus,
    },
    hiddenLegacyServices: [
      {
        label: 'Anthropic Proxy :8320',
        reason: '本机自用模式下，统一入口直接走 V2，不再依赖旧 Anthropic 兼容代理。',
        serviceName: 'anthropic_proxy',
      },
      {
        label: 'New API :3001',
        reason: '本机自用模式下，统一入口直接走 V2，不再依赖旧 New API 入口。',
        serviceName: 'new_api',
      },
      {
        label: 'Cloudflare Tunnel',
        reason: '本机自用模式下只看本地 localhost，不再依赖公网隧道。',
        serviceName: 'tunnel_public',
      },
    ],
    localUse: {
      blockers: localBlockers,
      checkedAt: completionProbe.checkedAt ?? input.teamPoolProbe.checkedAt,
      note: localReady
        ? '当前可以直接把客户端指向 V2 统一入口，本机请求由 V2 接住，再交给后台 Team Pool 执行。'
        : '当前还不适合直接把它当成稳定本机入口使用，先处理上面的阻塞项。',
      ready: localReady,
      status: localStatus,
    },
    nextActions,
    primaryEntry: {
      anthropicMessagesUrl: input.gatewayBaseUrl ? `${input.gatewayBaseUrl}/v1/messages` : null,
      baseUrl: input.gatewayBaseUrl,
      openAiChatUrl: input.gatewayBaseUrl ? `${input.gatewayBaseUrl}/v1/chat/completions` : null,
      opsUrl: input.gatewayBaseUrl ? `${input.gatewayBaseUrl}/ops` : null,
    },
    teamPool: {
      baseUrl: input.teamPoolProbe.baseUrl,
      checkedAt: input.teamPoolProbe.checkedAt,
      completionProbeCheckedAt: completionProbe.checkedAt,
      completionProbeHealthy: completionProbe.healthy,
      completionProbeSummary: completionProbe.summary,
      detail: input.teamPoolProbe.detail,
      lastServiceStatus: input.teamPoolServiceStatus,
      modelsReachable: input.teamPoolProbe.modelsReachable,
      note: input.teamPoolProbe.modelsReachable
        ? completionProbe.healthy === true
          ? '底层引擎不仅能返回模型列表，最近一次真实 completion 体检也通过了。'
          : completionProbe.healthy === false
            ? '底层引擎虽然能返回模型列表，但最近一次真实 completion 体检失败，不能直接当成真正可用。'
            : '底层引擎能返回模型列表，但还没有最近一次真实 completion 体检结果。'
        : `底层引擎当前不可达${input.teamPoolProbe.error ? `：${input.teamPoolProbe.error}` : '。'}`,
      port: input.teamPoolProbe.port,
      status: teamPoolStatus,
      statusCode: input.teamPoolProbe.statusCode,
    },
    workspaceMode: 'local_self_use',
  };
}

export async function getDefaultLocalPlatformStatus(input: {
  availableForRouting: number;
  currentMode: string;
  gatewayBaseUrl: string | null;
  gatewayReady: boolean;
  latestSyntheticRun: SyntheticProbeRunView | null;
  teamPoolServiceStatus: string | null;
  workspaceRoot: string;
}): Promise<LocalPlatformStatus> {
  const teamPoolProbe = await probeTeamPoolModels(input.workspaceRoot);

  return buildLocalPlatformStatus({
    availableForRouting: input.availableForRouting,
    currentMode: input.currentMode,
    gatewayBaseUrl: input.gatewayBaseUrl,
    gatewayReady: input.gatewayReady,
    latestSyntheticRun: input.latestSyntheticRun,
    teamPoolProbe,
    teamPoolServiceStatus: input.teamPoolServiceStatus,
  });
}

export const defaultPlatformRuntimeController: PlatformRuntimeController = {
  async ensureTeamPoolRunning(workspaceRoot: string): Promise<EnsureTeamPoolRunningResult> {
    clearTeamPoolStopRequested(workspaceRoot);
    const initialProbe = await probeTeamPoolModels(workspaceRoot);
    if (initialProbe.modelsReachable) {
      return {
        action: 'already_running',
        detail: 'team_pool_already_running',
        probe: initialProbe,
        scriptPath: null,
        waitMs: 0,
      };
    }

    const scriptPath = resolve(workspaceRoot, 'start_team.bat');
    launchBatchScriptDetached(scriptPath, workspaceRoot);

    const waited = await waitForReachableTeamPool(workspaceRoot, TEAM_POOL_ENSURE_WAIT_MS);
    return {
      action: 'started',
      detail: waited.probe.modelsReachable ? 'team_pool_started' : 'team_pool_start_timeout',
      probe: waited.probe,
      scriptPath,
      waitMs: waited.waitMs,
    };
  },

  async restartTeamPool(workspaceRoot: string): Promise<RestartTeamPoolResult> {
    clearTeamPoolStopRequested(workspaceRoot);
    const stopResult = stopTeamPoolProcesses(workspaceRoot);
    let waited = await waitForReachableTeamPool(workspaceRoot, TEAM_POOL_RESTART_WAIT_MS);
    let scriptLaunched = false;

    if (!waited.probe.modelsReachable) {
      const scriptPath = resolve(workspaceRoot, 'start_team.bat');
      launchBatchScriptDetached(scriptPath, workspaceRoot);
      scriptLaunched = true;
      const restartedWait = await waitForReachableTeamPool(workspaceRoot, TEAM_POOL_ENSURE_WAIT_MS);
      waited = {
        probe: restartedWait.probe,
        waitMs: waited.waitMs + restartedWait.waitMs,
      };
    }

    return {
      detail: waited.probe.modelsReachable ? 'team_pool_restarted' : 'team_pool_restart_timeout',
      killedProcessCount: stopResult.killedProcessCount,
      killedProcessIds: stopResult.killedProcessIds,
      probe: waited.probe,
      scriptLaunched,
      targetPort: stopResult.targetPort,
      waitMs: waited.waitMs,
    };
  },

  async stopTeamPool(workspaceRoot: string): Promise<StopTeamPoolResult> {
    markTeamPoolStopRequested(workspaceRoot);
    let stopResult: {
      killedProcessCount: number;
      killedProcessIds: number[];
      targetPort: number;
    };

    try {
      stopResult = stopTeamPoolProcesses(workspaceRoot);
    } catch (error) {
      clearTeamPoolStopRequested(workspaceRoot);
      throw error;
    }
    const waited = await waitForUnreachableTeamPool(workspaceRoot, TEAM_POOL_RESTART_WAIT_MS);

    return {
      detail: !waited.probe.modelsReachable
        ? stopResult.killedProcessCount > 0
          ? 'team_pool_stopped'
          : 'team_pool_already_stopped'
        : 'team_pool_stop_timeout',
      killedProcessCount: stopResult.killedProcessCount,
      killedProcessIds: stopResult.killedProcessIds,
      probe: waited.probe,
      targetPort: stopResult.targetPort,
      waitMs: waited.waitMs,
    };
  },
};
