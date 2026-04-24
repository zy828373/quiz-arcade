@echo off
chcp 65001 >nul 2>&1
set "CUTOVER_MODE=legacy"
echo Before if
if /I not "%CUTOVER_MODE%"=="legacy" (
  echo V2 would start here
) 
echo After if - reached successfully
echo [1/3] Starting Team Pool...
start "" "%~dp0start_team.bat"
timeout /t 3 /nobreak >nul
echo [2/3] Starting Anthropic Proxy...
start "" "%~dp0start_anthropic_proxy.bat"
timeout /t 2 /nobreak >nul
echo [3/3] Starting Cloudflare Tunnel...
start "" "%~dp0start_tunnel.bat"
echo All done!
pause
