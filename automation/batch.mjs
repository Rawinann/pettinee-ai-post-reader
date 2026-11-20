import {randomUUID} from 'node:crypto';
import {deliverPending} from './outbox.mjs';
import {isNavigationTransition} from './navigation.mjs';

export const BATCH_REASONS={
 overlap_reached:'พบช่วงโพสต์เดิมต่อเนื่องตามเกณฑ์แล้ว',
 order_unverified:'ยังยืนยันการเรียงโพสต์ใหม่ไม่ได้',
 no_progress:'เลื่อนแล้วไม่พบรายการเพิ่ม ยังไม่ยืนยันว่าถึงข้อมูลเดิม',
 round_limit:'ถึงจำนวนชุดสูงสุดที่ตั้งไว้ ยังไม่ถึงช่วงข้อมูลเดิม',
 scroll_limit:'ถึงขีดจำกัดการเลื่อน ยังไม่ถึงช่วงข้อมูลเดิม',
 time_limit:'ถึงเวลาสูงสุดที่ตั้งไว้ ยังไม่ถึงช่วงข้อมูลเดิม',
 selector_changed:'element ไม่ตรงกับตัวอ่าน',
 needs_login:'ต้องล็อกอินด้วยตัวเอง',blocked:'หยุดที่ checkpoint/challenge',
 wrong_page:'ไม่ได้อยู่ในหน้ากลุ่มที่ตั้งไว้',waiting_feed:'รายการโพสต์ยังไม่พร้อม',
 navigation:'หน้าเปลี่ยนระหว่างอ่าน เก็บข้อมูลที่รับแล้วไว้และลองใหม่รอบถัดไป',
 cancelled:'ผู้ใช้หยุดการทำงาน',error:'พบข้อผิดพลาดระหว่างเก็บข้อมูล',
};

// The boundary is frozen before this run. Newly captured IDs must never become
// the stopping boundary for the next 40-item chunk or for an interrupted retry.
export async function collectInBatches({reader,outbox,ingest,groupId,batchSize=40,knownStreak=5,maxRounds=25,maxScrolls=300,maxDurationMs=900000,stallLimit=5,isCancelled=()=>false,clock=Date.now,onProgress=async()=>{}}){
 for(const [name,value]of Object.entries({batchSize,knownStreak,maxRounds,maxScrolls,maxDurationMs,stallLimit}))if(!Number.isInteger(value)||value<1)throw Error('Invalid batch option: '+name);
 if(batchSize>100||!/^\d+$/.test(groupId))throw Error('Invalid batch source or size');
 const started=clock(),baseline=new Set(outbox.batchBaseline(groupId)),consumed=new Set();
 const report={version:1,runId:randomUUID(),groupId,mode:'batch',batchSize,knownStreak,baselineCount:baseline.size,startedAt:new Date(started).toISOString(),finishedAt:null,state:'running',reason:null,collectionComplete:false,feedOrder:'unverified',read:0,new:0,seen:0,changed:0,delivered:0,deliveryDuplicates:0,deliveryFailures:0,scrolls:0,rounds:[],parseWarnings:false};
 let buffered=[],streak=0,stalls=0;
 const deliver=async()=>{while(outbox.pending().length){const d=await deliverPending(outbox,ingest);report.delivered+=d.delivered;report.deliveryDuplicates+=d.duplicates;report.deliveryFailures+=d.failed;if(!d.delivered&&!d.failed)break;}};
 const flush=async(reason=null)=>{
  if(!buffered.length)return;
  const posts=buffered;buffered=[];const counts=outbox.capture(posts);report.new+=counts.new;report.seen+=counts.seen;report.changed+=counts.changed;
  await deliver();
  report.rounds.push({round:report.rounds.length+1,read:posts.length,new:counts.new,seen:counts.seen,changed:counts.changed,knownAtStart:posts.filter(p=>baseline.has(p.externalId)).length,continuation:!reason&&posts.length===batchSize,at:new Date(clock()).toISOString(),reason});
  await onProgress(structuredClone(report));
 };
 let reason;
 try{
  const gate=await reader.gate();
  if(gate!=='ready')reason=gate;
  else if(!await reader.preferNewPosts())reason='order_unverified';
  else{
   report.feedOrder=reader.order();await reader.beginBatch();
   while(!reason){
    if(isCancelled()){reason='cancelled';break;}
    if(clock()-started>=maxDurationMs){reason='time_limit';break;}
    if(report.rounds.length>=maxRounds){reason='round_limit';break;}
    const currentGate=await reader.gate();if(currentGate!=='ready'){reason=currentGate;break;}
    const view=await reader.readBatchView({excludeIds:[...consumed],limit:batchSize-buffered.length});
    if(view.selectorError){reason='selector_changed';break;}
    if(Object.values(view.skipped||{}).some(n=>n>0))report.parseWarnings=true;
    const posts=view.posts.filter(p=>!consumed.has(p.externalId)).slice(0,batchSize-buffered.length);
    if(!posts.length){
     stalls++;
     if(stalls>=stallLimit){reason='no_progress';break;}
     if(report.scrolls>=maxScrolls){reason='scroll_limit';break;}
     await reader.scrollBatch();report.scrolls++;continue;
    }
    stalls=0;
    for(const post of posts){
     consumed.add(post.externalId);buffered.push(post);report.read++;
     streak=baseline.has(post.externalId)?streak+1:0;
     if(streak>=knownStreak){reason='overlap_reached';break;}
    }
    if(buffered.length>=batchSize||reason)await flush(reason);
    // Read unconsumed items from this same DOM before scrolling. A new chunk
    // never scrolls to the top and never discards surplus cards already loaded.
   }
  }
 }catch(error){reason=isCancelled()?'cancelled':isNavigationTransition(error)?'navigation':'error';if(reason==='error')report.error=String(error.message||'Collection error').slice(0,300);}
 await flush(reason);await deliver();
 report.reason=Object.hasOwn(BATCH_REASONS,reason)?reason:'error';
 report.collectionComplete=reason==='overlap_reached';
 if(report.collectionComplete)outbox.finishBatchBaseline(groupId);
 const counts=outbox.stats();report.pending=counts.pending||0;report.rejected=counts.rejected||0;
 report.state=reason==='cancelled'?'cancelled':report.collectionComplete&&!report.pending&&!report.rejected?'completed':'incomplete';
 report.finishedAt=new Date(clock()).toISOString();report.message=BATCH_REASONS[report.reason];
 if(report.rounds.length)report.rounds.at(-1).continuation=false;
 await onProgress(structuredClone(report));return report;
}
