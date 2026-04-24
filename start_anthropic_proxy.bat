@echo off
chcp 65001 >nul 2>&1
title [Anthropic Proxy] :8320
cd /d "%~dp0"

:LOOP
echo [%date% %time%] Starting Anthropic Proxy...
echo [%date% %time%] Anthropic Proxy starting >> restart.log
node anthropic_proxy.js
echo [%date% %time%] Anthropic Proxy exited! Restarting in 5 seconds...
echo [%date% %time%] Anthropic Proxy crashed, auto-restarting >> restart.log
timeout /t 5 /nobreak >nul
goto LOOP
