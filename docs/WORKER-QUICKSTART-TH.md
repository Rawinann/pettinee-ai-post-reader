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

## เพิ่ม worker ของเพจ Pettinee บนเครื่องเดียวกัน

ช่องคอมเมนต์ที่แสดง “ตอบในชื่อ Pettinee” บอกว่าเลือกตัวตนเพจในหน้าจอนั้นได้ แต่ยังไม่ยืนยันว่ากดส่งสำเร็จ ให้ทดสอบการส่งจริงเฉพาะเมื่อทีมอนุมัติข้อความแล้ว

ลงทะเบียน worker ตัวที่สองครั้งเดียว โดยคัดลอก Neon Connection string แบบ pooled ชุดปัจจุบัน แล้วพิมพ์ `$env:DATABASE_URL=Get-Clipboard` ด้วยมือใน PowerShell เหมือนหัวข้อแรก จากนั้นรัน:

```powershell
cd C:\intern\pettinee\post_demo
$env:PUBLIC_ORIGIN='https://pettinee-ai-post-reader.vercel.app'
$env:CLOUD_WORKER_ID='page'
$env:CLOUD_WORKER_LABEL='เพจ Pettinee'
$env:CLOUD_FACEBOOK_ACCOUNT=Read-Host 'ชื่อเพจเต็มที่ช่องคอมเมนต์ Facebook แสดง'
npm.cmd run cloud:worker-register
```

เมื่อขึ้นว่า `บันทึก worker แล้ว` ให้รัน:

```powershell
Copy-Item data/runtime/cloud-page.env .env.worker.page
Remove-Item Env:DATABASE_URL
```

ไฟล์ `.env.worker.page` มี token ของเพจแยกจาก `.env.worker` เก็บไว้ในเครื่อง ไม่ส่งในแชตหรือขึ้น Git

ดับเบิลคลิก [login-pettinee-page-worker.cmd](../login-pettinee-page-worker.cmd) จะเปิด Chrome โปรไฟล์ใหม่ของ worker `page` ล็อกอินด้วยบัญชีส่วนตัวที่มีสิทธิ์จัดการเพจ แล้วเลือกตัวตนเพจในกลุ่ม ตรวจชื่อเพจที่ช่องคอมเมนต์ให้ตรงกับค่าที่ตั้งไว้ จากนั้นกด `Ctrl+C` ที่หน้าต่างคำสั่ง

เวลาใช้งาน ดับเบิลคลิก [start-pettinee-page-worker.cmd](../start-pettinee-page-worker.cmd) ค้างไว้พร้อมกับ worker ส่วนตัวได้ ทั้งสองใช้ Chrome โปรไฟล์และ token คนละชุด ใน Dashboard ให้เลือก `เพจ Pettinee` ก่อนกดส่ง คำตอบจะไม่สลับบัญชีเอง และจะหยุดหากชื่อบัญชีในช่องคอมเมนต์ไม่ตรงกับ worker ที่เลือก

หากดับเบิลคลิกไม่เปิด ให้เปิด PowerShell ในโฟลเดอร์โปรเจกต์แล้วรัน `\.\login-pettinee-page-worker.cmd` หรือ `\.\start-pettinee-page-worker.cmd` ตามงานที่ต้องการ ไฟล์ `.cmd` ใช้ข้อความ ASCII และรูปแบบบรรทัด Windows เพื่อให้ CMD อ่านได้ถูกต้อง
