import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {writeAtomicJSON} from '../automation/batch-report.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrowserCommentPublisher} from '../automation/comment-driver.mjs';
import {collectorConfig} from '../automation/config.mjs';
import {createDashboardCollector} from '../server/dashboard-collector.mjs';
import {createIntentService} from '../server/intent.mjs';
import {createGuideService} from '../server/guides.mjs';
import {createPetmommyWriter} from '../server/petmommy.mjs';
import {classifyTopics,evaluateSafety,verifiedGuides,checkReply} from '../lib/workflow-policy.mjs';
const normal=s=>String(s||'').normalize('NFC').replace(/\s+/gu,' ').trim();
export function createCloudWorker({request,publisher,analyse,collect,workerId,expectedAccount,publishEnabled=false,journal=async()=>{},loadJournal=async()=>null}){
 let pending,initialized=false,busy=false;
 return {
  async tick(){if(busy)return;busy=true;let lease;
   try{
    if(!initialized){pending=await loadJournal();initialized=true;}
    // A result lost in transit is reported again, never re-executed in Chrome.
    if(pending){await request('/api/worker/jobs/'+pending.id+'/complete',pending.body);pending=null;await journal(null);return;}
    await request('/api/worker/heartbeat',publisher.status());const {job}=await request('/api/worker/claim',{});if(!job)return;
    lease=setInterval(()=>request('/api/worker/jobs/'+job.id+'/renew',{leaseToken:job.lease_token}).catch(()=>{}),30000);lease.unref?.();
    let result;
    try{
     if(job.worker_id!==workerId)throw Object.assign(Error('งานเป็นของเครื่องอื่น'),{definitive:true});
     if(job.kind==='publish'){
      const p=job.snapshot;if(!publishEnabled||p.mode!=='browser')throw Object.assign(Error('ยังไม่เปิดส่งผ่าน Chrome ใช้ตอบด้วยมือก่อน'),{definitive:true});
      if(normal(p.expectedAccount)!==normal(expectedAccount)||p.approvedRevision!==p.revision||p.approvedWorkerId!==workerId||checkReply(p.draft,p).length)throw Object.assign(Error('บัญชีหรือข้อความไม่ตรงกับที่ยืนยัน'),{definitive:true});
      const prepared=await publisher.prepare(p);if(normal(prepared.account)!==normal(expectedAccount))throw Object.assign(Error('บัญชี Facebook ไม่ตรงกับบัญชีที่ตั้งไว้'),{definitive:true});
      await request('/api/worker/jobs/'+job.id+'/renew',{leaseToken:job.lease_token});
      const receipt=await publisher.send(p,prepared);result={status:'success',data:{...receipt,account:prepared.account}};
     }else if(job.kind==='collect')result={status:'success',data:await collect(job.snapshot.scope)};
     else result={status:'success',data:await analyse(job.snapshot.post,job.kind==='rewrite'?{externalDataReviewed:job.snapshot.externalDataReviewed,reviewedText:job.snapshot.reviewedText}:{})};
    }catch(error){result={status:job.kind==='publish'&&error.definitive!==true?'unknown':'failed',message:error.statusCode||error.definitive?String(error.message).slice(0,250):'worker ทำงานไม่สำเร็จ ตรวจโมเดลหรือ Chrome ในเครื่อง'};}
    clearInterval(lease);pending={id:job.id,body:{leaseToken:job.lease_token,...result}};await journal(pending);
    await request('/api/worker/jobs/'+job.id+'/complete',pending.body);pending=null;await journal(null);
   }finally{clearInterval(lease);busy=false;}
  },
 };
}
export function workerRequest({origin,token,fetcher=fetch}){const u=new URL(origin);if((u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('CLOUD_ORIGIN ต้องเป็น HTTPS origin ของ Dashboard');if(!token||token.length<32)throw Error('ตั้ง CLOUD_WORKER_TOKEN ก่อน');return async(path,data)=>{if(!/^\/api\/worker\//.test(path))throw Error('Worker เรียกได้เฉพาะ worker API');const r=await fetcher(u.origin+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(data),signal:AbortSignal.timeout(25000),redirect:'error'});const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error||'Cloud ติดต่อไม่ได้'),{statusCode:r.status});return value;};}
async function main(){
 const env=process.env,root=fileURLToPath(new URL('../',import.meta.url)),workerId=env.CLOUD_WORKER_ID,expectedAccount=env.CLOUD_FACEBOOK_ACCOUNT;
 if(!/^[A-Za-z0-9_-]{1,50}$/.test(workerId||'')||!expectedAccount)throw Error('ตั้ง CLOUD_WORKER_ID และ CLOUD_FACEBOOK_ACCOUNT ก่อน');
 const config=collectorConfig(root,{...env,COLLECTOR_PROFILE_DIR:env.COLLECTOR_PROFILE_DIR||'data/runtime/cloud-'+workerId+'-profile',COLLECTOR_OUTBOX_PATH:env.COLLECTOR_OUTBOX_PATH||'data/runtime/cloud-'+workerId+'-collector.sqlite'});config.statusPath=resolve(root,'data/runtime/cloud-'+workerId+'-collector-status.json');config.batchReportDir=resolve(root,'data/runtime/cloud-'+workerId+'-batch-reports');
 const publisher=createBrowserCommentPublisher({profileDir:config.profileDir,groupId:config.groupId,channel:config.channel});
 if(process.argv.includes('--login')){await publisher.open();console.log('เปิด Chrome ของ worker แล้ว ล็อกอินด้วยตัวเอง ปิดด้วย Ctrl+C');const stop=()=>publisher.close().finally(()=>process.exit(0));process.once('SIGINT',stop);process.once('SIGTERM',stop);await new Promise(()=>{});return;}
 const request=workerRequest({origin:env.CLOUD_ORIGIN,token:env.CLOUD_WORKER_TOKEN}),intent=createIntentService(root),guides=createGuideService(root),catalog=JSON.parse(await readFile(resolve(root,'data/guides/catalog.json'),'utf8'));
 const writer=createPetmommyWriter({enabled:env.REPLY_LLM_ENABLED==='true',provider:env.REPLY_LLM_PROVIDER||'ollama',...(env.REPLY_LLM_MODEL?{model:env.REPLY_LLM_MODEL}:{}),apiKey:env.OPENAI_API_KEY||''});
 const collector=createDashboardCollector({publisher,config,ingest:event=>request('/api/worker/ingest',event)});
 const journalPath=resolve(root,'data/runtime/cloud-'+workerId+'-result.json');await mkdir(resolve(root,'data/runtime'),{recursive:true});
 const worker=createCloudWorker({workerId,expectedAccount,publisher,request,publishEnabled:env.CLOUD_WORKER_PUBLISH_ENABLED==='true',
  journal:pending=>writeAtomicJSON(journalPath,pending),loadJournal:async()=>{try{return JSON.parse(await readFile(journalPath,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('อ่านผลค้างในเครื่องไม่ได้ ต้องตรวจไฟล์ก่อนรับงานใหม่');}},
  analyse:async(post,options)=>{const start=performance.now(),classified=await intent.classify({text:post.text}),topics=classifyTopics(post.text),selected=verifiedGuides(await guides.search({text:post.text,species:'cat'}),catalog),safety=evaluateSafety(post.text,{topics,guides:selected,sourceMeta:post.sourceMeta});const generated=await writer.generate({...post,text:options.reviewedText||post.text,topics,guides:selected,safety},{externalDataReviewed:options.externalDataReviewed===true});return {intent:classified,topics,guides:selected,safety,draft:generated.draft,replyMeta:generated.meta,processingMs:Math.round(performance.now()-start)};},
  collect:async scope=>{await collector.start({scope});while((await collector.status()).running)await delay(1000);const result=await collector.status();if(!result.last||result.last.state!=='completed')throw Object.assign(Error(result.message||'ยังเก็บโพสต์ไม่ครบตามรอบ'),{definitive:true});return result.last;},
 });
 let stopped=false;const stop=()=>{stopped=true;collector.cancel().catch(()=>{});};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{do{try{await worker.tick();}catch(error){console.error(error.statusCode===409?'ผลค้างต้องตรวจสอบบน Dashboard ก่อนรับงานต่อ':'Cloud/worker ยังไม่พร้อม ตรวจ config หรือการเชื่อมต่อ');if(error.statusCode===409)break;}if(process.argv.includes('--once'))break;if(!stopped)await delay(30000);}while(!stopped);}finally{await collector.close();await publisher.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('เปิด Cloud worker ไม่สำเร็จ ตรวจค่าตั้งต้นและคู่มือ');process.exitCode=1;});
