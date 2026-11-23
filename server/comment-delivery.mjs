import {createHash,randomUUID} from 'node:crypto';
import {workflowError} from './workflow-store.mjs';
export function groupCommentTarget(post,allowedGroupId){
 if(post.sourceType!=='group')throw workflowError('ส่งผ่าน browser ได้เฉพาะข้อมูลจากกลุ่มที่กำหนด',403);
 let url;try{url=new URL(post.url);}catch{throw workflowError('โพสต์นี้ยังไม่มีลิงก์ต้นทางที่ใช้ส่งได้');}
 const match=url.pathname.match(/^\/groups\/(\d+)\/(?:posts|permalink)\/([A-Za-z0-9_-]+)\/?$/);
 if(url.protocol!=='https:'||url.port||url.username||url.password||!['www.facebook.com','web.facebook.com','facebook.com'].includes(url.hostname)||!match||match[1]!==allowedGroupId)throw workflowError('ลิงก์โพสต์ไม่อยู่ในกลุ่มที่ตั้งค่าส่ง',403);
 if(post.externalId?.includes(':')&&post.externalId!==match[1]+':'+match[2])throw workflowError('รหัสโพสต์ไม่ตรงกับลิงก์ต้นทาง',409);
 return {groupId:match[1],postId:match[2],url:'https://www.facebook.com/groups/'+match[1]+'/posts/'+match[2]+'/'};
}
const hash=text=>createHash('sha256').update(text).digest('hex');
export function createCommentDelivery({store,checkedPost,publisher=null,clock=Date.now,previewTTL=300000}){
 const tickets=new Map(),pending=new Set();let closed=false;
 const approved=(id,revision)=>{const p=checkedPost(id,revision);if(p.status!=='approved'||p.approvedRevision!==p.revision)throw workflowError('ต้องอนุมัติร่างเวอร์ชันปัจจุบันก่อนส่ง',409);return p;};
 const status=()=>({demoAvailable:true,liveConfigured:!!publisher?.enabled,liveReady:!!publisher?.status().ready,liveMessage:publisher?.status().message||'ส่งจริงผ่าน Chrome ยังไม่เปิด ใช้ npm.cmd run replies:live',browser:publisher?.status()||{state:'disabled',browserOpen:false,busy:false},humanApprovalRequired:true,automaticReply:false});
 return {
  status,
  async refreshStatus(){await publisher?.refreshStatus?.();return status();},
  async openBrowser(){if(closed||!publisher?.enabled||!publisher.open)throw workflowError('ยังไม่เปิดตัวส่งผ่าน Chrome ใช้ npm.cmd run replies:live',503);await publisher.open();return status();},
  async showBrowser(){if(closed||!publisher?.enabled||!publisher.show)throw workflowError('ยังไม่มีหน้าต่าง Chrome ที่แสดงได้ เปิด worker ก่อน',503);await publisher.show();return status();},
  async closeBrowser(){if(pending.size||publisher?.status().busy)throw workflowError('กำลังตรวจหรือส่งคอมเมนต์ รอผลก่อนปิด Chrome',409);await publisher?.disconnect?.();tickets.clear();return status();},
  availability(post){let liveReason='';if(!publisher?.enabled)liveReason='ยังไม่เปิดตัวส่งจริงผ่าน Chrome';else{try{groupCommentTarget(post,publisher.groupId);}catch(e){liveReason=e.message;}}return {demo:true,live:!liveReason,liveReason};},
  async preview(id,{revision,mode='demo'}){
   if(closed)throw workflowError('ระบบส่งกำลังปิด',503);if(!['demo','live'].includes(mode))throw workflowError('เลือก Demo หรือส่งจริง');
   const post=approved(id,revision);let target={url:post.url||'',account:'บัญชีจำลองภายใน Demo'};
   if(mode==='live'){if(!publisher?.enabled)throw workflowError('ยังไม่ได้เปิดตัวส่งจริงผ่าน Chrome',503);const expected=groupCommentTarget(post,publisher.groupId),prepared=await publisher.prepare(post);if(prepared.url!==expected.url||typeof prepared.account!=='string'||!prepared.account.trim()||prepared.account.length>200)throw workflowError('ผลตรวจปลายทางหรือบัญชีไม่ถูกต้อง',502);target={...expected,account:prepared.account};}
   for(const [key,item]of tickets)if(item.expiresAt<=clock())tickets.delete(key);
   if(tickets.size>=100)throw workflowError('มีหน้าตรวจส่งค้างอยู่มาก กรุณาปิดแล้วลองใหม่',429);
   const ticket={id:randomUUID(),postId:id,revision,mode,draftHash:hash(post.draft),target,expiresAt:clock()+previewTTL,used:false};tickets.set(ticket.id,ticket);
   return {ticketId:ticket.id,revision,mode,text:post.draft,targetUrl:target.url,account:target.account,expiresAt:new Date(ticket.expiresAt).toISOString(),simulated:mode==='demo'};
  },
  async send(id,{ticketId,revision,confirmed,actor='operator'}){
   if(closed)throw workflowError('ระบบส่งกำลังปิด',503);
   const ticket=tickets.get(ticketId);if(!ticket||ticket.postId!==id||ticket.expiresAt<=clock())throw workflowError('หน้าตรวจส่งหมดอายุ กรุณาตรวจและยืนยันใหม่',409);
   if(confirmed!==true)throw workflowError('ต้องยืนยันข้อความ โพสต์ปลายทาง และบัญชีที่จะใช้ส่ง');
   if(ticket.used)throw workflowError('คำสั่งนี้ถูกใช้แล้ว กรุณาดูผลล่าสุดก่อนส่งอีกครั้ง',409);
   const post=approved(id,revision);if(ticket.revision!==revision||ticket.draftHash!==hash(post.draft))throw workflowError('ร่างเปลี่ยนหลังเปิดหน้าตรวจส่ง ต้องตรวจใหม่',409);
   ticket.used=true;
   if(ticket.mode==='demo')return {mode:'demo',published:false,receipt:store.simulatePublication(id,revision,String(actor).slice(0,80)),post:store.get(id)};
   if(!publisher?.enabled)throw workflowError('ตัวส่งจริงยังไม่พร้อม',503);
   const reservation=store.reservePublication(id,revision,String(actor).slice(0,80),'browser-ui');
   if(reservation.alreadySent)return {mode:'live',published:true,alreadySent:true,post:reservation.post};
   const job=(async()=>{
    try{const sent=await publisher.send(post,ticket.target);if(!sent?.id)throw Error('Missing visible comment receipt');
     const updated=store.publicationResult(id,{externalId:sent.id,info:{account:ticket.target.account,commentUrl:sent.url||'',verification:sent.pendingModeration?'visible-pending-moderation':'visible-comment',pendingModeration:sent.pendingModeration===true}});
     return {mode:'live',published:true,pendingModeration:sent.pendingModeration===true,post:updated,externalId:sent.id};
    }catch(error){const message=error.statusCode?error.message:'ยังยืนยันผลส่งไม่ได้ ต้องตรวจคอมเมนต์จริงก่อนส่งอีกครั้ง';store.publicationResult(id,{error:message,definitive:error.definitive===true});throw workflowError(message,502);}
   })();pending.add(job);try{return await job;}finally{pending.delete(job);}
  },
  async close(){closed=true;tickets.clear();await Promise.allSettled([...pending]);await publisher?.close?.();},
 };
}
