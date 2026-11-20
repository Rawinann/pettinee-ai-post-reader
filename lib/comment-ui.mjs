const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function link(url,label){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return '';return `<a class="evidence-link" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${esc(label)}</a>`;}catch{return '';}}
export function createCommentUI(host){
 let preview=null,sending=false;
 host.workspace.insertAdjacentHTML('afterend','<dialog id="comment-send-dialog" aria-label="ตรวจและยืนยันส่งคอมเมนต์"></dialog>');
 const dialog=()=>document.getElementById('comment-send-dialog');
 dialog().addEventListener('cancel',event=>{if(sending)event.preventDefault();else preview=null;});
 function open(post,value){host.pause();preview={...value,postId:post.id};dialog().innerHTML=`<div class="dialog-head"><h2>${value.mode==='live'?'ยืนยันส่งคอมเมนต์จริง':'ทดลองส่งคอมเมนต์ Demo'}</h2><button class="icon-button" data-comment-action="cancel" aria-label="ปิด">×</button></div><p class="pill ${value.mode==='live'?'amber':'neutral'}">${value.mode==='live'?'ส่งไป Facebook จริง':'Demo · ไม่ส่งออกจากแอป'}</p><p><strong>บัญชี:</strong> ${esc(value.account)}</p><p><strong>โพสต์ปลายทาง:</strong> ${value.targetUrl?link(value.targetUrl,'เปิดลิงก์เพื่อตรวจสอบ'):'โพสต์จำลองภายในแอป'}</p><blockquote>${esc(post.text.slice(0,400))}</blockquote><label for="comment-send-text">ข้อความที่จะส่ง · เวอร์ชัน ${value.revision}</label><textarea id="comment-send-text" rows="7" readonly>${esc(value.text)}</textarea><label class="review-confirm"><input id="comment-send-ack" type="checkbox">ฉันตรวจข้อความ โพสต์ปลายทาง และบัญชีแล้ว ยืนยัน${value.mode==='live'?'ส่งคอมเมนต์นี้จริง':'ทดสอบแบบ Demo'}</label><div class="actions"><button class="primary" data-comment-action="confirm">${value.mode==='live'?'ยืนยันส่งคอมเมนต์':'ยืนยันส่ง Demo'}</button><button class="secondary" data-comment-action="cancel">ยกเลิก</button></div><p id="comment-send-message" role="status"></p>`;dialog().showModal();}
 document.addEventListener('input',event=>{if(event.target.id==='wf-draft')for(const b of document.querySelectorAll('[data-comment-action="prepare-live"],[data-comment-action="prepare-demo"]'))b.disabled=true;});
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-comment-action]');if(!button)return;
  const action=button.dataset.commentAction;
  if(action==='cancel'){if(!sending){dialog().close();preview=null;}return;}
  if(action==='prepare-live'||action==='prepare-demo'){
   if(button.disabled)return;const post=host.getPost();if(!post)return;
   if(host.isDirty()){host.notify('บันทึกและอนุมัติร่างเวอร์ชันปัจจุบันก่อน');return;}
   host.pause();button.disabled=true;host.notify(action==='prepare-live'?'กำลังตรวจโพสต์และบัญชีใน Chrome…':'กำลังเตรียม Demo…');
   try{const value=await host.request('/api/workflow/posts/'+post.id+'/comment-preview',{revision:post.revision,mode:action==='prepare-live'?'live':'demo'});if(host.getPost()?.id===post.id)open(post,value);}
   catch(error){host.notify(error.message);}finally{button.disabled=false;}return;
  }
  if(action!=='confirm'||sending||!preview)return;
  const info=document.getElementById('comment-send-message');if(!document.getElementById('comment-send-ack').checked){info.textContent='กรุณาทำเครื่องหมายยืนยันก่อนส่ง';return;}
  const ticket=preview;sending=true;for(const b of dialog().querySelectorAll('button'))b.disabled=true;info.textContent=ticket.mode==='live'?'กำลังส่งและตรวจผล กรุณารอ…':'กำลังจำลองการส่ง…';
  try{const result=await host.request('/api/workflow/posts/'+ticket.postId+'/comment-send',{ticketId:ticket.ticketId,revision:ticket.revision,confirmed:true});dialog().close();preview=null;await host.refresh(ticket.postId);host.notify(result.mode==='demo'?'จำลองส่งแล้ว ไม่มีการโพสต์ Facebook':result.pendingModeration?'ส่งแล้ว พบสถานะรอผู้ดูแลกลุ่มอนุมัติ':'ส่งแล้วและพบคอมเมนต์ในหน้าเว็บ');}
  catch(error){info.textContent=error.message+' · ปิดหน้านี้เพื่อดูสถานะล่าสุด ห้ามส่งซ้ำจนกว่าจะตรวจผล';try{await host.refresh(ticket.postId);}catch{}}
  finally{sending=false;for(const b of dialog().querySelectorAll('[data-comment-action="cancel"]'))b.disabled=false;}
 });
 return {
  controls(post){return `<div class="wf-send-options"><p><strong>ส่งคำตอบจาก Dashboard</strong></p><div class="actions">${post.commentDelivery?.live?'<button class="primary" data-comment-action="prepare-live">ส่งคอมเมนต์จริง</button>':''}<button class="secondary" data-comment-action="prepare-demo">ทดลองส่ง Demo</button></div><p class="notice">${post.commentDelivery?.live?'ตรวจโพสต์และบัญชีใน Chrome แล้วให้คุณยืนยันก่อนส่งทีละรายการ':esc(post.commentDelivery?.liveReason||'ส่งจริงยังไม่เปิด')} · Demo จำลองในแอป ไม่มีการโพสต์ Facebook</p></div>`;},
  receipts(post){
   const demo=post.demoComment?`<p class="notice">ทดลองส่ง Demo เวอร์ชัน ${post.demoComment.revision} แล้ว · ไม่ได้โพสต์ Facebook และยังไม่นับว่าส่งจริง</p>`:'';
   const publication=post.publication;if(publication?.method!=='browser-ui')return demo;
   const info=publication.info||{};
   if(publication.state!=='sent')return demo+`<p class="notice">${publication.state==='sending'?'กำลังส่งผ่าน Chrome':publication.state==='unknown'?'ยังยืนยันผลส่งไม่ได้ ต้องตรวจต้นทางก่อนส่งอีกครั้ง':'ยังไม่ได้ส่งสำเร็จ เปิดหน้าตรวจส่งใหม่ได้หลังตรวจปัญหา'}</p>`;
   return demo+`<div class="wf-warning"><p>${info.pendingModeration?'ส่งแล้ว แต่ยังรอผู้ดูแลกลุ่มอนุมัติ':'บันทึกผลจากการตรวจหน้าคอมเมนต์'}</p><p>บัญชี ${esc(info.account||'ไม่ระบุ')} · ${link(info.commentUrl,'เปิดคอมเมนต์ที่พบ')}</p></div>`;
  },
 };
}
