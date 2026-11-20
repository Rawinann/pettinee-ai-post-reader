# ตัวอ่านโพสต์อัตโนมัติบนเครื่อง

ตัวอ่านสำหรับกลุ่มที่ผู้ใช้ระบุ: `https://web.facebook.com/groups/1067156573375730` อ่านข้อความจาก element ที่ Chrome แสดง ไม่เรียก Graph/Groups API และไม่ส่งคอมเมนต์ ใช้ Playwright Core กับ Chrome ที่ติดตั้งอยู่แล้ว แล้วส่งข้อมูลเข้าคิว SQLite และโมเดล Intent / MiniLM เดิม

## เปิดใช้งาน

```powershell
npm.cmd ci
npm.cmd run guides:download  # เฉพาะเครื่องที่ยังไม่มีน้ำหนักโมเดล
npm.cmd run automate
```

หรือดับเบิลคลิก `Start-Pettinee-Automation.cmd` ในโฟลเดอร์โปรเจกต์

คำสั่งนี้เปิด Node server บน `http://127.0.0.1:4187` และ Chrome **โปรไฟล์ worker แยก** ถ้าหน้ากลุ่มขอเข้าสู่ระบบ ให้ล็อกอินด้วยตัวเองในหน้าต่างนี้ ไม่มีการขอรหัสผ่านผ่านแชต ไม่มีการคัดลอก cookies หรือโปรไฟล์ Chrome ส่วนตัว หากกลุ่มเปิดอ่านได้แล้ว worker จะเริ่มรับโพสต์เอง เข้าเมนู Inbox เพื่อดูข้อมูล ไม่ต้องคัดลอกแต่ละโพสต์

หากต้องการเตรียมล็อกอินก่อน ใช้ `npm.cmd run automate:login` โหมดนี้ยังไม่เก็บโพสต์ ล็อกอินแล้วปิดหน้าต่าง worker จากนั้นเริ่ม `npm.cmd run automate` ข้อมูล session ยังคงอยู่เฉพาะโปรไฟล์ worker ในเครื่อง ระยะเวลาที่เข้าสู่ระบบได้ขึ้นกับเว็บไซต์ หากมีคำถามยืนยันตัวตนต้องทำด้วยตัวเอง

ใช้ `COLLECTOR_BROWSER_CHANNEL=msedge` ถ้าใช้ Edge ห้ามชี้ `COLLECTOR_PROFILE_DIR` ไปโปรไฟล์ใช้งานส่วนตัวหรือคัดลอก session จากโปรไฟล์อื่น

## วิธีทำงาน

1. เปิดเฉพาะหน้ากลุ่มที่ตั้งค่า ตรวจสถานะ login/checkpoint และรอ feed
2. พยายามเลือก “โพสต์ใหม่ / New posts” ผ่านเมนูบนหน้า และตรวจป้ายหลังเลือก ถ้าเลือกไม่ได้แสดง `feedOrder:unverified` ไม่อ้างว่าได้ทุกโพสต์ล่าสุด
3. อ่านการ์ดโพสต์ที่โหลดมา ใช้ permalink เป็นตัวระบุ กรอง nested comments และลิงก์กลุ่มอื่น อ่านเฉพาะข้อความใน message element หรือ heading ของโพสต์แบบพื้นหลังสี ไม่ fallback เป็นข้อความทั้งการ์ดซึ่งอาจปนชื่อคน คอมเมนต์ และยอดไลก์
4. พยายามขยาย “ดูเพิ่มเติม” เฉพาะใน message ของโพสต์ เลื่อนเพิ่มสูงสุด 3 ช่วง/รอบ จำกัด 40 โพสต์ที่พบ/รอบ ค่าเหล่านี้เปลี่ยนได้
5. บันทึกลง SQLite outbox ก่อนนำเข้า workflow ข้อมูลที่แสดงในหน้าเป็นข้อความปลอดภัย ไม่รันคำสั่งที่ฝังในโพสต์
6. ตรวจ DOM เปลี่ยนเป็นสัญญาณให้อ่านใหม่ โดยจำกัดความถี่ และ refresh ทุก 60 วินาทีเมื่ออยู่หน้ากลุ่มที่อ่านได้
7. รับเฉพาะโพสต์ที่ยังไม่เคยเห็น ข้อความเดิมข้าม ข้อความที่เปลี่ยนเก็บใน outbox เป็น `changed_json` ให้ทีมเปิดต้นทางทบทวน ยังไม่เขียนทับโพสต์/ร่างเดิมอัตโนมัติ
8. เข้า workflow เดิม: Intent → Topic rules → Guide retrieval → safety → draft → human approval ร่าง/การคัดลอกไม่ใช่การส่งคอมเมนต์

