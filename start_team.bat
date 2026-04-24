@echo off
chcp 65001 >nul 2>&1
title [Team Pool] CLIProxyAPI :8317
cd /d "%~dp0"
set "TEAM_POOL_STOP_FILE=%~dp0v2\data\team-pool-stop.requested"

if not exist "%~dp0v2\data" (
  mkdir "%~dp0v2\data" >nul 2>&1
)

:LOOP
if exist "%TEAM_POOL_STOP_FILE%" (
  echo [%date% %time%] Team Pool stop requested, exiting loop...
  echo [%date% %time%] Team Pool stop requested, loop exiting >> restart.log
  del /f /q "%TEAM_POOL_STOP_FILE%" >nul 2>&1
  goto :eof
)
echo [%date% %time%] Starting Team Pool...
echo [%date% %time%] Team Pool starting >> restart.log
cli-proxy-api.exe -config config_team.yaml
if exist "%TEAM_POOL_STOP_FILE%" (
  echo [%date% %time%] Team Pool stop requested after exit, not restarting.
  echo [%date% %time%] Team Pool stop requested after exit, loop exiting >> restart.log
  del /f /q "%TEAM_POOL_STOP_FILE%" >nul 2>&1
  goto :eof
)
echo [%date% %time%] Team Pool exited! Restarting in 5 seconds...
echo [%date% %time%] Team Pool crashed, auto-restarting >> restart.log
timeout /t 5 /nobreak >nul
goto LOOP
