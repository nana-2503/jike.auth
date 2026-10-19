@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: 设置备份目录
set BACKUP_DIR=backup
set TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_NAME=source_%TIMESTAMP%

:: 创建备份目录
if not exist %BACKUP_DIR% mkdir %BACKUP_DIR%

:: 创建临时目录
set TEMP_DIR=%BACKUP_DIR%\%BACKUP_NAME%
mkdir %TEMP_DIR%

echo 正在备份源代码...

:: 备份后端代码（排除编译文件和数据）
echo 备份后端...
xcopy /E /I /Y backend\*.go %TEMP_DIR%\backend\ >nul 2>&1
xcopy /E /I /Y backend\cmd %TEMP_DIR%\backend\cmd\ >nul 2>&1
xcopy /E /I /Y backend\config %TEMP_DIR%\backend\config\ >nul 2>&1
xcopy /E /I /Y backend\database %TEMP_DIR%\backend\database\ >nul 2>&1
xcopy /E /I /Y backend\handlers %TEMP_DIR%\backend\handlers\ >nul 2>&1
xcopy /E /I /Y backend\middleware %TEMP_DIR%\backend\middleware\ >nul 2>&1
xcopy /E /I /Y backend\models %TEMP_DIR%\backend\models\ >nul 2>&1
copy /Y backend\go.mod %TEMP_DIR%\backend\ >nul 2>&1
copy /Y backend\go.sum %TEMP_DIR%\backend\ >nul 2>&1
:: 不备份 backend\config.yaml：其中含数据库密码与 JWT 密钥，属于敏感配置。

:: 备份前端代码（排除node_modules和dist）
echo 备份前端...
xcopy /E /I /Y frontend\src %TEMP_DIR%\frontend\src\ >nul 2>&1
copy /Y frontend\*.json %TEMP_DIR%\frontend\ >nul 2>&1
copy /Y frontend\*.html %TEMP_DIR%\frontend\ >nul 2>&1
copy /Y frontend\*.ts %TEMP_DIR%\frontend\ >nul 2>&1

:: 备份根目录文件
copy /Y README.md %TEMP_DIR%\ >nul 2>&1

:: 压缩备份
echo 压缩备份文件...
powershell -Command "Compress-Archive -Path '%TEMP_DIR%\*' -DestinationPath '%BACKUP_DIR%\%BACKUP_NAME%.zip' -Force"

:: 删除临时目录
rmdir /S /Q %TEMP_DIR%

echo.
echo ========================================
echo 备份完成: %BACKUP_DIR%\%BACKUP_NAME%.zip
echo ========================================

pause
