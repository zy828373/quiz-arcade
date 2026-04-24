@echo off
chcp 65001 >nul 2>&1
title [Tunnel Watchdog] Cloudflare Codex Pool
cd /d "%~dp0"

echo [%date% %time%] Starting Cloudflare Tunnel watchdog...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tunnel_watchdog.ps1"
