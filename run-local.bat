@echo off
title NORVA Local Development Server
cd /d "%~dp0"

echo ============================================
echo  NORVA - Local Development Server
echo  Storefront: http://localhost:3000
echo  Admin:      http://localhost:3000/admin/login
echo  Press Ctrl+C in this window to stop.
echo ============================================
echo.

if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Check the output above.
    pause
    exit /b 1
  )
)

rem Open the browser once the server has had time to start.
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 12; Start-Process 'http://localhost:3000'"

rem Run the Next.js development server in this visible terminal.
call npm run dev