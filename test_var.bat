@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
set "CUTOVER_MODE=legacy"
set "V2_ROLLBACK_PENDING=0"
set "CUTOVER_MODE_FILE=%~dp0v2\data\cutover-mode.env"
if exist "%CUTOVER_MODE_FILE%" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%CUTOVER_MODE_FILE%") do (
    if /I "%%A"=="V2_CUTOVER_MODE" set "CUTOVER_MODE=%%B"
  )
)
echo VAL=[%CUTOVER_MODE%]
echo COMPARE TEST:
if "%CUTOVER_MODE%"=="legacy" (echo MATCH) else (echo NO MATCH)
pause
