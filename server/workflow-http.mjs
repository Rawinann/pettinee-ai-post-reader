import {secureEqual} from './source-adapters.mjs';
import {workflowError} from './workflow-store.mjs';
export async function readWorkflowBody(req,limit=1_000_000){const parts=[];let size=0;for await(const part of req){size+=part.length;if(size<=limit)parts.push(part);}if(size>limit)throw workflowError('ข้อมูลใหญ่เกินขนาดที่รองรับ',413);return Buffer.concat(parts);}
export function createWorkflowHTTP(service,{operatorToken='',ingestToken=''}={}){
 const authorize=(req,token,kind)=>{if(token&&!secureEqual(req.headers.authorization,'Bearer '+token))throw workflowError('ต้องระบุ '+kind+' token ที่ถูกต้อง',401);};
 return async(req,url)=>{
  const path=url.pathname,method=req.method;
  if(path==='/webhooks/meta'){
   if(method==='GET')return {body:service.page.challenge(url.searchParams),type:'text/plain; charset=utf-8'};
   if(method==='POST')return {body:service.webhook(await readWorkflowBody(req,500000),req.headers['x-hub-signature-256'])};
   throw workflowError('ไม่รองรับ method',405);
  }
  if(path==='/api/sources/events'){
   if(!ingestToken)throw workflowError('ยังไม่ได้ตั้งค่า INGEST_TOKEN สำหรับ connector',503);authorize(req,ingestToken,'connector');
  }else authorize(req,operatorToken,'operator');
  if(method==='GET'){
   if(path==='/api/workflow/status'||path==='/api/workflow/dashboard')return {body:await service.status()};
   if(path==='/api/workflow/posts')return {body:service.list(Object.fromEntries(url.searchParams))};
   if(path==='/api/workflow/guide-clicks')return {body:service.trackingReport()};
   if(path==='/api/workflow/reply-status')return {body:service.replyStatus()};
   if(path==='/api/workflow/reply-browser')return {body:await service.replyBrowserStatus()};
   if(path==='/api/workflow/collection')return {body:await service.collectionStatus()};
   const match=path.match(/^\/api\/workflow\/posts\/([a-f\d-]{36})$/);if(match)return {body:service.detail(match[1])};
   throw workflowError('ไม่พบเส้นทางนี้',404);
  }
  if(method!=='POST')throw workflowError('ไม่รองรับ method',405);
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw workflowError('กรุณาส่ง JSON',415);
  let body;try{body=JSON.parse((await readWorkflowBody(req,path==='/api/workflow/import'?4_000_000:1_000_000)).toString('utf8'));}catch(error){if(error.statusCode)throw error;throw workflowError('JSON ไม่ถูกต้อง');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw workflowError('ต้องส่ง JSON object');
  if(path==='/api/sources/events'||path==='/api/workflow/posts')return {status:202,body:service.ingest(body)};
  if(path==='/api/workflow/import'){
   if(body.authorized!==true)throw workflowError('ต้องยืนยันสิทธิ์การใช้ข้อมูลก่อนนำเข้า');
   if(!Array.isArray(body.posts)||body.posts.length<1||body.posts.length>200)throw workflowError('นำเข้าได้ครั้งละ 1–200 โพสต์');
   const results=body.posts.map((post,index)=>{try{return {index,...service.ingest({...post,authorized:true})};}catch(error){return {index,error:error.statusCode?error.message:'รับข้อมูลไม่สำเร็จ'};}});
   return {body:{results,accepted:results.filter(r=>r.post&&!r.duplicate).length,duplicates:results.filter(r=>r.duplicate).length,failed:results.filter(r=>r.error).length}};
  }
  if(path==='/api/workflow/mock')return {status:202,body:service.mock(body)};
  if(path==='/api/workflow/mock/start')return {body:service.startMock(body)};
  if(path==='/api/workflow/mock/stop')return {body:service.stopMock()};
  if(path==='/api/workflow/connections/page/verify')return {body:await service.page.verify()};
  if(path==='/api/workflow/page/import')return {status:202,body:await service.importPage(body.postId)};
  if(path==='/api/workflow/reply-browser/open')return {body:await service.openReplyBrowser()};
  if(path==='/api/workflow/reply-browser/show')return {body:await service.showReplyBrowser()};
  if(path==='/api/workflow/reply-browser/close')return {body:await service.closeReplyBrowser()};
  if(path==='/api/workflow/collection/start')return {status:202,body:await service.startCollection(body)};
  if(path==='/api/workflow/collection/cancel')return {body:await service.cancelCollection()};
  const match=path.match(/^\/api\/workflow\/posts\/([a-f\d-]{36})\/(draft|approve|copy|manual|publish|retry|resolve|comment-preview|comment-send|rewrite)$/);
  if(match){const operations={draft:'edit',approve:'approve',copy:'copy',manual:'manual',publish:'publish',retry:'retry',resolve:'resolvePublication','comment-preview':'prepareComment','comment-send':'sendComment',rewrite:'rewrite'};return {body:await service[operations[match[2]]](match[1],body)};}
  throw workflowError('ไม่พบเส้นทางนี้',404);
 };
}
