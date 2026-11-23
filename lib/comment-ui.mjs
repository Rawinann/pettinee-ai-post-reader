const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function link(url,label){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return '';return `<a class="evidence-link" href="${esc(u.href)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${esc(label)}</a>`;}catch{return '';}}
function receiptUrl(post,publication){
 if(publication.info?.commentUrl)return publication.info.commentUrl;
 if(!/^[A-Za-z0-9_-]+$/.test(publication.externalId||''))return '';
 try{const u=new URL(post.url);if(u.protocol!=='https:'||!['www.facebook.com','web.facebook.com','facebook.com'].includes(u.hostname))return '';u.searchParams.set('comment_id',publication.externalId);return u.href;}catch{return '';}
}
export function createCommentUI(host){
 let sending=false,browserAction=false,deliveryTimer=null,browserTimer=null,lastBrowserValue=null;
 const stop=()=>{clearTimeout(deliveryTimer);clearTimeout(browserTimer);deliveryTimer=null;browserTimer=null;};
 const syncButtons=()=>{if(sending)return;for(const b of buttons())b.disabled=b.dataset.unavailable==='true'||browserAction||(b.dataset.commentAction==='send-live'&&lastBrowserValue?.browser?.busy===true);};
 function watchBrowser(){clearTimeout(browserTimer);if(host.isBrowserActive?.()===false)return;browserTimer=setTimeout(pollBrowser,host.browserPollMs||1000);browserTimer.unref?.();}
 async function pollBrowser(){if(host.isBrowserActive?.()===false||!document.getElementById('reply-browser-panel'))return;try{const value=await host.request('/api/workflow/reply-browser');const panel=document.getElementById('reply-browser-panel');if(panel)panel.outerHTML=browserControls(value);syncButtons();}catch{if(browserAction||sending)watchBrowser();}}
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden'&&lastBrowserValue)watchBrowser();});
 async function pollDelivery(id,started){if(host.getPost()?.id!==id||host.isActive?.()===false)return stop();try{const p=await host.refresh(id);if(host.getPost()?.id!==id||host.isActive?.()===false)return stop();if(p?.status==='published'){host.notify(p.publication?.info?.pendingModeration?'ส่งแล้ว · รอผู้ดูแลกลุ่มอนุมัติ':'ส่งคำตอบไปคอมเมนต์ต้นทางแล้ว');return stop();}if(p?.status==='publish_unknown'){host.notify('ยังยืนยันผลส่งไม่ได้ ตรวจต้นทางก่อนส่งอีกครั้ง');return stop();}if(p&&p.status!=='publishing'){host.notify(p.lastError||'ยังไม่ได้ส่ง ตรวจสถานะ worker แล้วลองใหม่');return stop();}if(Date.now()-started>180000){host.notify('ยังรอผลจาก worker กดรีเฟรชเพื่อตรวจสถานะได้ ระบบไม่ส่งซ้ำเอง');return stop();}}catch(error){host.notify(error.message);return stop();}deliveryTimer=setTimeout(()=>pollDelivery(id,started),3000);deliveryTimer.unref?.();}
 const watchDelivery=id=>{stop();deliveryTimer=setTimeout(()=>pollDelivery(id,Date.now()),1500);deliveryTimer.unref?.();};
 const buttons=()=>document.querySelectorAll('[data-comment-action="send-live"],[data-comment-action="send-demo"]');
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-comment-action]');if(!button)return;
  const action=button.dataset.commentAction;
  if(action==='manual-confirm'){if(sending||button.disabled)return;const p=host.getPost();button.disabled=true;try{await host.request('/api/workflow/posts/'+p.id+'/manual',{revision:p.revision,confirmed:true});await host.refresh(p.id);host.notify('บันทึกว่าตอบด้วยมือแล้ว');}catch(e){host.notify(e.message);}finally{button.disabled=false;}return;}
  if(action==='manual-open'){const p=host.getPost();try{await navigator.clipboard.writeText(p.draft);window.open(p.url,'_blank','noopener,noreferrer');host.notify('คัดลอกแล้ว กรุณาวางและส่งใน Facebook');}catch{host.notify('คัดลอกไม่ได้ เลือกข้อความในช่องและเปิดต้นทางได้ครับ');}return;}
  if(action==='browser-show'){if(button.disabled)return;button.disabled=true;try{const value=await host.request('/api/workflow/reply-browser/show',{});const panel=document.getElementById('reply-browser-panel');if(panel)panel.outerHTML=browserControls(value);}catch(error){host.notify(error.message);}finally{button.disabled=false;}return;}
  if(['browser-open','browser-close','browser-status'].includes(action)){
   if(sending||browserAction||button.disabled)return;browserAction=true;host.pause();button.disabled=true;syncButtons();if(lastBrowserValue){const next={...lastBrowserValue,browser:{...lastBrowserValue.browser,busy:action!=='browser-status',phase:action==='browser-open'?'opening':action==='browser-close'?'closing':lastBrowserValue.browser?.phase,phaseMessage:action==='browser-open'?'กำลังเปิดหน้าต่าง Chrome worker…':action==='browser-close'?'กำลังปิด Chrome worker…':lastBrowserValue.browser?.phaseMessage}};const panel=document.getElementById('reply-browser-panel');if(panel)panel.outerHTML=browserControls(next);}
   try{const value=await host.request('/api/workflow/reply-browser'+(action==='browser-status'?'':action==='browser-open'?'/open':'/close'),action==='browser-status'?undefined:{});const panel=document.getElementById('reply-browser-panel');if(panel)panel.outerHTML=browserControls(value);host.notify(value.liveMessage);}
   catch(error){try{const value=await host.request('/api/workflow/reply-browser');lastBrowserValue=value;}catch{}host.notify(['needs_login','blocked'].includes(lastBrowserValue?.browser?.state)?lastBrowserValue.liveMessage:error.message);}finally{browserAction=false;const panel=document.getElementById('reply-browser-panel');if(panel&&lastBrowserValue)panel.outerHTML=browserControls(lastBrowserValue);syncButtons();}return;
  }
  if(!['send-live','send-demo'].includes(action)||sending||browserAction||button.disabled)return;
  const post=host.getPost();if(!post)return;stop();
  // The explicit send click authorizes the exact visible text. Persist and audit
  // that version before preflight; concurrent changes still invalidate the send.
  const field=document.getElementById('wf-draft'),text=host.getDraft(),sender=document.getElementById('comment-worker'),workerId=sender?.value;
  const unchanged=()=>host.getPost()?.id===post.id&&host.getDraft()===text&&(!sender||sender.value===workerId);
  sending=true;host.pause();for(const b of buttons())b.disabled=true;let sendRequested=false;
  if(field)field.readOnly=true;if(sender)sender.disabled=true;let popup;if(post.commentDelivery?.cloud&&post.commentDelivery.manual){popup=window.open('about:blank','_blank');if(popup)popup.opener=null;}
  const mode=action==='send-live'?'live':'demo';host.notify(post.commentDelivery?.cloud?(post.commentDelivery.manual?'กำลังเตรียมข้อความและเปิดต้นทาง…':'กำลังเข้าคิวให้เครื่องที่เลือก…'):mode==='live'?'กำลังตรวจต้นทางและส่งคำตอบผ่าน Chrome…':'กำลังทดลองส่ง Demo…');
  if(!post.commentDelivery?.cloud)watchBrowser();
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
   await host.refresh(post.id);if(result.mode==='manual'){host.notify(clipboardOK?'คัดลอกข้อความแล้ว วางและกดส่งใน Facebook จากนั้นกลับมากด “ตอบบน Facebook แล้ว”':'คัดลอกไม่ได้ เลือกข้อความในช่องแล้วคัดลอกเอง ก่อนเปิดต้นทาง');return;}if(result.mode==='queued'){host.notify('กำลังรอ Chrome worker ของบัญชีที่เลือก ระบบจะอัปเดตผลส่งให้');watchDelivery(post.id);return;}host.notify(result.mode==='demo'?'ทดลองส่งแล้ว · Demo ไม่ได้โพสต์ Facebook':result.pendingModeration?'ส่งแล้ว · รอผู้ดูแลกลุ่มอนุมัติ':'ส่งคำตอบไปคอมเมนต์ต้นทางแล้ว');
  }catch(error){if(popup)popup.close();
   if(unchanged()&&!host.isDirty())try{await host.refresh(post.id);}catch{}
   if(!post.commentDelivery?.cloud&&mode==='live'&&document.getElementById('reply-browser-panel'))try{const value=await host.request('/api/workflow/reply-browser');document.getElementById('reply-browser-panel').outerHTML=browserControls(value);}catch{}
   host.notify(error.message+(sendRequested?' · ตรวจสถานะล่าสุดก่อนส่งอีกครั้ง':''));
  }finally{sending=false;if(field)field.readOnly=false;if(sender)sender.disabled=false;syncButtons();if(!post.commentDelivery?.cloud)watchBrowser();}
 });
 function browserControls(value){
  if(!value)return '';lastBrowserValue=value;const b=value.browser||{},enabled=value.liveConfigured;
  if(enabled&&(b.browserOpen||b.busy||browserAction||sending))watchBrowser();
  const opening=b.busy&&!b.browserOpen;
  return `<section id="reply-browser-panel" class="wf-send-options" aria-label="Chrome worker"><strong>Chrome worker · เปิดให้ดูการทำงาน</strong><p role="status" aria-live="polite">${esc(b.phaseMessage||value.liveMessage||'ยังไม่เปิดตัวส่งจริง')}</p>${b.lastError&&!['needs_login','blocked'].includes(b.state)?`<p class="notice" data-error="true">${esc(b.lastError)}</p>`:''}${b.account?`<p>บัญชีที่ตรวจล่าสุด: ${esc(b.account)}</p>`:''}<div class="actions"><button class="secondary" data-comment-action="${b.browserOpen?'browser-show':'browser-open'}"${!enabled||(!b.browserOpen&&(b.busy||browserAction))?' disabled':''}>${b.browserOpen?'แสดงหน้าต่าง Chrome':opening?'กำลังเปิด Chrome…':'เปิด Chrome worker'}</button>${b.browserOpen?`<button class="text-button" data-comment-action="browser-close"${b.busy||browserAction||sending?' disabled':''}>ปิด Chrome</button>`:''}<button class="text-button" data-comment-action="browser-status"${browserAction?' disabled':''}>ตรวจสถานะ</button></div>${b.lastReceipt?.url?`<p>${link(b.lastReceipt.url,'เปิดคอมเมนต์ที่ตรวจพบ')}${b.lastReceipt.pendingModeration?' · รอผู้ดูแลกลุ่มอนุมัติ':''}</p>`:b.targetUrl?`<p>${link(b.targetUrl,'หน้าที่ worker กำลังเปิด')}</p>`:''}<p class="notice">${enabled?'Chrome จะเปิดค้างไว้ให้ดูระหว่างตรวจโพสต์ กรอก และส่งข้อความ · ล็อกอินด้วยตัวเองเมื่อร้องขอ':'เปิด server ด้วย npm.cmd run replies:ai เพื่อใช้ Chrome worker'}${opening?' · หากเปิดไม่สำเร็จ ระบบจะแจ้งให้ลองใหม่':''}</p></section>`;
 }

 return {
  browserControls,stop,
  controls(post){if(post.commentDelivery?.cloud){const workers=post.commentDelivery.workers.filter(w=>w.enabled&&(post.commentDelivery.manual||w.capabilities?.publish)),chosen=post.approvedWorkerId||workers[0]?.id;return `<div class="wf-send-options"><label for="comment-worker">${post.commentDelivery.manual?'ผู้รับผิดชอบคำตอบ':'บัญชีที่จะใช้ตอบ'}</label><select id="comment-worker">${workers.map(w=>`<option value="${esc(w.id)}"${w.id===chosen?' selected':''}>${esc(w.label)} · ${esc(w.expectedAccount)} · ${w.online?'ออนไลน์':'ออฟไลน์'}</option>`).join('')}</select><button class="primary" data-comment-action="send-live"${sending||!workers.length||!post.commentDelivery.live?' disabled':''}${!workers.length||!post.commentDelivery.live?' data-unavailable="true"':''}>${post.commentDelivery.manual?'คัดลอกและเปิดโพสต์ต้นทาง':'ส่งคำตอบไปโพสต์ต้นทาง'}</button>${post.commentDelivery.manual?'<p class="notice">ตรวจบัญชี Facebook ในเบราว์เซอร์ก่อนส่ง การเลือกชื่อนี้ไม่ได้สลับบัญชีให้อัตโนมัติ</p>':''}${post.commentDelivery.live?'':`<p class="notice">${esc(post.commentDelivery.liveReason)}</p>`}</div>`;}const demo=post.sourceType==='mock',live=post.commentDelivery?.live,available=demo||live;return `<div class="wf-send-options"><button class="primary" data-comment-action="${demo?'send-demo':'send-live'}"${!available||sending?' disabled':''}${available?'':' data-unavailable="true"'}>${demo?'ทดลองส่ง Demo':'ส่งคำตอบไปโพสต์ต้นทาง'}</button>${demo?'<p class="notice">เคสจำลอง · ไม่ส่งไป Facebook</p>':!live?`<p class="notice">${esc(post.commentDelivery?.liveReason||'ส่งจริงยังไม่เปิด')}</p>`:''}</div>`;},
  receipts(post){
   if(post.cloudJob?.snapshot.mode==='manual')return post.cloudJob.state==='sent'?'<p class="notice">บันทึกว่าตอบด้วยมือแล้ว · ยืนยันโดยผู้ดูแล</p>':`<div class="wf-warning"><p>รอตอบด้วยมือบน Facebook · ยังไม่นับว่าส่งแล้ว</p><div class="actions"><button class="secondary" data-comment-action="manual-open">คัดลอกและเปิดต้นทางอีกครั้ง</button><button class="primary" data-comment-action="manual-confirm">ตอบบน Facebook แล้ว</button></div></div>`;
   const demo=post.demoComment?`<p class="notice">ทดลองส่ง Demo เวอร์ชัน ${post.demoComment.revision} แล้ว · ไม่ได้โพสต์ Facebook และยังไม่นับว่าส่งจริง</p>`:'';
   const publication=post.publication;if(publication?.method!=='browser-ui')return demo;
   const info=publication.info||{};
   if(publication.state!=='sent')return demo+`<p class="notice">${publication.state==='queued'?'อยู่ในคิว รอ Chrome worker ของบัญชีที่เลือก':publication.state==='sending'?'กำลังส่งผ่าน Chrome':publication.state==='unknown'?'ยังยืนยันผลส่งไม่ได้ ต้องตรวจต้นทางก่อนส่งอีกครั้ง':'ยังไม่ได้ส่งสำเร็จ เปิดหน้าตรวจส่งใหม่ได้หลังตรวจปัญหา'}</p>`;
   return demo+`<div class="wf-warning"><p>${info.pendingModeration?'ส่งแล้ว แต่ยังรอผู้ดูแลกลุ่มอนุมัติ':'บันทึกผลจากการตรวจหน้าคอมเมนต์'}</p><p>${info.account?`บัญชี ${esc(info.account)} · `:''}${link(receiptUrl(post,publication),'เปิดคอมเมนต์ที่พบ')}</p></div>`;
  },
 };
}
