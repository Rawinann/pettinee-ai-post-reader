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
const root=fileURLToPath(new URL('../',import.meta.url));
async function waitFor(fn,label){for(let i=0;i<500;i++){if(fn())return;await delay(10);}assert.fail('Timed out: '+label);}
async function boot(t,{backend=true,browserPublisher=null}={}){
 const parent=resolve(root,'tmp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'workflow-ui-'));
 const server=backend?createAppServer({workflowOptions:{dbPath:join(dir,'queue.sqlite'),autoRun:false,browserPublisher}}):null;
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
test('Dashboard -> real mock ingestion -> Inbox -> edit -> approval -> clipboard -> natural handoff',async t=>{
 const b=await boot(t);await b.ui.showDashboard();assert.match(b.document.body.textContent,/Group: รอช่องทาง/);
 b.document.querySelector('#wf-scenario option').setAttribute('selected','');b.click('[data-wf-action="mock"]');await waitFor(()=>b.server.workflow.list().total===1,'post received');
 await b.server.workflow.runOnce();await b.host.go('inbox');b.click('[data-wf-post]');await waitFor(()=>b.document.querySelector('#wf-draft')?.value?.includes('cat-post-neuter-recovery-care'),'actual guide draft').catch(e=>{assert.fail(e.message+' '+JSON.stringify({post:b.server.workflow.list().posts[0],dom:b.document.body.textContent}));});b.ui.stop();
 assert.equal(b.document.querySelector('[data-wf-action="copy"]').disabled,true);assert.equal(b.document.querySelector('[data-wf-action="publish"]'),null);
 const draft=b.document.querySelector('#wf-draft');draft.value+='\nขอบคุณที่เล่าให้ฟังนะคะ';draft.dispatchEvent(new b.window.Event('input',{bubbles:true}));
 assert.equal(b.document.querySelector('#wf-approve').disabled,true);b.click('[data-wf-action="save"]');await waitFor(()=>b.server.workflow.list().posts[0].revision===2,'saved edit');await waitFor(()=>b.document.querySelector('#wf-approve')?.disabled===false,'refreshed draft');
 b.document.querySelector('#wf-ack').checked=true;b.click('[data-wf-action="approve"]');await waitFor(()=>b.document.querySelector('[data-wf-action="copy"]')?.disabled===false,'approved state').catch(e=>assert.fail(e.message+' '+b.document.getElementById('wf-message').textContent+' / '+JSON.stringify(b.server.workflow.list().posts[0])));
 b.click('[data-wf-action="copy"]');await waitFor(()=>b.writes.length===1,'clipboard');assert.match(b.writes[0],/ขอบคุณที่เล่าให้ฟัง/);assert.equal(b.server.workflow.list().posts[0].status,'approved');
 b.click('[data-wf-action="handoff"]');assert.equal(b.handoffs.length,1);b.click('[data-wf-action="manual"]');await waitFor(()=>b.server.workflow.list({status:'done'}).total===1,'operator confirmed manual reply');await waitFor(()=>b.document.querySelector('#wf-detail .pill')?.textContent==='ตอบแล้ว','publication displayed in Inbox');
 assert.ok(b.server.workflow.detail(b.server.workflow.list().posts[0].id).history.some(h=>h.kind==='draft-edited'));
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
test('admin sends Demo from the Dashboard without clipboard and it never counts as published',async t=>{
 const b=await boot(t);b.server.workflow.mock({scenario:'neuter'});await b.server.workflow.runOnce();await b.host.go('inbox');b.click('[data-wf-post]');await waitFor(()=>b.document.querySelector('#wf-draft'),'draft');b.ui.stop();
 b.document.querySelector('#wf-ack').checked=true;b.click('[data-wf-action="approve"]');await waitFor(()=>b.document.querySelector('[data-comment-action="prepare-demo"]'),'send button');
 b.click('[data-comment-action="prepare-demo"]');await waitFor(()=>b.document.querySelector('#comment-send-dialog[open]'),'Demo preview');assert.equal(b.document.querySelector('#comment-send-text').value,b.server.workflow.list().posts[0].draft);
 b.click('[data-comment-action="confirm"]');await waitFor(()=>b.document.querySelector('#comment-send-message').textContent.includes('กรุณา'),'explicit final confirmation');assert.equal(b.server.workflow.detail(b.server.workflow.list().posts[0].id).demoComment,null);
 b.document.querySelector('#comment-send-ack').checked=true;b.click('[data-comment-action="confirm"]');await waitFor(()=>b.document.querySelector('#wf-detail').textContent.includes('ทดลองส่ง Demo เวอร์ชัน'),'Demo receipt');
 const p=b.server.workflow.detail(b.server.workflow.list().posts[0].id);assert.equal(p.status,'approved');assert.equal(p.publication,null);assert.ok(p.demoComment);assert.equal(b.writes.length,0);
});
test('admin reviews source/account and sends one approved comment through HTTP; untrusted account stays literal',async t=>{
 let sends=0;const browserPublisher={enabled:true,groupId:'1067156573375730',status:()=>({ready:true}),prepare:async()=>({url:'https://www.facebook.com/groups/1067156573375730/posts/100/',account:'<img src=x onerror=alert(1)> Admin'}),send:async()=>{sends++;return {id:'900',url:'https://www.facebook.com/groups/1067156573375730/posts/100/?comment_id=900'};},close:async()=>{}};
 const b=await boot(t,{browserPublisher});b.server.workflow.ingest({sourceType:'group',authorized:true,externalId:'1067156573375730:100',url:'https://www.facebook.com/groups/1067156573375730/posts/100/',text:'หลังทำหมันแผลบวม อยากอ่านข้อมูลเพิ่มเติม'});await b.server.workflow.runOnce();await b.host.go('inbox');b.click('[data-wf-post]');await waitFor(()=>b.document.querySelector('#wf-draft'),'draft');b.ui.stop();
 b.document.querySelector('#wf-ack').checked=true;b.click('[data-wf-action="approve"]');await waitFor(()=>b.document.querySelector('[data-comment-action="prepare-live"]'),'live button');b.click('[data-comment-action="prepare-live"]');await waitFor(()=>b.document.querySelector('#comment-send-dialog[open]'),'live preview');
 assert.equal(sends,0);assert.equal(b.document.querySelector('#comment-send-dialog img'),null);assert.match(b.document.querySelector('#comment-send-dialog').textContent,/<img/);assert.match(b.document.querySelector('#comment-send-dialog a').href,/groups\/1067156573375730\/posts\/100\//);
 b.document.querySelector('#comment-send-ack').checked=true;b.click('[data-comment-action="confirm"]');b.click('[data-comment-action="confirm"]');await waitFor(()=>b.document.querySelector('#wf-detail .pill')?.textContent==='ตอบแล้ว','visible receipt rendered');assert.equal(sends,1);assert.equal(b.writes.length,0);assert.equal(b.server.workflow.detail(b.server.workflow.list().posts[0].id).publication.method,'browser-ui');
});
