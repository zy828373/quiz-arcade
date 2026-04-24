powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change monitor-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
Write-Host "[OK] 已禁用所有睡眠和休眠" -ForegroundColor Green
