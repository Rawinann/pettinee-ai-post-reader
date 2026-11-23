// DOM + actual HTTP/SQLite/ML integration. Clipboard/dialog are doubles;
// this does not substitute for checking native browser viewport behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {parseHTML} from 'linkedom';
import {createWorkflowUI} from '../lib/workflow-ui.mjs';
import {createAppServer} from '../server.mjs';
import {encoder} from '../guides/encoder.mjs';
import {createPetmommyWriter} from '../server/petmommy.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function waitFor(fn,label){for(let i=0;i<500;i++){if(fn())return;await delay(10);}assert.fail('Timed out: '+label);}
async function boot(t,{backend=true,browserPublisher=null,replyWriter=null}={}){
 const parent=resolve(root,'tmp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'workflow-ui-'));
 const server=backend?createAppServer({workflowOptions:{dbPath:join(dir,'queue.sqlite'),autoRun:false,browserPublisher,replyWriter}}):null;
 if(server)await new Promise(r=>server.listen(0,'127.0.0.1',r));
 // Initialize native ONNX before installing browser globals for the DOM double.
 if(server)await encoder();
 const originalFetch=globalThis.fetch,descriptors=new Map(),writes=[],notices=[],handoffs=[];
 const {document,window}=parseHTML('<html><body><main id="workspace"></main></body></html>');
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');};window.HTMLElement.prototype.focus=function(){};
 window.confirm=()=>true;
 const put=(k,v)=>{descriptors.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});};
 put('document',document);put('window',window);put('navigator',{clipboard:{writeText:async text=>writes.push(text)}});
 put('fetch',(path,options)=>backend?originalFetch('http://127.0.0.1:'+server.address().port+path,options):Promise.resolve(new Response('{"available":false}')));
 let view='dashboard',ui;
 const host={workspace:document.getElementById('workspace'),isActive:()=>true,currentView:()=>view,notify:text=>notices.push(text),prepareQuestion:p=>handoffs.push(p),go:next=>{view=next;return ({dashboard:()=>ui.showDashboard(),inbox:()=>ui.showInbox(),settings:()=>ui.showSettings()})[next]?.();}};
 ui=createWorkflowUI(host);
 t.after(async()=>{ui.stop();if(server){await server.workflow.close();await new Promise(r=>server.close(r));}for(const [key,d]of descriptors)d?Object.defineProperty(globalThis,key,d):delete globalThis[key];if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe cleanup');await rm(dir,{recursive:true,force:true});});
 const click=selector=>{const target=document.querySelector(selector);assert.ok(target,selector);target.dispatchEvent(new window.Event('click',{bubbles:true}));};
 const submit=selector=>document.querySelector(selector).dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 return {ui,host,server,document,window,writes,notices,handoffs,click,submit};
}
test('clean dashboard -> manual add -> editable PetMommy -> one-click Demo with exact edited text',async t=>{
 const b=await boot(t);await b.ui.showDashboard();assert.equal(b.document.querySelector('[data-wf-action="mock"]'),null);assert.equal(b.document.querySelector('#wf-scenario'),null);assert.match(b.document.querySelector('[data-wf-action="receive"]').textContent,/เพิ่มโพสต์เอง/);
 b.click('[data-wf-action="receive"]');b.document.querySelector('#wf-source option[value="import"]').setAttribute('selected','');b.document.getElementById('wf-rights').checked=true;b.document.getElementById('wf-text').value='หลังทำหมันวันที่ 5–6 แผลยังดูบวม';b.submit('#wf-receive-form');await waitFor(()=>b.server.workflow.list().total===1,'manual post received');
 await b.server.workflow.runOnce();await b.host.go('inbox');b.click('[data-wf-post]');await waitFor(()=>b.document.querySelector('#wf-draft')?.value.includes('cat-post-neuter-recovery-care'),'PetMommy draft');b.ui.stop();
 assert.match(b.document.querySelector('.wf-reply h3').textContent,/คำตอบ PetMommy/);for(const id of ['wf-save','wf-ack','wf-approve'])assert.equal(b.document.getElementById(id),null);for(const action of ['copy','manual','publish'])assert.equal(b.document.querySelector('[data-wf-action="'+action+'"]'),null);
 assert.equal(b.document.querySelector('.wf-reply button').disabled,true);assert.equal(b.document.querySelector('[data-comment-action="send-demo"]'),null);assert.doesNotMatch(b.document.querySelector('#wf-detail').textContent,/ทวนสิ่งที่เจ้าของสังเกตไว้ก่อน/);
 b.server.workflow.mock({scenario:'neuter'});await b.server.workflow.runOnce();await b.host.go('inbox');const mock=b.server.workflow.list().posts.find(p=>p.sourceType==='mock');b.click('[data-wf-post="'+mock.id+'"]');await waitFor(()=>b.document.querySelector('[data-comment-action="send-demo"]'),'mock selected');b.ui.stop();
 const draft=b.document.getElementById('wf-draft');draft.value+='\nขอบคุณที่เล่าให้ฟังครับ';draft.dispatchEvent(new b.window.Event('input',{bubbles:true}));const edited=draft.value;assert.equal(b.document.querySelector('[data-comment-action="send-demo"]').disabled,false);
 b.click('[data-comment-action="send-demo"]');await waitFor(()=>b.document.querySelector('#wf-detail').textContent.includes('ทดลองส่ง Demo เวอร์ชัน'),'sent');const p=b.server.workflow.detail(mock.id);assert.equal(p.draft,edited);assert.equal(p.revision,2);assert.equal(p.approvedRevision,2);assert.equal(p.publication,null);assert.equal(p.demoComment.revision,2);assert.equal(b.writes.length,0);assert.ok(p.history.some(h=>h.kind==='draft-edited'));b.click('[data-wf-action="handoff"]');assert.equal(b.handoffs.length,1);
});

test('Inbox receives JSON and existing Excel parser, merges rows and reports duplicates; source HTML stays literal',async t=>{
 const b=await boot(t);await b.ui.showDashboard();b.click('[data-wf-action="receive"]');b.document.getElementById('wf-rights').checked=true;
 b.document.getElementById('wf-json').value=JSON.stringify([{externalId:'ui-import',text:'<img src=x onerror=alert(1)> หลังทำหมันแผลบวม',url:'https://example.org/post'}]);b.submit('#wf-receive-form');await waitFor(()=>b.document.querySelector('#wf-draft'),'import selected');b.ui.stop();
 assert.equal(b.document.querySelector('#wf-detail img'),null);assert.match(b.document.querySelector('#wf-detail .source-text').textContent,/<img/);
 b.click('[data-wf-action="receive"]');b.document.getElementById('wf-rights').checked=true;b.document.getElementById('wf-json').value=JSON.stringify([{externalId:'ui-import',text:'<img src=x onerror=alert(1)> หลังทำหมันแผลบวม',url:'https://example.org/post'}]);b.submit('#wf-receive-form');await waitFor(()=>b.notices.some(n=>/รับใหม่ 0 · ซ้ำ 1/.test(n)),'duplicates shown');
 b.click('[data-wf-action="receive"]');const bytes=await readFile(new URL('./fixtures/import-demo.xlsx',import.meta.url)),input=b.document.getElementById('wf-excel');Object.defineProperty(input,'files',{value:[{size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}]});input.dispatchEvent(new b.window.Event('change',{bubbles:true}));
 await waitFor(()=>b.document.getElementById('wf-map-text'),'Excel columns');assert.match(b.document.getElementById('wf-file-preview').textContent,/รวมได้/);b.document.getElementById('wf-rights').checked=true;b.submit('#wf-receive-form');await waitFor(()=>b.server.workflow.list().total>1,'Excel server ingestion');
});
test('static site reports missing server and unavailable permissions without fabricated connection',async t=>{
 const b=await boot(t,{backend:false});await b.ui.showDashboard();assert.match(b.document.body.textContent,/Inbox ต้องใช้ server/);assert.match(b.document.body.textContent,/ไม่ได้เชื่อม Facebook Group/);assert.equal(b.document.querySelector('[data-wf-action="mock"]'),null);
});

test('manual add recognizes Facebook Group links and deduplicates against the collector identity',async t=>{
 const b=await boot(t);const original=b.server.workflow.ingest({sourceType:'group',authorized:true,externalId:'1067156573375730:123',url:'https://www.facebook.com/groups/1067156573375730/posts/123/',text:'หลังทำหมันแผลบวม'}).post;
 await b.ui.showDashboard();b.click('[data-wf-action="receive"]');b.document.getElementById('wf-rights').checked=true;b.document.getElementById('wf-url').value='https://web.facebook.com/groups/1067156573375730/permalink/123/?ref=share';b.document.getElementById('wf-text').value=original.text;b.submit('#wf-receive-form');
 await waitFor(()=>b.notices.some(n=>/รับใหม่ 0 · ซ้ำ 1/.test(n)),'same collector post');assert.equal(b.server.workflow.list().total,1);await waitFor(()=>b.document.querySelector('#wf-draft'),'inbox ready');b.ui.stop();
 b.click('[data-wf-action="receive"]');b.document.getElementById('wf-rights').checked=true;b.document.getElementById('wf-url').value='https://m.facebook.com/groups/1067156573375730/posts/456/?ref=share';b.document.getElementById('wf-text').value='อยากอ่านข้อมูลหลังทำหมัน';b.submit('#wf-receive-form');await waitFor(()=>b.server.workflow.list().total===2,'new manual group post');const added=b.server.workflow.list().posts.find(p=>p.externalId==='1067156573375730:456');assert.equal(added.sourceType,'group');assert.equal(added.url,'https://www.facebook.com/groups/1067156573375730/posts/456/');await waitFor(()=>b.document.querySelector('.source-text')?.textContent===added.text,'new post selected');b.ui.stop();
});

test('one-click send rejects an unapproved link and preserves the edited text without contacting Chrome',async t=>{
 let prepares=0,sends=0;const browserPublisher={enabled:true,groupId:'1067156573375730',status:()=>({ready:true}),prepare:async()=>{prepares++;},send:async()=>{sends++;},close:async()=>{}};
 const b=await boot(t,{browserPublisher});b.server.workflow.ingest({sourceType:'group',authorized:true,externalId:'1067156573375730:789',url:'https://www.facebook.com/groups/1067156573375730/posts/789/',text:'แผลบวมหลังทำหมัน'});await b.server.workflow.runOnce();await b.host.go('inbox');b.click('[data-wf-post]');await waitFor(()=>b.document.querySelector('#wf-draft'),'draft');b.ui.stop();const field=b.document.getElementById('wf-draft');field.value+='\nhttps://unapproved.example.org/';field.dispatchEvent(new b.window.Event('input',{bubbles:true}));const edited=field.value;
 b.click('[data-comment-action="send-live"]');await waitFor(()=>b.document.querySelector('.wf-warning')&&b.document.querySelector('[data-comment-action="send-live"]')?.disabled===false,'validation shown and send finished');assert.equal(prepares,0);assert.equal(sends,0);assert.equal(b.document.getElementById('wf-draft').value,edited);assert.equal(b.server.workflow.list().posts[0].approvedRevision,null);
});
test('Dashboard worker controls open and close Chrome through HTTP without losing an unsaved draft or sending a comment',async t=>{
 let opened=false,opens=0,closes=0,sends=0;const browserPublisher={enabled:true,groupId:'1067156573375730',status:()=>({browserOpen:opened,state:opened?'needs_login':'closed',ready:false,busy:false,message:opened?'รอล็อกอิน Facebook ใน Chrome ของ worker':'Chrome ยังปิดอยู่'}),refreshStatus:async()=>{},open:async()=>{opened=true;opens++;},disconnect:async()=>{opened=false;closes++;},send:async()=>{sends++;},close:async()=>{}};
 const b=await boot(t,{browserPublisher});b.server.workflow.mock({scenario:'neuter'});await b.server.workflow.runOnce();await b.host.go('inbox');b.click('[data-wf-post]');await waitFor(()=>b.document.querySelector('#wf-draft'),'draft');b.ui.stop();const draft=b.document.querySelector('#wf-draft');draft.value+=' ข้อความยังไม่บันทึก';draft.dispatchEvent(new b.window.Event('input',{bubbles:true}));const unsaved=draft.value;
 b.click('[data-comment-action="browser-open"]');await waitFor(()=>b.document.querySelector('#reply-browser-panel')?.textContent.includes('รอล็อกอิน'),'worker login status');assert.equal(opens,1);assert.equal(b.document.querySelector('#wf-draft').value,unsaved);assert.equal(b.document.querySelector('[data-comment-action="send-demo"]').disabled,false);assert.equal(sends,0);
 b.click('[data-comment-action="browser-close"]');await waitFor(()=>b.document.querySelector('[data-comment-action="browser-close"]')===null,'closed status');assert.equal(closes,1);assert.equal(b.document.querySelector('#wf-draft').value,unsaved);assert.equal(sends,0);
});

test('an opening failure returns the open and send buttons to usable state, and showing Chrome preserves the unsaved reply',async t=>{
 let opened=false,busy=false,release,opens=0,shows=0,sends=0;const gate=new Promise(r=>release=r),publisher={enabled:true,groupId:'1067156573375730',status:()=>({browserOpen:opened,busy,state:opened?'open':busy?'opening':'error',phaseMessage:busy?'กำลังเปิด Chrome…':opened?'Chrome เปิดค้างไว้':'เปิด Chrome ไม่สำเร็จ ลองใหม่ได้'}),refreshStatus:async()=>{},open:async()=>{opens++;if(opens===1){busy=true;await gate;busy=false;throw Object.assign(Error('เปิด Chrome เกินเวลาที่กำหนด'),{statusCode:409});}opened=true;},show:async()=>{shows++;},send:async()=>{sends++;},close:async()=>{}};
 const b=await boot(t,{browserPublisher:publisher});b.server.workflow.ingest({sourceType:'group',authorized:true,externalId:'1067156573375730:456',url:'https://www.facebook.com/groups/1067156573375730/posts/456/',text:'หลังทำหมันแผลบวม อยากอ่านข้อมูลเพิ่มเติม'});await b.server.workflow.runOnce();await b.host.go('inbox');b.click('[data-wf-post]');await waitFor(()=>b.document.querySelector('#wf-draft'),'draft');b.ui.stop();const field=b.document.getElementById('wf-draft');field.value+=' ข้อความที่ยังไม่ส่ง';field.dispatchEvent(new b.window.Event('input',{bubbles:true}));const unsaved=field.value;
 b.click('[data-comment-action="browser-open"]');await waitFor(()=>busy,'opening');assert.equal(b.document.querySelector('[data-comment-action="send-live"]').disabled,true);assert.match(b.document.getElementById('reply-browser-panel').textContent,/กำลังเปิด/);release();await waitFor(()=>b.document.querySelector('[data-comment-action="browser-open"]')?.disabled===false,'retry available');assert.equal(b.document.querySelector('[data-comment-action="send-live"]').disabled,false);assert.equal(b.document.getElementById('wf-draft').value,unsaved);
 b.click('[data-comment-action="browser-open"]');await waitFor(()=>b.document.querySelector('[data-comment-action="browser-show"]'),'visible worker');b.click('[data-comment-action="browser-show"]');await waitFor(()=>shows===1,'focus only');assert.equal(opens,2);assert.equal(sends,0);assert.equal(b.document.getElementById('wf-draft').value,unsaved);
});

test('an already open worker refreshes its visible status on Dashboard without reloading the workspace',async t=>{
 let reads=0;const publisher={enabled:true,groupId:'1067156573375730',status:()=>({browserOpen:true,busy:false,state:'open',phaseMessage:reads>=2?'กำลังตรวจโพสต์ต้นทาง':'Chrome เปิดค้างไว้'}),refreshStatus:async()=>{reads++;},close:async()=>{}};const b=await boot(t,{browserPublisher:publisher});await b.ui.showDashboard();assert.ok(b.document.querySelector('[data-comment-action="browser-show"]'));await waitFor(()=>b.document.getElementById('reply-browser-panel')?.textContent.includes('กำลังตรวจโพสต์ต้นทาง'),'live worker status');assert.ok(reads>=2);
});
test('admin sends Demo from the Dashboard without clipboard and it never counts as published',async t=>{
 const b=await boot(t);b.server.workflow.mock({scenario:'neuter'});await b.server.workflow.runOnce();await b.host.go('inbox');b.click('[data-wf-post]');await waitFor(()=>b.document.querySelector('#wf-draft'),'draft');b.ui.stop();
 assert.equal(b.document.querySelector('.wf-checks'),null);assert.doesNotMatch(b.document.querySelector('#wf-detail').textContent,/ประเด็นที่ต้องตรวจ/);
 assert.equal(b.document.querySelectorAll('.wf-reply button').length,1);
 b.click('[data-comment-action="send-demo"]');await waitFor(()=>b.document.querySelector('#wf-detail').textContent.includes('ทดลองส่ง Demo เวอร์ชัน'),'one-click Demo receipt');assert.equal(b.document.querySelector('#comment-send-dialog'),null);
 const p=b.server.workflow.detail(b.server.workflow.list().posts[0].id);assert.equal(p.status,'approved');assert.equal(p.publication,null);assert.ok(p.demoComment);assert.equal(b.writes.length,0);
});
test('one explicit Dashboard click saves and sends the edited reply through HTTP without a dialog or clipboard; double click cannot duplicate',async t=>{
 let sends=0,sentText;const browserPublisher={enabled:true,groupId:'1067156573375730',status:()=>({ready:true}),prepare:async()=>({url:'https://www.facebook.com/groups/1067156573375730/posts/100/',account:'<img src=x onerror=alert(1)> Admin'}),send:async(post)=>{sends++;sentText=post.draft;return {id:'900',url:'https://www.facebook.com/groups/1067156573375730/posts/100/?comment_id=900'};},close:async()=>{}};
 const b=await boot(t,{browserPublisher});b.server.workflow.ingest({sourceType:'group',authorized:true,externalId:'1067156573375730:100',url:'https://www.facebook.com/groups/1067156573375730/posts/100/',text:'หลังทำหมันแผลบวม อยากอ่านข้อมูลเพิ่มเติม'});await b.server.workflow.runOnce();await b.host.go('inbox');b.click('[data-wf-post]');await waitFor(()=>b.document.querySelector('#wf-draft'),'draft');b.ui.stop();
 const field=b.document.getElementById('wf-draft');field.value+='\nลองอ่านคู่มือนี้ประกอบได้ครับ';field.dispatchEvent(new b.window.Event('input',{bubbles:true}));const expected=field.value;assert.equal(b.document.querySelector('[data-comment-action="send-live"]').disabled,false);assert.equal(sends,0);
 b.click('[data-comment-action="send-live"]');b.click('[data-comment-action="send-live"]');await waitFor(()=>b.document.querySelector('#wf-detail .pill')?.textContent==='ตอบแล้ว','visible receipt rendered');assert.equal(sends,1);assert.equal(sentText,expected);assert.equal(b.writes.length,0);assert.equal(b.document.querySelector('#comment-send-dialog'),null);assert.equal(b.document.querySelector('#wf-detail img'),null);assert.match(b.document.querySelector('#wf-detail').textContent,/<img/);assert.equal(b.server.workflow.detail(b.server.workflow.list().posts[0].id).publication.method,'browser-ui');
});
test('PetMommy API rewrite sends only the admin-reviewed text and invalidates the previous approval',async t=>{
 let calls=0,payload;const replyWriter=createPetmommyWriter({enabled:true,provider:'openai',apiKey:'test-only',fetcher:async(url,options)=>{calls++;payload=JSON.parse(JSON.parse(options.body).input[1].content);return Response.json({output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({hook:'เห็นแผลยังบวม ก็คงกังวลครับ',info:'มีคู่มือหลังทำหมันให้อ่านประกอบครับ'})}]}]});}});
 const b=await boot(t,{replyWriter});b.server.workflow.ingest({sourceType:'import',authorized:true,externalId:'redaction-test',text:'หลังทำหมันแผลยังบวม สอบถามที่ 0812345678'});await b.server.workflow.runOnce();assert.equal(calls,0);await b.host.go('inbox');b.click('[data-wf-post]');await waitFor(()=>b.document.querySelector('#wf-ai-text'),'review input');b.ui.stop();
 const original=b.server.workflow.list().posts[0];b.server.workflow.approve(original.id,{revision:original.revision,acknowledged:true});
 b.click('[data-wf-action="rewrite"]');await waitFor(()=>b.document.getElementById('wf-message').textContent.includes('ตรวจและลบข้อมูล'),'consent gate');assert.equal(calls,0);
 b.document.querySelector('#wf-ai-text').value='หลังทำหมันแผลยังบวม อยากหาข้อมูลเพิ่มเติม';b.document.querySelector('#wf-ai-ack').checked=true;b.click('[data-wf-action="rewrite"]');await waitFor(()=>b.document.querySelector('#wf-draft')?.value.includes('เห็นแผลยังบวม'),'LLM result');
 assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(payload),/0812345678/);const p=b.server.workflow.list().posts[0];assert.equal(p.approvedRevision,null);assert.equal(p.replyMeta.mode,'llm');assert.match(p.text,/0812345678/);assert.equal(b.document.querySelector('[data-comment-action="send-live"]').disabled,true);assert.equal(b.document.querySelector('[data-wf-action="copy"]'),null);
 await b.ui.showDashboard();b.ui.stop();assert.match(b.document.body.textContent,/เข้าเว็บเรา/);assert.match(b.document.body.textContent,/ไปอ่านคู่มือ/);assert.equal(b.document.querySelector('.table-scroll'),null);assert.doesNotMatch(b.document.body.textContent,/แยก bot|แยก Demo/);b.click('[data-wf-action="analytics"]');await waitFor(()=>b.document.querySelector('#wf-analytics-detail'),'detailed analytics');assert.match(b.document.querySelector('#wf-analytics-detail').textContent,/ไม่ใช่คนไม่ซ้ำ/);assert.ok(b.document.querySelector('#wf-analytics-detail table'));
});
