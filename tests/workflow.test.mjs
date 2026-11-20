import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHmac} from 'node:crypto';
import {createWorkflowService} from '../server/workflow.mjs';
import {createIntentService} from '../server/intent.mjs';
import {createGuideService} from '../server/guides.mjs';
import {createPageAdapter,verifyMetaSignature} from '../server/source-adapters.mjs';
import {createAppServer} from '../server.mjs';
import {classifyTopics,currentUrinaryConcern,EMERGENCY_NOTICE} from '../lib/workflow-policy.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function fixture(t,options={}){
 const parent=resolve(root,'tmp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'workflow-test-'));
 const service=createWorkflowService({rootDir:root,dbPath:join(dir,'queue.sqlite'),intent:createIntentService(root),guides:createGuideService(root),autoRun:false,...options});
 const resources=[()=>service.close()];t.after(async()=>{for(const close of resources.reverse())await close();if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe test cleanup');await rm(dir,{recursive:true,force:true});});return {service,dir,resources};
}
test('actual pipeline: new event -> original intent ML -> separate topics -> catalog guide -> safe draft -> approve and copy',async t=>{
 const {service}=await fixture(t);const received=service.mock({scenario:'neuter',eventId:'fixed-event'});
 assert.equal(received.post.status,'queued');assert.equal(service.mock({scenario:'neuter',eventId:'fixed-event'}).duplicate,true);
 await service.runOnce();const post=service.detail(received.post.id);
 assert.ok(post.intent.modelVersion.startsWith('intent-char-tfidf-lr'));assert.equal(post.topics.method,'rules_v1');assert.ok(post.topics.topics.some(t=>t.id==='recovery'));
 assert.equal(post.guides[0].id,'cat-post-neuter-recovery-care');assert.ok(post.draft.includes(post.guides[0].url));assert.deepEqual(post.replyErrors,[]);
 assert.throws(()=>service.copy(post.id,{revision:post.revision}),/อนุมัติ/);
 assert.throws(()=>service.approve(post.id,{revision:post.revision}),/ทำเครื่องหมาย/);
 const approved=service.approve(post.id,{revision:post.revision,acknowledged:true});assert.equal(approved.status,'approved');
 const copy=service.copy(post.id,{revision:approved.revision});assert.equal(copy.text,post.draft);assert.equal(copy.published,false);assert.equal(service.detail(post.id).status,'approved');
 const sent=service.manual(post.id,{revision:approved.revision,confirmed:true});assert.equal(sent.status,'published');assert.equal(service.manual(post.id,{revision:approved.revision,confirmed:true}).status,'published');
 assert.equal(service.store.stats().total,1);assert.equal(post.history.filter(h=>h.kind==='draft-created').length,1);
 assert.ok(service.detail(post.id).history.some(h=>h.kind==='manual-publication-confirmed'));
});
test('unknown topics and no matching guide produce no invented medical explanation or source',async t=>{
 const {service}=await fixture(t);const {post}=service.ingest({sourceType:'import',externalId:'unknown',text:'อยากซื้อรถยนต์ไปเที่ยวต่างจังหวัด',authorized:true});await service.runOnce();
 const result=service.detail(post.id);assert.equal(result.topics.status,'uncertain');assert.equal(result.guides.length,0);assert.match(result.draft,/ยังไม่พบคู่มือ/);assert.doesNotMatch(result.draft,/https:\/\/|วินิจฉัยว่า/);assert.equal(result.status,'needs_review');
 assert.equal((await service.status()).connections.group.connected,false);
});
test('urgent urinary wording bypasses chatbot waiting and cannot be removed during approval',async t=>{
 assert.equal(currentUrinaryConcern('ตอนนี้แมวฉี่ไม่ออกเลย'),true);
 for(const text of ['แมวเคยฉี่ไม่ออกปีก่อน ตอนนี้ฉี่ได้ปกติ','แมวไม่มีอาการฉี่ไม่ออก','ถ้าแมวฉี่ไม่ออกต้องทำอย่างไร','แมวกินน้ำน้อยแต่ฉี่ได้'])assert.equal(currentUrinaryConcern(text),false,text);
 const {service}=await fixture(t);const {post}=service.mock({scenario:'urinary'});assert.equal(post.safety.urgent,true);await service.runOnce();let p=service.detail(post.id);assert.ok(p.draft.includes(EMERGENCY_NOTICE));
 p=service.edit(p.id,{revision:p.revision,text:'ลองไปถาม Chatbot ก่อนค่ะ'});assert.throws(()=>service.approve(p.id,{revision:p.revision,acknowledged:true}),/โรงพยาบาลสัตว์ทันที/);
});
test('edits invalidate approval, preserve history and block unsupported medication, price, blame and fake links',async t=>{
 const {service}=await fixture(t);const {post}=service.mock({scenario:'belief'});await service.runOnce();let p=service.detail(post.id);assert.match(p.draft,/ยังตัดสินคุณภาพการรักษาไม่ได้/);assert.ok(p.safety.flags.some(f=>f.code==='causation'));
 const original=p.draft;service.approve(p.id,{revision:p.revision,acknowledged:true});
 for(const unsafe of ['ให้กินยา 5 mg','เปลี่ยนยาแล้วหายแน่นอน','หมอรักษาผิด','ค่าตรวจ 500 บาท','อ่านที่ https://evil.test/fake-guide']){
  p=service.detail(post.id);p=service.edit(p.id,{revision:p.revision,text:unsafe});assert.equal(p.approvedRevision,null);assert.throws(()=>service.approve(p.id,{revision:p.revision,acknowledged:true}),e=>e.statusCode===422);
 }
 const stale=p.revision;p=service.edit(p.id,{revision:p.revision,text:original});assert.throws(()=>service.approve(p.id,{revision:stale,acknowledged:true}),e=>e.statusCode===409);service.approve(p.id,{revision:p.revision,acknowledged:true});assert.ok(service.detail(p.id).history.filter(h=>h.kind==='draft-edited').length>=6);
});
test('SQLite keeps queued jobs and edited replies after restart',async t=>{
 const {service,dir,resources}=await fixture(t);const {post}=service.mock({eventId:'restart-job'});await service.close();
 const restarted=createWorkflowService({rootDir:root,dbPath:join(dir,'queue.sqlite'),intent:createIntentService(root),guides:createGuideService(root),autoRun:false});resources.push(()=>restarted.close());assert.equal(restarted.detail(post.id).status,'queued');await restarted.runOnce();let p=restarted.detail(post.id);p=restarted.edit(p.id,{revision:p.revision,text:p.draft+'\nต้องการทบทวนข้อมูลเพิ่มเติมค่ะ'});await restarted.close();
 const again=createWorkflowService({rootDir:root,dbPath:join(dir,'queue.sqlite'),intent:createIntentService(root),guides:createGuideService(root),autoRun:false});resources.push(()=>again.close());assert.equal(again.detail(post.id).draft,p.draft);assert.ok(again.detail(post.id).history.some(h=>h.kind==='draft-edited'));
});
test('temporary processing errors retry with a durable backoff; repeated events do not add jobs',async t=>{
 let clock=Date.now(),calls=0;const actual=createGuideService(root);
 const {service}=await fixture(t,{clock:()=>clock,storeOptions:{retryBaseMs:100,maxAttempts:2},guides:{status:()=>actual.status(),search:body=>{calls++;if(calls===1)throw Object.assign(Error('ทดสอบระบบชั่วคราว'),{statusCode:503});return actual.search(body);}}});
 const {post}=service.mock({eventId:'retry'});await service.runOnce();assert.equal(service.detail(post.id).status,'queued');assert.equal(await service.runOnce(),false);clock+=101;await service.runOnce();assert.ok(['awaiting_review','needs_review'].includes(service.detail(post.id).status));assert.equal(calls,2);assert.equal(service.mock({eventId:'retry'}).duplicate,true);assert.equal(service.store.stats().total,1);
});
test('Meta Page adapter validates signature, filters comments/groups, scopes posts and publishes once after approval',async t=>{
 const calls=[],secret='test-secret';
 const page=createPageAdapter({pageId:'123',appId:'42',appSecret:secret,accessToken:'test-page-token',verifyToken:'verify',graphVersion:'v27.0',publishEnabled:true,fetcher:async(input,options)=>{
  const url=new URL(input);calls.push({url,options});assert.equal(url.searchParams.has('access_token'),false);
  let value;if(url.pathname.endsWith('/me'))value={id:'123',name:'Test Page'};else if(url.pathname.endsWith('/subscribed_apps'))value={data:[{id:'42',subscribed_fields:['feed']}]};else if(options.method==='POST')value={id:'123_999'};else value={id:'123_456',message:'หลังทำหมันวันที่ 5–6 แผลยังดูบวม จึงถามว่าปกติหรือไม่',permalink_url:'https://www.facebook.com/123/posts/456',created_time:'2026-11-20T08:00:00Z'};
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 }});
 const raw=Buffer.from(JSON.stringify({object:'page',entry:[{id:'123',changes:[{field:'feed',value:{item:'post',verb:'add',post_id:'123_456'}},{field:'feed',value:{item:'comment',verb:'add',post_id:'123_456',comment_id:'x'}}]},{id:'other',changes:[]}]}));
 const signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');assert.equal(verifyMetaSignature(raw,signature,secret),true);assert.throws(()=>page.events(raw,signature+'0'),e=>e.statusCode===403);assert.throws(()=>page.events(Buffer.from('{}'),signature),e=>e.statusCode===403);
 assert.equal(page.challenge(new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':'verify','hub.challenge':'challenge'})),'challenge');
 assert.throws(()=>page.events(Buffer.from('{"object":"group","entry":[]}'),'bad'),e=>e.statusCode===403);
 const {service}=await fixture(t,{pageAdapter:page});assert.deepEqual(service.webhook(raw,signature),{received:1,duplicates:0,ignored:2});assert.equal(service.webhook(raw,signature).duplicates,1);await service.runOnce();let p=service.list().posts[0];
 assert.equal(calls.filter(c=>c.options.method==='POST').length,0);await assert.rejects(service.publish(p.id,{revision:p.revision}),e=>e.statusCode===403);
 await page.verify();await assert.rejects(service.publish(p.id,{revision:p.revision}),/อนุมัติ/);service.approve(p.id,{revision:p.revision,acknowledged:true});
 const sent=await service.publish(p.id,{revision:p.revision});assert.equal(sent.externalId,'123_999');assert.equal((await service.publish(p.id,{revision:p.revision})).alreadySent,true);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 await assert.rejects(page.getPost('999_456'),e=>e.statusCode===403);
});
test('ambiguous network publication never retries automatically and requires explicit reconciliation',async t=>{
 let sends=0;const page={status:()=>({canPublish:true}),groupStatus:()=>({connected:false}),publish:async()=>{sends++;throw Error('network timed out');}};
 const {service}=await fixture(t,{pageAdapter:page});const {post}=service.ingest({sourceType:'page',externalId:'1_2',text:'หลังทำหมันวันที่ 5–6 แผลยังดูบวม จึงถามว่าปกติหรือไม่',authorized:true},{trustedPage:true});await service.runOnce();const p=service.detail(post.id);service.approve(p.id,{revision:p.revision,acknowledged:true});await assert.rejects(service.publish(p.id,{revision:p.revision}));assert.equal(service.detail(p.id).status,'publish_unknown');await assert.rejects(service.publish(p.id,{revision:p.revision}));assert.equal(sends,1);
 service.resolvePublication(p.id,{revision:p.revision,found:true,externalId:'1_3',confirmed:true});assert.equal((await service.publish(p.id,{revision:p.revision})).alreadySent,true);assert.equal(sends,1);
});
test('HTTP workflow authentication, connector ingestion and source permission restrictions',async t=>{
 const {service,dir,resources}=await fixture(t);await service.close();const server=createAppServer({workflowOptions:{dbPath:join(dir,'http.sqlite'),operatorToken:'operator-test',ingestToken:'connector-test',autoRun:false}});await new Promise(r=>server.listen(0,'127.0.0.1',r));resources.push(async()=>{await server.workflow.close();await new Promise(r=>server.close(r));});const base='http://127.0.0.1:'+server.address().port;
 const request=(path,body,token='operator-test')=>fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await request('/api/workflow/status',null,'wrong')).status,401);assert.equal((await (await request('/api/workflow/status')).json()).connections.group.connected,false);
 assert.equal((await request('/api/workflow/posts',{sourceType:'group',text:'ข้อความจากกลุ่ม'})).status,400);
 assert.equal((await request('/api/workflow/posts',{sourceType:'page',externalId:'1_2',text:'forged',authorized:true})).status,403);
 const event={sourceType:'group',externalId:'authorized-connector',text:'หลังทำหมันวันที่ 5–6 แผลยังดูบวม จึงถามว่าปกติหรือไม่',authorized:true};
 assert.equal((await request('/api/sources/events',event)).status,401);const received=await request('/api/sources/events',event,'connector-test');assert.equal(received.status,202);const payload=await received.json();assert.equal((await (await request('/api/sources/events',event,'connector-test')).json()).duplicate,true);
 await server.workflow.runOnce();const detail=await (await request('/api/workflow/posts/'+payload.post.id)).json();assert.ok(detail.guides.length);assert.equal((await request('/api/workflow/posts/'+detail.id+'/publish',{revision:detail.revision})).status,403);
 assert.equal((await fetch(base+'/data/runtime/workflow.sqlite')).status,404);assert.equal((await fetch(base+'/api/workflow/status',{headers:{Origin:'https://evil.test'}})).status,403);
 const commentPath='/api/workflow/posts/'+detail.id;
 assert.equal((await request(commentPath+'/comment-preview',{revision:detail.revision,mode:'demo'},'wrong')).status,401);
 assert.equal((await request(commentPath+'/comment-send',{revision:detail.revision,ticketId:'forged',confirmed:true},'wrong')).status,401);
 assert.equal((await request(commentPath+'/comment-preview',{revision:detail.revision,mode:'demo'})).status,409);
 server.workflow.approve(detail.id,{revision:detail.revision,acknowledged:true});
 const preview=await (await request(commentPath+'/comment-preview',{revision:detail.revision,mode:'demo'})).json();assert.equal(preview.simulated,true);
 assert.equal((await request(commentPath+'/comment-send',{revision:detail.revision,ticketId:'forged',confirmed:true})).status,409);
 const denied=await fetch(base+commentPath+'/comment-send',{method:'POST',headers:{Authorization:'Bearer operator-test','Content-Type':'application/json',Origin:'https://evil.test'},body:JSON.stringify({ticketId:preview.ticketId,revision:detail.revision,confirmed:true})});assert.equal(denied.status,403);
 const sent=await request(commentPath+'/comment-send',{ticketId:preview.ticketId,revision:detail.revision,confirmed:true});assert.equal(sent.status,200);assert.equal((await sent.json()).published,false);assert.equal(server.workflow.detail(detail.id).status,'approved');
});
