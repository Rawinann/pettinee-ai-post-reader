@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Pettinee Chrome Worker

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

echo กำลังเชื่อม Chrome worker กับ Pettinee Dashboard...
echo เปิดหน้าต่างนี้ไว้ระหว่างดึงโพสต์หรือส่งคำตอบ
echo ปิดหน้าต่างนี้เพื่อหยุด worker
echo.
npm.cmd run cloud:worker
set "PETTINEE_WORKER_EXIT=%errorlevel%"
echo.
if not "%PETTINEE_WORKER_EXIT%"=="0" (
  echo Worker หยุดพร้อมข้อผิดพลาด ตรวจข้อความด้านบน
) else (
  echo Worker หยุดแล้ว
)
pause
exit /b %PETTINEE_WORKER_EXIT%
