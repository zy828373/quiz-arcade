param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [string]$RawPath = ''
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$outPath = Join-Path $repoRoot "${Name}_auth.json"

$possiblePaths = @(
    "$env:USERPROFILE\.codex\auth.json",
    "$env:APPDATA\codex\auth.json",
    "$env:LOCALAPPDATA\codex\auth.json",
    "$env:APPDATA\codex-cli\auth.json",
    "$env:USERPROFILE\.config\codex\auth.json"
)

if ($RawPath -and (Test-Path $RawPath)) {
    $foundPath = $RawPath
    Write-Host "Using specified path: $foundPath" -ForegroundColor Cyan
}
else {
    $foundPath = $null
    foreach ($p in $possiblePaths) {
        if (Test-Path $p) {
            $foundPath = $p
            break
        }
    }
}

if (-not $foundPath) {
    Write-Host 'auth.json not found at any known locations:' -ForegroundColor Red
    foreach ($p in $possiblePaths) {
        Write-Host "  - $p" -ForegroundColor DarkGray
    }
    exit 1
}

Write-Host "Reading auth.json from: $foundPath" -ForegroundColor Cyan
$raw = Get-Content $foundPath -Raw | ConvertFrom-Json
$isNested = ($null -ne $raw.tokens)

if ($isNested) {
    Write-Host 'Detected nested format. Converting...' -ForegroundColor Cyan
    $idToken = $raw.tokens.id_token
    $accessToken = $raw.tokens.access_token
    $refreshToken = $raw.tokens.refresh_token
    $accountId = $raw.tokens.account_id
    $lastRefresh = $raw.last_refresh
}
else {
    Write-Host 'Detected flat format. Checking fields...' -ForegroundColor Cyan
    $idToken = $raw.id_token
    $accessToken = $raw.access_token
    $refreshToken = $raw.refresh_token
    $accountId = $raw.account_id
    $lastRefresh = $raw.last_refresh
}

if (-not $refreshToken) {
    Write-Host 'ERROR: No refresh_token found.' -ForegroundColor Red
    exit 1
}

function Decode-JwtPayload($jwt) {
    $parts = $jwt.Split('.')
    if ($parts.Count -lt 2) { return $null }
    $payload = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($payload.Length % 4) {
        2 { $payload += '==' }
        3 { $payload += '=' }
    }
    $bytes = [Convert]::FromBase64String($payload)
    $json = [System.Text.Encoding]::UTF8.GetString($bytes)
    return $json | ConvertFrom-Json
}

$jwtPayload = Decode-JwtPayload $idToken
$email = $jwtPayload.email
$authInfo = $jwtPayload.'https://api.openai.com/auth'
$expired = $authInfo.chatgpt_subscription_active_until

if ($lastRefresh -match '(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})') {
    $lastRefresh = $Matches[1] + 'Z'
}

$flat = [ordered]@{
    id_token      = $idToken
    access_token  = $accessToken
    refresh_token = $refreshToken
    account_id    = $accountId
    last_refresh  = $lastRefresh
    email         = $email
    type          = 'codex'
    expired       = $expired
}

$flat | ConvertTo-Json -Depth 1 | Set-Content $outPath -Encoding UTF8
Write-Host "SUCCESS! Saved to: $outPath" -ForegroundColor Green
