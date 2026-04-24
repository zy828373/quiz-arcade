# Claude Code -> local Anthropic proxy -> GPT pool
# Usage:
#   .\claude_gpt.ps1          Standard: sonnet alias -> gpt-5.5, high effort
#   .\claude_gpt.ps1 pro      Pro:      opus alias -> gpt-5.5, xhigh effort
#   .\claude_gpt.ps1 fast     Fast:     haiku alias -> gpt-5.5, low effort

param(
    [ValidateSet("pro", "standard", "fast", "")]
    [string]$Mode = ""
)

$ErrorActionPreference = "Stop"

$ProxyUrl = "http://127.0.0.1:8320"
$ProxyToken = "team-api-key-1"

switch ($Mode) {
    "pro" {
        $ClaudeModel = "opus"
        $Effort = "xhigh"
        $ModeLabel = "PRO - opus -> gpt-5.5 + xhigh reasoning"
        $Color = "Magenta"
    }
    "fast" {
        $ClaudeModel = "haiku"
        $Effort = "low"
        $ModeLabel = "FAST - haiku -> gpt-5.5 + low reasoning"
        $Color = "Cyan"
    }
    default {
        $ClaudeModel = "sonnet"
        $Effort = "high"
        $ModeLabel = "STANDARD - sonnet -> gpt-5.5 + high reasoning"
        $Color = "Green"
    }
}

# Route Claude Code through the local proxy.
$env:ANTHROPIC_BASE_URL = $ProxyUrl

# Avoid Claude Code's "claude.ai token + ANTHROPIC_API_KEY" auth conflict.
# The proxy accepts Authorization: Bearer team-api-key-1.
Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
$env:ANTHROPIC_AUTH_TOKEN = $ProxyToken

# Keep localhost traffic off the system HTTP proxy.
$env:NO_PROXY = "localhost,127.0.0.1,::1"
$env:no_proxy = "localhost,127.0.0.1,::1"

# Proxy/gateway compatibility and quiet mode.
$env:CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS = "1"
$env:DISABLE_AUTOUPDATER = "1"
$env:CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1"
$env:DISABLE_TELEMETRY = "1"
$env:DISABLE_ERROR_REPORTING = "1"

# Long-running shell tool timeout.
$env:BASH_DEFAULT_TIMEOUT_MS = "86400000"
$env:BASH_MAX_TIMEOUT_MS = "86400000"

Write-Host ""
Write-Host "  [MODE] $ModeLabel" -ForegroundColor $Color
Write-Host ""
Write-Host "  ============================================" -ForegroundColor DarkGray
Write-Host "  Proxy:  $ProxyUrl" -ForegroundColor DarkGray
Write-Host "  Auth:   ANTHROPIC_AUTH_TOKEN only" -ForegroundColor DarkGray
Write-Host "  Model:  $ClaudeModel" -ForegroundColor DarkGray
Write-Host "  Effort: $Effort" -ForegroundColor DarkGray
Write-Host "  Tip:    use /model opus or /model sonnet after launch" -ForegroundColor DarkGray
Write-Host "  ============================================" -ForegroundColor DarkGray
Write-Host ""

claude --model $ClaudeModel --effort $Effort
