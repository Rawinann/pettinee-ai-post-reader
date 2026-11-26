import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createCloudStore} from '../cloud/store.mjs';
import {digest} from '../cloud/auth.mjs';
import {createPetmommyWriter} from '../server/petmommy.mjs';
import {classifyTopics,evaluateSafety} from '../lib/workflow-policy.mjs';
import {autoReplyReason} from '../cloud/automation.mjs';
import {automationHTML} from '../lib/automation-ui.mjs';

test('automatic collection -> new post -> tracked reply -> rate limit -> pause, without touching old posts',async()=>{
 const db=new PGlite();
 try{
  for(const file of ['001-shared.sql','002-automation.sql'])await db.exec(await readFile(new URL('../cloud/migrations/'+file,import.meta.url),'utf8'));
  const pool={query:(s,a)=>db.query(s,a),connect:async()=>({query:(s,a)=>db.query(s,a),release(){}})};
  const store=createCloudStore(pool,{origin:'https://reader.example'}),token='a'.repeat(43);
  await store.provisionWorker({id:'page',label:'Page',expectedAccount:'Pettinee',tokenHash:digest(token)});
  const worker=await store.authenticateWorker(token),catalog=JSON.parse(await readFile(new URL('../data/guides/catalog.json',import.meta.url),'utf8'));
  const guide={...catalog.articles.find(g=>g.id==='cat-post-neuter-recovery-care'),score:0.7};
  const event=n=>({sourceType:'group',externalId:'1067156573375730:'+n,url:'https://www.facebook.com/groups/1067156573375730/posts/'+n+'/',text:'หลังทำหมันวันที่ 5–6 แผลยังดูบวม',sourceMeta:{}});
  const old=await store.ingest(event('1'),'page');
  await store.configureAutomation({enabled:true,workerId:'page',intervalMinutes:60,maxPerHour:1},'admin');
  const collect=await store.claim(worker);assert.equal(collect.kind,'collect');
  await store.complete('page',collect.id,collect.lease_token,{status:'success',data:{read:40}});
  const fresh=await store.ingest(event('2'),'page');assert.equal((await store.ingest(event('2'),'page')).duplicate,true);
  const analyse=async()=>{const job=await store.claim(worker);assert.equal(job.kind,'analyse');const p=job.snapshot.post,topics=classifyTopics(p.text),safety=evaluateSafety(p.text,{topics,guides:[guide]});const generated=await createPetmommyWriter().generate({...p,topics,safety,guides:[guide]});return store.complete('page',job.id,job.lease_token,{status:'success',data:{draft:generated.draft,guides:[guide],topics,safety,replyMeta:generated.meta}});};
  const oldResult=await analyse();assert.equal(oldResult.post.id,old.post.id);assert.notEqual(oldResult.post.status,'publishing');
  const freshResult=await analyse();assert.equal(freshResult.post.id,fresh.post.id);assert.equal(freshResult.post.status,'publishing');assert.match(freshResult.post.draft,/https:\/\/reader.example\/g\//);
  const send=await store.claim(worker);assert.equal(send.kind,'publish');assert.equal(send.snapshot.automatic,true);assert.equal(send.snapshot.expectedAccount,'Pettinee');
  await store.complete('page',send.id,send.lease_token,{status:'success',data:{id:'comment-1'}});
  const link=freshResult.post.replyMeta.links[0];await store.link(link.token);await store.link(link.token,{outbound:true,method:'POST'});assert.equal((await store.tracking()).pageViews,1);assert.equal((await store.tracking()).clicks,1);
  await store.ingest(event('3'),'page');await analyse();assert.equal(await store.claim(worker),null,'hourly limit blocks a second send');
  await store.configureAutomation({enabled:false},'admin');assert.equal(await store.claim(worker),null);assert.equal((await store.get(fresh.post.id)).status,'published');
  const a=await store.automation();assert.equal(a.enabled,false);
  assert.match(automationHTML({cloud:true,automation:a,workers:[]}),/เปิดดึงและตอบอัตโนมัติ/);
  await store.configureAutomation({enabled:true,workerId:'page',intervalMinutes:60,maxPerHour:2},'admin');
  const nextCollect=await store.claim(worker);assert.equal(nextCollect.kind,'collect');
  await store.complete('page',nextCollect.id,nextCollect.lease_token,{status:'success',data:{read:40}});
  await store.ingest(event('4'),'page');await analyse();const unknown=await store.claim(worker);assert.equal(unknown.kind,'publish');
  await store.complete('page',unknown.id,unknown.lease_token,{status:'unknown',message:'ต้องตรวจคอมเมนต์จริง'});
  assert.equal((await store.automation()).enabled,false);assert.equal(await store.claim(worker),null);
  assert.equal((await store.get(unknown.post_id)).status,'publish_unknown');
 }finally{await db.close();}
});

test('automation holds urgent, unrelated, edited and question-shaped replies',()=>{
 const a={enabled:true,startedAt:'run'},p={automationRun:'run',sourceType:'group',revision:1,safety:{urgent:true}};
 assert.ok(autoReplyReason(p,a));assert.ok(autoReplyReason({...p,automationRun:'old'},a));
 assert.ok(autoReplyReason({...p,safety:{},revision:2},a));assert.ok(autoReplyReason({...p,safety:{},guides:[]},a));
});
