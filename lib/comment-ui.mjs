const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function link(url,label){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return '';return `<a class="evidence-link" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${esc(label)}</a>`;}catch{return '';}}
export function createCommentUI(host){
 let sending=false,browserAction=false;
 const buttons=()=>document.querySelectorAll('[data-comment-action="send-live"],[data-comment-action="send-demo"]');
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-comment-action]');if(!button)return;
  const action=button.dataset.commentAction;
  if(action==='manual-confirm'){if(sending||button.disabled)return;const p=host.getPost();button.disabled=true;try{await host.request('/api/workflow/posts/'+p.id+'/manual',{revision:p.revision,confirmed:true});await host.refresh(p.id);host.notify('บันทึกว่าตอบด้วยมือแล้ว');}catch(e){host.notify(e.message);}finally{button.disabled=false;}return;}
  if(action==='manual-open'){const p=host.getPost();try{await navigator.clipboard.writeText(p.draft);window.open(p.url,'_blank','noopener,noreferrer');host.notify('คัดลอกแล้ว กรุณาวางและส่งใน Facebook');}catch{host.notify('คัดลอกไม่ได้ เลือกข้อความในช่องและเปิดต้นทางได้ครับ');}return;}
  if(['browser-open','browser-close','browser-status'].includes(action)){
   if(sending||browserAction||button.disabled)return;browserAction=true;host.pause();button.disabled=true;
   try{const value=await host.request('/api/workflow/reply-browser'+(action==='browser-status'?'':action==='browser-open'?'/open':'/close'),action==='browser-status'?undefined:{});const panel=document.getElementById('reply-browser-panel');if(panel)panel.outerHTML=browserControls(value);host.notify(value.liveMessage);}
   catch(error){host.notify(error.message);}finally{browserAction=false;button.disabled=false;}return;
  }
  if(!['send-live','send-demo'].includes(action)||sending||browserAction||button.disabled)return;
  const post=host.getPost();if(!post)return;
  // The explicit send click authorizes the exact visible text. Persist and audit
  // that version before preflight; concurrent changes still invalidate the send.
  const field=document.getElementById('wf-draft'),text=host.getDraft(),sender=document.getElementById('comment-worker'),workerId=sender?.value;
  const unchanged=()=>host.getPost()?.id===post.id&&host.getDraft()===text&&(!sender||sender.value===workerId);
  sending=true;host.pause();for(const b of buttons())b.disabled=true;let sendRequested=false;
  if(field)field.readOnly=true;if(sender)sender.disabled=true;let popup;if(post.commentDelivery?.cloud&&post.commentDelivery.manual){popup=window.open('about:blank','_blank');if(popup)popup.opener=null;}
  const mode=action==='send-live'?'live':'demo';host.notify(post.commentDelivery?.cloud?(post.commentDelivery.manual?'กำลังเตรียมข้อความและเปิดต้นทาง…':'กำลังเข้าคิวให้เครื่องที่เลือก…'):mode==='live'?'กำลังตรวจต้นทางและส่งคำตอบผ่าน Chrome…':'กำลังทดลองส่ง Demo…');
  try{
   await host.beforeSend?.();const path='/api/workflow/posts/'+post.id+'/';let current=host.getPost();if(!unchanged())throw Error('โพสต์หรือร่างเปลี่ยนระหว่างเตรียมส่ง ยังไม่ได้ส่งข้อความ');
   if(text!==current.draft){current=await host.request(path+'draft',{text,revision:current.revision});host.acceptPost(current);}
   if(!unchanged())throw Error('โพสต์หรือร่างเปลี่ยนระหว่างเตรียมส่ง ยังไม่ได้ส่งข้อความ');
   current=await host.request(path+'approve',{revision:current.revision,acknowledged:true,...(workerId?{workerId}:{})});host.acceptPost(current);
   if(!unchanged())throw Error('โพสต์หรือร่างเปลี่ยนระหว่างเตรียมส่ง ยังไม่ได้ส่งข้อความ');
   const ticket=await host.request(path+'comment-preview',{revision:current.revision,mode,...(workerId?{workerId}:{})});
   if(!unchanged())throw Error('โพสต์หรือร่างเปลี่ยนระหว่างเตรียมส่ง ยังไม่ได้ส่งข้อความ');
   sendRequested=true;
   const result=await host.request('/api/workflow/posts/'+post.id+'/comment-send',{ticketId:ticket.ticketId,revision:ticket.revision,confirmed:true});
   let clipboardOK=true;if(result.mode==='manual'){try{await navigator.clipboard.writeText(result.text);}catch{clipboardOK=false;}if(popup)popup.location.href=result.targetUrl;}
   await host.refresh(post.id);if(result.mode==='manual'){host.notify(clipboardOK?'คัดลอกข้อความแล้ว วางและกดส่งใน Facebook จากนั้นกลับมากด “ตอบบน Facebook แล้ว”':'คัดลอกไม่ได้ เลือกข้อความในช่องแล้วคัดลอกเอง ก่อนเปิดต้นทาง');return;}if(result.mode==='queued'){host.notify('เข้าคิวแล้ว รอเครื่องที่เลือกตรวจและส่ง ยังไม่นับว่าตอบแล้ว');return;}host.notify(result.mode==='demo'?'ทดลองส่งแล้ว · Demo ไม่ได้โพสต์ Facebook':result.pendingModeration?'ส่งแล้ว · รอผู้ดูแลกลุ่มอนุมัติ':'ส่งคำตอบไปคอมเมนต์ต้นทางแล้ว');
  }catch(error){if(popup)popup.close();
   if(unchanged()&&!host.isDirty())try{await host.refresh(post.id);}catch{}
   if(!post.commentDelivery?.cloud&&mode==='live'&&document.getElementById('reply-browser-panel'))try{const value=await host.request('/api/workflow/reply-browser');document.getElementById('reply-browser-panel').outerHTML=browserControls(value);}catch{}
   host.notify(error.message+(sendRequested?' · ตรวจสถานะล่าสุดก่อนส่งอีกครั้ง':''));
  }finally{sending=false;if(field)field.readOnly=false;if(sender)sender.disabled=false;for(const b of buttons())b.disabled=b.dataset.unavailable==='true';}
 });
 function browserControls(value){
  if(!value)return '';const b=value.browser||{},enabled=value.liveConfigured;
  return `<section id="reply-browser-panel" class="wf-send-options"><strong>Chrome worker สำหรับตอบคอมเมนต์</strong><p role="status">${esc(value.liveMessage||'ยังไม่เปิดตัวส่งจริง')}</p>${b.account?`<p>บัญชีที่ตรวจล่าสุด: ${esc(b.account)}</p>`:''}<div class="actions"><button class="secondary" data-comment-action="browser-open"${!enabled||b.busy?' disabled':''}>${b.browserOpen?'เปิดหน้ากลุ่ม / ล็อกอิน':'เปิด Chrome / ล็อกอิน'}</button>${b.browserOpen?`<button class="text-button" data-comment-action="browser-close"${b.busy?' disabled':''}>ปิด Chrome</button>`:''}<button class="text-button" data-comment-action="browser-status">ตรวจสถานะ</button></div><p class="notice">เปิด–ปิดจากหน้านี้ได้ ไม่จำเป็นต้องเปิดค้าง · ล็อกอินด้วยตัวเองเมื่อระบบร้องขอ · การเปิด Chrome ยังไม่ส่งข้อความ</p></section>`;
 }
 return {
  browserControls,
  controls(post){if(post.commentDelivery?.cloud){const workers=post.commentDelivery.workers.filter(w=>w.enabled),chosen=post.approvedWorkerId||workers[0]?.id;return `<div class="wf-send-options"><label for="comment-worker">${post.commentDelivery.manual?'ผู้รับผิดชอบคำตอบ':'บัญชีที่จะใช้ตอบ'}</label><select id="comment-worker">${workers.map(w=>`<option value="${esc(w.id)}"${w.id===chosen?' selected':''}>${esc(w.label)} · ${esc(w.expectedAccount)} · ${w.online?'ออนไลน์':'ออฟไลน์'}</option>`).join('')}</select><button class="primary" data-comment-action="send-live"${sending||!workers.length||!post.commentDelivery.live?' disabled':''}${!workers.length||!post.commentDelivery.live?' data-unavailable="true"':''}>${post.commentDelivery.manual?'คัดลอกและเปิดโพสต์ต้นทาง':'ส่งคำตอบไปโพสต์ต้นทาง'}</button>${post.commentDelivery.manual?'<p class="notice">ตรวจบัญชี Facebook ในเบราว์เซอร์ก่อนส่ง การเลือกชื่อนี้ไม่ได้สลับบัญชีให้อัตโนมัติ</p>':''}${post.commentDelivery.live?'':`<p class="notice">${esc(post.commentDelivery.liveReason)}</p>`}</div>`;}const demo=post.sourceType==='mock',live=post.commentDelivery?.live,available=demo||live;return `<div class="wf-send-options"><button class="primary" data-comment-action="${demo?'send-demo':'send-live'}"${!available||sending?' disabled':''}${available?'':' data-unavailable="true"'}>${demo?'ทดลองส่ง Demo':'ส่งคำตอบไปโพสต์ต้นทาง'}</button>${demo?'<p class="notice">เคสจำลอง · ไม่ส่งไป Facebook</p>':!live?`<p class="notice">${esc(post.commentDelivery?.liveReason||'ส่งจริงยังไม่เปิด')}</p>`:''}</div>`;},
  receipts(post){
   if(post.cloudJob?.snapshot.mode==='manual')return post.cloudJob.state==='sent'?'<p class="notice">บันทึกว่าตอบด้วยมือแล้ว · ยืนยันโดยผู้ดูแล</p>':`<div class="wf-warning"><p>รอตอบด้วยมือบน Facebook · ยังไม่นับว่าส่งแล้ว</p><div class="actions"><button class="secondary" data-comment-action="manual-open">คัดลอกและเปิดต้นทางอีกครั้ง</button><button class="primary" data-comment-action="manual-confirm">ตอบบน Facebook แล้ว</button></div></div>`;
   const demo=post.demoComment?`<p class="notice">ทดลองส่ง Demo เวอร์ชัน ${post.demoComment.revision} แล้ว · ไม่ได้โพสต์ Facebook และยังไม่นับว่าส่งจริง</p>`:'';
   const publication=post.publication;if(publication?.method!=='browser-ui')return demo;
   const info=publication.info||{};
   if(publication.state!=='sent')return demo+`<p class="notice">${publication.state==='sending'?'กำลังส่งผ่าน Chrome':publication.state==='unknown'?'ยังยืนยันผลส่งไม่ได้ ต้องตรวจต้นทางก่อนส่งอีกครั้ง':'ยังไม่ได้ส่งสำเร็จ เปิดหน้าตรวจส่งใหม่ได้หลังตรวจปัญหา'}</p>`;
   return demo+`<div class="wf-warning"><p>${info.pendingModeration?'ส่งแล้ว แต่ยังรอผู้ดูแลกลุ่มอนุมัติ':'บันทึกผลจากการตรวจหน้าคอมเมนต์'}</p><p>บัญชี ${esc(info.account||'ไม่ระบุ')} · ${link(info.commentUrl,'เปิดคอมเมนต์ที่พบ')}</p></div>`;
  },
 };
}
