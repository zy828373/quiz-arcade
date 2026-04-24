param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('legacy', 'parallel', 'canary', 'primary')]
    [string]$Mode,

    [string]$Reason = 'manual_cutover_mode_change',
    [string]$OperatorId = 'local-script',
    [switch]$EnsureV2Started,
    [switch]$StopV2AfterLegacy,
    [int]$GraceDelayMs = 0
)

$scriptRoot = $PSScriptRoot
$v2Dir = Join-Path $scriptRoot 'v2'
$startV2Script = Join-Path $scriptRoot 'start_v2.bat'
$v2EnvFile = Join-Path $v2Dir '.env'
$cutoverModeFile = Join-Path $v2Dir 'data\cutover-mode.env'
$rollbackLockFile = Join-Path $v2Dir 'data\cutover-rollback.lock'

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

function Get-CutoverMode {
    if (Test-Path $cutoverModeFile) {
        foreach ($rawLine in Get-Content $cutoverModeFile -ErrorAction SilentlyContinue) {
            $line = $rawLine.Trim()
            if (-not $line -or $line.StartsWith('#')) {
                continue
            }

            $separatorIndex = $line.IndexOf('=')
            if ($separatorIndex -lt 0) {
                continue
            }

            $key = $line.Substring(0, $separatorIndex).Trim()
            if ($key -ne 'V2_CUTOVER_MODE') {
                continue
            }

            $value = $line.Substring($separatorIndex + 1).Trim().ToLower()
            if ($value) {
                return $value
            }
        }
    }

    return 'legacy'
}

function Get-V2ListeningProcessIds {
    $listenerPort = Get-V2GatewayPort

    try {
        return @(Get-NetTCPConnection -LocalPort $listenerPort -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique)
    }
    catch {
        return @()
    }
}

function Invoke-CutoverCli {
    Push-Location $v2Dir
    try {
        & npm.cmd run cutover:mode -- --mode $Mode --reason $Reason --operator $OperatorId
        return $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}

function Start-V2GatewayProcess {
    if (-not (Test-Path $startV2Script)) {
        throw "Unable to restore V2 gateway because start_v2.bat is missing: $startV2Script"
    }

    Start-Process -FilePath $startV2Script -WorkingDirectory $scriptRoot | Out-Null
}

function Remove-RollbackLock {
    if (Test-Path $rollbackLockFile) {
        Remove-Item -Path $rollbackLockFile -Force -ErrorAction SilentlyContinue
    }
}

function Write-RollbackLock {
    $lockDirectory = Split-Path $rollbackLockFile -Parent
    if (-not (Test-Path $lockDirectory)) {
        New-Item -ItemType Directory -Path $lockDirectory -Force | Out-Null
    }

    $requestedAt = (Get-Date).ToString('o')
    @(
        "reason=$Reason"
        "operator=$OperatorId"
        "requested_at=$requestedAt"
    ) | Set-Content -Path $rollbackLockFile -Encoding UTF8 -Force
}

function Stop-V2GatewayListener {
    $listenerPort = Get-V2GatewayPort
    $listenerPids = Get-V2ListeningProcessIds

    if ($listenerPids.Count -eq 0) {
        return @{
            ListenerPort = $listenerPort
            RemainingPids = @()
            Stopped = $true
            WasListening = $false
        }
    }

    foreach ($listenerPid in $listenerPids) {
        Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Milliseconds 300
    $remainingListenerPids = Get-V2ListeningProcessIds

    return @{
        ListenerPort = $listenerPort
        RemainingPids = $remainingListenerPids
        Stopped = ($remainingListenerPids.Count -eq 0)
        WasListening = $true
    }
}

if ($Mode -eq 'legacy' -and $StopV2AfterLegacy) {
    $previousMode = Get-CutoverMode
    $stopResult = $null
    $persistedLegacy = $false

    try {
        Write-RollbackLock

        if ($GraceDelayMs -gt 0) {
            Start-Sleep -Milliseconds $GraceDelayMs
        }

        $stopResult = Stop-V2GatewayListener
        if (-not $stopResult.Stopped) {
            throw "Legacy rollback failed to stop the V2 gateway listener on port $($stopResult.ListenerPort)."
        }

        $exitCode = Invoke-CutoverCli
        if ($exitCode -ne 0) {
            throw "Legacy rollback stopped the V2 listener, but cutover:mode exited with code $exitCode."
        }

        $persistedLegacy = $true
        Remove-RollbackLock
        Write-Host "Legacy rollback applied. V2 gateway listener on port $($stopResult.ListenerPort) has been stopped and cutover mode is now legacy."
        exit 0
    }
    catch {
        $errorMessage = $_.Exception.Message
        Remove-RollbackLock

        if ($stopResult -and $stopResult.WasListening -and -not $persistedLegacy -and $previousMode -ne 'legacy') {
            try {
                Start-V2GatewayProcess
            }
            catch {
                Write-Error ("Legacy rollback failed and V2 could not be restored automatically: " + $_.Exception.Message)
                exit 1
            }
        }

        Write-Error $errorMessage
        exit 1
    }
}

$cutoverExitCode = Invoke-CutoverCli
if ($cutoverExitCode -ne 0) {
    exit $cutoverExitCode
}

if ($EnsureV2Started) {
    $listenerPids = Get-V2ListeningProcessIds
    if ($listenerPids.Count -eq 0 -and (Test-Path $startV2Script)) {
        Start-V2GatewayProcess
        Write-Host "V2 gateway start requested."
    }
}

if ($Mode -eq 'canary' -or $Mode -eq 'primary') {
    Write-Host "Cutover mode updated to $Mode. External Cloudflare / client entrypoint switching remains manual in this phase."
}
