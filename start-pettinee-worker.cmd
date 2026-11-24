@echo off
cd /d "%~dp0"
title Pettinee Chrome Worker

if not exist ".env.worker" (
  echo Worker setup is missing: .env.worker
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

echo Connecting the personal worker to Pettinee Dashboard...
echo Keep this window open while collecting posts or sending replies.
echo Close this window to stop the worker.
echo.
set "CLOUD_WORKER_SHOW_CHROME=true"
npm.cmd run cloud:worker
set "PETTINEE_WORKER_EXIT=%errorlevel%"
echo.
if not "%PETTINEE_WORKER_EXIT%"=="0" (
  echo Worker stopped with an error. Read the message above.
) else (
  echo Worker stopped.
)
pause
exit /b %PETTINEE_WORKER_EXIT%
