# health_check.ps1 - QuanLianLu Health Check v2.3
# Checks: Team Pool + Anthropic Proxy + New API + Tunnel(process+HTTP) + CLOSE_WAIT
# Runs every 2 minutes via scheduled task
# Updated: 2026-03-31

# ======================== Config ========================

$scriptRoot = $PSScriptRoot
$logFile = "$scriptRoot\health.log"
$failCountFile = "$scriptRoot\health_fail_count.tmp"
$maxLogLines = 500
$v2EnvFile = "$scriptRoot\v2\.env"
$teamConfigFile = "$scriptRoot\config_team.yaml"
$cutoverModeFile = "$scriptRoot\v2\data\cutover-mode.env"
$v2RollbackLockFile = "$scriptRoot\v2\data\cutover-rollback.lock"
$v2RestartStateFile = "$scriptRoot\v2\data\health_v2_restart_state.json"
$teamPoolStopRequestFile = "$scriptRoot\v2\data\team-pool-stop.requested"

# Thresholds
$closeWaitThreshold = 5
$failThreshold = 2
$v2RestartCooldownMinutes = 10
$v2MaxRestartsPerHour = 3

# ======================== Utilities ========================

function Write-Log {
    param([string]$msg)
    $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    "[$ts] $msg" | Add-Content $logFile
}

function Send-Alert {
    param([string]$title, [string]$body, [string]$uid)
    try {
        Import-Module BurntToast -ErrorAction SilentlyContinue
        New-BurntToastNotification -Text $title, $body -UniqueIdentifier $uid -ErrorAction SilentlyContinue
    }
    catch {
        Write-Log "ALERT(no popup): $title | $body"
    }
}

function Get-V2EnvValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [string]$Fallback = ''
    )

    $envPath = "Env:$Name"
    if (Test-Path $envPath) {
        $value = (Get-Item $envPath).Value
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value.Trim()
        }
    }

    if (Test-Path $v2EnvFile) {
        foreach ($rawLine in Get-Content $v2EnvFile -ErrorAction SilentlyContinue) {
            $line = $rawLine.Trim()
            if (-not $line -or $line.StartsWith('#')) {
                continue
            }

            $separatorIndex = $line.IndexOf('=')
            if ($separatorIndex -lt 0) {
                continue
            }

            $key = $line.Substring(0, $separatorIndex).Trim()
            if ($key -ne $Name) {
                continue
            }

            $value = $line.Substring($separatorIndex + 1).Trim()
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                return $value
            }
        }
    }

    return $Fallback
}

function Get-V2GatewayPort {
    $configuredPort = 0
    $rawValue = Get-V2EnvValue -Name 'V2_PORT'
    if ([int]::TryParse($rawValue, [ref]$configuredPort) -and $configuredPort -ge 1 -and $configuredPort -le 65535) {
        return $configuredPort
    }

    return 18320
}

function Get-WorkspaceMode {
    $rawValue = Get-V2EnvValue -Name 'V2_WORKSPACE_MODE'
    if (-not [string]::IsNullOrWhiteSpace($rawValue)) {
        return $rawValue.Trim().ToLower()
    }

    return 'local_self_use'
}

function Get-TeamPoolConfig {
    $port = 8317
    $apiKeys = @()
    $inApiKeys = $false

    if (-not (Test-Path $teamConfigFile)) {
        return @{
            ApiKeys = $apiKeys
            Port = $port
        }
    }

    foreach ($rawLine in Get-Content $teamConfigFile -ErrorAction SilentlyContinue) {
        $trimmed = $rawLine.Trim()

        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }

        if ($trimmed -match '^port:\s*(\d+)') {
            $port = [int]$matches[1]
            continue
        }

        if ($trimmed.StartsWith('api-keys:')) {
            $inApiKeys = $true
            continue
        }

        if ($inApiKeys -and $trimmed.StartsWith('- ')) {
            $value = $trimmed.Substring(2).Trim().Trim('"').Trim("'")
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                $apiKeys += $value
            }
            continue
        }

        if (-not $rawLine.StartsWith(' ') -and -not $rawLine.StartsWith("`t")) {
            $inApiKeys = $false
        }
    }

    return @{
        ApiKeys = $apiKeys
        Port = $port
    }
}

