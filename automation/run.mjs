import {mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';
import {createAppServer} from '../server.mjs';
import {collectorConfig} from './config.mjs';
import {createBrowserReader} from './browser.mjs';
import {createCollectorOutbox,deliverPending} from './outbox.mjs';
import {runBrowserCycle,isNavigationTransition} from './navigation.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const config=collectorConfig(root),loginOnly=process.argv.includes('--login');
const messages={starting:'กำลังเปิด Chrome สำหรับตัวอ่านโพสต์',needs_login:'กรุณาล็อกอินด้วยตัวเองใน Chrome ของ worker',blocked:'พบหน้า checkpoint/challenge กรุณาตรวจด้วยตัวเอง ระบบหยุดรีเฟรช',wrong_page:'แท็บ worker ไม่ได้อยู่ในกลุ่มที่ตั้งค่า หยุดอ่านจนกว่าจะกลับหน้ากลุ่ม',waiting_feed:'กำลังรอรายการโพสต์โหลด หากต้องล็อกอินให้ทำด้วยตัวเอง',no_posts:'ยังอ่านข้อความโพสต์พร้อมลิงก์ไม่ได้ ตรวจหน้าและ selector',selector_changed:'รูปแบบ element ไม่ตรง ต้องตรวจ selector',running:'กำลังอ่านโพสต์ที่หน้าโหลดมา ไม่รับรองว่าเก็บครบทั้งกลุ่ม',error:'ตัวอ่านพบข้อผิดพลาด กรุณาตรวจ Chrome และเริ่มใหม่',stopped:'ตัวอ่านหยุดแล้ว'};
let context,server,outbox,closing=false,closed=false,currentState='starting',lastScanAt=null,lastCaptureAt=null,feedOrder='unverified',lastRefresh=0,changePending=true,lastScan=0;
const update=async(state=currentState)=>{currentState=state;const value={version:1,groupId:config.groupId,state,updatedAt:new Date().toISOString(),lastScanAt,lastCaptureAt,feedOrder,counts:outbox?.stats()||{},message:messages[state]};await mkdir(dirname(config.statusPath),{recursive:true});const temp=config.statusPath+'.tmp';await writeFile(temp,JSON.stringify(value));await rename(temp,config.statusPath);};
let statusWork=Promise.resolve();
const status=state=>{statusWork=statusWork.then(()=>update(state)).catch(()=>{console.error('บันทึกสถานะ worker ไม่สำเร็จ');});return statusWork;};
async function shutdown(){if(closing)return;closing=true;closed=true;if(!loginOnly)await status(currentState==='error'?'error':'stopped');if(context)await context.close().catch(()=>{});if(server){await server.workflow.close();await new Promise(r=>server.close(r));}outbox?.close();}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{closed=true;});

