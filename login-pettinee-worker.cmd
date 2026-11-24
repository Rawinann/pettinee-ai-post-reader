@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Pettinee Facebook Login

if not exist ".env.worker" (
  echo ยังไม่ได้ตั้งค่า Chrome worker บนเครื่องนี้
  echo เปิด docs\WORKER-QUICKSTART-TH.md เพื่อทำครั้งแรก
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ไม่พบ Node.js บนเครื่องนี้
  pause
  exit /b 1
)

echo Chrome ของ worker จะเปิดขึ้น ให้ล็อกอิน Facebook ด้วยตัวเอง
echo เมื่อเห็นโพสต์ในกลุ่มแล้ว กด Ctrl+C ที่หน้าต่างนี้
echo.
npm.cmd run cloud:worker -- --login
set "PETTINEE_WORKER_EXIT=%errorlevel%"
echo.
if not "%PETTINEE_WORKER_EXIT%"=="0" echo ตรวจข้อความด้านบนหาก Chrome ไม่เปิด
pause
exit /b %PETTINEE_WORKER_EXIT%
