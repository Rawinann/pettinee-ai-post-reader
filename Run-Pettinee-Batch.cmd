@echo off
cd /d "%~dp0"
call npm.cmd run automate:batch
exit /b %errorlevel%
