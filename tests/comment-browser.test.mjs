import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {inspectReplyPage,selectedCommentAccount,visibleCommentReceipts,findCommentSubmit,replyBrowserState} from '../automation/comment-dom.mjs';
import {createBrowserCommentPublisher} from '../automation/comment-driver.mjs';
const groupId='1067156573375730',postId='100',url=`https://www.facebook.com/groups/${groupId}/posts/${postId}/`;
const post={sourceType:'group',externalId:groupId+':'+postId,url,text:'หลังทำหมันแผลยังบวม อยากทราบข้อมูลเพิ่มเติม',draft:'ลองอ่านคู่มือการดูแลหลังทำหมันเพิ่มเติมค่ะ'};
function fixture({receipt=true,pending=false}={}){
 const {document}=parseHTML('<html><body><main><p id="source"></p><section id="composer"><div role="textbox" contenteditable="true" aria-label="Comment as Test Admin"></div><button aria-label="Post comment"></button></section></main></body></html>');
 document.location={href:url};document.getElementById('source').textContent=post.text;
 const editor=document.querySelector('[role="textbox"]');let now=0,clicks=0,closed=false;
 const addReceipt=({account='Test Admin',id='900',text=post.draft,target=url}={})=>{
  const row=document.createElement('article');row.setAttribute('role','article');row.setAttribute('aria-label','Comment by '+account);const p=document.createElement('p');p.textContent=text;row.append(p);const a=document.createElement('a');a.href=target+'?comment_id='+id;a.textContent='1 min';row.append(a);if(pending)row.append(document.createTextNode(' Pending approval'));document.querySelector('main').append(row);return row;
 };
 const composer={count:async()=>document.querySelectorAll('[role="textbox"]').length,fill:async text=>{editor.textContent=text;},innerText:async()=>editor.textContent,evaluateHandle:async fn=>{
  const button=fn(editor);return {asElement:()=>button?{click:async()=>{clicks++;if(receipt)addReceipt();editor.textContent='';}}:null,dispose:async()=>{}};
 }};
 const page={isClosed:()=>closed,setDefaultTimeout(){},goto:async target=>{document.location.href=target;},evaluate:async(fn,args)=>fn(args,document),getByRole:()=>composer,waitForTimeout:async ms=>{now+=ms;}};
 const context={on(){},newPage:async()=>page,close:async()=>{closed=true;}};
 const publisher=createBrowserCommentPublisher({groupId,profileDir:'tmp/reply-browser-fixture',verifyTimeoutMs:800,contextFactory:async()=>{closed=false;return context;},clock:()=>now});
 return {document,editor,publisher,page,context,addReceipt,clicks:()=>clicks};
}
test('DOM preflight rejects login, wrong target, changed source, multiple composers and reports existing draft',()=>{
 const f=fixture(),args={groupId,postId,sourceText:post.text};assert.equal(inspectReplyPage(args,f.document).state,'ready');
 const hiddenLogin=f.document.createElement('input');hiddenLogin.type='password';hiddenLogin.setAttribute('hidden','');f.document.body.append(hiddenLogin);assert.equal(inspectReplyPage(args,f.document).state,'ready');
 f.editor.textContent='private unsent text';assert.equal(inspectReplyPage(args,f.document).existingDraft,true);
 f.document.getElementById('source').textContent='another post';assert.equal(inspectReplyPage(args,f.document).state,'source_changed');
 f.document.location.href=url.replace('/100/','/101/');assert.equal(inspectReplyPage(args,f.document).state,'wrong_post');
 f.document.location.href='https://www.facebook.com/checkpoint/';assert.equal(inspectReplyPage(args,f.document).state,'blocked');
 f.document.location.href='https://www.facebook.com/login/';assert.equal(inspectReplyPage(args,f.document).state,'needs_login');
 f.document.location.href=url;f.document.getElementById('source').textContent=post.text;f.editor.parentElement.append(f.editor.cloneNode());assert.equal(inspectReplyPage(args,f.document).state,'composer_unavailable');
});
test('post dialog is inspected and an unnamed public composer cannot authorize sending',()=>{
 const {document}=parseHTML('<html><body><div role="dialog"><article role="article"><p id="source"></p></article><div role="textbox" contenteditable="true" aria-label="เขียนความคิดเห็นที่แสดงต่อสาธารณะ..."></div></div></body></html>');
 document.location={href:url};const args={groupId,postId,sourceText:post.text};
 document.getElementById('source').textContent='โพสต์เปลี่ยนข้อความแล้ว';
 assert.equal(inspectReplyPage(args,document).state,'source_changed');
 document.getElementById('source').textContent=post.text;
 assert.equal(inspectReplyPage(args,document).state,'account_unavailable');
 document.querySelector('[role="textbox"]').setAttribute('aria-label','Comment as Test Admin');
 assert.equal(inspectReplyPage(args,document).state,'ready');
 document.querySelector('[role="dialog"]').remove();
 assert.equal(inspectReplyPage(args,document).state,'waiting_page');
});
test('selected profile must be explicit, unique and visible',()=>{
 const {document}=parseHTML('<html><body><div role="dialog"><h2>โปรไฟล์และเพจของคุณ</h2><button aria-label="Test Adminการแจ้งเตือน 4 รายการเลือกไว้ในขณะนี้">Test Admin</button></div></body></html>');
 assert.equal(selectedCommentAccount(undefined,document),'Test Admin');
 const button=document.querySelector('button');button.setAttribute('hidden','');assert.equal(selectedCommentAccount(undefined,document),null);
 button.removeAttribute('hidden');button.parentElement.append(button.cloneNode(true));assert.equal(selectedCommentAccount(undefined,document),null);
});
test('generic reply composer uses the selected profile for read-only preview and rechecks it before mock send',async t=>{
 const f=fixture();t.after(()=>f.publisher.close());f.editor.setAttribute('aria-label','เขียนคำตอบ...');
 const switcher=f.document.createElement('button');switcher.setAttribute('aria-label','เปลี่ยนเป็นโปรไฟล์หรือเพจอื่น');f.editor.parentElement.prepend(switcher);
 const originalGetByRole=f.page.getByRole;
 f.page.getByRole=(role,{name}={})=>{
  if(role==='textbox')return originalGetByRole(role,{name});
  if(role==='button')return {count:async()=>1,click:async()=>{const menu=f.document.createElement('div');menu.setAttribute('role','dialog');menu.innerHTML='<h2>โปรไฟล์และเพจของคุณ</h2><button aria-label="Test Adminเลือกไว้ในขณะนี้">Test Admin</button><button aria-label="ปิด">ปิด</button>';f.document.body.append(menu);}};
  if(role==='dialog')return {waitFor:async()=>{},getByRole:()=>({click:async()=>f.document.querySelector('[role="dialog"]').remove()})};
 };
 const target=await f.publisher.prepare(post);assert.equal(target.account,'Test Admin');assert.equal(f.clicks(),0);
 const sent=await f.publisher.send(post,target);assert.equal(sent.id,'900');assert.equal(f.clicks(),1);
});
test('receipt requires matching message, account, top-level comment ID and exact target; hidden/ambiguous submit is rejected',()=>{
 const f=fixture(),args={groupId,postId,text:post.draft,account:'Test Admin'};
 f.addReceipt({account:'Other Admin'});f.addReceipt({id:'901',text:'Other text'});f.addReceipt({id:'902',target:url.replace('/100/','/101/')});assert.deepEqual(visibleCommentReceipts(args,f.document),[]);
 f.addReceipt();assert.equal(visibleCommentReceipts(args,f.document)[0].id,'900');assert.ok(findCommentSubmit(f.editor));
 f.document.querySelector('button').setAttribute('hidden','');assert.equal(findCommentSubmit(f.editor),null);
 f.document.querySelector('button').removeAttribute('hidden');f.editor.parentElement.append(f.document.querySelector('button').cloneNode());assert.equal(findCommentSubmit(f.editor),null);
});
test('visible proof can be found in a Facebook post dialog',()=>{
 const {document}=parseHTML('<html><body><div role="dialog"><article role="article" aria-label="Comment by Test Admin"><p>Test reply</p><a href="'+url+'?comment_id=900">1 min</a></article></div></body></html>');
 document.location={href:url};
 assert.equal(visibleCommentReceipts({groupId,postId,text:'Test reply',account:'Test Admin'},document)[0].id,'900');
});
test('Facebook link preview still verifies exact visible words, guide destination and comment permalink',()=>{
 const guide='https://pettinee.meongsiljang.com/th/guide/qa/newborn-puppy-kitten-nutrition?utm_source=facebook&utm_content=token123';
 const words='ข้อมูลการดูแลลูกแมวที่ควรอ่านก่อนเลือกอาหารครับ อ่านเพิ่มได้ที่นี่ครับ';
 const {document}=parseHTML('<html><body><div role="dialog"><article role="article" aria-label="ความคิดเห็นจาก Test Admin เมื่อ ไม่กี่วินาทีที่แล้ว"><p>'+words+'</p><a href="https://l.facebook.com/l.php?u='+encodeURIComponent(guide)+'">ลิงก์คู่มือ</a><a href="'+url+'?comment_id=901">เวลาโพสต์</a><div>คู่มือพร้อมภาพพรีวิว</div></article></div></body></html>');
 document.location={href:url};const args={groupId,postId,text:words+'\n'+guide,account:'Test Admin'};
 assert.equal(visibleCommentReceipts(args,document)[0].id,'901');
 assert.deepEqual(visibleCommentReceipts({...args,text:words+'\n'+guide.replace('token123','other')},document),[]);
 assert.deepEqual(visibleCommentReceipts({...args,text:'ข้อความคนละเรื่อง '+words+'\n'+guide},document),[]);
});
test('browser adapter prepares read-only and sends once only after rechecking account and approved draft',async t=>{
 const f=fixture();t.after(()=>f.publisher.close());const target=await f.publisher.prepare(post);assert.equal(f.editor.textContent,'');assert.equal(f.clicks(),0);assert.equal(target.account,'Test Admin');
 const sent=await f.publisher.send(post,target);assert.equal(f.clicks(),1);assert.equal(sent.id,'900');assert.equal(sent.pendingModeration,false);
 await assert.rejects(()=>f.publisher.send(post,target),e=>e.definitive===false);assert.equal(f.clicks(),1);
});
test('browser adapter refuses changed account, changed page, source or a user draft without clicking',async t=>{
 for(const change of [f=>f.editor.setAttribute('aria-label','Comment as Other'),f=>{f.document.location.href=url.replace('/100/','/101/');},f=>{f.document.getElementById('source').textContent='Changed';},f=>{f.editor.textContent='keep my draft';}]){
  const f=fixture();t.after(()=>f.publisher.close());const target=await f.publisher.prepare(post);change(f);await assert.rejects(()=>f.publisher.send(post,target),e=>e.definitive===true);assert.equal(f.clicks(),0);
 }
});
test('missing send button clears only the injected unsent draft; post-click timeout stays uncertain',async t=>{
 const f=fixture();t.after(()=>f.publisher.close());const target=await f.publisher.prepare(post);f.document.querySelector('button').remove();await assert.rejects(()=>f.publisher.send(post,target),e=>e.definitive===true);assert.equal(f.clicks(),0);assert.equal(f.editor.textContent,'');
 const g=fixture({receipt:false});t.after(()=>g.publisher.close());const expected=await g.publisher.prepare(post);await assert.rejects(()=>g.publisher.send(post,expected),e=>e.definitive===false);assert.equal(g.clicks(),1);
});
test('browser adapter reports group moderation independently from visible submission',async t=>{
 const f=fixture({pending:true});t.after(()=>f.publisher.close());const target=await f.publisher.prepare(post);const sent=await f.publisher.send(post,target);assert.equal(sent.pendingModeration,true);assert.equal(f.clicks(),1);
});
test('opening/closing/reopening the worker never fills or submits and status reflects login and checkpoint',async t=>{
 const f=fixture();t.after(()=>f.publisher.close());assert.equal(f.publisher.status().browserOpen,false);const opened=await f.publisher.open();assert.equal(opened.browserOpen,true);assert.equal(opened.state,'open');assert.equal(f.editor.textContent,'');assert.equal(f.clicks(),0);
 f.document.location.href='https://www.facebook.com/login/';assert.equal((await f.publisher.refreshStatus()).state,'needs_login');f.document.location.href='https://www.facebook.com/checkpoint/';assert.equal((await f.publisher.refreshStatus()).state,'blocked');
 await f.publisher.disconnect();assert.equal(f.publisher.status().state,'closed');await f.publisher.open();assert.equal(f.publisher.status().browserOpen,true);assert.equal(f.clicks(),0);
});
test('worker status does not claim the source is connected on a different group or a hidden login form',()=>{
 const f=fixture();f.document.location.href='https://www.facebook.com/groups/999/';assert.equal(replyBrowserState({groupId},f.document).state,'wrong_page');f.document.location.href=url;const hidden=f.document.createElement('input');hidden.type='password';hidden.hidden=true;f.document.body.append(hidden);assert.equal(replyBrowserState({groupId},f.document).state,'open');hidden.hidden=false;assert.equal(replyBrowserState({groupId},f.document).state,'needs_login');
});
test('status reflects Facebook loading instead of retaining a stale error',async t=>{
 const f=fixture();t.after(()=>f.publisher.close());await f.publisher.open();
 f.page.evaluate=async()=>{throw Error('Execution context was destroyed, most likely because of a navigation');};
 assert.equal((await f.publisher.refreshStatus()).state,'waiting_page');
 assert.equal(f.publisher.status().phase,'waiting_page');
 f.page.evaluate=async(fn,args)=>fn(args,{...f.document,querySelector:()=>null,querySelectorAll:()=>[],location:f.document.location});
 assert.equal((await f.publisher.refreshStatus()).state,'waiting_page');
 assert.equal(f.publisher.status().lastError,'');
});
test('collection reuses the worker and excludes sending or closing until it finishes',async t=>{const f=fixture();t.after(()=>f.publisher.close());let release;const gate=new Promise(r=>release=r);const collecting=f.publisher.withCollection(async()=>gate);await Promise.resolve();assert.equal(f.publisher.status().busy,true);await assert.rejects(f.publisher.prepare(post),e=>e.definitive===true);await assert.rejects(f.publisher.disconnect(),e=>e.definitive===true);release();await collecting;assert.equal(f.publisher.status().busy,false);assert.equal(f.publisher.status().browserOpen,true);assert.equal(f.clicks(),0);});

