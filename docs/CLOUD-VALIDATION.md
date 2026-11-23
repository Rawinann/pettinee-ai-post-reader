# ผลตรวจรุ่น Cloud MVP — 23 พฤศจิกายน 2026

- `npm.cmd test`: 197 tests ผ่าน รวม reader/local workflow เดิม, PostgreSQL/session/worker/Cloud UI/backup และการแก้ Chrome เปิดค้าง/ติดตามสถานะ
- `npm.cmd run check`: ตรวจ syntax ผ่าน
- `npm.cmd run build:cloud`: ผ่าน ตรวจ import ของ static artifacts ครบ ไม่บรรจุโพสต์/runtime/SQLite/secret/model weights และ function import graph ไม่โหลด SQLite หรือ local ML
- `npm.cmd run build:public`: reader ออนไลน์เดิมยัง build ได้ ไม่เปลี่ยนชุดข้อมูลที่อนุมัติให้เผยแพร่
- หลังปรับ session/settings และปุ่มส่งผ่าน worker ตรวจ Cloud UI และ local UI/PetMommy/public build ซ้ำตามส่วนที่เปลี่ยน ผ่าน
- npm install/audit หลัง pin `sharp` dependency ย่อยที่แก้ช่องโหว่: 0 vulnerabilities ตามผล registry ในรอบนี้ คง Transformers และโมเดลเดิม
- ทดลอง inference จริงกับ Ollama `qwen2.5:7b-instruct` ในเครื่อง โดยใช้ข้อความตัวอย่างแมวสองตัวกินน้ำพอ ๆ กันแต่ก้อนฉี่ต่างกัน ได้คู่มือ cat-polyuria-polydipsia-qa อันดับแรก และ `mode=llm`, prompt `petmommy-v5-peer-education`, ผ่านตัวตรวจข้อความ  ตัวอย่างเดียวไม่ใช่การรับรองคุณภาพทุกโพสต์ ยังต้องให้พี่หมอตรวจสำนวน
- ไม่มีการส่งข้อมูลจริงไป OpenAI ไม่มีการ fine-tune และไม่มีการส่งคอมเมนต์จริงไป Facebook ระหว่างการทดสอบนี้

## สิ่งที่ยังไม่ได้ทดสอบจริง

ยังไม่มี Neon/Vercel project ตามที่ผู้ใช้แจ้ง จึงยังไม่ได้ทดสอบ Neon TLS/pooling หรือ Vercel deployment จริง และยังไม่มี Cloud URL ใหม่ `cloud:test-postgres` ถูก skip เพราะไม่มี `TEST_DATABASE_URL` เตรียมไว้สำหรับทดสอบสอง connection บน branch staging ก่อนเปิด browser publishing

PGlite เป็น PostgreSQL WASM จริงแต่มี backend เดียว ชุดทดสอบใช้ตัวจำลอง pool ที่ serialize connection จึงตรวจ transaction/revision/unique constraints ได้ และไม่ใช่หลักฐานว่าได้ตรวจการแข่งขันสอง backend บน Neon แล้ว

UI ตรวจด้วย DOM + HTTP และตัวจำลอง clipboard/window/publisher ไม่ได้ตรวจภาพใน native browser รอบนี้ การเปิด Chrome/Facebook account B บนเครื่องพี่หมอยังต้องทดสอบภายหลัง ระบบเริ่มต้นเป็นการกดส่งจาก Dashboard แล้วให้ worker ลงคอมเมนต์ ไม่มี auto-reply ตามโพสต์เข้า ทดสอบ UI → HTTP → PostgreSQL queue → worker → หลักฐานคอมเมนต์จำลองครบ โดยไม่ใช้ clipboard หรือเปิดแท็บ Facebook ให้ผู้ดูแล

รอบยืนยันเพิ่มเติม: คิวที่แอดมินกดส่งมาก่อนงานวิเคราะห์ค้าง รายงานผลที่บันทึกแล้วแต่ response หลุดสามารถรายงานซ้ำด้วย lease เดิมได้โดยไม่ส่ง Chrome ซ้ำหรือเพิ่ม audit ซ้ำ ผลที่ต่างจากเดิมถูกปฏิเสธ ทดสอบ Dashboard → HTTP → PostgreSQL → worker จำลอง → HTTP response หลุด → รายงานผลเดิม → แสดงลิงก์คอมเมนต์ครบ

รอบแก้หน้าต่าง worker: พบ local server เดิมรายงาน busy=true ขณะไม่มี Chrome เปิดและไม่มีงานส่ง/ดึงโพสต์ กู้เฉพาะ server ตัวนั้นและเริ่มใหม่ด้วยสิทธิ์เปิด Chrome บน desktop ทดสอบ `/reply-browser/open` และ `/show` จริงแบบอ่านอย่างเดียว ได้ browserOpen=true, busy=false, state=needs_login และ keepOpen=true ทิ้ง Chrome ไว้ให้ผู้ใช้ล็อกอินเอง ไม่ได้ส่งคอมเมนต์จริง ไม่ปิด Chrome ส่วนตัว และไม่ล้าง profile/SQLite

ทดสอบเพิ่มด้วยตัวจำลอง: launch/newPage/navigation ที่ไม่ resolve ต้อง timeout และคืน lock; context ที่มาช้าถูกปิดโดยไม่ล้างหน้าต่างใหม่; แสดงหน้าต่างระหว่างงานไม่เปลี่ยน URL หรือส่งข้อความ; Dashboard ติดตามสถานะและคืนปุ่มหลังเปิดไม่สำเร็จ โดยรักษาร่างที่ยังไม่ได้ส่ง
