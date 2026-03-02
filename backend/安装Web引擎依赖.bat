@echo off
chcp 65001 >nul 2>&1
title Install Web Engine (Selenium)
cd /d "%~dp0"
echo Installing Python dependencies (Selenium)...
pip install -r requirements.txt
if errorlevel 1 ( echo Install failed. & pause & exit /b 1 )
echo.
echo Done. On first Web run, Selenium will auto-download the matching driver.
echo Ensure Chrome or Edge is installed. Restart backend then run Web cases.
pause