function Get-TeamPoolApiKeyState {
    param([hashtable]$TeamPoolConfig)

    $envOverride = Get-V2EnvValue -Name 'TEAM_POOL_HEALTHCHECK_API_KEY'
    if (-not [string]::IsNullOrWhiteSpace($envOverride)) {
        return @{
            Available = $true
            Source = 'env'
            Value = $envOverride
        }
    }

    if ($TeamPoolConfig.ApiKeys.Count -gt 0) {
        return @{
            Available = $true
            Source = 'config_team.yaml'
            Value = $TeamPoolConfig.ApiKeys[0]
        }
    }

    return @{
        Available = $false
        Source = 'missing'
        Value = $null
    }
}

function Test-Endpoint {
    param(
        [string]$url,
        [hashtable]$headers = $null,
        [int]$timeout = 10
    )

    try {
        $requestHeaders = @{}
        if ($headers) {
            foreach ($entry in $headers.GetEnumerator()) {
                $requestHeaders[$entry.Key] = $entry.Value
            }
        }

        $response = Invoke-WebRequest -Uri $url -Method Get -Headers $requestHeaders -TimeoutSec $timeout -UseBasicParsing -ErrorAction Stop
        return [string][int]$response.StatusCode
    }
    catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            return [string][int]$_.Exception.Response.StatusCode
        }
        return "000"
    }
}

function Get-FailCount {
    param([string]$svc)
    if (Test-Path $failCountFile) {
        $raw = Get-Content $failCountFile -Raw -ErrorAction SilentlyContinue
        if ($raw -and $raw -match "(?m)^${svc}=(\d+)") { return [int]$matches[1] }
    }
    return 0
}

function Set-FailCount {
    param([string]$svc, [int]$val)
    if (Test-Path $failCountFile) {
        $raw = Get-Content $failCountFile -Raw -ErrorAction SilentlyContinue
        if ($raw -match "(?m)^${svc}=\d+") {
            $raw = $raw -replace "(?m)^${svc}=\d+", "${svc}=$val"
        }
        else {
            $raw = $raw.TrimEnd() + [Environment]::NewLine + "${svc}=$val"
        }
        $raw | Set-Content $failCountFile -Force
    }
    else {
        "${svc}=$val" | Set-Content $failCountFile -Force
    }
}

function Get-CutoverMode {
    if (Test-Path $cutoverModeFile) {
        $raw = Get-Content $cutoverModeFile -Raw -ErrorAction SilentlyContinue
        if ($raw -and $raw -match '(?m)^V2_CUTOVER_MODE=(.+)$') {
            return $matches[1].Trim().ToLower()
        }
    }
    return "legacy"
}

function Test-V2RollbackPending {
    return Test-Path $v2RollbackLockFile
}

function Test-TeamPoolStopRequested {
    return Test-Path $teamPoolStopRequestFile
}

function Get-V2RestartState {
    if (Test-Path $v2RestartStateFile) {
        try {
            $raw = Get-Content $v2RestartStateFile -Raw -ErrorAction SilentlyContinue
            if ($raw) {
                $state = $raw | ConvertFrom-Json
                return @{
                    lastRestartAt = $state.lastRestartAt
                    restartCount = [int]($state.restartCount)
                    windowStartedAt = $state.windowStartedAt
                }
            }
        }
        catch {
            Write-Log "WARN: Failed to parse V2 restart state, resetting guard state"
        }
    }

    return @{
        lastRestartAt = $null
        restartCount = 0
        windowStartedAt = $null
    }
}

function Save-V2RestartState {
    param([hashtable]$state)

    $dir = Split-Path $v2RestartStateFile -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    ($state | ConvertTo-Json -Compress) | Set-Content $v2RestartStateFile -Force
}

