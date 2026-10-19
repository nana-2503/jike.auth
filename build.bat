@echo off
chcp 65001 >nul
setlocal

echo ========================================
echo 开始打包...
echo ========================================

:: 1. 打包前端
echo.
echo [1/4] 打包前端...
cd frontend
call npm run build
if errorlevel 1 (
    echo 前端打包失败！
    pause
    exit /b 1
)
cd ..

:: 2. 复制前端文件到后端
echo.
echo [2/4] 复制前端文件到后端...
if exist backend\dist rmdir /S /Q backend\dist
xcopy /E /I /Y frontend\dist backend\dist >nul

:: 3. 打包后端 Windows amd64
echo.
echo [3/6] 打包后端 (Windows amd64)...
cd backend
set GOOS=windows
set GOARCH=amd64
go build -ldflags="-s -w" -o server .
if errorlevel 1 (
    echo Windows amd64 后端打包失败！
    pause
    exit /b 1
)
cd ..
if not exist release\windows-amd64 mkdir release\windows-amd64
move /Y backend\server release\windows-amd64\ >nul

:: 注意：config.yaml 含有数据库密码与自动生成的 JWT 密钥，属于本地敏感配置，
:: 不会随发布产物分发。部署时请自行创建 config.yaml 或通过安装向导生成。

:: 4. 打包后端 Linux amd64
echo.
echo [4/6] 打包后端 (Linux amd64)...
cd backend
set GOOS=linux
set GOARCH=amd64
go build -ldflags="-s -w" -o server .
if errorlevel 1 (
    echo Linux amd64 后端打包失败！
    pause
    exit /b 1
)
cd ..
if not exist release\linux-amd64 mkdir release\linux-amd64
move /Y backend\server release\linux-amd64\ >nul

:: 5. 打包后端 Linux arm64
echo.
echo [5/6] 打包后端 (Linux arm64)...
cd backend
set GOOS=linux
set GOARCH=arm64
go build -ldflags="-s -w" -o server .
if errorlevel 1 (
    echo Linux arm64 后端打包失败！
    pause
    exit /b 1
)
cd ..
if not exist release\linux-arm64 mkdir release\linux-arm64
move /Y backend\server release\linux-arm64\ >nul

:: 完成
echo.
echo ========================================
echo 打包完成！
echo 输出文件:
echo   - release\windows-amd64\server
echo   - release\linux-amd64\server
echo   - release\linux-arm64\server
echo ========================================

pause
