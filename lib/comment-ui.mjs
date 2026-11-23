const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function link(url,label){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return '';return `<a class="evidence-link" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${esc(label)}</a>`;}catch{return '';}}
export function createCommentUI(host){
 let sending=false;
 const buttons=()=>document.querySelectorAll('[data-comment-action="send-live"],[data-comment-action="send-demo"]');
 document.addEventListener('input',event=>{if(event.target.id==='wf-draft')for(const b of buttons())b.disabled=true;});
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-comment-action]');if(!button)return;
  const action=button.dataset.commentAction;
  if(!['send-live','send-demo'].includes(action)||sending||button.disabled)return;
  const post=host.getPost();if(!post)return;
  if(host.isDirty()){host.notify('บันทึกและอนุมัติร่างเวอร์ชันปัจจุบันก่อน');return;}
  // This explicit click confirms the approved reply visible beside the source.
  // Preflight still binds the exact account, target and revision before sending.
  sending=true;host.pause();for(const b of buttons())b.disabled=true;let sendRequested=false;
  const mode=action==='send-live'?'live':'demo';host.notify(mode==='live'?'กำลังตรวจต้นทางและส่งคำตอบผ่าน Chrome…':'กำลังทดลองส่ง Demo…');
  try{
   const ticket=await host.request('/api/workflow/posts/'+post.id+'/comment-preview',{revision:post.revision,mode});
   if(host.getPost()?.id!==post.id||host.isDirty())throw Error('โพสต์หรือร่างเปลี่ยนระหว่างเตรียมส่ง ยังไม่ได้ส่งข้อความ');
   sendRequested=true;
   const result=await host.request('/api/workflow/posts/'+post.id+'/comment-send',{ticketId:ticket.ticketId,revision:ticket.revision,confirmed:true});
   await host.refresh(post.id);host.notify(result.mode==='demo'?'ทดลองส่งแล้ว · Demo ไม่ได้โพสต์ Facebook':result.pendingModeration?'ส่งแล้ว · รอผู้ดูแลกลุ่มอนุมัติ':'ส่งคำตอบไปคอมเมนต์ต้นทางแล้ว');
  }catch(error){
   if(!host.isDirty())try{await host.refresh(post.id);}catch{}
   host.notify(error.message+(sendRequested?' · ตรวจสถานะล่าสุดก่อนส่งอีกครั้ง':''));
  }finally{sending=false;for(const b of buttons())b.disabled=host.isDirty();}
 });
 return {
  controls(post){return `<div class="wf-send-options"><div class="actions">${post.commentDelivery?.live?'<button class="primary" data-comment-action="send-live">ส่งคำตอบไปคอมเมนต์ต้นทาง</button>':''}<button class="secondary" data-comment-action="send-demo">ทดลองส่ง Demo</button></div><p class="notice">${post.commentDelivery?.live?'กดเพื่อส่งคำตอบที่อนุมัติแล้วทันที ด้วยบัญชี Facebook ใน Chrome worker':esc(post.commentDelivery?.liveReason||'ส่งจริงยังไม่เปิด')} · Demo ไม่ส่ง Facebook</p></div>`;},
  receipts(post){
   const demo=post.demoComment?`<p class="notice">ทดลองส่ง Demo เวอร์ชัน ${post.demoComment.revision} แล้ว · ไม่ได้โพสต์ Facebook และยังไม่นับว่าส่งจริง</p>`:'';
   const publication=post.publication;if(publication?.method!=='browser-ui')return demo;
   const info=publication.info||{};
   if(publication.state!=='sent')return demo+`<p class="notice">${publication.state==='sending'?'กำลังส่งผ่าน Chrome':publication.state==='unknown'?'ยังยืนยันผลส่งไม่ได้ ต้องตรวจต้นทางก่อนส่งอีกครั้ง':'ยังไม่ได้ส่งสำเร็จ เปิดหน้าตรวจส่งใหม่ได้หลังตรวจปัญหา'}</p>`;
   return demo+`<div class="wf-warning"><p>${info.pendingModeration?'ส่งแล้ว แต่ยังรอผู้ดูแลกลุ่มอนุมัติ':'บันทึกผลจากการตรวจหน้าคอมเมนต์'}</p><p>บัญชี ${esc(info.account||'ไม่ระบุ')} · ${link(info.commentUrl,'เปิดคอมเมนต์ที่พบ')}</p></div>`;
  },
 };
}
