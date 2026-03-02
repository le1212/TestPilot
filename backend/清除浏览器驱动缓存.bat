@echo off
chcp 65001 >nul 2>&1
echo ========================================
echo   清除浏览器驱动缓存
echo ========================================
echo.
echo 当 Web 用例报「Unable to obtain driver」或驱动版本不匹配时，
echo 可运行此脚本清除缓存后重启后端。
echo.
set WDM=%USERPROFILE%\.wdm
set SEL=%USERPROFILE%\.cache\selenium
if exist "%WDM%" (
    echo 删除 %WDM%
    rd /s /q "%WDM%"
    echo 已删除 .wdm
) else (
    echo .wdm 目录不存在，跳过
)
if exist "%SEL%" (
    echo 删除 %SEL%
    rd /s /q "%SEL%"
    echo 已删除 .cache\selenium
) else (
    echo .cache\selenium 目录不存在，跳过
)
echo.
echo 完成。请重新启动后端（一键启动.bat 或 start_backend.bat）后再执行 Web 用例。
echo.
pause