การนำเข้ารอบแรกหมายถึง **โพสต์ที่เพิ่งพบโดย worker** อาจเป็นโพสต์เก่า ไม่ใช่การยืนยันว่าเพิ่งเผยแพร่ การเลื่อนแบบมีขอบเขตอาจพลาดโพสต์ระหว่างรอบ จึงไม่รับประกัน completeness ทั้งกลุ่ม โดยเฉพาะช่วงโพสต์ถี่/ฟีดจัดอันดับ/เน็ตหลุด/เครื่องพัก

## สถานะและการหยุด

Settings → “ตัวอ่านโพสต์ผ่าน Chrome” แสดงจำนวนที่เก็บ/เข้า Inbox/รอส่ง/ข้อความเปลี่ยน เวลาตรวจล่าสุด และสถานะ heartbeat ไม่มี heartbeat เกิน 45 วินาทีจะแสดง stale และไม่อ้างว่ากำลังอ่านอยู่

- `running`: อ่านข้อความโพสต์พร้อมลิงก์ได้ในรอบล่าสุด
- `needs_login`: รอผู้ใช้เข้าสู่ระบบ
- `blocked`: พบ checkpoint/challenge หยุด refresh จนผู้ใช้ตรวจเอง ไม่มีการแก้ CAPTCHA หรือหลบข้อจำกัด
- `wrong_page`: แท็บตัวอ่านออกจากหน้ากลุ่ม หยุดอ่านจนกลับหน้ากลุ่มที่ตั้งไว้
- `no_posts` / `selector_changed`: อ่านข้อความพร้อม permalink ไม่ได้ ต้องตรวจหน้า/element อย่าตีความเป็น “ไม่มีโพสต์ใหม่”
- `error` / `stale`: ตรวจ console/Chrome และเริ่มใหม่ตามสาเหตุ

หยุดด้วย Ctrl+C ใน terminal ที่เปิด หรือปิดหน้าต่าง **Chrome ของ worker** ที่มีแท็บ Inbox พอร์ต 4187 และกลุ่มต้นทาง Node server ที่คำสั่งนี้เปิดจะหยุดด้วย ไม่ปิด Chrome ส่วนตัว และข้อมูล SQLite ยังอยู่

## ข้อมูลและการตั้งค่า

| ตำแหน่ง/ตัวแปร | การใช้ |
|---|---|
| `data/runtime/collector-profile/` | โปรไฟล์ browser เฉพาะ worker มีข้อมูล session ต้องเก็บส่วนตัว ไม่เข้า Git |
| `data/runtime/collector.sqlite` | outbox/receipt/ข้อความที่เปลี่ยน ข้าม restart ได้ |
| `data/runtime/collector-status.json` | heartbeat และจำนวน ไม่มีเนื้อหาโพสต์หรือ token |
| `data/runtime/workflow.sqlite` | SQLite ของ Inbox เดิม ใช้ร่วมกับแอป ไม่แยกสำเนาข้อมูล |
| `COLLECTOR_GROUP_URL` | URL หน้ากลุ่ม HTTPS; เริ่มต้นเป็นกลุ่มที่ผู้ใช้ระบุ |
| `COLLECTOR_APP_PORT` | เริ่มต้น 4187 ถ้าชนพอร์ตให้เปลี่ยน |
| `COLLECTOR_REFRESH_SECONDS` | เริ่ม 60 วินาที รองรับ 30–3600 |
| `COLLECTOR_MAX_SCROLLS`, `COLLECTOR_MAX_POSTS` | เริ่มต้น 3 / 40 เป็นขอบเขตการเก็บต่อรอบ ไม่ใช่จำนวนโพสต์ที่ยืนยันว่ามีทั้งหมด |
| `COLLECTOR_MESSAGE_SELECTOR` | เปลี่ยนเฉพาะเมื่อได้ตรวจ DOM จริงหลังเว็บเปลี่ยน ไม่ใช้ selector ทั้ง feed/body |
| `OPERATOR_TOKEN` | ถ้าตั้งไว้ หน้า Inbox ต้องใช้ token นี้ ไม่เกี่ยวกับรหัสผ่าน Facebook |