function Test-V2RestartAllowed {
    $state = Get-V2RestartState
    $now = Get-Date

    if (-not $state.windowStartedAt) {
        $state.windowStartedAt = $now.ToString('o')
    }

    $windowStartedAt = Get-Date $state.windowStartedAt
    if (($now - $windowStartedAt).TotalMinutes -ge 60) {
        $state.windowStartedAt = $now.ToString('o')
        $state.restartCount = 0
    }

    if ($state.lastRestartAt) {
        $lastRestartAt = Get-Date $state.lastRestartAt
        if (($now - $lastRestartAt).TotalMinutes -lt $v2RestartCooldownMinutes) {
            return @{
                Allowed = $false
                Reason = "cooldown"
                State = $state
            }
        }
    }

    if ($state.restartCount -ge $v2MaxRestartsPerHour) {
        return @{
            Allowed = $false
            Reason = "rate_limit"
            State = $state
        }
    }

    return @{
        Allowed = $true
        Reason = "ok"
        State = $state
    }
}

function Register-V2Restart {
    param([hashtable]$state)

    $now = Get-Date

    if (-not $state.windowStartedAt) {
        $state.windowStartedAt = $now.ToString('o')
        $state.restartCount = 0
    }

    $windowStartedAt = Get-Date $state.windowStartedAt
    if (($now - $windowStartedAt).TotalMinutes -ge 60) {
        $state.windowStartedAt = $now.ToString('o')
        $state.restartCount = 0
    }

    $state.restartCount = [int]$state.restartCount + 1
    $state.lastRestartAt = $now.ToString('o')
    Save-V2RestartState -state $state
}

function Restart-TeamPool {
    Write-Log "-> Killing Team pool (bat LOOP will auto-restart)..."
    Get-Process -Name "cli-proxy-api" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    # bat LOOP will auto-restart in 5 seconds
    Write-Log "-> Team pool killed, waiting for bat LOOP auto-restart"
    Start-Sleep 8
}

