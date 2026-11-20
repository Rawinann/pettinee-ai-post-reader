import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflowStore} from '../server/workflow-store.mjs';
const event=(key,urgent=false)=>({sourceType:'mock',externalId:key,eventId:key,url:'',text:'ข้อความทดสอบ '+key,publishedAt:'',initialSafety:{urgent}});
const result={intent:{},topics:{},guides:[],safety:{requiresReview:false},draft:'ข้อความรอตรวจ',processingMs:1};
test('expired worker leases recover, prioritize urgent posts and stop after repeated interruptions',()=>{
 let time=1000;const db=createWorkflowStore(':memory:',{clock:()=>time,leaseMs:100,maxAttempts:2});try{
  const normal=db.ingest(event('normal')).post,urgent=db.ingest(event('urgent',true)).post;
  assert.equal(db.list({status:'new'}).total,2);assert.equal(db.claim('first').post.id,urgent.id);assert.equal(db.list({status:'processing'}).total,1);
  time+=101;const recovered=db.claim('second');assert.equal(recovered.post.id,urgent.id);assert.equal(recovered.attempts,2);
  time+=101;assert.equal(db.claim('third').post.id,normal.id);assert.equal(db.get(urgent.id).status,'error');assert.ok(db.history(urgent.id).some(h=>h.kind==='lease-exhausted'));assert.equal(db.list({status:'attention'}).total,1);
  assert.equal(db.list({status:'__proto__'}).total,0);assert.equal(db.list({status:'constructor',limit:2.5}).total,0);
 }finally{db.close();}
});
test('interrupted publications become unknown and require reconciliation; explicit API rejection can switch to manual',()=>{
 let time=1000;const db=createWorkflowStore(':memory:',{clock:()=>time,leaseMs:100});try{
  const post=db.ingest(event('publication')).post,job=db.claim('worker');db.complete(job,result);let p=db.get(post.id);db.approve(p.id,p.revision);db.reservePublication(p.id,p.revision);
  time+=101;db.claim('maintenance');assert.equal(db.get(p.id).status,'publish_unknown');assert.throws(()=>db.reservePublication(p.id,p.revision));
  db.resolvePublication(p.id,p.revision,{confirmed:true,found:false});db.reservePublication(p.id,p.revision);db.publicationResult(p.id,{error:'explicit rejection',definitive:true});
  assert.equal(db.get(p.id).status,'approved');db.confirmManual(p.id,p.revision);assert.equal(db.list({status:'done'}).total,1);assert.equal(db.list({status:'review'}).total,0);
 }finally{db.close();}
});