โพสต์เก็บข้อความ ลิงก์ รหัสภายใน เวลาที่เก็บ และ provenance ไม่เก็บชื่อผู้เขียน โปรไฟล์ ยอดไลก์ รูปภาพ หรือคอมเมนต์ เวลาโพสต์ที่แปลงจาก “เมื่อสักครู่/1 ชั่วโมง” ยังไม่อนุมานเป็นเวลาจริง ข้อความจะมีป้ายว่าเก็บจากหน้าที่โหลดมา/ยังไม่ยืนยันว่าครบและส่งให้คนตรวจ

## Hosting / ความพร้อม

ใช้เครื่องที่เปิด Node กับ Chrome ค้างไว้ได้และไม่ sleep การใช้ desktop Chrome ต้องมี session ผู้ใช้ที่ใช้งานได้ ไม่รับประกันการทำงานหลัง logout หรือ checkpoint เว็บไซต์ static เดิมไม่ได้รัน worker และไม่ได้อัปโหลดโพสต์ที่เก็บใหม่ขึ้นเว็บสาธารณะ การเปิด Inbox ให้เครื่องอื่นใช้ต้องทำ Node hosting/authentication เพิ่ม

Browser automation เป็นวิธีเก็บอัตโนมัติ การที่เปิดอ่านกลุ่มได้ไม่ใช่หลักฐานว่าได้รับสิทธิ์เก็บ/นำข้อมูลไปเผยแพร่ต่อ ควรตรวจขอบเขตที่ได้รับอนุญาตและข้อกำหนดแหล่งข้อมูล [Meta อธิบายเรื่อง automated collection](https://about.fb.com/news/2021/04/how-we-combat-scraping/)

โค้ดใช้ [Playwright persistent context](https://playwright.dev/docs/api/class-browsertype) กับโปรไฟล์แยก ไม่ใช้ default Chrome profile ตามข้อจำกัดของ Chrome [ข้อมูล session ต้องไม่เข้า Git](https://playwright.dev/docs/auth)

## ทดสอบ

`tests/collector.test.mjs` ใช้ DOM จำลองที่ติดป้ายชัด ทดสอบตัดคอมเมนต์/ชื่อ/ยอดไลก์ กรอง source scope, partial text, login/checkpoint, outbox restart/backoff, lost receipt replay dedup และ DOM → SQLite → ML จริง → review ผลทดสอบนี้ไม่ยืนยันว่า selector จะใช้ได้กับทุก account/layout ของ Facebook ต้องดูผล capture จริงใน Inbox ก่อนอ้างว่า worker ดึงจากกลุ่มสำเร็จ

ผลตรวจรอบพัฒนา 20 พฤศจิกายน 2569: `npm.cmd test` ผ่าน 97 รายการ ไม่มี skip และ `npm.cmd run check` ผ่าน เพิ่ม regression กรณีล็อกอินแล้วหน้าเปลี่ยนระหว่าง `evaluate` ให้รอ document ใหม่แทนการปิด Chrome ทดลองเปิด worker จริงได้และรอผู้ใช้ยืนยันตัวตนใน checkpoint ยังไม่อ้างว่าดึงโพสต์จริงสำเร็จจนกว่าจะมี receipt ใน Inbox
