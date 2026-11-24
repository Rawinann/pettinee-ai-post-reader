@echo off
cd /d "%~dp0"
title Pettinee Facebook Login

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

echo A separate Chrome window will open for the personal worker.
echo Sign in to Facebook yourself. Press Ctrl+C here when ready.
echo.
npm.cmd run cloud:worker -- --login
set "PETTINEE_WORKER_EXIT=%errorlevel%"
echo.
if not "%PETTINEE_WORKER_EXIT%"=="0" echo Read the error above if Chrome did not open.
pause
exit /b %PETTINEE_WORKER_EXIT%