test('a hung Chrome launch times out, releases busy and permits retry; a late context cannot replace the working window',async t=>{
 const f=fixture();let release,attempts=0,lateClosed=0;const publisher=createBrowserCommentPublisher({groupId,profileDir:'tmp/reply-start-timeout',startupTimeoutMs:15,contextFactory:()=>++attempts===1?new Promise(r=>release=r):f.context});t.after(()=>publisher.close());const first=publisher.open();await new Promise(r=>setTimeout(r,2));assert.equal(publisher.status().busy,true);assert.equal((await publisher.refreshStatus()).state,'opening');await assert.rejects(first,/เกินเวลา/);assert.equal(publisher.status().busy,false);assert.equal((await publisher.refreshStatus()).state,'error');await publisher.open();release({close:async()=>lateClosed++});await new Promise(r=>setTimeout(r,0));assert.equal(lateClosed,1);assert.equal(publisher.status().browserOpen,true);assert.equal(publisher.status().busy,false);assert.equal(f.clicks(),0);
});

test('a hung new tab or navigation cannot hold the browser lock indefinitely',async t=>{
 const hung=createBrowserCommentPublisher({groupId,profileDir:'tmp/reply-tab-timeout',pageTimeoutMs:10,contextFactory:async()=>({on(){},newPage:()=>new Promise(()=>{}),close:async()=>{}})});t.after(()=>hung.close());await assert.rejects(hung.open(),/เกินเวลา/);assert.equal(hung.status().busy,false);
 const f=fixture();f.page.goto=()=>new Promise(()=>{});const nav=createBrowserCommentPublisher({groupId,profileDir:'tmp/reply-nav-timeout',navigationTimeoutMs:10,contextFactory:async()=>f.context});t.after(()=>nav.close());await assert.rejects(nav.open(),/เกินเวลา/);assert.equal(nav.status().busy,false);assert.equal(nav.status().browserOpen,true);
});

