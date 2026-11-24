@echo off
cd /d "%~dp0"
title Pettinee Page Worker

if not exist ".env.worker.page" (
  echo Page worker setup is missing: .env.worker.page
  echo See docs\WORKER-QUICKSTART-TH.md
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or not on PATH.
  pause
  exit /b 1
)

echo Connecting the Page worker to Pettinee Dashboard...
echo Keep this window open while sending replies as the Page.
echo Close this window to stop the Page worker.
echo.
node --env-file=.env.worker.page cloud/worker.mjs

set "PETTINEE_WORKER_EXIT=%errorlevel%"
echo.
if not "%PETTINEE_WORKER_EXIT%"=="0" (
  echo Page worker stopped with an error. Read the message above.
) else (
  echo Page worker stopped.
)
pause
exit /b %PETTINEE_WORKER_EXIT%