try{
 await mkdir(config.profileDir,{recursive:true});
 if(!loginOnly){
  outbox=createCollectorOutbox(config.outboxPath);
  server=createAppServer({workflowOptions:{dbPath:config.workflowPath,collectorStatusPath:config.statusPath,operatorToken:process.env.OPERATOR_TOKEN||'',ingestToken:process.env.INGEST_TOKEN||'',chatbotUrl:process.env.MEONGSILJANG_URL||'https://meongsiljang.com/th',televetUrl:process.env.TELEVET_URL||''}});
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(config.appPort,'127.0.0.1',()=>{server.off('error',reject);done();});});
  console.log('Pettinee Inbox: http://127.0.0.1:'+config.appPort);
  console.log('อ่านเฉพาะข้อความโพสต์และลิงก์ที่หน้าเว็บโหลดมา ไม่มีการส่งคอมเมนต์');
  await status('starting');
 }
 context=await chromium.launchPersistentContext(config.profileDir,{channel:config.channel,headless:false,viewport:{width:1280,height:900},acceptDownloads:false});
 context.setDefaultTimeout(10000);context.on('close',()=>{closed=true;});
 const page=context.pages()[0]||await context.newPage();
 console.log('เปิดกลุ่ม '+config.groupId+' ด้วยโปรไฟล์ worker แยกจาก Chrome ส่วนตัว');
 console.log('หากต้องล็อกอิน ให้ทำในหน้าต่าง Chrome นี้ด้วยตัวเอง ไม่ส่งรหัสผ่านมาที่แชต');
 if(!loginOnly){
  await page.exposeBinding('__pettineeFeedChanged',()=>{changePending=true;});
  await page.addInitScript(()=>{
   const start=()=>{let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;setTimeout(()=>{pending=false;window.__pettineeFeedChanged?.().catch(()=>{});},2000);}).observe(document.body,{childList:true,subtree:true,characterData:true});};
   if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
  });
  const appPage=await context.newPage();await appPage.goto('http://127.0.0.1:'+config.appPort,{waitUntil:'domcontentloaded'});
 }
 try{await page.goto(config.groupUrl,{waitUntil:'domcontentloaded',timeout:45000});}catch(error){if(!isNavigationTransition(error))throw error;}
 if(!closed)await page.bringToFront();
 if(loginOnly){
  console.log('โหมดเตรียมล็อกอิน: ยังไม่เก็บโพสต์ เมื่อล็อกอินและเปิดกลุ่มได้แล้ว ให้ปิดหน้าต่าง Chrome นี้');
  while(!closed)await delay(500);
 }else{
  const reader=createBrowserReader(page,config);
  let lastHeartbeat=0,lastReported='';
  while(!closed){
   const outcome=await runBrowserCycle(async()=>{
   const now=Date.now(),gate=await reader.gate();
   if(gate!=='ready'){
    if(currentState!==gate)await status(gate);
    // Login/checkpoint/wrong-page states never trigger automated refresh.
    lastRefresh=now;
   }else{
    if(now-lastRefresh>=config.refreshMs&&lastRefresh!==0){await page.reload({waitUntil:'domcontentloaded',timeout:45000});lastRefresh=now;changePending=true;lastScan=0;return;}
    if(!lastRefresh)lastRefresh=now;
    if((changePending&&now-lastScan>=10000)||now-lastScan>=30000){
     if(!lastScan){await reader.preferNewPosts();feedOrder=reader.order();}
     const batch=await reader.scan({scroll:!lastScan});
     const captured=outbox.capture(batch.posts);lastScan=Date.now();lastScanAt=new Date(lastScan).toISOString();changePending=false;
     if(captured.new)lastCaptureAt=lastScanAt;
     const delivery=await deliverPending(outbox,event=>server.workflow.ingest(event));
     const state=batch.selectorError?'selector_changed':batch.posts.length?'running':'no_posts';await status(state);
     const summary=JSON.stringify({new:captured.new,delivered:delivery.delivered,duplicates:delivery.duplicates,counts:outbox.stats(),state});
     if(summary!==lastReported){console.log(new Date().toLocaleTimeString('th-TH')+' '+summary);lastReported=summary;}
    }
   }
   // Recover an outbox interrupted between database ingestion and its receipt.
   if(now-lastHeartbeat>=10000){await deliverPending(outbox,event=>server.workflow.ingest(event));await status();lastHeartbeat=now;}
   },{isClosed:()=>closed||page.isClosed(),onTransition:async()=>{changePending=true;lastRefresh=Date.now();await status('waiting_feed');}});
   if(outcome.kind==='closed'){closed=true;break;}
   await delay(500);
  }
 }
}catch(error){
 if(!closed){console.error(error.code==='EADDRINUSE'?'พอร์ต Inbox ถูกใช้อยู่ ตั้ง COLLECTOR_APP_PORT เป็นพอร์ตอื่น':String(error.message).includes('Executable doesn\'t exist')?'ยังไม่พบ Chrome/Edge ที่ worker ใช้ได้ ตั้ง COLLECTOR_BROWSER_CHANNEL ให้ตรงกับ browser ที่ติดตั้ง':'เริ่ม/อ่านหน้าเว็บไม่สำเร็จ: '+String(error.message).replace(/Bearer\s+\S+/g,'Bearer [redacted]').slice(0,350));await status('error');process.exitCode=1;}
}finally{await shutdown();}
