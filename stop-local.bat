@echo off
title NORVA - Stop Local Development Server
cd /d "%~dp0"

powershell.exe -NoProfile -Command "$ErrorActionPreference = 'SilentlyContinue'; $c = Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -First 1; if (-not $c) { Write-Host 'No server is running on port 3000.'; exit 0 }; $p = Get-Process -Id $c.OwningProcess; if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $p.Id -Force; Write-Host ('Stopped NORVA development server (PID ' + $p.Id + ').') } else { Write-Host ('Port 3000 is held by a non-Node process (' + $p.ProcessName + ' PID ' + $p.Id + '); not stopping it.') }"

echo.
pause