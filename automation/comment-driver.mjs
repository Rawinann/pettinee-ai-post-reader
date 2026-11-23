import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
import {workflowError} from '../server/workflow-store.mjs';
import {groupCommentTarget} from '../server/comment-delivery.mjs';
import {inspectReplyPage,visibleCommentReceipts,findCommentSubmit,replyBrowserState} from './comment-dom.mjs';
const normal=value=>String(value||'').normalize('NFC').replace(/\s+/gu,' ').trim();
const fail=(message,definitive=true)=>Object.assign(workflowError(message,409),{definitive});
export function createBrowserCommentPublisher({profileDir,groupId,channel='chrome',verifyTimeoutMs=20000,startupTimeoutMs=15000,pageTimeoutMs=8000,navigationTimeoutMs=20000,inspectionTimeoutMs=5000,contextFactory,clock=Date.now}={}){
 let context,page,busy=false,ready=false,lastCheckedAt=null,closing=false,state='closed',account=null,phase='idle',phaseMessage='ยังไม่เปิด Chrome',lastError='',targetUrl='',lastReceipt=null,operation=null,busySince=null;
 const progress=(value,message)=>{phase=value;phaseMessage=message;lastCheckedAt=new Date(clock()).toISOString();};
 async function bounded(task,ms,message,onLate){let timer,expired=false;const pending=Promise.resolve().then(task);pending.then(value=>{if(expired&&onLate)Promise.resolve(onLate(value)).catch(()=>{});},()=>{});try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(fail(message));},ms);})]);}finally{clearTimeout(timer);}}
 const foreground=async p=>{if(p?.bringToFront)await bounded(()=>p.bringToFront(),2000,'นำ Chrome มาแสดงไม่สำเร็จ').catch(()=>{});};
 const messages={closed:'Chrome ยังปิดอยู่ จะเปิดเมื่อกดส่ง',opening:'กำลังเปิด Chrome',open:'Chrome เปิดอยู่ จะตรวจโพสต์และบัญชีอีกครั้งเมื่อกดส่ง',ready:'ตรวจช่องคอมเมนต์และบัญชีแล้ว พร้อมตรวจซ้ำก่อนส่ง',needs_login:'รอล็อกอิน Facebook ใน Chrome ของ worker',blocked:'รอยืนยันตัวตนใน Chrome ของ worker',wrong_page:'Chrome ไม่ได้อยู่ในกลุ่มที่กำหนด กดเปิด Chrome เพื่อกลับไปหน้ากลุ่ม',waiting_page:'รอหน้า Facebook โหลด',error:'ตรวจ Chrome ไม่สำเร็จ ลองเปิด Chrome อีกครั้ง'};
 const status=()=>({ready,busy,browserOpen:!!context&&!!page&&!page.isClosed(),state,lastCheckedAt,account,phase,phaseMessage,lastError,targetUrl,lastReceipt,operation,busySince,headed:true,keepOpen:true,message:messages[state]||messages.open});
 async function refreshStatus(){
  if(busy)return status();
  if(!context||!page||page.isClosed()){if(state!=='error')state='closed';ready=false;account=null;return status();}
  try{const inspected=await bounded(()=>page.evaluate(replyBrowserState,{groupId}),inspectionTimeoutMs,'ตรวจสถานะ Chrome ใช้เวลานาน กรุณาลองตรวจอีกครั้ง');state=inspected.state;if(state!=='open')ready=false;else if(ready)state='ready';if(!ready)account=null;lastCheckedAt=new Date(clock()).toISOString();if(['needs_login','blocked','waiting_page'].includes(state)){lastError='';progress(state,messages[state]);}else if(state==='open'&&phase==='waiting_page')progress('watching','หน้า Facebook โหลดแล้ว กดส่งเพื่อตรวจโพสต์และบัญชีก่อนส่ง');}catch(error){ready=false;account=null;if(/Execution context was destroyed|Cannot find context with specified id|navigation/i.test(error.message)){state='waiting_page';lastError='';progress('waiting_page',messages.waiting_page);}else{state='error';lastError=error.message;progress('error','ตรวจสถานะ Chrome ไม่สำเร็จ กดเปิด Chrome อีกครั้งได้');}}
  return status();
 }
 async function disconnect(){const old=context;context=null;page=null;state='closed';ready=false;account=null;progress('closed','ปิด Chrome worker แล้ว');if(old)await bounded(()=>old.close(),pageTimeoutMs,'ปิด Chrome ไม่สำเร็จ').catch(()=>{});}
 async function browserPage(){
  if(closing)throw fail('ตัวส่งกำลังปิด');
  if(page&&!page.isClosed())return page;
  state='opening';lastError='';progress('opening','กำลังเปิดหน้าต่าง Chrome worker…');
  if(context)await disconnect();state='opening';
  await bounded(()=>mkdir(profileDir,{recursive:true}),pageTimeoutMs,'เปิดโฟลเดอร์โปรไฟล์ Chrome ไม่สำเร็จ');
  let created;
  try{
   created=await bounded(()=>contextFactory?contextFactory():chromium.launchPersistentContext(profileDir,{channel,headless:false,chromiumSandbox:true,acceptDownloads:false,viewport:null,args:['--start-maximized'],timeout:startupTimeoutMs}),startupTimeoutMs,'เปิด Chrome เกินเวลาที่กำหนด กรุณาลองเปิดใหม่',late=>late.close());
   context=created;created.on?.('close',()=>{if(context===created){context=null;page=null;ready=false;state='closed';account=null;progress('closed','หน้าต่าง Chrome worker ถูกปิด');}});
   page=(created.pages?.()||[]).find(p=>!p.isClosed())||await bounded(()=>created.newPage(),pageTimeoutMs,'สร้างแท็บ Chrome เกินเวลาที่กำหนด');page.setDefaultTimeout?.(10000);await foreground(page);return page;
  }catch(error){if(context===created)context=null;page=null;state='error';ready=false;lastError=error.statusCode?error.message:'เปิด Chrome ไม่สำเร็จ ตรวจ Chrome และโปรไฟล์ worker';progress('error',lastError);if(created)bounded(()=>created.close(),pageTimeoutMs,'ปิด Chrome ไม่สำเร็จ').catch(()=>{});throw fail(lastError);}

 }
 async function inspect(post,target,{navigate=true,allowDraft=false}={}){
  const p=await browserPage();
  targetUrl=target.url;if(navigate){progress('opening-post','กำลังเปิดโพสต์ต้นทางใน Chrome…');await bounded(()=>p.goto(target.url,{waitUntil:'domcontentloaded',timeout:navigationTimeoutMs}),navigationTimeoutMs,'เปิดโพสต์ต้นทางเกินเวลาที่กำหนด');}await foreground(p);progress('checking','กำลังตรวจโพสต์ ช่องคอมเมนต์ และบัญชี Facebook…');
  const args={...target,sourceText:post.text};let result;
  const deadline=clock()+15000;
  do{result=await bounded(()=>p.evaluate(inspectReplyPage,args),inspectionTimeoutMs,'ตรวจโพสต์ใน Chrome เกินเวลาที่กำหนด');if(!['composer_unavailable','waiting_page'].includes(result.state))break;progress(result.state,result.state==='waiting_page'?'กำลังรอให้โพสต์ Facebook โหลดจนเห็นข้อความและช่องคอมเมนต์…':'กำลังรอช่องคอมเมนต์หลักของโพสต์…');await p.waitForTimeout(300);}while(clock()<deadline);
  const errors={blocked:'Chrome อยู่ที่ checkpoint/challenge ให้ยืนยันตัวตนเองก่อน',needs_login:'ต้องล็อกอินใน Chrome โปรไฟล์ worker ก่อน',wrong_post:'หน้าที่เปิดไม่ตรงกับโพสต์ปลายทาง',waiting_page:'หน้าโพสต์ Facebook ยังโหลดไม่เสร็จ กรุณารอสักครู่แล้วลองอีกครั้ง',source_changed:'ข้อความต้นทางที่เห็นไม่ตรงกับข้อมูลที่เก็บไว้ ต้องทบทวนโพสต์อีกครั้งก่อนส่ง',account_unavailable:'พบช่องคอมเมนต์แล้ว แต่ Facebook ไม่แสดงชื่อบัญชีที่ใช้ตอบในช่องนี้ จึงยังไม่กดส่ง',composer_unavailable:'ยังหาช่องคอมเมนต์หลักที่ชัดเจนไม่ได้ อาจปิดคอมเมนต์หรือรูปแบบหน้าเปลี่ยน'};
  if(result.state!=='ready'){ready=false;state=['needs_login','blocked'].includes(result.state)?result.state:'open';progress(result.state,errors[result.state]||'ตรวจหน้าคอมเมนต์ไม่ได้');throw fail(errors[result.state]||'ตรวจหน้าคอมเมนต์ไม่ได้');}
  if(result.existingDraft&&!allowDraft)throw fail('ช่องคอมเมนต์มีข้อความค้างอยู่ กรุณาตรวจใน Chrome ก่อน ระบบจะไม่เขียนทับ');
  ready=true;state='ready';account=result.account;lastCheckedAt=new Date(clock()).toISOString();return {page:p,...result};
 }
 async function exclusive(kind,fn){if(busy)throw fail('Chrome กำลังทำงาน: '+phaseMessage);busy=true;busySince=new Date(clock()).toISOString();operation=kind;lastError='';try{return await fn();}catch(error){lastError=error.statusCode?error.message:'Chrome ทำงานไม่สำเร็จ ตรวจหน้าต่าง worker';if(!['needs_login','blocked'].includes(state))progress('error',lastError);throw error;}finally{busy=false;operation=null;busySince=null;}}
 return {
  enabled:true,
  groupId,
  status,
  refreshStatus,
  async show(){if(!context||!page||page.isClosed())throw fail('ยังไม่มีหน้าต่าง Chrome เปิดอยู่ กดเปิด Chrome ก่อน');await foreground(page);return status();},
  async open(){await exclusive('open',async()=>{const p=await browserPage();try{targetUrl='https://www.facebook.com/groups/'+groupId+'/';progress('opening-group','กำลังเปิดกลุ่มใน Chrome…');await bounded(()=>p.goto(targetUrl,{waitUntil:'domcontentloaded',timeout:navigationTimeoutMs}),navigationTimeoutMs,'เปิดหน้ากลุ่มเกินเวลาที่กำหนด กรุณาลองใหม่');await foreground(p);ready=false;account=null;state='open';progress('watching','Chrome เปิดค้างไว้แล้ว คุณติดตามการทำงานในหน้าต่างนี้ได้');}catch(error){state='error';throw fail(error.statusCode?error.message:'เปิดหน้ากลุ่มไม่สำเร็จ ตรวจ Chrome และการเชื่อมต่อ');}});return refreshStatus();},
  disconnect:()=>exclusive('close',async()=>{await disconnect();return status();}),
  withCollection:task=>exclusive('collect',async()=>{const p=await browserPage();ready=false;account=null;try{targetUrl='https://www.facebook.com/groups/'+groupId+'/';progress('collecting','กำลังดึงโพสต์จากกลุ่มใน Chrome…');await bounded(()=>p.goto(targetUrl,{waitUntil:'domcontentloaded',timeout:navigationTimeoutMs}),navigationTimeoutMs,'เปิดกลุ่มเกินเวลาที่กำหนด');await foreground(p);return await task(p);}finally{ready=false;account=null;state='open';}}),
  prepare:post=>exclusive('prepare',async()=>{const target=groupCommentTarget(post,groupId),state=await inspect(post,target);return {...target,account:state.account};}),
  send:(post,expected)=>exclusive('send',async()=>{
   let attempted=false,composer=null,p=null;
   try{
    const target=groupCommentTarget(post,groupId);if(target.url!==expected.url)throw fail('ลิงก์ปลายทางเปลี่ยนหลังยืนยัน');
    // No navigation here: a changed tab/account after preview must be detected.
    const state=await inspect(post,target,{navigate:false});p=state.page;
    if(normal(state.account)!==normal(expected.account))throw fail('บัญชีที่จะโพสต์เปลี่ยนหลังเปิดหน้าตรวจส่ง ต้องยืนยันใหม่');
    const args={...target,text:post.draft,account:state.account};
    const existing=await p.evaluate(visibleCommentReceipts,args);
    if(existing.length)throw fail('พบคอมเมนต์ข้อความเดียวกันในชื่อบัญชีนี้อยู่แล้ว ต้องตรวจต้นทางก่อนส่งซ้ำ',false);
    composer=p.getByRole('textbox',{name:state.editorLabel,exact:true});if(await composer.count()!==1)throw fail('ช่องคอมเมนต์ไม่ชัดเจน ต้องตรวจหน้าใหม่');
    progress('typing','กำลังกรอกคำตอบที่คุณยืนยันในช่องคอมเมนต์…');await foreground(p);await composer.fill(post.draft);if(normal(await composer.innerText())!==normal(post.draft))throw fail('ข้อความในช่องคอมเมนต์ไม่ตรงกับร่างที่อนุมัติ');
    const checked=await inspect(post,target,{navigate:false,allowDraft:true});if(normal(checked.account)!==normal(expected.account))throw fail('บัญชีเปลี่ยนก่อนส่ง');
    const handle=await composer.evaluateHandle(findCommentSubmit),button=handle.asElement();
    if(!button){await handle.dispose();throw fail('ยังระบุปุ่มส่งคอมเมนต์ที่แน่นอนไม่ได้ ไม่มีการกดส่ง');}
    progress('submitting','กำลังกดส่งคอมเมนต์ที่โพสต์ต้นทาง…');await foreground(p);attempted=true;try{await button.click({timeout:10000});}finally{await handle.dispose();}
    progress('verifying','ส่งคำสั่งแล้ว กำลังตรวจว่ามีคอมเมนต์ปรากฏจริง…');await foreground(p);const deadline=clock()+verifyTimeoutMs;
    do{
     const receipts=await p.evaluate(visibleCommentReceipts,args);
     if(receipts.length===1){lastReceipt={...receipts[0],account:state.account,verifiedAt:new Date(clock()).toISOString()};progress('sent',receipts[0].pendingModeration?'ส่งแล้ว รอผู้ดูแลกลุ่มอนุมัติ':'ตรวจพบคอมเมนต์ที่โพสต์ต้นทางแล้ว');await foreground(p);return receipts[0];}
     if(receipts.length>1)throw fail('พบผลคอมเมนต์มากกว่าหนึ่งรายการ ต้องตรวจต้นทาง',false);
     await p.waitForTimeout(400);
    }while(clock()<deadline);
    throw fail('กดส่งแล้ว แต่ยังยืนยันรหัสคอมเมนต์ที่ปรากฏไม่ได้ ต้องตรวจ Facebook ก่อนส่งอีกครั้ง',false);
   }catch(error){
    if(!attempted&&composer){try{if(normal(await composer.innerText())===normal(post.draft))await composer.fill('');}catch{}}
    if(error.definitive===undefined)error.definitive=!attempted;
    if(!error.statusCode)throw Object.assign(workflowError(attempted?'ยังยืนยันผลส่งไม่ได้ ต้องตรวจ Facebook ก่อนส่งซ้ำ':'เตรียมคอมเมนต์ไม่สำเร็จ ไม่มีการยืนยันส่ง กรุณาตรวจ Chrome แล้วลองใหม่',502),{definitive:error.definitive});
    throw error;
   }
  }),
  async close(){closing=true;await disconnect();},
 };
}
