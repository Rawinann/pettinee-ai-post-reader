@echo off
cd /d "%~dp0"
title Pettinee Page Facebook Login

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

echo A separate Chrome window will open for the Page worker.
echo Sign in with your Facebook account and select the Pettinee Page.
echo Check the Page name in the comment box. Press Ctrl+C here when ready.
echo.
node --env-file=.env.worker.page cloud/worker.mjs --login

set "PETTINEE_WORKER_EXIT=%errorlevel%"
echo.
if not "%PETTINEE_WORKER_EXIT%"=="0" echo Read the error above if Chrome did not open.
pause
exit /b %PETTINEE_WORKER_EXIT%
