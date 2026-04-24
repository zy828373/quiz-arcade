@echo off
chcp 65001 >nul 2>&1
echo =========================================================
echo   Codex Pool Diagnostic Script
echo   %date% %time%
echo =========================================================
echo.

echo [1/7] Check: Team Pool (localhost:8317) alive?
curl -s -o nul -w "  HTTP Status: %%{http_code}\n" http://localhost:8317/v1/models
echo.

echo [2/7] Check: Team Pool with API Key auth
curl -s -w "\n  HTTP Status: %%{http_code}\n" -H "Authorization: Bearer team-api-key-1" http://localhost:8317/v1/models
echo.

echo [3/7] Check: Anthropic Proxy (localhost:8320) alive?
curl -s -o nul -w "  HTTP Status: %%{http_code}\n" http://localhost:8320/health
echo.

echo [4/7] Check: New API Docker (localhost:3001) alive?
curl -s -o nul -w "  HTTP Status: %%{http_code}\n" http://localhost:3001/v1/models
echo.

echo [5/7] Check: Cloudflare Tunnel - team-api.codexapis.uk
curl -s -o nul -w "  HTTP Status: %%{http_code}\n" --max-time 10 https://team-api.codexapis.uk/v1/models
echo.

echo [6/7] Check: Cloudflare Tunnel - api.codexapis.uk (New API)
curl -s -o nul -w "  HTTP Status: %%{http_code}\n" --max-time 10 https://api.codexapis.uk/v1/models
echo.

echo [7/7] Check: Clash proxy (127.0.0.1:7897) alive?
curl -s -o nul -w "  HTTP Status: %%{http_code}\n" --max-time 5 --proxy http://127.0.0.1:7897 https://api.openai.com/v1/models
echo.

echo =========================================================
echo   Diagnostic Summary:
echo   - Step 1 should return 401 (normal, no key)
echo   - Step 2 should return 200 with model list
echo   - Step 3 should return 200
echo   - Step 4 should return 200
echo   - Step 5 should return 401 (normal, tunnel works)
echo   - Step 6 should return 200
echo   - Step 7 should return 401 (normal, proxy works)
echo   - If any step returns 000 = service unreachable
echo =========================================================
pause
