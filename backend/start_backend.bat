@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title TestPilot-Backend
echo TestPilot Backend - port 8001
echo Open: http://localhost:3000  API: http://localhost:8001
echo.
if defined EDGE_DRIVER_PATH echo Using EDGE_DRIVER_PATH: %EDGE_DRIVER_PATH%
echo.
REM If backend crashes on start, try without --reload: change to uvicorn app.main:app --port 8001
python -m uvicorn app.main:app --reload --port 8001
if errorlevel 1 (
    echo.
    echo If crash persists, try: python -m uvicorn app.main:app --port 8001
    pause
)
pause
