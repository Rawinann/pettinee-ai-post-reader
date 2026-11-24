@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Pettinee Page Worker

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

echo กำลังเชื่อม worker ของเพจกับ Pettinee Dashboard...
echo เปิดหน้าต่างนี้ไว้ระหว่างส่งคำตอบในชื่อเพจ
echo ปิดหน้าต่างนี้เพื่อหยุด worker ของเพจ
echo.
node --env-file=.env.worker.page cloud/worker.mjs

set "PETTINEE_WORKER_EXIT=%errorlevel%"
echo.
if not "%PETTINEE_WORKER_EXIT%"=="0" (
  echo Worker ของเพจหยุดพร้อมข้อผิดพลาด ตรวจข้อความด้านบน
) else (
  echo Worker ของเพจหยุดแล้ว
)
pause
exit /b %PETTINEE_WORKER_EXIT%
