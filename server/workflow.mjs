import {readFile,access} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createWorkflowStore,workflowError} from './workflow-store.mjs';
import {createPageAdapter,validateSourceEvent,mockEvent,MOCK_SCENARIOS} from './source-adapters.mjs';
import {classifyTopics,evaluateSafety,verifiedGuides,generateReply,checkReply} from '../lib/workflow-policy.mjs';
import {readCollectorStatus} from './collector-status.mjs';
import {createCommentDelivery} from './comment-delivery.mjs';
import {createPetmommyWriter} from './petmommy.mjs';
import {createGuideTracking} from './guide-tracking.mjs';
export function integrationURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)return '';u.search='';u.hash='';return u.href;}catch{return '';}}
export function createWorkflowService({rootDir,dbPath,intent,guides,pageAdapter,meta={},autoRun=true,pollMs=500,clock=Date.now,storeOptions={},chatbotUrl='https://meongsiljang.com/th',televetUrl='',collectorStatusPath=join(dirname(dbPath),'collector-status.json'),browserPublisher=null,replyWriter=null,trackingOrigin=''}={}){
 const store=createWorkflowStore(dbPath,{clock,...storeOptions}),owner=randomUUID(),page=pageAdapter||createPageAdapter(meta);
 let catalogPromise,work=null,timer=null,closing=null,stopped=false,mockTimer=null,mockRemaining=0;
 const catalog=()=>catalogPromise??=readFile(join(rootDir,'data/guides/catalog.json'),'utf8').then(JSON.parse).catch(e=>{catalogPromise=null;throw e;});
 const get=id=>{const post=store.get(id);if(!post)throw workflowError('ไม่พบโพสต์',404);return post;};
 const checkedPost=(id,revision)=>{const post=get(id);if(post.revision!==revision)throw workflowError('คำตอบเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลล่าสุด',409);const errors=checkReply(post.draft,post);if(errors.length)throw workflowError(errors.join(' · '),422);return post;};
 const commentDelivery=createCommentDelivery({store,checkedPost,publisher:browserPublisher,clock});
 const writer=replyWriter||createPetmommyWriter(),tracking=createGuideTracking({store,origin:trackingOrigin});
 const writeReply=async(post,options)=>{const generated=await writer.generate(post,options),tracked=tracking.attach(post,generated.draft);const replyMeta={...generated.meta,links:tracked.links};const errors=checkReply(tracked.draft,{...post,replyMeta});if(errors.length)throw workflowError(errors.join(' · '),422);return {draft:tracked.draft,replyMeta};};
 async function execute(job){
  const started=performance.now(),heartbeat=setInterval(()=>store.heartbeat(job),20000);heartbeat.unref?.();
  const step=async(name,fn)=>{const start=performance.now();store.stage(job,name);const value=await fn();store.stage(job,name,Math.round(performance.now()-start));return value;};
  try{
   let post=job.post;
   if(post.sourceType==='page'&&!post.text){const fetched=await step('fetch-page',()=>page.getPost(post.externalId));store.hydrate(job,fetched);post=get(post.id);}
   const classified=await step('intent',()=>intent.classify({text:post.text}));
   const topics=await step('topic',()=>classifyTopics(post.text));
   const selected=await step('guide',async()=>{if(post.text.trim().length<4)return [];const found=await guides.search({text:post.text,species:'cat'});return verifiedGuides(found,await catalog());});
   const safety=await step('safety',()=>evaluateSafety(post.text,{intent:classified,topics,guides:selected,sourceMeta:post.sourceMeta}));
   const generated=await step('draft',()=>writeReply({...post,topics,guides:selected,safety}));
   store.complete(job,{intent:classified,topics,guides:selected,safety,...generated,processingMs:Math.round(performance.now()-started)});
  }catch(error){const safeMessage=error.statusCode?error.message:'วิเคราะห์ไม่สำเร็จ กรุณาตรวจโมเดล ดัชนี หรือแหล่งข้อมูลแล้วลองใหม่';store.fail(job,safeMessage);}
  finally{clearInterval(heartbeat);}
 }
 async function runOnce(){if(stopped||work)return false;const job=store.claim(owner);if(!job)return false;work=execute(job);try{await work;}finally{work=null;}return true;}
 const kick=()=>{if(autoRun&&!stopped)runOnce().catch(()=>{});};
 const service={
  store,page,runOnce,
  replyStatus:()=>writer.status(),
  replyBrowserStatus:()=>commentDelivery.refreshStatus(),
  openReplyBrowser:()=>commentDelivery.openBrowser(),
  closeReplyBrowser:()=>commentDelivery.closeBrowser(),
  guideTrackingStatus:()=>tracking.status(),
  trackingReport:()=>tracking.report(),
  resolveGuideLink:(token,options)=>tracking.resolve(token,options),
  async rewrite(id,{revision,externalDataReviewed=false,textForAI}){const post=get(id);if(post.revision!==revision||!['awaiting_review','needs_review','approved'].includes(post.status))throw workflowError('โหลดร่างล่าสุดที่ยังไม่ได้ส่งก่อนเขียนใหม่',409);if(writer.status().externalDataReviewRequired){if(externalDataReviewed!==true||typeof textForAI!=='string'||!textForAI.trim()||textForAI.length>10000)throw workflowError('ตรวจและลบข้อมูลส่วนบุคคลในข้อความที่จะส่ง OpenAI ก่อน',400);post.text=textForAI.trim();}const generated=await writeReply(post,{externalDataReviewed});const updated=store.edit(id,generated.draft,revision);return store.setReplyMeta(id,updated.revision,generated.replyMeta);},
  ingest(raw,options){const event=validateSourceEvent(raw,options);event.initialSafety=evaluateSafety(event.text,{sourceMeta:event.sourceMeta});const result=store.ingest(event);kick();return result;},
  list:options=>store.list(options),
  detail(id){const post=get(id);return {...post,replyErrors:post.draft?checkReply(post.draft,post):[],history:store.history(id),canPublishPage:post.sourceType==='page'&&page.status().canPublish,commentDelivery:commentDelivery.availability(post),demoComment:store.demoReceipt(id),publication:store.publication(id)};},
  async status(){await commentDelivery.refreshStatus();const [guideStatus,intentStatus]=await Promise.all([guides.status(),intent.status()]);const encoderAvailable=await access(join(rootDir,'models/guide-encoder/onnx/model_quantized.onnx')).then(()=>true,()=>false);return {available:true,brand:'แอพคุณหมอใจดี',company:'Pettinee',persistence:'server-sqlite',...store.stats(),connections:{collector:await readCollectorStatus(collectorStatusPath),page:page.status(),group:page.groupStatus(),import:{available:true},mock:{available:true,running:!!mockTimer,remaining:mockRemaining}},guides:{...guideStatus,encoderAvailable,metadataOnly:true},intent:{ready:intentStatus.ready,trainingLabelStatus:intentStatus.trainingLabelStatus},commentDelivery:commentDelivery.status(),reply:writer.status(),guideTracking:tracking.report(),approval:{required:true,autoReply:false,generator:writer.status().enabled?'petmommy-llm-with-fallback':'petmommy-template',llmConnected:!!writer.status().lastSuccessAt},products:{chatbot:{mode:'external-link',url:integrationURL(chatbotUrl),apiConnected:false},televet:{mode:integrationURL(televetUrl)?'external-link':'not-configured',url:integrationURL(televetUrl),apiConnected:false,bookingConnected:false}},mockScenarios:MOCK_SCENARIOS};},
  edit(id,{text,revision,actor='operator'}){if(typeof text!=='string'||!text.trim()||text.length>2400)throw workflowError('คำตอบต้องยาว 1–2,400 ตัวอักษร');return store.edit(id,text,revision,String(actor).slice(0,80));},
  approve(id,{revision,acknowledged,actor='operator'}){if(acknowledged!==true)throw workflowError('ต้องอ่านข้อความ คู่มือ และข้อควรตรวจ แล้วทำเครื่องหมายยืนยัน');checkedPost(id,revision);return store.approve(id,revision,String(actor).slice(0,80));},
  copy(id,{revision,actor='operator'}){checkedPost(id,revision);return {text:store.copy(id,revision,String(actor).slice(0,80)),published:false};},
  manual(id,{revision,confirmed,actor='operator'}){if(confirmed!==true)throw workflowError('ต้องยืนยันว่าได้ตอบผ่านช่องทางของคุณแล้ว');checkedPost(id,revision);return store.confirmManual(id,revision,String(actor).slice(0,80));},
  retry(id,{revision,actor='operator'}){const post=store.retry(id,revision,String(actor).slice(0,80));kick();return post;},
  prepareComment:(id,body)=>commentDelivery.preview(id,body),
  sendComment:(id,body)=>commentDelivery.send(id,body),
  async publish(id,{revision,actor='operator'}){
   const post=checkedPost(id,revision);if(post.sourceType!=='page')throw workflowError('แหล่ง Group, Import และ Mock ใช้คัดลอกหลังอนุมัติเท่านั้น',403);
   if(post.status!=='published'&&!page.status().canPublish)throw workflowError('Facebook Page ยังไม่ผ่านการตรวจการเชื่อมต่อหรือยังไม่ได้เปิดสิทธิ์ส่ง',403);
   const reserved=store.reservePublication(id,revision,String(actor).slice(0,80));if(reserved.alreadySent)return {post:reserved.post,externalId:reserved.externalId,alreadySent:true};
   try{const sent=await page.publish(post,post.draft);return {post:store.publicationResult(id,{externalId:sent.id}),externalId:sent.id,alreadySent:false};}
   catch(e){const updated=store.publicationResult(id,{error:e.statusCode?e.message:'ไม่ทราบผลการส่ง ต้องตรวจคอมเมนต์ที่ Facebook ก่อนลองอีกครั้ง',definitive:e.definitive===true});throw Object.assign(workflowError(updated.lastError,502),{postStatus:updated.status});}
  },
  resolvePublication(id,body){return store.resolvePublication(id,body.revision,body,String(body.actor||'operator').slice(0,80));},
  webhook(raw,signature){const result=page.events(raw,signature),posts=result.events.map(event=>service.ingest({...event,authorized:true},{trustedPage:true}));return {received:posts.length,duplicates:posts.filter(p=>p.duplicate).length,ignored:result.ignored};},
  async importPage(postId){const event=await page.getPost(postId);return service.ingest({...event,authorized:true},{trustedPage:true});},
  mock({scenario='neuter',eventId}={}){return service.ingest(mockEvent(scenario,eventId));},
  startMock({scenario='neuter',count=3,intervalMs=5000}={}){if(!MOCK_SCENARIOS.some(s=>s.id===scenario)||!Number.isInteger(count)||count<1||count>30||!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>60000)throw workflowError('Mock ต้องมี 1–30 events ห่างกัน 1–60 วินาที');if(mockTimer)throw workflowError('มี Mock stream ทำงานอยู่แล้ว',409);mockRemaining=count;const emit=()=>{if(stopped||mockRemaining<=0){service.stopMock();return;}service.mock({scenario});mockRemaining--;if(!mockRemaining)service.stopMock();};mockTimer=setInterval(emit,intervalMs);mockTimer.unref?.();emit();return {running:!!mockTimer,remaining:mockRemaining};},
  stopMock(){if(mockTimer)clearInterval(mockTimer);mockTimer=null;mockRemaining=0;return {running:false};},
  close(){if(closing)return closing;stopped=true;if(timer)clearInterval(timer);service.stopMock();closing=(async()=>{if(work)await work;await commentDelivery.close();store.close();})();return closing;},
 };
 if(autoRun){timer=setInterval(kick,Math.max(100,pollMs));timer.unref?.();kick();}
 return service;
}
