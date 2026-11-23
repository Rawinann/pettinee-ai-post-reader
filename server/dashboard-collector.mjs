import {mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createBrowserReader} from '../automation/browser.mjs';
import {createCollectorOutbox} from '../automation/outbox.mjs';
import {collectInBatches} from '../automation/batch.mjs';
import {persistBatchReport} from '../automation/batch-report.mjs';
import {readCollectorStatus} from './collector-status.mjs';
import {workflowError} from './workflow-store.mjs';
const summary=r=>r?{runId:r.runId,state:r.state,scope:r.scope||'catchup',read:r.read||0,new:r.new||0,seen:r.seen||0,changed:r.changed||0,delivered:r.delivered||0,rounds:Array.isArray(r.rounds)?r.rounds.length:r.rounds||0,reason:r.reason||null,collectionComplete:r.collectionComplete===true,analysisRemaining:r.analysisRemaining||0,finishedAt:r.finishedAt||null}:null;
export function createDashboardCollector({publisher,config,ingest,remaining=()=>0,readerFactory=createBrowserReader,outboxFactory=createCollectorOutbox,clock=Date.now}={}){
 const available=!!publisher?.withCollection&&!!config;let job=null,starting=false,cancelled=false,last=null,closed=false,writes=Promise.resolve();
 async function status(){const previous=!last&&config?await readCollectorStatus(config.statusPath,{clock}):null;const lastSummary=summary(last)||previous?.batch||null;if(lastSummary)lastSummary.analysisRemaining=remaining();return {available,running:starting||!!job,batchSize:40,last:lastSummary,message:last?.message||previous?.message||'เลือกดึง 40 โพสต์ล่าสุด หรืออ่านต่อจนถึงช่วงข้อมูลเดิม'};}
 function save(report,counts){delete report.error;last=structuredClone(report);const captured=structuredClone(last);writes=writes.catch(()=>{}).then(async()=>{await persistBatchReport(config.batchReportDir,captured);const value={version:1,groupId:config.groupId,mode:'batch',state:captured.state,updatedAt:new Date(clock()).toISOString(),lastScanAt:new Date(clock()).toISOString(),lastCaptureAt:captured.new?new Date(clock()).toISOString():null,feedOrder:captured.feedOrder,counts,message:captured.message||'กำลังดึงโพสต์ล่าสุด',batch:{...summary(captured),phase:captured.state==='running'?'collecting':'finished'}};await mkdir(dirname(config.statusPath),{recursive:true});await writeFile(config.statusPath+'.tmp',JSON.stringify(value));await rename(config.statusPath+'.tmp',config.statusPath);});return writes;}
 return {
  status,
  async start({scope='latest40'}={}){
   if(!available||closed)throw workflowError('เปิดตัวดึงผ่าน Chrome ด้วย npm.cmd run replies:ai ก่อน',503);
   if(!['latest40','catchup'].includes(scope))throw workflowError('เลือก 40 โพสต์ล่าสุด หรืออ่านต่อชุดละ 40',400);
   if(starting||job||publisher.status().busy)throw workflowError('Chrome กำลังทำงาน รอให้ดึงหรือส่งรอบเดิมจบก่อน',409);
   starting=true;
   try{
    const prior=await readCollectorStatus(config.statusPath,{clock});if(closed)throw workflowError('ตัวดึงกำลังปิด',503);if(prior.fresh&&['starting','running','analysing','needs_login','blocked','waiting_feed'].includes(prior.state))throw workflowError('มีตัวดึงอีกชุดทำงานอยู่ กรุณาหยุด automate เดิมก่อน',409);
    cancelled=false;last={runId:randomUUID(),startedAt:new Date(clock()).toISOString(),state:'running',scope,read:0,new:0,seen:0,changed:0,delivered:0,rounds:[],message:'กำลังเปิดกลุ่มและดึงโพสต์…'};
    const task=publisher.withCollection(async page=>{
     const box=outboxFactory(config.outboxPath,{clock});let heartbeat;
     try{await save(last,box.stats());heartbeat=setInterval(()=>{save(last,box.stats()).catch(()=>{});},10000);heartbeat.unref?.();const report=await collectInBatches({runId:last.runId,reader:readerFactory(page,{...config,maxPosts:40}),outbox:box,ingest,groupId:config.groupId,batchSize:40,knownStreak:config.batchKnownStreak,maxRounds:config.batchMaxRounds,maxScrolls:config.batchMaxScrolls,maxDurationMs:config.batchMaxDurationMs,stallLimit:config.batchStallLimit,isCancelled:()=>cancelled||closed,clock,stopAfterFirstBatch:scope==='latest40',onProgress:async r=>{r.scope=scope;r.analysisRemaining=remaining();r.message=r.state==='running'?'กำลังดึงโพสต์ล่าสุด…':r.message;await save(r,box.stats());}});last={...report,scope};delete last.error;}finally{clearInterval(heartbeat);await writes.catch(()=>{});box.close();}
    });
    job=task.catch(async()=>{const failed={...last,state:'incomplete',message:'ดึงโพสต์ไม่สำเร็จ ตรวจ Chrome หรือรอรอบเดิมจบก่อนลองใหม่',reason:'error',finishedAt:new Date(clock()).toISOString()};await save(failed,{}).catch(()=>{});}).finally(()=>{job=null;});
    return status();
   }finally{starting=false;}
  },
  async cancel(){if(job||starting){cancelled=true;if(last)last.message='กำลังหยุด เก็บรายการที่ดึงได้แล้วไว้ก่อน';}return status();},
  async close(){closed=true;cancelled=true;if(job)await job;},
 };
}
