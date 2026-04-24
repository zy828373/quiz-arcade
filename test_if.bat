@echo off
chcp 65001 >nul 2>&1
set "CUTOVER_MODE=legacy"
echo mode=%CUTOVER_MODE%
if /I not "%CUTOVER_MODE%"=="legacy" (
  echo not-legacy
) else (
  echo is-legacy
)
echo done
pause
