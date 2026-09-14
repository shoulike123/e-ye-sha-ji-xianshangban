@echo off
REM 小朋友可以双击这个文件开游戏。
REM 它会：检查有没有 Node → 关掉旧窗口 → 先开规则服务器(8787) → 再开网页(5173) → 打开浏览器。
REM 两个黑窗口不要关，关了游戏就停了。
cd /d "%~dp0"

echo ========================================
echo  E Ye Sha Ji - starting...
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run: npm install...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Stopping old processes on 8787 / 5173...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
ping -n 2 127.0.0.1 >nul

echo Starting server on 8787...
start "EYSJ-Server" /D "%~dp0" cmd /k "npm run dev:server"

echo Waiting for server...
set /a i=0
:wait_server
set /a i+=1
ping -n 2 127.0.0.1 >nul
powershell -NoProfile -Command "try{Invoke-RestMethod http://127.0.0.1:8787/api/health|Out-Null;exit 0}catch{exit 1}"
if not errorlevel 1 goto server_ok
if %i% GEQ 20 (
  echo [ERROR] Server failed to start. Check EYSJ-Server window.
  pause
  exit /b 1
)
goto wait_server

:server_ok
echo Server OK.

echo Starting web UI on 5173...
start "EYSJ-Client" /D "%~dp0" cmd /k "npm run dev:client"

echo Waiting for web UI...
set /a j=0
:wait_web
set /a j+=1
ping -n 2 127.0.0.1 >nul
powershell -NoProfile -Command "try{(Invoke-WebRequest http://127.0.0.1:5173/ -UseBasicParsing -TimeoutSec 2).StatusCode|Out-Null;exit 0}catch{exit 1}"
if not errorlevel 1 goto web_ok
if %j% GEQ 20 (
  echo [ERROR] Web UI failed to start. Check EYSJ-Client window.
  pause
  exit /b 1
)
goto wait_web

:web_ok
echo Web UI OK.
echo Opening browser...
start "" "http://127.0.0.1:5173/"

echo.
echo Done. Keep these two windows open:
echo   EYSJ-Server
echo   EYSJ-Client
echo URL: http://127.0.0.1:5173/
echo.
pause
