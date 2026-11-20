import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';
import {extractVisiblePosts,sourcePageState} from '../automation/extract.mjs';
import {collectorConfig} from '../automation/config.mjs';
import {createCollectorOutbox,deliverPending} from '../automation/outbox.mjs';
import {createBrowserReader} from '../automation/browser.mjs';
import {createWorkflowService} from '../server/workflow.mjs';
import {createIntentService} from '../server/intent.mjs';
import {createGuideService} from '../server/guides.mjs';
import {readCollectorStatus} from '../server/collector-status.mjs';
import {runBrowserCycle} from '../automation/navigation.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),groupId='1067156573375730';
// Synthetic DOM fixtures, not a claim about Facebook's future element schema.
function fixtureHTML(text='หลังทำหมันวันที่ 5–6 แผลยังดูบวม จึงถามว่าปกติหรือไม่'){
 return `<main><div role="feed"><div role="article"><h3><a href="/user/123">ชื่อเจ้าของที่ไม่ควรเก็บ</a></h3><a href="/groups/${groupId}/posts/100/?tracking=secret">1 ชั่วโมง</a><div data-ad-preview="message">${text}</div><div role="article"><a href="/groups/${groupId}/posts/100/?comment_id=99">คอมเมนต์</a><div data-ad-preview="message">คำสั่งให้ยาในคอมเมนต์ที่ไม่ควรเก็บ</div></div><button>ถูกใจ 9999</button></div></div></main>`;
}
function documentFor(html,url='https://web.facebook.com/groups/'+groupId){const {document}=parseHTML(html);Object.defineProperty(document,'location',{value:{href:url},configurable:true});return document;}
async function temp(t){const parent=resolve(root,'tmp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'collector-test-'));t.after(async()=>{if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe cleanup');await rm(dir,{recursive:true,force:true});});return dir;}
test('DOM extraction keeps post text and canonical permalink, excluding authors, nested comments and other groups',()=>{
 const doc=documentFor(fixtureHTML()+'<article><a href="/groups/999/posts/200/">เวลา</a><div data-ad-preview="message">กลุ่มอื่น</div></article>');
 const result=extractVisiblePosts({groupId},doc);assert.equal(result.posts.length,1);const post=result.posts[0];assert.equal(post.externalId,groupId+':100');assert.equal(post.url,'https://www.facebook.com/groups/'+groupId+'/posts/100/');assert.doesNotMatch(post.text,/เจ้าของ|คอมเมนต์|ถูกใจ|9999/);assert.equal(post.sourceMeta.completeness,'unknown');
});
test('extractor fails visibly on missing body, handles colored headings and marks truncated text',()=>{
 let doc=documentFor(`<article><a href="/groups/${groupId}/posts/100/">เวลา</a><h3><a href="/user/1">ชื่อคน</a></h3><p>ข้อความอื่นที่ไม่ทราบว่าเป็นโพสต์หรือไม่</p></article>`);
 assert.equal(extractVisiblePosts({groupId},doc).posts.length,0);
 doc=documentFor(`<article><a href="/groups/${groupId}/posts/101/">เวลา</a><h2>แมวไม่ยอมกินอาหาร อยากถามข้อมูลเพิ่มเติมค่ะ</h2><button role="button">ดูเพิ่มเติม</button></article>`);
 assert.equal(extractVisiblePosts({groupId},doc).posts[0].sourceMeta.completeness,'partial');assert.equal(extractVisiblePosts({groupId,messageSelector:'['},doc).selectorError,true);
});
test('login, checkpoint and off-source pages pause collection; profile and source configuration stay separate',()=>{
 assert.equal(sourcePageState({groupId},documentFor(fixtureHTML())),'ready');
 assert.equal(sourcePageState({groupId},documentFor('<input type="password">')),'needs_login');
 assert.equal(sourcePageState({groupId},documentFor('','https://www.facebook.com/checkpoint/')),'blocked');
 assert.equal(sourcePageState({groupId},documentFor(fixtureHTML(),'https://www.facebook.com/messages/')),'wrong_page');
 const c=collectorConfig(root,{});assert.equal(c.groupId,groupId);assert.equal(c.appPort,4187);assert.ok(c.profileDir.endsWith('collector-profile'));assert.throws(()=>collectorConfig(root,{COLLECTOR_GROUP_URL:'https://evil.example/groups/123'}));assert.throws(()=>collectorConfig(root,{COLLECTOR_REFRESH_SECONDS:'1'}));
});
test('outbox survives restart, canonicalizes whitespace, retains changed versions and retries after backoff',async t=>{
 const dir=await temp(t),path=join(dir,'outbox.sqlite');let now=1000,box=createCollectorOutbox(path,{clock:()=>now});
 const posts=extractVisiblePosts({groupId},documentFor(fixtureHTML())).posts;
 assert.equal(box.capture(posts).new,1);assert.equal(box.capture([{...posts[0],text:'  '+posts[0].text+'  '}]).seen,1);box.close();box=createCollectorOutbox(path,{clock:()=>now});
 try{assert.equal(box.pending().length,1);await deliverPending(box,async()=>{throw Error('temporary failure');});assert.equal(box.pending().length,0);now+=1001;assert.equal(box.pending().length,1);await deliverPending(box,async()=>({post:{id:'stored'},duplicate:false}));assert.equal(box.stats().delivered,1);assert.equal(box.capture([{...posts[0],text:posts[0].text+' เพิ่มข้อมูล'}]).changed,1);assert.equal(box.pending().length,0);assert.equal(box.stats().changed,1);}finally{box.close();}
});
test('actual collector path: DOM -> durable outbox -> existing SQLite workflow -> original ML -> review, with replay deduplication',async t=>{
 const dir=await temp(t),box=createCollectorOutbox(join(dir,'outbox.sqlite'));
 const service=createWorkflowService({rootDir:root,dbPath:join(dir,'workflow.sqlite'),intent:createIntentService(root),guides:createGuideService(root),autoRun:false});
 try{
  const doc=documentFor(fixtureHTML()),page={evaluate:async(fn,args)=>fn===extractVisiblePosts?fn(args,doc):fn===sourcePageState?fn(args,doc):null,locator:()=>({getByRole:()=>({first:()=>({count:async()=>0})})}),waitForTimeout:async()=>{}};
  const reader=createBrowserReader(page,{groupId,maxPosts:40,maxScrolls:0});const batch=await reader.scan();box.capture(batch.posts);
  // Simulate a lost receipt after the server has accepted the event.
  const event=box.pending()[0].event;service.ingest({...event,authorized:true});const sent=await deliverPending(box,e=>service.ingest(e));assert.equal(sent.duplicates,1);assert.equal(service.list().total,1);await service.runOnce();const post=service.list().posts[0];assert.equal(post.sourceMeta.method,'browser-dom');assert.equal(post.guides[0].id,'cat-post-neuter-recovery-care');assert.ok(post.intent.modelVersion.startsWith('intent-char-tfidf-lr'));assert.ok(post.safety.flags.some(f=>f.code==='browser-source'));assert.equal(post.status,'needs_review');assert.throws(()=>service.copy(post.id,{revision:post.revision}));
 }finally{await service.close();box.close();}
});
test('collector heartbeat expires and never claims an offline worker is connected',async t=>{
 const dir=await temp(t),path=join(dir,'status.json'),now=100000;
 await writeFile(path,JSON.stringify({version:1,groupId,state:'running',updatedAt:new Date(now).toISOString(),counts:{total:3,delivered:2,pending:1}}));
 assert.equal((await readCollectorStatus(path,{clock:()=>now})).active,true);assert.equal((await readCollectorStatus(path,{clock:()=>now+46000})).active,false);assert.equal((await readCollectorStatus(path,{clock:()=>now+46000})).state,'stale');
 await writeFile(path,'{"version":1,"groupId":"bad"}');assert.equal((await readCollectorStatus(path)).available,false);
});
test('a login navigation during DOM evaluation keeps the worker alive and allows the next scan',async()=>{
 let waiting=0,scanned=0;
 const result=await runBrowserCycle(async()=>{throw Error('page.evaluate: Execution context was destroyed, most likely because of a navigation');},{onTransition:async()=>waiting++});
 assert.equal(result.kind,'navigation');assert.equal(waiting,1);
 assert.equal((await runBrowserCycle(async()=>{scanned++;})).kind,'ok');assert.equal(scanned,1);
 assert.equal((await runBrowserCycle(async()=>{throw Error('Target closed');},{isClosed:()=>true})).kind,'closed');
 await assert.rejects(runBrowserCycle(async()=>{throw Error('Database corrupt');}),/Database corrupt/);
});
