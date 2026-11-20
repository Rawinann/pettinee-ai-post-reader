import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
import {workflowError} from '../server/workflow-store.mjs';
import {groupCommentTarget} from '../server/comment-delivery.mjs';
import {inspectReplyPage,visibleCommentReceipts,findCommentSubmit} from './comment-dom.mjs';
const normal=value=>String(value||'').normalize('NFC').replace(/\s+/gu,' ').trim();
const fail=(message,definitive=true)=>Object.assign(workflowError(message,409),{definitive});
export function createBrowserCommentPublisher({profileDir,groupId,channel='chrome',verifyTimeoutMs=20000,contextFactory,clock=Date.now}={}){
 let context,page,busy=false,ready=false,lastCheckedAt=null,closing=false;
 async function browserPage(){
  if(closing)throw fail('ตัวส่งกำลังปิด');
  if(page&&!page.isClosed())return page;
  if(context){await context.close().catch(()=>{});context=null;}
  await mkdir(profileDir,{recursive:true});
  try{context=await (contextFactory?contextFactory():chromium.launchPersistentContext(profileDir,{channel,headless:false,chromiumSandbox:true,acceptDownloads:false,viewport:{width:1280,height:900}}));}
  catch{throw fail('เปิด Chrome ของตัวส่งไม่ได้ กรุณาปิด worker ที่ใช้โปรไฟล์เดียวกันก่อน และตรวจ Chrome ที่ติดตั้ง');}
  context.on?.('close',()=>{context=null;page=null;ready=false;});
  page=await context.newPage();page.setDefaultTimeout?.(10000);return page;
 }
 async function inspect(post,target,{navigate=true,allowDraft=false}={}){
  const p=await browserPage();
  if(navigate)await p.goto(target.url,{waitUntil:'domcontentloaded',timeout:45000});
  const args={...target,sourceText:post.text};let result;
  const deadline=clock()+15000;
  do{result=await p.evaluate(inspectReplyPage,args);if(result.state!=='composer_unavailable')break;await p.waitForTimeout(300);}while(clock()<deadline);
  const errors={blocked:'Chrome อยู่ที่ checkpoint/challenge ให้ยืนยันตัวตนเองก่อน',needs_login:'ต้องล็อกอินใน Chrome โปรไฟล์ worker ก่อน',wrong_post:'หน้าที่เปิดไม่ตรงกับโพสต์ปลายทาง',source_changed:'ข้อความต้นทางที่เห็นไม่ตรงกับข้อมูลที่ตรวจไว้ ต้องทบทวนโพสต์อีกครั้ง',composer_unavailable:'ยังหาช่องคอมเมนต์หลักที่ชัดเจนไม่ได้ อาจปิดคอมเมนต์หรือรูปแบบหน้าเปลี่ยน'};
  if(result.state!=='ready'){ready=false;throw fail(errors[result.state]||'ตรวจหน้าคอมเมนต์ไม่ได้');}
  if(result.existingDraft&&!allowDraft)throw fail('ช่องคอมเมนต์มีข้อความค้างอยู่ กรุณาตรวจใน Chrome ก่อน ระบบจะไม่เขียนทับ');
  ready=true;lastCheckedAt=new Date(clock()).toISOString();return {page:p,...result};
 }
 async function exclusive(fn){if(busy)throw fail('กำลังเตรียมหรือส่งโพสต์อื่น กรุณารอผลก่อน');busy=true;try{return await fn();}finally{busy=false;}}
 return {
  enabled:true,
  groupId,
  status:()=>({ready,busy,lastCheckedAt,message:ready?'ตรวจโพสต์และบัญชีใน Chrome แล้ว ต้องยืนยันส่งทีละโพสต์':'เปิดส่งจริงแล้ว รอตรวจโพสต์และบัญชีใน Chrome'}),
  prepare:post=>exclusive(async()=>{const target=groupCommentTarget(post,groupId),state=await inspect(post,target);return {...target,account:state.account};}),
  send:(post,expected)=>exclusive(async()=>{
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
    await composer.fill(post.draft);if(normal(await composer.innerText())!==normal(post.draft))throw fail('ข้อความในช่องคอมเมนต์ไม่ตรงกับร่างที่อนุมัติ');
    const checked=await inspect(post,target,{navigate:false,allowDraft:true});if(normal(checked.account)!==normal(expected.account))throw fail('บัญชีเปลี่ยนก่อนส่ง');
    const handle=await composer.evaluateHandle(findCommentSubmit),button=handle.asElement();
    if(!button){await handle.dispose();throw fail('ยังระบุปุ่มส่งคอมเมนต์ที่แน่นอนไม่ได้ ไม่มีการกดส่ง');}
    attempted=true;try{await button.click({timeout:10000});}finally{await handle.dispose();}
    const deadline=clock()+verifyTimeoutMs;
    do{
     const receipts=await p.evaluate(visibleCommentReceipts,args);
     if(receipts.length===1)return receipts[0];
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
  async close(){closing=true;if(context)await context.close().catch(()=>{});context=null;page=null;ready=false;},
 };
}
