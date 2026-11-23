# ตรวจโค้ดก่อนย้าย Cloud — 23 พฤศจิกายน 2026

บรีฟล่าสุดให้เตรียมโค้ดและคู่มือ ยังไม่มี Neon/Vercel project และยังไม่เปิดส่งคอมเมนต์อัตโนมัติ การตรวจร่างและกดส่งโดยคนยังจำเป็นทุกโพสต์

## ของเดิมที่ใช้ต่อ

- `server.mjs` / `server/workflow.mjs`: HTTP ในเครื่องและ pipeline ใช้ต่อสำหรับ local ไม่ย้าย long-running server ไป Vercel
- `server/workflow-store.mjs`: SQLite transaction, revision และ audit ใช้ต่อใน local; synchronous API เปลี่ยนตรง ๆ เป็น PostgreSQL ไม่ได้
- `server/workflow-http.mjs`: รูปแบบ API ใช้ร่วมกับ Dashboard เดิม แต่ Cloud ตรวจ secure session แทน shared token
- `server/petmommy.mjs`: provider adapter, structured output, fallback, ข้อจำกัดด้านสุขภาพ และการตรวจข้อมูลก่อนส่ง OpenAI ใช้ต่อ
- `automation/comment-driver.mjs` / `automation/config.mjs`: Chrome profile และตรวจโพสต์/บัญชีคงอยู่บนแต่ละเครื่อง ไม่ขึ้น Cloud
- `server/intent.mjs`, `server/guides.mjs`, `lib/workflow-policy.mjs`: ML/semantic matching ใช้ใน local worker; Cloud ตรวจคู่มือกับ catalog ซ้ำ
- `app.mjs`: reader เดิมใช้ต่อ ไม่ย้ายข้อมูลผู้อ่านใน localStorage มาเป็นข้อมูลทีม
- `lib/workflow-ui.mjs`, `lib/comment-ui.mjs`: ใช้ Dashboard/Inbox เดิม เพิ่มเฉพาะ session และเลือก worker
- Excel parser และการป้องกันคำสั่งฝังในโพสต์ใช้ต่อ

## จุดเปลี่ยน

เพิ่ม entry สำหรับ Cloud แยกจาก reader เดิม ข้อมูลทีมอยู่ PostgreSQL เท่านั้น ไม่ใช้ filesystem, timers หรือ memory tickets เป็น persistence บน Vercel งาน ML/Chrome ใช้คิวมี lease ใน PostgreSQL เลือก worker ชัดเจน ไม่มี WebSocket และไม่มี browser ฝั่ง Vercel

Schema ใช้ posts (JSONB เก็บรูปแบบเดิม + คอลัมน์ revision/status/index), jobs, workers, audit, guide links/clicks, login limits และ archive ข้อมูล SQLite เดิมทั้งหมด ไม่สร้าง comments table เปล่าเพราะยังไม่มีข้อมูลคอมเมนต์จริง

ล็อกอินผู้ดูแลสองบัญชีด้วย password hash และ secure HttpOnly session ไม่มีสมัครสมาชิก/ลืมรหัส Worker ใช้ token เฉพาะเครื่องที่เก็บ hash ใน DB แยกจาก session ผู้ดูแล

ปรับตามคำยืนยันล่าสุด: ส่งด้วยการกดปุ่มใน Dashboard แล้ว Chrome worker ลงคอมเมนต์ให้ ค่าเริ่มต้นเปิดตัวส่ง แต่ทุกงานต้องเกิดจากการกดส่งของแอดมิน ไม่ตอบตามโพสต์เข้าเอง ช่องทางคัดลอก/เปิดต้นทางเป็นตัวเลือกสำรองเมื่อปิดตัวส่ง

## ขอบเขตการตรวจรับ

ทดสอบ PostgreSQL ด้วย PGlite (PostgreSQL WASM จริง) และ HTTP/session/worker ด้วยตัวส่งจำลอง ทดสอบ pooled PostgreSQL/Neon จริงเพิ่มหลังมี connection string และ staging project ไม่อ้างว่า deploy, Neon หรือ Facebook ส่งจริงสำเร็จจากการทดสอบจำลอง
