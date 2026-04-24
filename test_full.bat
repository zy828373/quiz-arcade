@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo === Step 1: READ_V2_PORT ===
call :READ_V2_PORT
echo V2_GATEWAY_PORT=%V2_GATEWAY_PORT%
echo === Step 2: READ_CUTOVER_STATE ===
call :READ_CUTOVER_STATE
echo CUTOVER_MODE=%CUTOVER_MODE%
echo V2_ROLLBACK_PENDING=%V2_ROLLBACK_PENDING%
echo === Step 3: IF block ===
if /I not "%CUTOVER_MODE%"=="legacy" (
  echo NOT legacy
) else (
  echo IS legacy
)
echo === Step 4: Done ===
pause
goto :eof

:READ_V2_PORT
set "V2_GATEWAY_PORT=18320"
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