import {workflowError as fail} from '../server/errors.mjs';
import {guideLanding} from '../server/guide-landing.mjs';
async function body(req){let parsed;try{parsed=req.body;}catch{throw fail('JSON ไม่ถูกต้อง');}if(parsed&&typeof parsed==='object'){if(Buffer.byteLength(JSON.stringify(parsed))>1000000)throw fail('ข้อมูลใหญ่เกินกำหนด',413);if(Array.isArray(parsed))throw fail('ส่งข้อมูลเป็น JSON object');return parsed;}const parts=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1000000)throw fail('ข้อมูลใหญ่เกินกำหนด',413);parts.push(chunk);}let value;try{value=JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');}catch{throw fail('JSON ไม่ถูกต้อง');}if(!value||typeof value!=='object'||Array.isArray(value))throw fail('ส่งข้อมูลเป็น JSON object');return value;}
export function createCloudHTTP({store,service,auth}){
 return async(req,res)=>{
  const send=(status,value,type='application/json; charset=utf-8')=>{res.statusCode=status;res.setHeader('Content-Type',type);res.end(req.method==='HEAD'?'':type.startsWith('application/json')?JSON.stringify(value):value);};
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  try{
   const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
   const publicLink=path.match(/^\/(?:r\/)?g\/([a-f0-9]{32}|[A-Za-z0-9_-]{12})(\/open)?$/);
   if(publicLink){const outbound=!!publicLink[2];if(outbound?method!=='POST':!['GET','HEAD'].includes(method))throw fail('ไม่รองรับ method',405);const found=await store.link(publicLink[1],{method,outbound,userAgent:String(req.headers['user-agent']||''),purpose:String(req.headers['sec-purpose']||req.headers.purpose||'')});if(!found)throw fail('ไม่พบคู่มือ',404);if(outbound){res.setHeader('Location',found.destination);return send(303,'','text/plain');}res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");return send(200,guideLanding(found),'text/html; charset=utf-8');}
   if(path==='/api/config'&&method==='GET')return send(200,{workflowAvailable:true,cloud:true,aiAvailable:false});
   if(path.startsWith('/api/worker/')){
    if(method!=='POST')throw fail('ไม่รองรับ method',405);const worker=await store.authenticateWorker(String(req.headers.authorization||'').replace(/^Bearer /,'')),value=await body(req);
    if(path==='/api/worker/heartbeat'){await store.heartbeat(worker.id,value);return send(200,{ok:true,workerId:worker.id});}
    if(path==='/api/worker/claim'){await store.heartbeat(worker.id,value.browser||{});return send(200,{job:await store.claim(worker)});}
    if(path==='/api/worker/ingest'&&!worker.capabilities.collect)throw fail('worker ไม่เปิดตัวเก็บโพสต์',403);
    if(path==='/api/worker/ingest')return send(200,await service.ingest({...value,authorized:true},worker.id,{worker:true}));
    const m=path.match(/^\/api\/worker\/jobs\/([a-f\d-]{36})\/(renew|complete)$/i);if(!m)throw fail('ไม่พบเส้นทาง worker',404);
    if(m[2]==='renew'){await store.renew(worker.id,m[1],value.leaseToken);return send(200,{ok:true});}
    if(!['success','failed','unknown'].includes(value.status))throw fail('สถานะผลลัพธ์ไม่ถูกต้อง');
    const job=(await store.pool.query('SELECT * FROM pettinee_jobs WHERE id=$1',[m[1]])).rows[0];if(!job||job.worker_id!==worker.id||job.lease_token!==value.leaseToken)throw fail('ไม่ใช่งานของ worker นี้',403);
    let data=value.data||{};if(value.status==='success'&&['analyse','rewrite'].includes(job.kind))data=await service.validateAnalysis(job,data);
    if(value.status==='success'&&job.kind==='collect'){const clean={};for(const key of ['read','new','seen','changed','delivered','rounds','analysisRemaining']){if(!Number.isInteger(data[key]??0)||(data[key]??0)<0||(data[key]??0)>100000)throw fail('ตัวเลขผลดึงโพสต์ไม่ถูกต้อง',422);clean[key]=data[key]??0;}clean.finishedAt=Number.isFinite(Date.parse(data.finishedAt))?new Date(data.finishedAt).toISOString():new Date().toISOString();clean.state=['completed','incomplete','cancelled'].includes(data.state)?data.state:'incomplete';clean.scope=['latest40','catchup'].includes(data.scope)?data.scope:'latest40';clean.collectionComplete=data.collectionComplete===true;data=clean;}
    if(value.status==='success'&&job.kind==='publish'){if(typeof data.id!=='string'||! /^[A-Za-z0-9_-]{1,200}$/.test(data.id))throw fail('ไม่มีรหัสคอมเมนต์ที่ตรวจพบ',422);let evidence;try{evidence=new URL(data.url);}catch{throw fail('ไม่มีลิงก์หลักฐาน',422);}if(evidence.origin!=='https://www.facebook.com'||evidence.pathname.replace('/permalink/','/posts/').replace(/\/$/,'')!==new URL(job.snapshot.url).pathname.replace('/permalink/','/posts/').replace(/\/$/,'')||evidence.searchParams.get('comment_id')!==data.id||String(data.account||'').normalize('NFC').replace(/\s+/gu,' ').trim()!==String(job.snapshot.expectedAccount||'').normalize('NFC').replace(/\s+/gu,' ').trim())throw fail('หลักฐานหรือบัญชีไม่ตรงกับงาน',422);data={id:data.id,url:evidence.href,account:data.account,pendingModeration:data.pendingModeration===true};}
    return send(200,await store.complete(worker.id,m[1],value.leaseToken,{status:value.status,data,message:value.message}));
   }
   if(path==='/api/auth/login'&&method==='POST'){auth.checkOrigin(req);const value=await auth.login(req,await body(req));res.setHeader('Set-Cookie',value.cookie);return send(200,{user:value.user});}
   const user=auth.user(req),actor=user.email;
   if(path==='/api/auth/me'&&method==='GET')return send(200,{user});
   if(method==='POST')auth.checkOrigin(req);
   if(path==='/api/auth/logout'&&method==='POST'){res.setHeader('Set-Cookie',auth.logout());return send(200,{ok:true});}
   if(method==='GET'){
    if(path==='/api/workflow/status')return send(200,await service.status());
    if(path==='/api/workflow/posts')return send(200,await store.list(Object.fromEntries(url.searchParams)));
    if(path==='/api/workflow/collection')return send(200,await store.collection());
    if(path==='/api/workflow/guide-clicks')return send(200,await store.tracking());
    const m=path.match(/^\/api\/workflow\/posts\/([a-f\d-]{36})$/i);if(m)return send(200,await service.detail(m[1]));
    throw fail('ไม่พบเส้นทางนี้',404);
   }
   if(method!=='POST')throw fail('ไม่รองรับ method',405);
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail('ส่งข้อมูลเป็น JSON',415);const value=await body(req);
   if(path==='/api/workflow/import'){if(value.authorized!==true||!Array.isArray(value.posts)||!value.posts.length||value.posts.length>200)throw fail('ยืนยันสิทธิ์และนำเข้า 1–200 โพสต์');const results=[];for(const [index,p] of value.posts.entries())try{results.push({index,...await service.ingest({...p,authorized:true},actor)});}catch(e){results.push({index,error:e.statusCode?e.message:'นำเข้าไม่สำเร็จ'});}return send(200,{accepted:results.filter(r=>r.post&&!r.duplicate).length,duplicates:results.filter(r=>r.duplicate).length,failed:results.filter(r=>r.error).length,results});}
   if(path==='/api/workflow/collection/start'){await store.collect(value.workerId,value.scope||'latest40',actor);return send(200,await store.collection());}
   const m=path.match(/^\/api\/workflow\/posts\/([a-f\d-]{36})\/(draft|approve|comment-preview|comment-send|manual|retry|resolve|rewrite)$/i);if(!m)throw fail('ไม่พบเส้นทางนี้',404);const id=m[1],op=m[2];
   if(op==='draft')return send(200,await store.edit(id,value,actor));if(op==='approve')return send(200,await store.approve(id,value,actor));if(op==='comment-preview')return send(200,await service.preview(id,value,actor));if(op==='comment-send')return send(200,await service.send(id,value,actor));if(op==='manual')return send(200,await store.manual(id,value,actor));if(op==='retry')return send(200,await store.retry(id,value.revision,actor));if(op==='resolve')return send(200,await store.reconcile(id,value,actor));
   if(op==='rewrite')return send(200,await store.queueRewrite(id,value,actor));
  }catch(error){return send(error.statusCode||500,{error:error.statusCode?error.message:'ระบบ Cloud ยังไม่พร้อม ตรวจการตั้งค่าหรือรอสักครู่'});}
 };
}
