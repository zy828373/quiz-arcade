@echo off
echo [*] Stopping dev server on port 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo [*] Killing process PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)
echo [*] Done.
pause
