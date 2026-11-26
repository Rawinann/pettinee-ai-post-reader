const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function automationHTML(status){
 if(!status?.cloud)return '';
 const a=status.automation||{};
 return `<section class="pane wf-block" aria-label="โหมดอัตโนมัติ"><h2>ดึงและตอบอัตโนมัติ · ${a.enabled?'เปิดอยู่':'หยุดอยู่'}</h2>
 <p>${a.enabled?'ระบบจะดึงโพสต์ใหม่ จับคู่ไกด์ และส่งคำตอบโดยไม่ต้องกดทีละโพสต์':'เลือกบัญชีและเปิดโหมดเมื่อพร้อมให้ระบบส่งคำตอบเอง'}</p>
 ${a.reason?`<p role="status">${esc(a.reason)}</p>`:''}
 ${a.setupRequired?'<p>ต้องอัปเดตฐานข้อมูลด้วย cloud:migrate ก่อน</p>':`<label for="auto-worker">ตอบในชื่อบัญชีของ worker</label><select id="auto-worker"${a.enabled?' disabled':''}>${status.workers.filter(w=>w.capabilities?.collect&&w.capabilities?.publish).map(w=>`<option value="${esc(w.id)}"${w.id===a.workerId?' selected':''}>${esc(w.label)} · ${esc(w.expectedAccount)} · ${w.online?'ออนไลน์':'ออฟไลน์'}</option>`).join('')}</select>
 <div class="wf-settings-grid"><label>ดึง 40 โพสต์ทุกกี่นาที<input id="auto-interval" type="number" min="5" max="1440" value="${a.intervalMinutes||60}"${a.enabled?' disabled':''}></label><label>ส่งสูงสุดต่อชั่วโมง<input id="auto-limit" type="number" min="1" max="30" value="${a.maxPerHour||6}"${a.enabled?' disabled':''}></label></div>
 <button class="${a.enabled?'secondary':'primary'} form-submit" data-wf-action="${a.enabled?'auto-stop':'auto-start'}">${a.enabled?'หยุดอัตโนมัติ':'เปิดดึงและตอบอัตโนมัติ'}</button>`}
 <p class="notice">เฉพาะโพสต์ใหม่ที่เก็บหลังเปิดโหมด · ไม่มีไกด์ตรงหรือเป็นเคสฉุกเฉินจะรอตรวจ · เครื่อง worker ต้องเปิดและล็อกอิน Facebook อยู่</p>
 ${a.enabled?'<p class="notice">การหยุดยกเลิกคิวที่ยังไม่เริ่ม งานที่เริ่มส่งแล้วอาจหยุดไม่ทัน</p>':''}</section>`;
}
