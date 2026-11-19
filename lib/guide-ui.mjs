const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const catalog='https://pettinee.meongsiljang.com/th/guide/qa';
const safeLink=value=>{try{const url=new URL(value);return url.origin==='https://pettinee.meongsiljang.com'&&/^\/th\/guide\/qa\/[^/]+$/.test(url.pathname)?url.href:'';}catch{return '';}};
export function guideCard(post){return `<section class="detail-section guide-card"><div class="section-heading"><h3>คู่มือที่อ่านต่อได้</h3></div><div id="guide-results" role="status" aria-live="polite">${post.text?'กำลังหาคู่มือที่เกี่ยวข้อง…':'เติมข้อความก่อน เพื่อหาคู่มือที่เกี่ยวข้อง'}</div><a class="text-button guide-catalog-link" href="${catalog}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">เปิดคลังคู่มือภาษาไทยทั้งหมด</a></section>`;}
function renderResult(result){
 const articles=result.results.filter(x=>safeLink(x.url));
 return `${result.topics.length?`<p class="guide-topics"><span>ประเด็นที่จับได้</span>${result.topics.map(t=>`<span class="pill neutral">${esc(t.label)}</span>`).join('')}</p>`:''}${articles.length?`<div class="guide-list">${articles.slice(0,3).map((article,i)=>`<article class="guide-item"><p class="guide-match-reason">${esc(article.reason)}</p><h4><a href="${esc(safeLink(article.url))}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${esc(article.title)}</a></h4><p class="notice">${esc(article.category)} · คู่มือภาษาไทย</p><a class="secondary" href="${esc(safeLink(article.url))}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">อ่านคู่มือนี้</a></article>`).join('')}</div><p class="notice">บทความที่เกี่ยวข้องช่วยให้เข้าใจหัวข้อ ไม่ใช่ข้อสรุปว่าแมวในโพสต์เป็นภาวะเดียวกัน</p>`:'<p class="notice">ยังไม่พบคู่มือที่ใกล้พอ ลองระบุหัวข้อเพิ่ม หรือเปิดคลังคู่มือทั้งหมด</p>'}<details class="guide-method"><summary>จับคู่อย่างไร?</summary><p class="notice">ใช้เวกเตอร์ความหมายจากโมเดลภาษา multilingual MiniLM ร่วมกับคำ/ประเด็นที่พบในชื่อและคำอธิบายบทความ ค้นหาในเครื่องโดยไม่ส่งข้อความโพสต์ออกไปภายนอก</p>${result.catalogCount?`<p class="notice">ดัชนีมี ${result.catalogCount.toLocaleString('th-TH')} คู่มือจากคลังภาษาไทย แสดงลิงก์ต้นฉบับ ไม่คัดลอกเนื้อหาทั้งบทความ</p>`:''}</details>`;
}
export function createGuideUI(host){
 const requests=new WeakMap();
 async function load(text,elementId='guide-results',species='cat'){
  const target=document.getElementById(elementId);if(!target||!text?.trim())return;
  const request={};requests.set(target,request);
  target.textContent='กำลังหาคู่มือที่เกี่ยวข้อง…';
  try{const response=await fetch('/api/guides/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,species})});const body=await response.json();if(!response.ok)throw Error(body.error||'ยังค้นหาคู่มือไม่ได้');if(document.getElementById(elementId)===target&&requests.get(target)===request)target.innerHTML=renderResult(body);}
  catch(e){if(document.getElementById(elementId)===target&&requests.get(target)===request)target.textContent=e.message;}
 }
 function showPage(){
  host.workspace.innerHTML=`<section class="pane page-pane"><p class="eyebrow">อ่านความรู้ให้ตรงกับเรื่องที่สนใจ</p><h2>หาคู่มือจากเรื่องที่อยากรู้</h2><p class="notice">พิมพ์เป็นประโยคได้ เช่น “เพิ่งพาแมวไปทำหมันมา อยากรู้เรื่องการดูแลแผล”</p><form id="guide-search-form"><label for="guide-query">อยากอ่านเรื่องอะไร?</label><textarea id="guide-query" rows="3" maxlength="10000" required></textarea><label for="guide-species">เกี่ยวกับสัตว์เลี้ยงชนิดไหน</label><select id="guide-species"><option value="cat">แมว</option><option value="dog">สุนัข</option><option value="all">ทั้งสองชนิด</option></select><button class="primary form-submit" type="submit">หาคู่มือที่เกี่ยวข้อง</button></form><div id="guide-page-results" aria-live="polite"></div><a class="text-button guide-catalog-link" href="${catalog}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">เปิดคลังคู่มือภาษาไทย</a></section>`;
 }
 document.addEventListener('submit',event=>{if(event.target.id==='guide-search-form'){event.preventDefault();load(document.getElementById('guide-query').value,'guide-page-results',document.getElementById('guide-species').value);}});
 return {loadPost:post=>load(post.text),showPage};
}
