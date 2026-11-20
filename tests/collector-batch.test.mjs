import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';
import {collectInBatches} from '../automation/batch.mjs';
import {createCollectorOutbox} from '../automation/outbox.mjs';
import {extractVisiblePosts} from '../automation/extract.mjs';
import {persistBatchReport} from '../automation/batch-report.mjs';
import {readCollectorStatus} from '../server/collector-status.mjs';
const groupId='1067156573375730',root=fileURLToPath(new URL('../',import.meta.url));
const post=n=>({sourceType:'group',externalId:groupId+':'+n,url:'https://www.facebook.com/groups/'+groupId+'/posts/'+n+'/',text:'ข้อความจำลองสำหรับทดสอบ Batch '+n,publishedAt:'',sourceMeta:{method:'browser-dom',groupId,completeness:'unknown'}});
function seed(box,posts){box.capture(posts);for(const p of posts)box.delivered(p.externalId,'existing-'+p.externalId);}
function readerFor(views,{order=true,gate=()=> 'ready',onRead=()=>{}}={}){
 let index=0,begins=0,reads=0,scrolls=0;
 return {gate:async()=>gate(reads),preferNewPosts:async()=>order,order:()=>order?'new_posts':'unverified',beginBatch:async()=>{begins++;index=0;},readBatchView:async({excludeIds,limit})=>{reads++;onRead(reads);const exclude=new Set(excludeIds);return {posts:views[Math.min(index,views.length-1)].filter(p=>!exclude.has(p.externalId)).slice(0,limit),skipped:{},selectorError:false};},scrollBatch:async()=>{scrolls++;index++;},state:()=>({begins,reads,scrolls})};
}
const ingest=async event=>({post:{id:'receipt-'+event.externalId},duplicate:false});
function options(reader,outbox,extra={}){return {reader,outbox,ingest,groupId,batchSize:40,...extra};}
test('95 new posts continue as 40 + 40 + 20 including five previous posts, without resetting to the first chunk',async()=>{
 const box=createCollectorOutbox(':memory:');try{
  const known=Array.from({length:5},(_,i)=>post(1000+i));seed(box,known);
  const reader=readerFor([[...Array.from({length:95},(_,i)=>post(i+1)),...known]]);
  const report=await collectInBatches(options(reader,box));
  assert.deepEqual(report.rounds.map(r=>r.read),[40,40,20]);assert.deepEqual(report.rounds.map(r=>r.new),[40,40,15]);assert.equal(report.new,95);assert.equal(report.seen,5);assert.equal(report.read,100);assert.equal(report.state,'completed');assert.equal(report.reason,'overlap_reached');assert.equal(box.stats().delivered,100);assert.equal(reader.state().begins,1);assert.equal(reader.state().scrolls,0);
 }finally{box.close();}
});
test('overlapping virtualized views are counted once; a single previously seen post does not stop the run',async()=>{
 const box=createCollectorOutbox(':memory:');try{
  const known=Array.from({length:6},(_,i)=>post(1000+i));seed(box,known);
  const stream=[known[0],...Array.from({length:76},(_,i)=>post(i+1)),...known.slice(1)];
  const views=[];for(let i=0;i<stream.length;i+=12)views.push(stream.slice(i,i+17));
  const reader=readerFor(views),report=await collectInBatches(options(reader,box));
  assert.equal(report.new,76);assert.equal(report.read,82);assert.equal(report.seen,6);assert.deepEqual(report.rounds.map(r=>r.read),[40,40,2]);assert.equal(report.state,'completed');assert.equal(reader.state().begins,1);
 }finally{box.close();}
});
test('an interrupted run retains its original boundary across restart; its captured posts cannot stop the retry',async t=>{
 const parent=resolve(root,'tmp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'batch-resume-'));t.after(async()=>{if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe cleanup');await rm(dir,{recursive:true,force:true});});
 const path=join(dir,'outbox.sqlite');let box=createCollectorOutbox(path);try{
  const known=Array.from({length:5},(_,i)=>post(1000+i)),fresh=Array.from({length:80},(_,i)=>post(i+1));seed(box,known);
  const first=await collectInBatches(options(readerFor([[...fresh,...known]]),box,{maxRounds:2}));
  assert.equal(first.state,'incomplete');assert.equal(first.reason,'round_limit');assert.equal(first.new,80);assert.equal(box.batchBaseline(groupId).length,5);
  box.close();box=createCollectorOutbox(path);
  const retry=await collectInBatches(options(readerFor([[...fresh,...known]]),box));
  assert.equal(retry.read,85);assert.equal(retry.new,0);assert.equal(retry.state,'completed');assert.deepEqual(retry.rounds.map(r=>r.read),[40,40,5]);assert.equal(box.batchBaseline(groupId).length,85);
 }finally{box.close();}
});
test('a stalled feed saves the partial chunk and reports incomplete instead of pretending all posts were collected',async()=>{
 const box=createCollectorOutbox(':memory:');try{
  const reader=readerFor([Array.from({length:9},(_,i)=>post(i+1))]);
  const report=await collectInBatches(options(reader,box,{stallLimit:3}));
  assert.equal(report.reason,'no_progress');assert.equal(report.state,'incomplete');assert.equal(report.new,9);assert.equal(report.rounds[0].read,9);assert.equal(box.stats().delivered,9);assert.equal(reader.state().scrolls,2);
 }finally{box.close();}
});
test('time, cancellation and login changes preserve buffered records without starting another chunk',async()=>{
 for(const scenario of ['time','cancel','login']){
  let time=1000,cancel=false;
  const box=createCollectorOutbox(':memory:');try{
   const reader=readerFor([Array.from({length:11},(_,i)=>post(i+1))],{onRead:()=>{if(scenario==='time')time+=100;if(scenario==='cancel')cancel=true;},gate:reads=>scenario==='login'&&reads?'needs_login':'ready'});
   const report=await collectInBatches(options(reader,box,{clock:()=>time,maxDurationMs:50,isCancelled:()=>cancel}));
   assert.equal(report.new,11,scenario);assert.equal(report.reason,{time:'time_limit',cancel:'cancelled',login:'needs_login'}[scenario]);assert.equal(report.collectionComplete,false);assert.equal(box.stats().delivered,11);
  }finally{box.close();}
 }
});
test('unverified ordering never marks a run complete, and scrolling has a finite guard',async()=>{
 const a=createCollectorOutbox(':memory:'),b=createCollectorOutbox(':memory:');try{
  const unverified=await collectInBatches(options(readerFor([[post(1)]],{order:false}),a));assert.equal(unverified.reason,'order_unverified');assert.equal(unverified.read,0);
  const limited=await collectInBatches(options(readerFor([[]]),b,{maxScrolls:2,stallLimit:10}));assert.equal(limited.reason,'scroll_limit');assert.equal(limited.state,'incomplete');
 }finally{a.close();b.close();}
});
test('extractor can read items 41–80 from a non-virtualized DOM and ignores matching links inside chat',()=>{
 const cards=Array.from({length:90},(_,i)=>`<article><a href="/groups/${groupId}/posts/${i+1}/">เวลา</a><div data-ad-preview="message">ข้อความจำลอง ${i+1}</div></article>`).join('');
 const {document}=parseHTML(`<div role="feed">${cards}</div><div role="log"><article><a href="/groups/${groupId}/posts/999/">ลิงก์ในแชต</a><div data-ad-preview="message">ข้อความส่วนตัวห้ามเก็บ</div></article></div>`);
 const first=extractVisiblePosts({groupId,limit:40},document),second=extractVisiblePosts({groupId,limit:40,excludeIds:first.posts.map(p=>p.externalId)},document);
 assert.equal(second.posts.length,40);assert.equal(second.posts[0].externalId,groupId+':41');assert.equal(second.posts.at(-1).externalId,groupId+':80');assert.ok(!extractVisiblePosts({groupId,limit:100},document).posts.some(p=>p.externalId.endsWith(':999')));
});
test('batch reports persist per-round results and terminal state remains readable after the worker exits',async t=>{
 const parent=resolve(root,'tmp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'batch-report-'));t.after(async()=>{if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe cleanup');await rm(dir,{recursive:true,force:true});});
 const box=createCollectorOutbox(':memory:');try{
  const known=Array.from({length:5},(_,i)=>post(1000+i));seed(box,known);const report=await collectInBatches(options(readerFor([[...Array.from({length:41},(_,i)=>post(i+1)),...known]]),box));
  const path=await persistBatchReport(dir,report),saved=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(saved.rounds.map(r=>r.read),[40,6]);assert.equal(saved.new,41);assert.doesNotMatch(await readFile(path,'utf8'),/ข้อความจำลอง|sourceMeta|event_json/);
  const status=join(dir,'status.json');await writeFile(status,JSON.stringify({version:1,groupId,mode:'batch',state:'completed',updatedAt:new Date(0).toISOString(),counts:box.stats(),batch:{rounds:2,read:46,new:41,seen:5,reason:report.reason,phase:'finished'}}));
  const parsed=await readCollectorStatus(status);assert.equal(parsed.state,'completed');assert.equal(parsed.active,false);assert.equal(parsed.batch.new,41);
 }finally{box.close();}
});
