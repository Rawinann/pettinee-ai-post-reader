import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorkflowStore} from '../server/workflow-store.mjs';
import {createCommentDelivery,groupCommentTarget} from '../server/comment-delivery.mjs';
import {checkReply} from '../lib/workflow-policy.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),groupId='1067156573375730';
const source=(id=100)=>({sourceType:'group',externalId:groupId+':'+id,eventId:'test-'+id,url:'https://www.facebook.com/groups/'+groupId+'/posts/'+id+'/',text:'ข้อความจำลองสำหรับทดสอบส่งคอมเมนต์ '+id,publishedAt:''});
function post(store,id=100){const p=store.ingest(source(id)).post,job=store.claim('test');store.complete(job,{intent:{},topics:{},guides:[],safety:{requiresReview:false},draft:'ขอบคุณที่เล่าให้ฟังนะคะ สามารถเตรียมคำถามไว้คุยกับคลินิกได้ค่ะ',processingMs:1});return store.get(p.id);}
function fixture({publisher=null,clock=Date.now,path=':memory:'}={}){const store=createWorkflowStore(path,{clock});const checkedPost=(id,revision)=>{const p=store.get(id);if(p.revision!==revision)throw Object.assign(Error('stale revision'),{statusCode:409});if(checkReply(p.draft,p).length)throw Error('invalid draft');return p;};const delivery=createCommentDelivery({store,checkedPost,publisher,clock,previewTTL:1000});return {store,delivery,close:async()=>{await delivery.close();store.close();}};}
function fakePublisher(overrides={}){return {enabled:true,groupId,status:()=>({ready:true,message:'fake test transport'}),prepare:async p=>({...groupCommentTarget(p,groupId),account:'บัญชีทดสอบ'}),send:async()=>({id:'comment-777',url:'https://www.facebook.com/groups/'+groupId+'/posts/100/?comment_id=777'}),close:async()=>{},...overrides};}
test('Demo requires approval and confirmation, stores a separate receipt, and never publishes or invokes the browser',async()=>{
 let browserCalls=0;const f=fixture({publisher:fakePublisher({prepare:async()=>{browserCalls++;},send:async()=>{browserCalls++;}})});try{
  const p=post(f.store);await assert.rejects(f.delivery.preview(p.id,{revision:p.revision}),/อนุมัติ/);f.store.approve(p.id,p.revision);
  const preview=await f.delivery.preview(p.id,{revision:p.revision,mode:'demo'});await assert.rejects(f.delivery.send(p.id,{ticketId:preview.ticketId,revision:p.revision}),/ยืนยัน/);
  const sent=await f.delivery.send(p.id,{ticketId:preview.ticketId,revision:p.revision,confirmed:true});assert.equal(sent.published,false);assert.equal(sent.receipt.simulated,true);assert.equal(f.store.get(p.id).status,'approved');assert.equal(f.store.publication(p.id),null);assert.equal(browserCalls,0);
  const again=await f.delivery.preview(p.id,{revision:p.revision});const replay=await f.delivery.send(p.id,{ticketId:again.ticketId,revision:p.revision,confirmed:true});assert.equal(replay.receipt.id,sent.receipt.id);assert.equal(replay.receipt.alreadySimulated,true);assert.equal(f.store.history(p.id).filter(h=>h.kind==='demo-comment-simulated').length,1);
 }finally{await f.close();}
});
test('preview tickets expire and bind the post, revision and exact approved draft',async()=>{
 let now=1000;const f=fixture({clock:()=>now});try{
  let p=post(f.store);f.store.approve(p.id,p.revision);const first=await f.delivery.preview(p.id,{revision:p.revision});now+=1001;
  await assert.rejects(f.delivery.send(p.id,{ticketId:first.ticketId,revision:p.revision,confirmed:true}),/หมดอายุ/);
  const second=await f.delivery.preview(p.id,{revision:p.revision});const other=post(f.store,200);f.store.approve(other.id,other.revision);await assert.rejects(f.delivery.send(other.id,{ticketId:second.ticketId,revision:other.revision,confirmed:true}));
  p=f.store.edit(p.id,p.draft+' ขอบคุณค่ะ',p.revision);f.store.approve(p.id,p.revision);await assert.rejects(f.delivery.send(p.id,{ticketId:second.ticketId,revision:p.revision,confirmed:true}),/ร่างเปลี่ยน/);
 }finally{await f.close();}
});
test('a confirmed live send reserves publication atomically and double clicks cannot submit twice',async()=>{
 let release,calls=0;const gate=new Promise(r=>release=r);const f=fixture({publisher:fakePublisher({send:async()=>{calls++;await gate;return {id:'777'};}})});try{
  const p=post(f.store);f.store.approve(p.id,p.revision);const a=await f.delivery.preview(p.id,{revision:p.revision,mode:'live'}),b=await f.delivery.preview(p.id,{revision:p.revision,mode:'live'});
  const send=f.delivery.send(p.id,{ticketId:a.ticketId,revision:p.revision,confirmed:true});await assert.rejects(f.delivery.send(p.id,{ticketId:a.ticketId,revision:p.revision,confirmed:true}));await assert.rejects(f.delivery.send(p.id,{ticketId:b.ticketId,revision:p.revision,confirmed:true}));assert.equal(calls,1);release();const result=await send;assert.equal(result.published,true);assert.equal(f.store.get(p.id).status,'published');assert.equal(f.store.publication(p.id).method,'browser-ui');assert.equal(f.store.publication(p.id).info.account,'บัญชีทดสอบ');
 }finally{release?.();await f.close();}
});
test('an ambiguous browser result blocks further sends; a definite pre-submit failure allows a fresh confirmation',async()=>{
 for(const definitive of [false,true]){let calls=0;const f=fixture({publisher:fakePublisher({send:async()=>{calls++;throw Object.assign(Error('controlled send failure'),{statusCode:502,definitive});}})});try{
  const p=post(f.store);f.store.approve(p.id,p.revision);const a=await f.delivery.preview(p.id,{revision:p.revision,mode:'live'});await assert.rejects(f.delivery.send(p.id,{ticketId:a.ticketId,revision:p.revision,confirmed:true}));assert.equal(f.store.get(p.id).status,definitive?'approved':'publish_unknown');assert.equal(calls,1);
  if(!definitive)await assert.rejects(f.delivery.preview(p.id,{revision:p.revision,mode:'live'}));else assert.ok((await f.delivery.preview(p.id,{revision:p.revision,mode:'live'})).ticketId);
 }finally{await f.close();}}
});
test('target validation rejects other groups, mismatched IDs, non-group records and credential-bearing URLs',()=>{
 const p=source();assert.equal(groupCommentTarget(p,groupId).postId,'100');
 for(const bad of [{...p,url:'https://evil.example/groups/'+groupId+'/posts/100/'},{...p,url:'https://www.facebook.com/groups/999/posts/100/'},{...p,externalId:groupId+':101'},{...p,sourceType:'mock'},{...p,url:'https://user:secret@www.facebook.com/groups/'+groupId+'/posts/100/'}])assert.throws(()=>groupCommentTarget(bad,groupId));
});
test('closing the worker invalidates prepared tickets and does not submit a comment',async()=>{
 let disconnects=0,sends=0;const f=fixture({publisher:fakePublisher({disconnect:async()=>{disconnects++;},send:async()=>{sends++;return {id:'777'};}})});try{const p=post(f.store);f.store.approve(p.id,p.revision);const ticket=await f.delivery.preview(p.id,{revision:p.revision,mode:'live'});await f.delivery.closeBrowser();assert.equal(disconnects,1);await assert.rejects(f.delivery.send(p.id,{ticketId:ticket.ticketId,revision:p.revision,confirmed:true}),/หมดอายุ/);assert.equal(sends,0);}finally{await f.close();}
});
test('the worker cannot be disconnected while a publication is in flight',async()=>{
 let release,disconnects=0;const gate=new Promise(r=>release=r),f=fixture({publisher:fakePublisher({disconnect:async()=>{disconnects++;},send:async()=>{await gate;return {id:'777'};}})});try{const p=post(f.store);f.store.approve(p.id,p.revision);const ticket=await f.delivery.preview(p.id,{revision:p.revision,mode:'live'}),sending=f.delivery.send(p.id,{ticketId:ticket.ticketId,revision:p.revision,confirmed:true});await assert.rejects(f.delivery.closeBrowser(),e=>e.statusCode===409);assert.equal(disconnects,0);release();await sending;}finally{release?.();await f.close();}
});
test('pending moderation is recorded as a visible submission and shown separately from public visibility',async()=>{
 const f=fixture({publisher:fakePublisher({send:async()=>({id:'777',pendingModeration:true})})});try{const p=post(f.store);f.store.approve(p.id,p.revision);const t=await f.delivery.preview(p.id,{revision:p.revision,mode:'live'});assert.equal((await f.delivery.send(p.id,{ticketId:t.ticketId,revision:p.revision,confirmed:true})).pendingModeration,true);assert.equal(f.store.publication(p.id).info.verification,'visible-pending-moderation');}finally{await f.close();}
});
test('Demo receipts and browser send reservations survive restart; interrupted sends become unknown',async t=>{
 const parent=resolve(root,'tmp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'reply-store-'));t.after(async()=>{if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe cleanup');await rm(dir,{recursive:true,force:true});});let now=1000;
 let f=fixture({path:join(dir,'queue.sqlite'),clock:()=>now});const p=post(f.store);f.store.approve(p.id,p.revision);const a=await f.delivery.preview(p.id,{revision:p.revision});await f.delivery.send(p.id,{ticketId:a.ticketId,revision:p.revision,confirmed:true});f.store.reservePublication(p.id,p.revision,'test','browser-ui');await f.close();
 now+=120001;f=fixture({path:join(dir,'queue.sqlite'),clock:()=>now});try{f.store.claim('recovery');assert.equal(f.store.get(p.id).status,'publish_unknown');assert.equal(f.store.publication(p.id).method,'browser-ui');assert.equal(f.store.demoReceipt(p.id).simulated,true);await assert.rejects(f.delivery.preview(p.id,{revision:p.revision,mode:'live'}));}finally{await f.close();}
});
