@echo off
chcp 65001 >nul 2>&1
title TestPilot
echo ========================================
echo   TestPilot - Start Backend + Frontend
echo ========================================
echo.
echo Two windows will open. Do not close them:
echo   - Window 1: Backend (port 8001)
echo   - Window 2: Frontend (port 3000)
echo.
echo If already running, close old windows first.
echo.

echo [1/2] Starting backend...
start "TestPilot-Backend" cmd /k "chcp 65001 >nul 2>&1 && cd /d %~dp0backend && start_backend.bat"
timeout /t 3 /nobreak >nul

echo [2/2] Starting frontend...
start "TestPilot-Frontend" cmd /k "chcp 65001 >nul 2>&1 && cd /d %~dp0frontend && npx vite --port 3000"

echo.
echo ========================================
echo   Done. Open in browser:
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8001
echo ========================================
echo.
pause
