@echo off
chcp 65001 >nul 2>&1
call :READ_V2_PORT
call :READ_CUTOVER_STATE

echo ========================================
echo   Starting all pool services...
echo ========================================
echo   Cutover Mode: %CUTOVER_MODE%

if /I not "%CUTOVER_MODE%"=="legacy" (
  if /I "%V2_ROLLBACK_PENDING%"=="1" (
    echo [0/4] V2 rollback is in progress. Skipping V2 gateway auto-start.
  ) else (
    echo [0/4] Starting V2 Gateway ^(mode=%CUTOVER_MODE%, port=%V2_GATEWAY_PORT%^)...
    start "" "%~dp0start_v2.bat"
    timeout /t 2 /nobreak >nul
  )
)

echo [1/3] Starting Team Pool (8317)...
start "" "%~dp0start_team.bat"
timeout /t 3 /nobreak >nul

echo [2/3] Starting Anthropic Proxy (8320)...
start "" "%~dp0start_anthropic_proxy.bat"
timeout /t 2 /nobreak >nul

echo [3/3] Starting Cloudflare Tunnel...
start "" "%~dp0start_tunnel.bat"

echo ========================================
echo   All services started!
echo   Team Pool:        http://localhost:8317
echo   Anthropic Proxy:  http://localhost:8320
echo   Cloudflare Tunnel: Started
if /I not "%CUTOVER_MODE%"=="legacy" echo   V2 Gateway:       http://localhost:%V2_GATEWAY_PORT%
echo   CPAMC Panel:      http://localhost:8317/management.html
echo   ----------------------------------------
echo   LAN Access:       http://192.168.8.200:8320
echo ========================================
pause
goto :eof

:READ_V2_PORT
set "V2_GATEWAY_PORT=18320"
if defined V2_PORT (
  set "V2_GATEWAY_PORT=%V2_PORT%"
  goto :eof
)
set "V2_ENV_FILE=%~dp0v2\.env"
if exist "%V2_ENV_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%V2_ENV_FILE%") do (
    if /I "%%A"=="V2_PORT" set "V2_GATEWAY_PORT=%%B"
  )
)
goto :eof

:READ_CUTOVER_STATE
set "CUTOVER_MODE=legacy"
set "V2_ROLLBACK_PENDING=0"
set "CUTOVER_MODE_FILE=%~dp0v2\data\cutover-mode.env"
set "ROLLBACK_LOCK_FILE=%~dp0v2\data\cutover-rollback.lock"
if exist "%ROLLBACK_LOCK_FILE%" (
  set "V2_ROLLBACK_PENDING=1"
)
if exist "%CUTOVER_MODE_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%CUTOVER_MODE_FILE%") do (
    if /I "%%A"=="V2_CUTOVER_MODE" set "CUTOVER_MODE=%%B"
  )
)
goto :eof