function Restart-AnthropicProxy {
    Write-Log "-> Killing Anthropic proxy (bat LOOP will auto-restart)..."
    # 找到监听8320端口的node进程并结束
    $conns = Get-NetTCPConnection -LocalPort 8320 -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($c in $conns) {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
    # bat LOOP will auto-restart in 5 seconds
    Write-Log "-> Anthropic proxy killed, waiting for bat LOOP auto-restart"
    Start-Sleep 8
}

function Restart-NewApi {
    Write-Log "-> Restarting New API container..."
    try {
        & docker restart new-api 2>$null
        Write-Log "-> New API container restarted"
    }
    catch {
        Write-Log "-> ERROR: Failed to restart New API container"
    }
}

function Start-Tunnel {
    Write-Log "-> Starting Cloudflare tunnel..."
    Start-Process -FilePath "$scriptRoot\cloudflared.exe" -ArgumentList @("tunnel", "--config", "C:\Users\AWSA\.cloudflared\config.yml", "run", "codex-pool") -WorkingDirectory $scriptRoot -WindowStyle Minimized
    Write-Log "-> Cloudflare tunnel started"
}

function Restart-V2Gateway {
    if (Test-V2RollbackPending) {
        Write-Log "-> V2 restart skipped because a legacy rollback is in progress"
        return $false
    }

    $guard = Test-V2RestartAllowed
    if (-not $guard.Allowed) {
        Write-Log ("-> V2 restart skipped by guard (" + $guard.Reason + ")")
        return $false
    }

    $v2GatewayPort = Get-V2GatewayPort
    Write-Log "-> Restarting V2 gateway..."
    $hadListener = $false
    $conns = Get-NetTCPConnection -LocalPort $v2GatewayPort -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $hadListener = $true
        foreach ($c in $conns) {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }

    Register-V2Restart -state $guard.State

    if (-not $hadListener) {
        Start-Process -FilePath "$scriptRoot\start_v2.bat" -WorkingDirectory $scriptRoot -WindowStyle Minimized
    }

    Start-Sleep 8
    return $true
}

$teamPoolConfig = Get-TeamPoolConfig
$teamApiKeyState = Get-TeamPoolApiKeyState -TeamPoolConfig $teamPoolConfig
$teamUrl = "http://localhost:$($teamPoolConfig.Port)/v1/models"
$proxyUrl = "http://localhost:8320/health"
$newApiUrl = "http://localhost:3001/api/status"
$v2GatewayPort = Get-V2GatewayPort
$v2HealthUrl = if ($env:V2_HEALTH_URL) { $env:V2_HEALTH_URL } else { "http://localhost:$v2GatewayPort/health" }
$v2RollbackPending = Test-V2RollbackPending
$workspaceMode = Get-WorkspaceMode
$localSelfUseMode = $workspaceMode -eq 'local_self_use'
$teamPoolStopRequested = Test-TeamPoolStopRequested

# ======================== Main Check ========================

$allOk = $true
$parts = @()

# -------- Check 1: Team Pool --------
if ($localSelfUseMode -and $teamPoolStopRequested) {
    Set-FailCount -svc "team" -val 0
    Write-Log "INFO: Team pool stop request is active in local self-use mode. Health probe is read-only and auto-restart is suppressed."
    $parts += "Team:STOP_REQUESTED"
}
elseif (-not $teamApiKeyState.Available) {
    $allOk = $false
    Set-FailCount -svc "team" -val 0
    Write-Log "WARN: Team pool API key is missing. Skipping authenticated team probe and suppressing auto-restart."
    $parts += "Team:AUTH_MISSING"
}
else {
    $teamHeaders = @{
        Authorization = "Bearer $($teamApiKeyState.Value)"
    }
    $teamCode = Test-Endpoint -url $teamUrl -headers $teamHeaders
    if ($teamCode -eq "200") {
        $parts += "Team:OK"
        Set-FailCount -svc "team" -val 0
    }
    elseif ($teamCode -eq "401" -or $teamCode -eq "403") {
        $allOk = $false
        Set-FailCount -svc "team" -val 0
        Write-Log ("WARN: Team pool probe returned auth status " + $teamCode + " using key source " + $teamApiKeyState.Source + ". Treating this as config drift, not a service outage.")
        $parts += ("Team:AUTH(" + $teamCode + ")")
    }
    else {
        $allOk = $false
        $fc = (Get-FailCount -svc "team") + 1
        Set-FailCount -svc "team" -val $fc
        Write-Log ("WARN: Team pool returned " + $teamCode + " (fail #" + $fc + ")")

        if ($fc -ge $failThreshold) {
            Write-Log ("ERROR: Team pool failed " + $fc + " times, restarting")
            Send-Alert -title "[WARN] Pool Alert" -body "Team pool (" + $teamPoolConfig.Port + ") is down, auto-restarting..." -uid "team-alert"

            Restart-TeamPool

            Start-Sleep 5
            $v = Test-Endpoint -url $teamUrl -headers $teamHeaders
            if ($v -eq "200") {
                Write-Log "-> Restart OK, Team pool recovered"
                Set-FailCount -svc "team" -val 0
            }
            elseif ($v -eq "401" -or $v -eq "403") {
                Write-Log ("WARN: Team pool responded with auth status " + $v + " after restart. Suppressing further restart attempts because the API key may have drifted.")
                Set-FailCount -svc "team" -val 0
            }
            else {
                Write-Log ("ERROR: Team pool still down after restart (" + $v + ")")
                Send-Alert -title "[CRITICAL] Pool Alert" -body "Team pool restart failed! Please check manually!" -uid "team-critical"
            }
        }
        $parts += ("Team:FAIL(" + $teamCode + ")")
    }
}


# -------- Check 2: Anthropic Proxy (8320) --------
if ($localSelfUseMode) {
    Set-FailCount -svc "proxy" -val 0
    $parts += "Proxy:SKIP(LOCAL)"
}
else {
    $proxyCode = Test-Endpoint -url $proxyUrl -timeout 5
    if ($proxyCode -eq "200") {
        $parts += "Proxy:OK"
        Set-FailCount -svc "proxy" -val 0
    }
    else {
        $allOk = $false
        $fc = (Get-FailCount -svc "proxy") + 1
        Set-FailCount -svc "proxy" -val $fc
        Write-Log ("WARN: Anthropic proxy returned " + $proxyCode + " (fail #" + $fc + ")")

        if ($fc -ge $failThreshold) {
            Write-Log ("ERROR: Anthropic proxy failed " + $fc + " times, restarting")
            Send-Alert -title "[WARN] Proxy Alert" -body "Anthropic proxy (8320) is down, auto-restarting..." -uid "proxy-alert"

            Restart-AnthropicProxy

            Start-Sleep 5
            $v = Test-Endpoint -url $proxyUrl -timeout 5
            if ($v -eq "200") {
                Write-Log "-> Restart OK, Anthropic proxy recovered"
                Set-FailCount -svc "proxy" -val 0
            }
            else {
                Write-Log ("ERROR: Anthropic proxy still down after restart (" + $v + ")")
                Send-Alert -title "[CRITICAL] Proxy Alert" -body "Anthropic proxy restart failed! Please check manually!" -uid "proxy-critical"
            }
        }
        $parts += ("Proxy:FAIL(" + $proxyCode + ")")
    }
}

# -------- Check 3: New API Gateway --------
if ($localSelfUseMode) {
    $parts += "NewAPI:SKIP(LOCAL)"
}
else {
    $newApiCode = Test-Endpoint -url $newApiUrl -timeout 5
    if ($newApiCode -eq "200") {
        $parts += "NewAPI:OK"
    }
    else {
        $allOk = $false
        Write-Log ("WARN: New API returned " + $newApiCode + ", restarting")
        Send-Alert -title "[WARN] New API" -body "New API (3001) is down, auto-restarting..." -uid "newapi-alert"
        Restart-NewApi

        Start-Sleep 10
        $v = Test-Endpoint -url $newApiUrl -timeout 5
        if ($v -eq "200") {
            Write-Log "-> New API restart OK"
        }
        else {
            Write-Log ("ERROR: New API still down after restart (" + $v + ")")
            Send-Alert -title "[CRITICAL] New API" -body "New API restart failed! Check Docker Desktop!" -uid "newapi-critical"
        }
        $parts += ("NewAPI:FAIL(" + $newApiCode + ")")
    }
}

# -------- Check 4: Cloudflare Tunnel --------
if ($localSelfUseMode) {
    Set-FailCount -svc "tunnel" -val 0
    $parts += "Tunnel:SKIP(LOCAL)"
}
else {
    $tunnelProc = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
    if ($tunnelProc) {
        # Process alive, but is tunnel actually reachable?
        $tunnelHttpCode = Test-Endpoint -url "https://team-api.codexapis.uk/v1/models" -timeout 10

        if ($tunnelHttpCode -eq "401" -or $tunnelHttpCode -eq "200") {
            # 401 = Missing API key (normal, means tunnel is working)
            $parts += "Tunnel:OK"
            Set-FailCount -svc "tunnel" -val 0
        }
        else {
            # Process alive but tunnel broken (TLS EOF / zombie state)
            $allOk = $false
            $fc = (Get-FailCount -svc "tunnel") + 1
            Set-FailCount -svc "tunnel" -val $fc
            Write-Log ("WARN: Tunnel process alive but unreachable (HTTP " + $tunnelHttpCode + ") (fail #" + $fc + ")")

            if ($fc -ge $failThreshold) {
                Write-Log ("ERROR: Tunnel zombie " + $fc + " times, killing for auto-restart")
                Send-Alert -title "[WARN] Tunnel" -body "Tunnel alive but broken, killing for auto-restart..." -uid "tunnel-zombie"
                Stop-Process -Name "cloudflared" -Force -ErrorAction SilentlyContinue
                # bat LOOP will auto-restart cloudflared in 10 seconds
                Set-FailCount -svc "tunnel" -val 0
            }
            $parts += ("Tunnel:ZOMBIE(" + $tunnelHttpCode + ")")
        }
    }
    else {
        $allOk = $false
        Write-Log "WARN: Cloudflare tunnel process missing, starting"
        Send-Alert -title "[WARN] Tunnel" -body "Cloudflare tunnel process is gone, auto-starting..." -uid "tunnel-alert"
        Start-Tunnel

        Start-Sleep 5
        $tv = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
        if ($tv) {
            Write-Log "-> Tunnel started OK"
        }
        else {
            Write-Log "ERROR: Tunnel failed to start"
            Send-Alert -title "[CRITICAL] Tunnel" -body "Cloudflare tunnel failed to start! Check manually!" -uid "tunnel-critical"
        }
        $parts += "Tunnel:DOWN"
    }
}

# -------- Check 4.5: V2 Gateway (explicit cutover modes only) --------
$cutoverMode = Get-CutoverMode
if ($cutoverMode -ne "legacy") {
    if ($v2RollbackPending) {
        Set-FailCount -svc "v2" -val 0
        Write-Log ("INFO: V2 rollback is pending in mode " + $cutoverMode + ". Health probe is read-only and restart is suppressed.")
        $parts += "V2:ROLLBACK_PENDING"
    }
    else {
        $v2Code = Test-Endpoint -url $v2HealthUrl -timeout 5
        if ($v2Code -eq "200") {
            $parts += ("V2:" + $cutoverMode.ToUpper())
            Set-FailCount -svc "v2" -val 0
        }
        else {
            $allOk = $false
            $fc = (Get-FailCount -svc "v2") + 1
            Set-FailCount -svc "v2" -val $fc
            Write-Log ("WARN: V2 gateway returned " + $v2Code + " in mode " + $cutoverMode + " on port " + $v2GatewayPort + " (fail #" + $fc + ")")

            if ($fc -ge $failThreshold) {
                Write-Log ("ERROR: V2 gateway failed " + $fc + " times, evaluating guarded restart")
                $restartTriggered = Restart-V2Gateway

                if ($restartTriggered) {
                    Start-Sleep 5
                    $v = Test-Endpoint -url $v2HealthUrl -timeout 5
                    if ($v -eq "200") {
                        Write-Log "-> Restart OK, V2 gateway recovered"
                        Set-FailCount -svc "v2" -val 0
                    }
                    else {
                        Write-Log ("ERROR: V2 gateway still down after guarded restart (" + $v + ")")
                    }
                }
            }

            $parts += ("V2:FAIL(" + $v2Code + ")")
        }
    }
}

# -------- Check 5: CLOSE_WAIT Detection on Team Pool --------
# New API runs in Docker (port 3001) - CLOSE_WAIT won't appear on host side
# Instead, monitor Team pool (port 8317) which is a real local process
if ($localSelfUseMode -and $teamPoolStopRequested) {
    $parts += "CW:SKIP(TEAM_STOP_REQUESTED)"
}
else {
    $cwPort = 8317
    $cwCount = 0
    try {
        $cwCount = @(Get-NetTCPConnection -LocalPort $cwPort -State CloseWait -ErrorAction SilentlyContinue).Count
    }
    catch { $cwCount = 0 }

    if ($cwCount -ge $closeWaitThreshold) {
        $allOk = $false
        Write-Log ("WARN: Team pool has " + $cwCount + " CLOSE_WAIT connections (threshold: " + $closeWaitThreshold + "), restarting")
        Send-Alert -title "[WARN] Connection" -body ("Team pool has " + $cwCount + " stale connections, restarting...") -uid "cw-alert"
        Restart-TeamPool
        $parts += ("CW:" + $cwCount + "(!)")
    }
    else {
        $parts += ("CW:" + $cwCount)
    }
}

# ======================== Summary Log ========================

$summary = $parts -join " | "
if ($allOk) {
    Write-Log ("OK (" + $summary + ")")
}
else {
    Write-Log ("ISSUE (" + $summary + ")")
}

# ======================== Log Rotation ========================

if (Test-Path $logFile) {
    $lines = Get-Content $logFile
    if ($lines.Count -gt $maxLogLines) {
        $lines | Select-Object -Last $maxLogLines | Set-Content $logFile
    }
}
