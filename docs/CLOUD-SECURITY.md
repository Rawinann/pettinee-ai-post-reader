# ตรวจรับ Cloud ก่อนเปิดทดลอง

- ตั้งผู้ดูแลเพียงสองอีเมล รหัสผ่านต่างกัน ไม่มีรหัสใน frontend/URL/localStorage
- `SESSION_SECRET`, DB credentials อยู่ Vercel server env; `.env.cloud`/`.env.worker` และ runtime ไม่อยู่ Git
- Dashboard/API ที่มีข้อมูลต้องตอบ 401 เมื่อไม่มี session แม้ส่ง worker token มาก็ตาม
- Worker token A/B ใช้ได้เฉพาะ worker API รับงานของเครื่องอื่นไม่ได้ ชื่อบัญชีที่ตั้งไว้ไม่เปลี่ยนตาม heartbeat
- ทดสอบ POST ต่าง origin ต้อง 403 ไม่อาศัย CORS แทน auth
- ตรวจ Neon/Vercel region, pooled TLS, runtime role และ plan ขององค์กรก่อนใช้จริง
- ก่อน import ตรวจสิทธิ์ข้อมูลและสำรอง SQLite ใช้ branch ใหม่ ไม่ทับข้อมูล Cloud
- ลิงก์ `/g/*` เปิดสาธารณะเฉพาะชื่อคู่มือและปุ่มอ่านต่อ ไม่เปิดข้อมูลเคสหรือ API ผู้ดูแล
- ทดสอบ backup/restore บน branch ทิ้งได้ ก่อนนำข้อมูลจริงเข้า
- ค่าเริ่มต้น `CLOUD_BROWSER_PUBLISH_ENABLED=true` และ `CLOUD_WORKER_PUBLISH_ENABLED=true` ส่งเฉพาะ job ที่เกิดจากแอดมินกดส่ง ไม่มี auto-reply ตามโพสต์เข้า
- ก่อนทดลองส่งจริง ตรวจสิทธิ์แหล่งข้อมูล บัญชีใน Chrome และทดสอบบน Neon สอง connection จริง ใช้ตัวส่งจำลองใน automated tests
- ถ้าผลส่งไม่แน่ชัดให้ตรวจ Facebook และบันทึกผล ห้ามลบ job หรือ journal เพื่อบังคับส่งซ้ำ

ข้อจำกัดที่ต้องรับรู้: ตรวจบัญชีจากชื่อใน DOM ไม่ใช่ Facebook ID, ไม่มี RLS แยกหลายองค์กร, ไม่มี MFA/ลืมรหัส และไม่มีสถิติคนไม่ซ้ำหรืออ่านจบ Worker/AI ยังต้องมีเครื่องออนไลน์ จึงไม่ใช่ cloud inference ตลอด 24 ชั่วโมง