test('showing the worker while busy only focuses it and never navigates, types or submits',async t=>{
 const f=fixture();t.after(()=>f.publisher.close());let focuses=0,navigations=0,release;f.page.bringToFront=async()=>{focuses++;};const goto=f.page.goto;f.page.goto=async target=>{navigations++;return goto(target);};await f.publisher.open();const collecting=f.publisher.withCollection(async()=>new Promise(r=>release=r));while(!release)await new Promise(r=>setTimeout(r,0));const before=navigations;await f.publisher.show();assert.ok(focuses>=3);assert.equal(navigations,before);assert.equal(f.editor.textContent,'');assert.equal(f.clicks(),0);release();await collecting;assert.equal(f.publisher.status().browserOpen,true);
});

test('visible send stages retain the window and expose a receipt only after a matching comment is found',async t=>{
 const f=fixture();t.after(()=>f.publisher.close());let focuses=0;f.page.bringToFront=async()=>{focuses++;};await f.publisher.open();assert.equal(f.publisher.status().lastReceipt,null);const target=await f.publisher.prepare(post);assert.equal(f.publisher.status().lastReceipt,null);await f.publisher.send(post,target);assert.equal(f.publisher.status().phase,'sent');assert.equal(f.publisher.status().browserOpen,true);assert.equal(f.publisher.status().lastReceipt.id,'900');assert.equal(f.publisher.status().lastReceipt.account,'Test Admin');assert.ok(focuses>=5);assert.equal(f.clicks(),1);
});
