@echo off
echo [*] Stopping existing dev server...
taskkill /F /FI "WINDOWTITLE eq npm*" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo [*] Starting dev server...
cd /d "%~dp0"
npm run dev
