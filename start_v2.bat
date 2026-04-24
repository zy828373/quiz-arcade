@echo off
chcp 65001 >nul 2>&1
call :READ_V2_PORT
title [V2 Gateway] :%V2_GATEWAY_PORT%
cd /d "%~dp0v2"

:LOOP
call :READ_MODE
if /I "%V2_ROLLBACK_PENDING%"=="1" (
  echo [%date% %time%] Legacy rollback is in progress. V2 gateway will stay stopped.
  exit /b 0
)

if /I "%CUTOVER_MODE%"=="legacy" (
  echo [%date% %time%] V2 cutover mode is legacy. V2 gateway will not auto-start.
  exit /b 0
)

echo [%date% %time%] Starting V2 Gateway on port %V2_GATEWAY_PORT%...
echo [%date% %time%] V2 Gateway starting on port %V2_GATEWAY_PORT% >> ..\restart.log
call npm.cmd run start
echo [%date% %time%] V2 Gateway exited.

call :READ_MODE
if /I "%V2_ROLLBACK_PENDING%"=="1" (
  echo [%date% %time%] Legacy rollback is in progress. V2 gateway will stay stopped.
  exit /b 0
)

if /I "%CUTOVER_MODE%"=="legacy" (
  echo [%date% %time%] Cutover mode switched to legacy. V2 gateway will stay stopped.
  exit /b 0
)

echo [%date% %time%] V2 Gateway exited unexpectedly. Restarting in 5 seconds...
echo [%date% %time%] V2 Gateway crashed, auto-restarting >> ..\restart.log
timeout /t 5 /nobreak >nul
goto LOOP

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

:READ_MODE
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
