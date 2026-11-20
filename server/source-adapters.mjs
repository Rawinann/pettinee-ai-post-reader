import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {workflowError} from './workflow-store.mjs';
export function secureEqual(a,b){const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));return left.length===right.length&&left.length>0&&timingSafeEqual(left,right);}
export function verifyMetaSignature(raw,signature,secret){if(!secret||!/^sha256=[a-f\d]{64}$/i.test(signature||''))return false;return timingSafeEqual(createHmac('sha256',secret).update(raw).digest(),Buffer.from(signature.slice(7),'hex'));}
function text(value,name,max=10000){if(value===undefined)return '';if(typeof value!=='string'||value.length>max)throw workflowError(name+' ไม่ถูกต้อง');return value.trim();}
export function validateSourceEvent(raw,{trustedPage=false}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw workflowError('ต้องส่งข้อมูลโพสต์เป็น object');
 const sourceType=raw.sourceType||'import';if(!['page','group','import','mock'].includes(sourceType))throw workflowError('ประเภทแหล่งข้อมูลไม่ถูกต้อง');
 if(sourceType==='page'&&!trustedPage)throw workflowError('รับ Page ผ่าน adapter ที่ตรวจสิทธิ์เท่านั้น',403);
 if(sourceType!=='mock'&&!trustedPage&&raw.authorized!==true)throw workflowError('ต้องยืนยันสิทธิ์การใช้ข้อมูลก่อนนำเข้า',400);
 const message=text(raw.text,'ข้อความ'),externalId=text(raw.externalId||raw.postId,'รหัสโพสต์',300),eventId=text(raw.eventId,'รหัส event',500);let url=text(raw.url,'URL',2000);
 if(url){try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error();parsed.hash='';url=parsed.href;}catch{throw workflowError('ลิงก์ต้นทางต้องเป็น HTTPS และไม่มีข้อมูลล็อกอิน');}}
 if(!message&&!url&&!externalId)throw workflowError('ต้องมีข้อความ ลิงก์ หรือรหัสโพสต์อย่างน้อยหนึ่งอย่าง');
 let publishedAt=text(raw.publishedAt,'เวลาโพสต์',60);if(publishedAt){if(Number.isNaN(Date.parse(publishedAt)))throw workflowError('เวลาโพสต์ไม่ถูกต้อง');publishedAt=new Date(publishedAt).toISOString();}
 return {sourceType,externalId,eventId,url,text:message,publishedAt,authorization:sourceType==='mock'?'fictional-test':trustedPage?'verified-meta-page-webhook':'operator-confirmed'};
}
export const MOCK_SCENARIOS=Object.freeze([
 {id:'neuter',label:'แผลบวมหลังทำหมัน',text:'หลังทำหมันวันที่ 5–6 แผลยังดูบวม จึงถามว่าปกติหรือไม่'},
 {id:'belief',label:'รักษาหลายวันแล้วยังไม่หาย',text:'พาแมวไปรักษามา 6–7 วันแล้วแต่ยังไม่หาย หมอรักษาไม่ดีหรือเปล่า มีคนบอกให้เปลี่ยนยาเพราะแมวเขาใช้แล้วหาย'},
 {id:'urinary',label:'แมวปัสสาวะไม่ออก',text:'ตอนนี้แมวฉี่ไม่ออกเลย เบ่งหลายครั้งแต่ไม่มีปัสสาวะ ควรทำอย่างไร'},
 {id:'cost',label:'ถามเรื่องค่าใช้จ่าย',text:'อยากทราบค่าใช้จ่ายติดตามอาการแมวกับคลินิก ควรถามรายการตรวจอะไรบ้าง'},
]);
export function mockEvent(scenario='neuter',eventId){const item=MOCK_SCENARIOS.find(s=>s.id===scenario);if(!item)throw workflowError('ไม่พบสถานการณ์จำลอง');const key=eventId||'mock-'+randomUUID();return {sourceType:'mock',externalId:key,eventId:key,text:item.text,url:'',publishedAt:new Date().toISOString(),authorization:'fictional-test'};}
export function createPageAdapter({pageId='',accessToken='',appSecret='',verifyToken='',graphVersion='',publishEnabled=false,appId='',fetcher=globalThis.fetch,timeoutMs=15000}={}){
 let checked=null;
 const configured=()=>/^\d+$/.test(pageId)&&/^\d+$/.test(appId)&&!!accessToken&&!!appSecret&&!!verifyToken&&/^v\d+\.\d+$/.test(graphVersion);
 const owns=id=>/^\d+_\d+$/.test(id||'')&&id.startsWith(pageId+'_');
 async function graph(path,{method='GET',fields,body}={}){
  if(!configured())throw workflowError('ยังไม่ได้ตั้งค่า App ID, Page ID, token, App Secret, verify token หรือ Graph version',503);
  const url=new URL('https://graph.facebook.com/'+graphVersion+'/'+path);if(fields)url.searchParams.set('fields',fields);
  let response;try{response=await fetcher(url,{method,headers:{Authorization:'Bearer '+accessToken,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:body?new URLSearchParams(body):undefined,signal:AbortSignal.timeout(timeoutMs)});}catch{throw Object.assign(workflowError('ติดต่อ Meta ไม่สำเร็จ ยังไม่ทราบผลคำขอ',502),{definitive:false});}
  let data;try{data=await response.json();}catch{throw Object.assign(workflowError('Meta ส่งผลลัพธ์ที่อ่านไม่ได้ ยังไม่ทราบผลคำขอ',502),{definitive:false});}
  if(!response.ok||data.error)throw Object.assign(workflowError('Meta ปฏิเสธคำขอ กรุณาตรวจ token, permission และสถานะแอป (code '+(Number(data.error?.code)||response.status)+')',502),{definitive:response.status<500});return data;
 }
 return {
  status(){return {type:'page',configured:configured(),verified:!!checked?.ok,checkedAt:checked?.at||null,pageId,webhookConfigured:!!appSecret&&!!verifyToken,publishEnabled,canPublish:configured()&&publishEnabled&&!!checked?.ok,message:!configured()?'ยังไม่ได้ตั้งค่า Facebook Page':!checked?.ok?'ตั้งค่าแล้ว ยังไม่ได้ตรวจการเข้าถึงกับ Meta':'ตรวจ Page และ subscription แล้ว การตอบยังขึ้นกับสิทธิ์ของ token ทุกครั้ง'};},
  groupStatus(){return {type:'group',connected:false,automaticRead:false,automaticPublish:false,message:'กลุ่มภายนอกยังรอ connector ที่มีสิทธิ์รองรับ ใช้ Import / connector API หรือ Mock ได้ ไม่มีการใช้ Groups API เดิม'};},
  challenge(search){if(search.get('hub.mode')!=='subscribe'||!secureEqual(search.get('hub.verify_token'),verifyToken))throw workflowError('Verify token ไม่ตรง',403);const challenge=search.get('hub.challenge');if(!challenge||challenge.length>2000)throw workflowError('Challenge ไม่ถูกต้อง');return challenge;},
  events(raw,signature){
   if(!verifyMetaSignature(raw,signature,appSecret))throw workflowError('ลายเซ็น Meta ไม่ถูกต้อง',403);
   let body;try{body=JSON.parse(raw.toString('utf8'));}catch{throw workflowError('Webhook JSON ไม่ถูกต้อง');}
   if(body.object!=='page'||!Array.isArray(body.entry))throw workflowError('รองรับเฉพาะ Page webhook');
   const events=[];let ignored=0;
   for(const entry of body.entry){if(String(entry.id)!==pageId){ignored++;continue;}for(const change of Array.isArray(entry.changes)?entry.changes:[]){const value=change.value||{};
    if(change.field!=='feed'||value.verb!=='add'||!['post','status','photo','video','link'].includes(value.item)||!owns(value.post_id)||value.comment_id){ignored++;continue;}
    events.push(validateSourceEvent({sourceType:'page',externalId:value.post_id,eventId:'page-feed-add:'+value.post_id,text:'',authorized:true},{trustedPage:true}));
   }}return {events,ignored};
  },
  async verify(){try{const me=await graph('me',{fields:'id,name'});if(String(me.id)!==pageId)throw workflowError('Token ไม่ได้เป็นของ Page ที่ตั้งค่า',403);const apps=await graph(pageId+'/subscribed_apps',{fields:'id,subscribed_fields'});if(!Array.isArray(apps.data)||!apps.data.some(a=>(!appId||String(a.id)===appId)&&a.subscribed_fields?.includes('feed')))throw workflowError('ยังไม่พบแอปที่สมัคร Page feed webhook',409);checked={ok:true,at:new Date().toISOString()};return this.status();}catch(e){checked={ok:false,at:new Date().toISOString()};throw e;}},
  async getPost(id){if(!owns(id))throw workflowError('โพสต์ไม่ได้อยู่ใน Page ที่ตั้งค่า',403);const data=await graph(id,{fields:'id,message,permalink_url,created_time'});if(data.id!==id)throw workflowError('Meta คืนรหัสโพสต์ไม่ตรง',502);return validateSourceEvent({sourceType:'page',externalId:id,text:data.message||'',url:data.permalink_url||'',publishedAt:data.created_time||''},{trustedPage:true});},
  async publish(post,reply){if(post.sourceType!=='page'||!owns(post.externalId)||!this.status().canPublish)throw workflowError('ยังไม่มีการตรวจ Page และเปิดสิทธิ์ส่งคอมเมนต์ ใช้คัดลอกหลังอนุมัติได้',403);const result=await graph(post.externalId+'/comments',{method:'POST',body:{message:reply}});if(typeof result.id!=='string'||!/^\d+(?:_\d+)?$/.test(result.id))throw Object.assign(workflowError('ยังยืนยันรหัสคอมเมนต์จาก Meta ไม่ได้',502),{definitive:false});return {id:result.id};},
 };
}
