@echo off
chcp 65001 >nul 2>&1
title [Tunnel] Cloudflare Codex Pool
cd /d "%~dp0"

:LOOP
echo [%date% %time%] Starting Cloudflare Tunnel...
echo [%date% %time%] Cloudflare Tunnel starting >> restart.log
cloudflared.exe tunnel --config C:\Users\AWSA\.cloudflared\config.yml run codex-pool
echo [%date% %time%] Tunnel exited! Restarting in 10 seconds...
echo [%date% %time%] Cloudflare Tunnel crashed, auto-restarting >> restart.log
timeout /t 10 /nobreak >nul
goto LOOP
