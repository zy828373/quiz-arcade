param(
    [int]$CheckIntervalSeconds = 60,
    [int]$FailureThreshold = 2,
    [int]$RequestTimeoutSeconds = 20
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $scriptRoot 'tunnel_watchdog.log'
$cloudflaredPath = Join-Path $scriptRoot 'cloudflared.exe'
$tunnelConfigPath = 'C:\Users\AWSA\.cloudflared\config.yml'
$publicModelsUrl = 'https://api.codexapis.uk/v1/models'
$clientApiKey = 'pandaclient'

function Write-WatchdogLog {
    param([string]$Message)
    $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    "[$timestamp] $Message" | Add-Content -Path $logFile -Encoding UTF8
    Write-Host "[$timestamp] $Message"
}

function Test-PublicTunnel {
    try {
        $response = Invoke-WebRequest `
            -Uri $publicModelsUrl `
            -Method Get `
            -Headers @{ Authorization = "Bearer $clientApiKey" } `
            -TimeoutSec $RequestTimeoutSeconds `
            -UseBasicParsing `
            -ErrorAction Stop

        return @{
            Healthy = ([int]$response.StatusCode -eq 200)
            Detail = "status=$([int]$response.StatusCode)"
        }
    }
    catch {
        $statusCode = $null
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }

        return @{
            Healthy = $false
            Detail = if ($statusCode) { "status=$statusCode error=$($_.Exception.Message)" } else { "error=$($_.Exception.Message)" }
        }
    }
}

function Stop-Cloudflared {
    $processes = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
    if (-not $processes) {
        Write-WatchdogLog 'cloudflared process not found before restart.'
        return
    }

    foreach ($process in $processes) {
        try {
            Write-WatchdogLog "Stopping cloudflared pid=$($process.Id)."
            Stop-Process -Id $process.Id -Force -ErrorAction Stop
        }
        catch {
            Write-WatchdogLog "Failed to stop cloudflared pid=$($process.Id): $($_.Exception.Message)"
        }
    }
}

function Start-Cloudflared {
    if (-not (Test-Path $cloudflaredPath)) {
        Write-WatchdogLog "cloudflared.exe not found at $cloudflaredPath"
        return
    }

    Write-WatchdogLog 'Starting cloudflared tunnel.'
    Start-Process `
        -FilePath $cloudflaredPath `
        -ArgumentList @('tunnel', '--config', $tunnelConfigPath, 'run', 'codex-pool') `
        -WorkingDirectory $scriptRoot `
        -WindowStyle Minimized
}

function Restart-Cloudflared {
    Write-WatchdogLog 'Restarting Cloudflare tunnel after repeated failures.'
    Stop-Cloudflared
    Start-Sleep -Seconds 5
    Start-Cloudflared
    Start-Sleep -Seconds 15
}

Write-WatchdogLog "Tunnel watchdog started. url=$publicModelsUrl interval=${CheckIntervalSeconds}s threshold=$FailureThreshold"

$failureCount = 0

while ($true) {
    $result = Test-PublicTunnel

    if ($result.Healthy) {
        if ($failureCount -gt 0) {
            Write-WatchdogLog "Tunnel recovered. $($result.Detail)"
        }
        $failureCount = 0
    }
    else {
        $failureCount += 1
        Write-WatchdogLog "Tunnel check failed ($failureCount/$FailureThreshold). $($result.Detail)"

        if ($failureCount -ge $FailureThreshold) {
            Restart-Cloudflared
            $failureCount = 0
        }
    }

    Start-Sleep -Seconds $CheckIntervalSeconds
}
