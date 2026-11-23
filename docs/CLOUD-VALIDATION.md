# ผลตรวจรุ่น Cloud MVP — 23 พฤศจิกายน 2026

- `npm.cmd test`: 184 tests ผ่าน รวม reader/local workflow เดิม และ PostgreSQL/session/worker/Cloud UI/backup ใหม่
- `npm.cmd run check`: ตรวจ syntax ผ่าน
- `npm.cmd run build:cloud`: ผ่าน ตรวจ import ของ static artifacts ครบ ไม่บรรจุโพสต์/runtime/SQLite/secret/model weights และ function import graph ไม่โหลด SQLite หรือ local ML
- `npm.cmd run build:public`: reader ออนไลน์เดิมยัง build ได้ ไม่เปลี่ยนชุดข้อมูลที่อนุมัติให้เผยแพร่
- หลังปรับ session/settings ตรวจ Cloud UI และ local UI/PetMommy/public build ซ้ำตามส่วนที่เปลี่ยน ผ่าน
- npm install/audit หลัง pin `sharp` dependency ย่อยที่แก้ช่องโหว่: 0 vulnerabilities ตามผล registry ในรอบนี้ คง Transformers และโมเดลเดิม
- ทดลอง inference จริงกับ Ollama `qwen2.5:7b-instruct` ในเครื่อง โดยใช้เคสจำลองหลังทำหมัน ได้ `mode=llm`, prompt `petmommy-v4-conversational`, ผ่านตัวตรวจข้อความ ใช้เวลาประมาณ 10 วินาที ตัวอย่างเดียวไม่ใช่การรับรองคุณภาพทุกโพสต์ ยังต้องให้พี่หมอตรวจสำนวน
- ไม่มีการส่งข้อมูลจริงไป OpenAI ไม่มีการ fine-tune และไม่มีการส่งคอมเมนต์จริงไป Facebook ระหว่างการทดสอบนี้

## สิ่งที่ยังไม่ได้ทดสอบจริง

ยังไม่มี Neon/Vercel project ตามที่ผู้ใช้แจ้ง จึงยังไม่ได้ทดสอบ Neon TLS/pooling หรือ Vercel deployment จริง และยังไม่มี Cloud URL ใหม่ `cloud:test-postgres` ถูก skip เพราะไม่มี `TEST_DATABASE_URL` เตรียมไว้สำหรับทดสอบสอง connection บน branch staging ก่อนเปิด browser publishing

PGlite เป็น PostgreSQL WASM จริงแต่มี backend เดียว ชุดทดสอบใช้ตัวจำลอง pool ที่ serialize connection จึงตรวจ transaction/revision/unique constraints ได้ และไม่ใช่หลักฐานว่าได้ตรวจการแข่งขันสอง backend บน Neon แล้ว

UI ตรวจด้วย DOM + HTTP และตัวจำลอง clipboard/window/publisher ไม่ได้ตรวจภาพใน native browser รอบนี้ การเปิด Chrome/Facebook account B บนเครื่องพี่หมอยังต้องทดสอบภายหลัง ระบบเริ่มต้นเป็นการคัดลอกและเปิดต้นทางเพื่อตอบด้วยมือ
