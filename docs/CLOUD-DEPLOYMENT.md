# Pettinee Cloud MVP — คู่มือตั้งค่า

รุ่นนี้เตรียมสำหรับทดลองสองคน 3–4 เดือน ยังไม่ได้ deploy ไป Neon/Vercel จริง เพราะยังไม่มีโปรเจกต์ของทีม ใช้ Node.js 22.13+ รุ่น local เดิมยังเปิดได้ด้วย `npm.cmd run replies:ai` ที่พอร์ต 4187

## รูปแบบการทดลอง

แอดมินเพิ่มโพสต์เอง หรือกดดึงโพสต์ → worker อ่านและวิเคราะห์ → Cloud เก็บร่วมกัน → ตรวจและแก้คำตอบ PetMommy → เลือกบัญชี → กด **ส่งคำตอบไปโพสต์ต้นทาง** → Chrome worker ของบัญชีนั้นลงคอมเมนต์ให้ → Dashboard แสดงผลจากหลักฐานคอมเมนต์ ไม่ต้องคัดลอกหรือเปิดโพสต์เอง

คำว่า “กดส่งเอง” หมายถึงคนกดปุ่มใน Dashboard แล้ว worker ส่งให้ ไม่ใช่ auto-reply ตามโพสต์เข้า ทุก job ต้องมีการกดยืนยันส่งข้อความ revision นั้นก่อนเสมอ หาก worker ออฟไลน์งานจะรอในคิว ถ้ายังไม่ได้ล็อกอินหรือพบ checkpoint ให้ผู้ใช้ทำเอง ไม่ข้ามการยืนยันตัวตน

ค่าเริ่มต้นเปิดการส่งแบบกดทีละโพสต์ (CLOUD_BROWSER_PUBLISH_ENABLED=true, CLOUD_WORKER_PUBLISH_ENABLED=true) ตั้ง false ทั้งสองฝั่งได้หากต้องใช้การคัดลอก/เปิดต้นทางเป็นช่องทางสำรอง การเปิดโหมดส่งไม่ได้สร้าง job เองจากโพสต์ใหม่

Vercel ทำเพียง HTTP API และหน้าเว็บ Neon เก็บข้อมูลทีม ส่วน Chrome, Facebook session, ONNX และ Ollama อยู่เครื่องแต่ละคน เมื่อปิด worker ทั้งสอง Dashboard ยังอ่าน แก้ และบันทึกร่างได้ งานวิเคราะห์/ดึงโพสต์รอในคิว

## 1. สร้าง Neon

