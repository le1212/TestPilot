@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo   释放 8001 端口
echo ========================================
echo.
echo 当 8001 被占用导致后端无法启动时，可运行此脚本结束占用进程。
echo.
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8001" ^| findstr "LISTENING"') do (
    echo 结束进程 PID: %%a
    taskkill /PID %%a /F 2>nul
)
echo.
echo 完成。请重新启动后端（一键启动.bat 或 start_backend.bat）。
echo.
pause
