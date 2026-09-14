@echo off
echo Stopping E Ye Sha Ji (ports 5173 / 8787)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8787" ^| findstr "LISTENING"') do (
  echo kill 8787 PID %%p
  taskkill /PID %%p /F >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  echo kill 5173 PID %%p
  taskkill /PID %%p /F >nul 2>&1
)
taskkill /FI "WINDOWTITLE eq EYSJ-Server*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq EYSJ-Client*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq NightHunt-Server*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq NightHunt-Client*" /F >nul 2>&1
echo Done.
pause
