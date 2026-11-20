# Facebook integration — Page และ Group แยกกัน

ตรวจเอกสาร Meta วันที่ 20 พฤศจิกายน 2569 ตัวอย่างเอกสาร API ที่อ่านใช้ `v27.0` ให้ตั้ง `META_GRAPH_VERSION` จาก version ที่แอปใช้งานได้จริง ไม่ถือว่าตั้งค่าตัวแปรแล้วได้ permission/App Review

## สถานะปัจจุบัน

- **Page:** มี adapter เรียก Graph API จริงเมื่อมี credentials, webhook challenge/HMAC, Page scope, queue/dedup และส่ง comments หลังอนุมัติ ทดสอบด้วย fake transport เท่านั้น รอบนี้ไม่มี token/Page ให้ลองส่งจริง
- **Group “ปรึกษาเรื่องแมว by ปอน”:** ไม่เชื่อมอัตโนมัติ มี import/connector boundary ที่ต้องยืนยันสิทธิ์ ไม่ใช้ cookies/session/CAPTCHA bypass/scraper ไม่อ้างว่า Page API อ่าน Group ได้
- **Mock:** สร้าง events จริงลง SQLite ทดสอบส่วนที่เหลือ ไม่มีผลต่อ Facebook

บรีฟระบุว่า Groups API เดิมถูกยกเลิก ลิงก์อ้างอิงคือ [Meta Graph API v19.0 changelog](https://developers.facebook.com/docs/graph-api/changelog/version19.0) แต่การเปิดในรอบนี้ได้ HTTP 429 จึงไม่ได้ยืนยันเนื้อหาหน้านั้นซ้ำ ไม่สร้างโค้ดใช้ Groups API หรืออ้างว่ามีช่องทางใหม่ที่ยืนยันแล้ว

## ตั้ง Page

1. ตั้ง `META_APP_ID`, `META_APP_SECRET`, `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION` ฝั่ง server เท่านั้น Page ID/App ID ต้องเป็นตัวเลข
2. Node ต้องเข้าถึงผ่าน HTTPS และมี authentication ชั้นหน้าเว็บสำหรับผู้ดูแล ตั้ง `PUBLIC_ORIGIN`, `OPERATOR_TOKEN` อย่างน้อย 32 ตัว เส้นทาง `/webhooks/meta` ต้องให้ Meta เรียกได้ ไม่ใส่ operator token แต่ตรวจ signature แทน
3. Callback เป็น `https://your-authorized-host/webhooks/meta` พร้อม verify token เดียวกัน GET ตรวจ `hub.mode`, `hub.verify_token` และคืน challenge
4. สมัคร Page `feed` ให้ **App ID ที่ตั้งไว้** ตามสิทธิ์ที่ Meta อนุมัติ UI ไม่สมัคร/ขอสิทธิ์แทน เอกสาร [Webhooks for Pages](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-pages) ระบุสิทธิ์รวม `pages_manage_metadata`, `pages_show_list` ต้องตรวจ App Review และ Page tasks ด้วย
5. Settings → **ตรวจการเข้าถึงกับ Meta** เรียก `GET /me` ตรวจ Page ID และ `/{page-id}/subscribed_apps` ตรวจ App ID/`feed` สถานะตรวจแล้วหมายถึงสองรายการนี้ ไม่ได้รับรองว่าทุก permission ผ่าน
6. ทดลองอ่าน Page post ID `pageId_postId` ผ่าน `GET /{post-id}?fields=id,message,permalink_url,created_time` ตรวจรหัสและขอบเขต Page ไม่รับ Group/อีก Page
7. เริ่ม `META_PAGE_PUBLISH_ENABLED=false` เมื่อได้รับสิทธิ์จึงเปิด `true` ผู้ดูแลต้องตรวจ/อนุมัติ revision และกดส่งเองทุกโพสต์

การอ่านมีเงื่อนไขตาม [Page/feed reference](https://developers.facebook.com/docs/graph-api/reference/page/feed/) เช่น `pages_read_engagement`, `pages_read_user_content` ตามชนิดข้อมูล การตอบใช้ Page token, task และ `pages_manage_engagement` ตาม [object/comments](https://developers.facebook.com/docs/graph-api/reference/object/comments) โค้ดส่งเพียง `POST /{authorized-page-post-id}/comments` ไม่สร้างโพสต์ใหม่หรือเปิด auto-reply

## Webhook และ idempotency

[Meta getting started](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/) กำหนด HMAC-SHA256 ของ **raw body** ด้วย App Secret เทียบ `X-Hub-Signature-256` โค้ดใช้ timing-safe comparison ก่อน parse ตรวจ object `page`/Page ID และ [Page feed schema](https://developers.facebook.com/docs/graph-api/webhooks/reference/page/) รับเฉพาะ `verb:add`, item post/status/photo/video/link ไม่รับ comment เพื่อกันตอบตัวเอง

ลง SQLite ก่อนตอบ 200 ใช้ key `page-feed-add:{postId}` กัน webhook retry ซ้ำ แล้วดึงข้อความผ่าน Page API ไม่เชื่อ connector ที่ปลอม source Page และไม่ทำตามคำสั่งฝังในโพสต์

Token อยู่ Authorization header ไม่อยู่ URL รหัสคอมเมนต์ที่ Graph ส่งกลับจึงนับ `published` หาก timeout/อ่านผลไม่ได้/server หยุดระหว่างส่ง เป็น `publish_unknown` หลัง lease หมด ต้องตรวจ Facebook ว่าพบ comment ID หรือไม่พบก่อนลองใหม่ ไม่ auto-retry publish ระบบไม่อ้าง exactly-once ข้าม network โดยไม่มี idempotency contract จาก Meta

Group/Import/Mock ใช้คัดลอกหลังอนุมัติ บันทึกการยืนยันตอบเองแยกจากผล API connector ส่ง `POST /api/sources/events` ด้วย `INGEST_TOKEN` + `authorized:true` ซึ่งเป็นคำยืนยันผู้ส่ง ไม่ใช่หลักฐานอนุญาตจาก Meta ต้องตรวจสัญญา/ขอบเขต/ความยินยอมจริงก่อนเปิดใช้

## บริการและกฎสัตวแพทย์

[MeongSilJang ภาษาไทย](https://meongsiljang.com/th) เปิดไปยัง Pettinee ได้ แต่รอบนี้ยังไม่ได้เอกสาร API ที่ MetaPet ยืนยัน จึงไม่สร้าง Chatbot endpoint `MEONGSILJANG_URL`/`TELEVET_URL` เป็น external links ตัด query/hash ไม่เติมเคส ไม่อ้างว่าจองคิวหรือส่งสำเร็จ

กฎปัสสาวะไม่ออกเป็นคำแนะนำให้เข้ารับการตรวจ ไม่วินิจฉัย อ้างอิง [VCA: Urinary tract disease in cats](https://vcahospitals.com/know-your-pet/urinary-tract-disease-in-cats) เรื่องความเร่งด่วนเมื่อเบ่งแล้วไม่มี/มีปัสสาวะน้อย กฎตรวจวลีและข้อความภาษาไทยยังต้องให้ทีมสัตวแพทย์ทบทวนก่อน production ไม่แต่งชื่อผู้อนุมัติหรือใช้ผล AI เป็นหลักฐาน
