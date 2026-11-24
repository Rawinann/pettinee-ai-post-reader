@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Pettinee Page Facebook Login

if not exist ".env.worker.page" (
  echo ยังไม่ได้ตั้งค่า worker ของเพจ
  echo เปิด docs\WORKER-QUICKSTART-TH.md หัวข้อ worker ของเพจ
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ไม่พบ Node.js บนเครื่องนี้
  pause
  exit /b 1
)

echo Chrome ของ worker เพจจะเปิดขึ้น
echo ล็อกอิน Facebook ด้วยบัญชีที่จัดการเพจ แล้วเลือกตอบในชื่อเพจ
echo ตรวจว่าช่องคอมเมนต์แสดงชื่อเพจที่ตั้งไว้ จากนั้นกด Ctrl+C ที่หน้าต่างนี้
echo.
node --env-file=.env.worker.page cloud/worker.mjs --login

set "PETTINEE_WORKER_EXIT=%errorlevel%"
echo.
if not "%PETTINEE_WORKER_EXIT%"=="0" echo ตรวจข้อความด้านบนหาก Chrome ไม่เปิด
pause
exit /b %PETTINEE_WORKER_EXIT%
