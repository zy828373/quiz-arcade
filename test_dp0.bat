@echo off
chcp 65001 >nul 2>&1
echo dp0=%~dp0
echo test1
set "CUTOVER_MODE=legacy"
if /I not "%CUTOVER_MODE%"=="legacy" (
  echo not-legacy
)
echo test2
pause
