param(
    [string]$Name,
    [string]$TokenFile
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$teamDir = Join-Path $repoRoot 'auths_team'

if (-not (Test-Path $teamDir)) {
    New-Item -ItemType Directory -Path $teamDir -Force | Out-Null
}

if (-not $Name) {
    $existing = @(Get-ChildItem -Path $teamDir -Filter '*_auth.json' -ErrorAction SilentlyContinue).Count
    $nextNum = $existing + 1
    $Name = "team$nextNum"
    Write-Host "自动编号: $Name" -ForegroundColor Cyan
}

if (-not $TokenFile) {
    $TokenFile = Read-Host '请输入 Token 文件路径'
    $TokenFile = $TokenFile.Trim('"')
}

if (-not (Test-Path $TokenFile)) {
    Write-Host "[ERROR] 文件不存在: $TokenFile" -ForegroundColor Red
    exit 1
}

try {
    $json = Get-Content $TokenFile -Raw | ConvertFrom-Json
    if (-not $json.access_token) {
        Write-Host "[ERROR] JSON 中缺少 access_token 字段" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "[ERROR] 不是有效的 JSON 文件" -ForegroundColor Red
    exit 1
}

if (-not $json.type) {
    $json | Add-Member -NotePropertyName 'type' -NotePropertyValue 'codex'
    Write-Host "[FIX] 已自动补充 type: codex" -ForegroundColor Yellow
}

$destFile = Join-Path $teamDir "${Name}_auth.json"
$json | ConvertTo-Json -Depth 10 | Set-Content $destFile -Encoding UTF8

Write-Host "[OK] Token 已保存到: $destFile" -ForegroundColor Green
Write-Host ''
Write-Host '如需让新 Token 生效，请重启 Team Pool 或重新执行 start_all.bat。' -ForegroundColor Cyan
