param(
    [string]$Host = "127.0.0.1",
    [int]$Port = 18320
)

$uri = "http://$Host`:$Port/health"

try {
    $response = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 10
    $response | ConvertTo-Json -Depth 6
}
catch {
    Write-Error "V2 health check failed: $uri"
    exit 1
}
