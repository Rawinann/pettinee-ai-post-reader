# เปิด Pettinee Chrome worker

## พี่หมอใช้งานเว็บ

หลังเพิ่มบัญชีพี่หมอใน `DASHBOARD_USERS_JSON` แล้ว พี่หมอเปิด [Pettinee Dashboard](https://pettinee-ai-post-reader.vercel.app/) และล็อกอินเพื่ออ่านโพสต์ แก้ร่าง และกดส่งได้ ไม่ต้องติดตั้งหรือเปิด worker บนเครื่องพี่หมอ หากเลือก worker บนเครื่องผู้ดูแล คอมเมนต์จะส่งจากบัญชี Facebook ที่เครื่องนั้นล็อกอินไว้

## ผู้ดูแลตั้งค่าเครื่องครั้งแรก

ใช้เครื่อง Windows ที่มี Node.js, Chrome และโค้ดโปรเจกต์นี้ คัดลอก **Connection string ชุดปัจจุบันแบบ pooled** จาก Neon แล้วพิมพ์บรรทัดแรกด้วยมือใน PowerShell เพื่อไม่ให้การคัดลอกคำสั่งทับคลิปบอร์ด:

```powershell
cd C:\intern\pettinee\post_demo
$env:DATABASE_URL=Get-Clipboard
```

จากนั้นคัดลอกคำสั่งต่อไปนี้ ชื่อบัญชี Facebook ต้องตรงกับชื่อที่ Chrome worker แสดง ไม่ใช่อีเมล:

```powershell
$env:PUBLIC_ORIGIN='https://pettinee-ai-post-reader.vercel.app'
$env:CLOUD_WORKER_ID='owner'
$env:CLOUD_WORKER_LABEL='เครื่องของผม'
$env:CLOUD_FACEBOOK_ACCOUNT=Read-Host 'ชื่อบัญชี Facebook ที่ Chrome แสดง'
npm.cmd run cloud:worker-register
```

เมื่อขึ้นว่า `บันทึก worker แล้ว` ให้รัน:

```powershell
Copy-Item data/runtime/cloud-owner.env .env.worker
Remove-Item Env:DATABASE_URL
```

ไฟล์ `.env.worker` มี token เฉพาะเครื่อง เก็บไว้บนเครื่องนี้ ไม่ส่งในแชตหรือขึ้น Git

ดับเบิลคลิก [login-pettinee-worker.cmd](../login-pettinee-worker.cmd) ให้ Chrome เปิดขึ้น แล้วล็อกอิน Facebook ด้วยตัวเอง เมื่อเห็นโพสต์ในกลุ่มแล้วกด `Ctrl+C` ที่หน้าต่างคำสั่ง

## เปิดใช้งานแต่ละวัน

ดับเบิลคลิก [start-pettinee-worker.cmd](../start-pettinee-worker.cmd) แล้วเปิดหน้าต่างคำสั่งค้างไว้ รีเฟรช Dashboard จะเห็นเครื่อง `owner` เป็น **ออนไลน์** หลังจากนั้นจึงกดดึงโพสต์หรือกดส่งคำตอบได้ ปิดหน้าต่างนี้เมื่อหยุดงาน

หาก Facebook ให้ล็อกอินใหม่ ให้ดับเบิลคลิก `login-pettinee-worker.cmd` อีกครั้ง การแก้ค่า worker บนเครื่องไม่ต้อง Redeploy Vercel