สร้าง project ที่ [Neon Console](https://console.neon.tech) เลือก region ใกล้ Vercel สร้าง branch สำหรับทดลองแยกจากข้อมูลจริง เลือก connection string แบบ **Pooled** เก็บไว้ใน `.env.cloud` ตาม [ตัวอย่าง](../cloud/dashboard.env.example) ไม่ส่งเข้าแชต ไม่ใส่ใน frontend และไม่ commit

`cloud/db.mjs` ใช้ `pg` สูงสุด 2 connection ต่อ function instance มี connect/statement timeout ไม่มี SQLite หรือ filesystem write บน function ใช้ PostgreSQL owner สำหรับ migration เฉพาะผู้พัฒนา; runtime ใช้ role จำกัดสิทธิ์ตาม SQL ท้ายคู่มือนี้

## 2. เตรียมโปรเจกต์และ schema

```powershell
npm.cmd ci
Copy-Item cloud/dashboard.env.example .env.cloud
# แก้ DATABASE_URL ในไฟล์ด้วยตัวเอง
npm.cmd run cloud:migrate
```

Migration ใช้ transaction และรันซ้ำได้ Schema: [001-shared.sql](../cloud/migrations/001-shared.sql) การติดตั้งไม่อ่านข้อมูล SQLite ของคุณไป Cloud เอง

## 3. สร้างผู้ดูแลสองบัญชี

ไม่ต้องมีระบบสมัครสมาชิก ใช้อีเมลจริงของคุณและพี่หมอเป็น allowlist คนละรหัสผ่าน สร้าง hash บนเครื่องด้วยคำสั่งต่อไปนี้ ตั้ง `PETTINEE_USER_PASSWORD` เป็นรหัสผ่านชั่วคราวใน environment ของ terminal ด้วยตัวเอง ความยาวอย่างน้อย 14 ตัวอักษร อย่าใส่รหัสจริงลงคำสั่งที่แชร์หรือ screenshot

```powershell
$env:PETTINEE_USER_EMAIL = 'your-email@example.com'
# ตั้ง $env:PETTINEE_USER_PASSWORD ใน terminal ส่วนตัวก่อน
npm.cmd run cloud:user
Remove-Item Env:PETTINEE_USER_PASSWORD
```

ทำสองครั้ง เก็บ JSON object ที่ได้ทั้งสองรายการเป็น array ใน `DASHBOARD_USERS_JSON` (ไม่มีรหัสผ่าน plaintext) สร้าง `SESSION_SECRET` แบบสุ่ม 32 bytes ขึ้นไปด้วย `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` เก็บเป็น secret ฝั่ง Vercel เท่านั้น

ใช้ cookie แบบ HttpOnly / Secure / SameSite=Strict อายุ 8 ชั่วโมง ทุก API ตรวจสิทธิ์ทุกครั้ง POST จาก Dashboard ตรวจ Origin ด้วย Login จำกัดจำนวนครั้งใน PostgreSQL ไม่ใช้ CORS เป็นการยืนยันตัวตน ไม่มี forgot-password: เปลี่ยน password hash และ redeploy จะยกเลิก session ของบัญชีนั้น

## 4. เชื่อม Vercel กับ GitHub

เลือก Import Git Repository → `Rawinann/pettinee-ai-post-reader` → Framework **Other** → Node.js **22.x** → Build command `npm run build:cloud` → Output `cloud-dist` ค่า routing/functions อยู่ใน [vercel.json](../vercel.json) ไม่ใช้ `npm start` บน Vercel และไม่ย้าย Chrome ไป function

ตั้ง environment ฝั่ง server: `DATABASE_URL`, `PUBLIC_ORIGIN`, `SESSION_SECRET`, `DASHBOARD_USERS_JSON`, `COLLECTOR_GROUP_ID`, `CLOUD_BROWSER_PUBLISH_ENABLED=true` ใช้ `PUBLIC_ORIGIN` เป็น origin จริง เช่น `https://ชื่อโปรเจกต์.vercel.app` ห้ามมี path/query กำหนด Preview แยกฐาน/secret/origin จาก Production หรือไม่เปิด API ใน Preview

ถ้ายังไม่ทราบ domain ให้สร้าง deployment แรกก่อน หน้า API จะตอบ 503 ว่าตั้งค่าไม่ครบ ไม่มีข้อมูลหลุด หลังทราบ domain ให้ตั้งค่าแล้ว redeploy หน้า login จะทำงานเมื่อ schema และค่าครบ ตรวจผลใน Deployments/Functions ของบัญชีทีม การ build ผ่านในเครื่องยังไม่ใช่การรับรอง deployment จริง

## 5. ย้ายข้อมูล SQLite เดิม

สำรอง SQLite ก่อน และหยุด server/collector เดิมให้จบงานก่อนนำเข้า เลือก Neon branch ที่ยังไม่มีโพสต์ ห้ามทดสอบเพิ่มโพสต์ลง branch นั้นก่อนนำเข้า

```powershell
npm.cmd run cloud:import-sqlite -- data/runtime/workflow.sqlite
```

อ่าน SQLite แบบ read-only ใน consistent transaction ไม่แก้ไฟล์ต้นฉบับ นำเข้าโพสต์ ร่าง revision สถานะ ประวัติ ลิงก์และยอดคลิก พร้อม archive **ทุกแถวของทุกตาราง workflow_** เพื่อไม่ทิ้ง events/jobs/receipt เดิม รัน snapshot เดิมซ้ำจะข้าม ไม่เขียนทับ Cloud ที่คนแก้ต่อแล้ว ถ้าปลายทางมีข้อมูลอื่นจะหยุดแทนการ merge เสี่ยงสูญหาย

Approval เดิมไม่มี worker จึงต้องเลือกผู้ส่งและกดส่งใหม่ งานที่เคยส่งสำเร็จไม่กลับไปคิว งานส่งค้างเดิมเป็น “ยังไม่ทราบผลส่ง” ต้องตรวจต้นทางก่อน ลิงก์เก่าใช้ได้เมื่อชี้โดเมนที่ยังรองรับเส้นทางเดิม ไม่เปลี่ยนลิงก์ที่เคยโพสต์ใน Facebook ให้เอง

นี่เป็นการอัปโหลดข้อมูลเคสจริงไปฐานของทีม ผู้พัฒนาต้องตรวจสิทธิ์และข้อมูลส่วนบุคคลก่อนรัน ไม่ได้อัปโหลดอัตโนมัติจากการติดตั้งโค้ด

## 6. ลงทะเบียน Worker A / B

บนเครื่องผู้พัฒนาที่มี `.env.cloud`:

```powershell
$env:CLOUD_WORKER_ID = 'developer'
$env:CLOUD_WORKER_LABEL = 'เครื่องผู้พัฒนา'
$env:CLOUD_FACEBOOK_ACCOUNT = 'ชื่อบัญชี A ที่ Chrome แสดงจริง'
npm.cmd run cloud:worker-register
```

สร้างอีกเครื่องโดยใช้ ID `doctor`, label `เครื่องพี่หมอ`, ชื่อบัญชี B ระบบสร้าง token สุ่มเฉพาะเครื่อง เก็บเฉพาะ hash ใน Neon เขียน config ให้ใน `data/runtime/cloud-<id>.env` ไม่มี token ใน log ย้ายไฟล์ของแต่ละคนอย่างเป็นส่วนตัว แล้วตั้งชื่อ `.env.worker` บนเครื่องเจ้าของ อย่าส่งไฟล์ A ให้เครื่อง B

คำสั่งไม่เขียนทับ config เก่า ถ้าต้องหมุน token ให้สำรอง/ย้ายไฟล์เก่าออกก่อน แล้วรันใหม่ ID เดิม ตรวจงาน queued เดิมก่อนเปลี่ยนบัญชีที่ผูกไว้

## 7. ตั้งค่าแต่ละเครื่อง

ติดตั้ง Node 22.13+, Git, Chrome และ clone repo เดียวกัน:

```powershell
npm.cmd ci
npm.cmd run guides:download
# แนะนำติดตั้ง Ollama แล้วดาวน์โหลด qwen2.5:7b-instruct
# ถ้าเครื่องไม่ไหว ตั้ง REPLY_LLM_ENABLED=false ยังมีแม่แบบ PetMommy
npm.cmd run cloud:worker -- --login
```

ล็อกอิน Facebook ด้วยตัวเองในหน้าต่าง worker ปิดด้วย Ctrl+C เมื่อเสร็จ จากนั้น:

```powershell
npm.cmd run cloud:worker
# หรือทดสอบรับงานสูงสุดหนึ่งงานแล้วหยุด
npm.cmd run cloud:worker -- --once
```

โปรไฟล์แยกตาม Worker ID อยู่ `data/runtime/cloud-<id>-profile` ไม่ใช้ Chrome ส่วนตัว ไม่อัปโหลด cookies/session/password/OTP ขึ้น Cloud ถ้าเป็นเครื่องเดียวกันให้แต่ละ worker ใช้ ID/profile/outbox คนละชุด ไม่เปิด collector เก่าทับ profile

Worker ใช้ outbound HTTPS เท่านั้น ไม่เปิดพอร์ตรับงานจากอินเทอร์เน็ต รายงาน heartbeat พร้อม claim ทุก 5 วินาที ตั้ง CLOUD_WORKER_POLL_SECONDS เป็น 2–60 ได้ ทำงานทีละ job ทั้งสองคนเห็น last seen/online ใน Dashboard เมื่อไม่ทำงานให้หยุด worker เพื่อลด Neon compute

## 8. ทดลองใช้งานร่วมกัน

1. คุณและพี่หมอล็อกอินคนละบัญชี เปิด Inbox เดียวกัน
2. เพิ่มโพสต์จำลองด้วยตัวเองก่อน หรือเลือก worker แล้วกดดึง 40 โพสต์ โดยใช้แหล่งที่ได้รับอนุญาต
3. Worker ทำ ML/คู่มือ/ร่าง โดยไม่มีการส่งคอมเมนต์ ตรวจว่าร่างและสถานะตรงกันทั้งสองเครื่อง
4. ปิด worker ทั้งสอง ลองแก้ร่าง รอข้อความ **บันทึกร่างแล้ว** ตรวจจากอีกบัญชี ถ้าแก้ชนกันให้โหลดเวอร์ชันใหม่ก่อน ไม่ทับร่างของอีกคน แล้วเปิด worker ของบัญชีที่จะใช้ส่ง
5. ตรวจคำตอบ เลือกบัญชี กด **ส่งคำตอบไปโพสต์ต้นทาง** ครั้งเดียว รอ worker ตรวจบัญชี/โพสต์และส่งให้ ไม่ต้องใช้ clipboard หน้ารายละเอียดติดตามผลส่งและแสดงลิงก์คอมเมนต์เมื่อยืนยันได้
6. ตรวจยอดตอบแล้วและ audit จากอีกเครื่อง กดซ้ำต้องไม่มี job ซ้ำ ถ้าส่งแล้วกลุ่มรออนุมัติ Dashboard จะบอกว่ารอผู้ดูแลกลุ่ม ไม่รับรองว่าเผยแพร่ให้ทุกคนแล้ว
7. กดลิงก์ `/g/<token>` จากคำตอบเพื่อทดสอบหน้าอ่านต่อแบบสาธารณะ ไม่ต้องล็อกอิน ไม่เห็น Dashboard/เคส กดอ่านคู่มือแล้วตรวจตัวเลขเข้าเว็บเรา/ไปอ่านคู่มือ

สถิติเป็นจำนวนครั้งของหน้าอ่านต่อ ไม่ใช่คนไม่ซ้ำ คนที่อ่านจบ หรือยอดเข้าทุกหน้าของเว็บ แยก preview/bot ที่ตรวจพบ และแยกเคส mock จากยอดจริง หากเปิด Vercel Deployment Protection ต้องยกเว้นทางสาธารณะ `/g/*` มิฉะนั้นคนอ่านจะติดหน้าป้องกันของ Vercel

## 9. LLM และการปรับภาษา

[PetMommy v5](../server/petmommy.mjs) เพิ่มตัวอย่างภาษาพูดและข้อความความรู้ที่ตรวจที่มาจากคู่มือเรื่องดื่มน้ำ ไม่สรุปว่าอาการเกิดจากสายพันธุ์ เลิกทวนแบบ quote/แบบฟอร์ม ไม่สมมติความกังวลในโพสต์เลือกของ ไม่แต่งว่าเราเคยเลี้ยง/เคยรักษา ใช้ **ครับ** และไม่ดึงเข้าหมอทุกคำตอบ URL มาจาก server เท่านั้น ไม่ให้โมเดลสร้างลิงก์ มีรายการความรู้ขนาดเล็กที่ตรวจที่มาจากข้อความดัชนีของคู่มือที่ผู้ใช้ระบุ เริ่มเรื่องการดูปริมาณน้ำเทียบกับน้ำหนักตัว ไม่ใช่ระบบอ่านทุกบทความเต็ม และไม่ยกค่าตัวเลขมาเป็นเกณฑ์วินิจฉัยเอง

ค่าเริ่มต้นเป็น Ollama บน worker ไม่มีค่า API เพิ่ม ปิด LLM หรือ provider ล่มจะใช้แม่แบบที่ติด metadata ตามจริง ระบบยังไม่ fine-tune และไม่มีคะแนนยืนยันว่าเหมือนมนุษย์ที่สุด ต้องให้พี่หมอให้คะแนนตัวอย่างจริงและเก็บคู่ input/ฉบับแก้ก่อนพิจารณาเทรน

OpenAI เป็นทางเลือกใน `.env.worker` ไม่บังคับซื้อ key โพสต์ใหม่จะใช้แม่แบบก่อนจนแอดมินกดตัวเลือกเขียนใหม่ ตรวจ/ลบข้อมูลส่วนบุคคล แล้วอนุญาตส่งข้อความและ metadata คู่มือเฉพาะครั้งนั้น คิว rewrite จำกัด 6 ครั้งต่อบัญชีต่อ 10 นาที มี timeout/fallback ไม่ส่งโพสต์ทั้งหมดออก API เอง แก้ร่างหรือเขียนใหม่ยกเลิก approval เดิม

## 10. การทดสอบและ debug

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build:cloud
npm.cmd run build:public
```

ชุด `tests/cloud.test.mjs` ใช้ PostgreSQL จริงแบบ WASM ผ่าน PGlite ครอบคลุม persistence, revision, unique/transaction, worker A/B, lease, unknown result, session, HTTP authorization, migration และ backup/restore PGlite มี backend เดียว จึงต้องทดสอบ lock/concurrency บน pooled Neon staging ด้วย `npm.cmd run cloud:test-postgres` ก่อนเปิด browser publishing จริง โดยตั้ง `TEST_DATABASE_URL` ของ branch สำหรับทดสอบ คำสั่งสร้าง/ลบเฉพาะ schema ทดสอบที่สุ่มขึ้นเอง

ไม่มีการยิงคอมเมนต์ Facebook จริงใน automated tests ไม่มีการ upload runtime DB หรือย้าย cookies ขณะทดสอบ Vercel bundling/Neon TLS/pooling และ Chrome บนเครื่องพี่หมอต้องตรวจจริงหลังสร้างบัญชี

- 503: ตรวจ env/schema/Neon quota ไม่แสดง connection string ในหน้าเว็บ
- 401: เข้าระบบใหม่ / ตรวจ token เครื่อง ไม่ใช้ session cookie แทน worker token
- 409: ร่างเปลี่ยน หรือ lease หมด ห้ามกดส่งซ้ำเพื่อข้ามการตรวจ
- worker offline: เปิด `cloud:worker` บนเครื่องที่เลือก ข้อมูลใน Inbox ไม่หาย
- ผลส่งค้าง: ไฟล์ `data/runtime/cloud-<id>-result.json` เก็บผลที่ยังรายงานไม่สำเร็จ worker จะรายงานผลเดิม ไม่กดส่งซ้ำ ถ้า lease หมดให้หยุดตรวจต้นทางก่อนจัดการไฟล์ ห้ามลบไฟล์เพื่อบังคับส่งใหม่

## 11. สำรองและกู้คืน

```powershell
npm.cmd run cloud:backup
# ใช้ DATABASE_URL ของ Neon branch ใหม่ที่ว่างและ migrate แล้วก่อน restore
npm.cmd run cloud:restore -- data/runtime/cloud-backup-<เวลา>.json
```

Backup เก็บ snapshot ทุกตารางข้อมูลทีม รวม posts/jobs/audit/links/clicks/worker token hashes/legacy archive แบบ repeatable-read ไม่มี DB credential หรือ Facebook session แต่มีข้อมูลเคส จึงต้องเก็บส่วนตัว เข้ารหัสเมื่อส่ง/เก็บนอกเครื่อง และไม่ขึ้น Git Restore ปฏิเสธฐานที่มีข้อมูล ตั้ง worker เป็น offline และให้ lease งานส่งเดิมเข้าสู่การตรวจ แทนการส่งซ้ำ

## 12. สิทธิ์และค่าใช้จ่าย

ก่อนใช้งานจริงตรวจว่าทั้งสองเครื่องใช้บัญชีที่ได้รับอนุญาตกับแหล่งข้อมูล ไม่ข้าม login/checkpoint และไม่ทำระบบหลบการตรวจจับ คงโหมดตอบด้วยมือถ้ายังยืนยันสิทธิ์ browser publishing ไม่ได้ ข้อความสุขภาพยังผ่านข้อจำกัดเดิม ไม่วินิจฉัยหรือสั่งยา

Neon Free ปัจจุบันมี 1 GB และ 100 CU-hours ต่อ project/เดือน ([ราคา Neon](https://neon.com/pricing)) โพสต์ข้อความหลักร้อยใช้พื้นที่ไม่มาก แต่ polling/worker เปิดตลอดทำให้ฐานไม่ sleep จึงไม่ได้รับรองว่าจะอยู่ในโควตาฟรีตลอด 3–4 เดือน

Vercel Hobby ใช้ได้กับงานส่วนตัวหรือไม่ใช่เชิงพาณิชย์ตาม [เงื่อนไข Vercel](https://vercel.com/legal/terms) งานทีมบริษัทต้องตรวจ plan ก่อน แม้ยังไม่เก็บเงินผู้ใช้ Pro ปัจจุบันเริ่ม $20/เดือนและอาจมี usage เพิ่ม ([ราคา Vercel](https://vercel.com/pricing)) ผู้ใช้แอพสองคนไม่เท่ากับซื้อ Vercel developer seat สองที่ ไม่มีการสมัคร plan หรือเรียก API แบบเสียเงินให้จากงานเตรียมโค้ดนี้ Ollama มีค่าเครื่อง/ไฟของแต่ละคน; OpenAI คิดตาม API ถ้าเลือกเปิดเอง

## 13. ส่งจากปุ่ม Dashboard และช่องทางสำรอง

ค่าเริ่มต้นใช้ browser sending หลังแอดมินกดส่ง: Vercel ตั้ง CLOUD_BROWSER_PUBLISH_ENABLED=true, worker ตั้ง CLOUD_WORKER_PUBLISH_ENABLED=true และ worker ที่ลงทะเบียนใหม่มี capability publish ค่าเหล่านี้เปิดเฉพาะตัวส่ง ไม่ได้เปิดการตอบทุกโพสต์อัตโนมัติ ต้องมีสิทธิ์ใช้แหล่งข้อมูลและล็อกอินด้วยตัวเองตามเดิม

หากเคยลงทะเบียน worker จากรุ่นก่อนที่ capability publish=false ให้ provision ใหม่ด้วย ID/บัญชีเดิมและแจก token ใหม่ตามขั้นตอนหมุน token ตรวจงานค้างก่อนทำ ปุ่มไม่ให้เลือก worker ที่ยังไม่เปิด capability ส่ง

หากต้องใช้ช่องทางสำรอง ให้ตั้ง CLOUD_BROWSER_PUBLISH_ENABLED=false, CLOUD_WORKER_PUBLISH_ENABLED=false และใช้ --manual-only ตอนลงทะเบียน เครื่องจะไม่ส่งผ่าน Chrome หน้าจอจะใช้ปุ่มคัดลอกและเปิดต้นทาง พร้อมบันทึกผลโดยผู้ดูแลตามจริง ช่องทางสำรองเปิด Facebook ด้วยบัญชีในเบราว์เซอร์ปัจจุบัน การเลือกผู้รับผิดชอบไม่ได้สลับบัญชีให้

ระบบส่งผ่าน worker ตรวจชื่อบัญชีที่ DOM แสดงเทียบค่าที่ตั้งไว้ และตรวจซ้ำระหว่างส่งด้วย driver เดิม นี่ไม่ใช่การรับรอง Facebook account ID ผ่าน API ถ้ายืนยันบัญชีหรือสิทธิ์ไม่ได้ให้ใช้ช่องทางสำรอง

Job claim ใช้ transaction / row lock / SKIP LOCKED / lease token และ snapshot ที่ผูก revision/account/worker ถ้าผลส่งไม่แน่ชัดจะพักเป็น Needs Verification ไม่ retry อัตโนมัติ การเปลี่ยนผู้ส่งต้องตรวจและกดส่งใหม่ Dashboard แยก “อยู่ในคิว / กำลังส่ง / ส่งแล้ว / ยังไม่ทราบผล” ไม่ใช้การรับเข้าคิวเป็นหลักฐานว่าส่งสำเร็จ

## Runtime database role

ใช้ role แยกจาก owner สำหรับ Vercel ตั้ง password แบบสุ่มนอก Git และ grant เฉพาะตาราง/sequence ใน schema ที่ใช้งาน ตัวอย่างให้รันใน Neon SQL Editor หลัง migration โดยแก้ชื่อ role:

```sql
GRANT USAGE ON SCHEMA public TO pettinee_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pettinee_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pettinee_runtime;
```

โปรเจกต์นี้ยังไม่มี RLS แยกข้อมูลหลายองค์กร ใช้กับทีมเดียวสองคนที่ยืนยันตัวตนแล้ว ห้ามนำไปเปิดเป็น multi-tenant โดยอาศัย schema นี้อย่างเดียว
