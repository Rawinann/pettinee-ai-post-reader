import { demoPosts } from './data/demo-posts.mjs';
import { analyzeDemo, validateAnalysis, makeHandoff, CLAIM_STATUSES } from './lib/analysis.mjs';
import { readWorkbook, suggestMapping, previewImport, commitImport } from './lib/import.mjs';
import { config } from './config.js';
import { createExperience } from './lib/experience-ui.mjs';
import { PUBLIC_FILE, postOnlyGuide } from './lib/public-posts.mjs';
import { createIntentUI, intentCard } from './lib/intent-ui.mjs';
import { INTENTS } from './lib/intent.mjs';
import { createGuideUI, guideCard } from './lib/guide-ui.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE = 'pettinee-local-v1';
const copy = value => JSON.parse(JSON.stringify(value));
const state = { view:'feed', reading:false, feedPage:1, posts:copy(demoPosts), active:demoPosts[0].id, filter:'ทั้งหมด', query:'', saved:new Set(), analyses:{}, batches:[], workbook:null, sheet:0, mapping:{}, preview:null, previewError:'', fileName:'', coverage:'auto', aiAvailable:false, importBusy:false };
let experience;
let intentUI;
let guideUI;
let toastTimer;

function notify(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,4200); }
function safeURL(value) { try { const u=new URL(value); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } }
function meongURL(value) { try { const u=new URL(value); if(u.protocol!=='https:'||u.username||u.password)return ''; u.search='';u.hash='';return u.href; } catch { return ''; } }
const destination=meongURL(config.meongSilJangUrl);
if(destination)$('open-meong').href=destination; else { $('open-meong').removeAttribute('href'); $('open-meong').setAttribute('aria-disabled','true'); }

try {
  const stored=JSON.parse(localStorage.getItem(STORE)||'null');
  if(stored && Array.isArray(stored.posts)) {
    const valid=stored.posts.filter(p=>p && typeof p.id==='string' && typeof p.text==='string' && Array.isArray(p.comments) && p.comments.every(c=>c && typeof c.id==='string'&&typeof c.text==='string'));
    state.posts=valid.length ? valid : state.posts;
    state.batches=Array.isArray(stored.batches)?stored.batches:[];
    state.saved=new Set(Array.isArray(stored.saved)?stored.saved:[]);
    if(stored.analyses&&typeof stored.analyses==='object') for(const [id,output] of Object.entries(stored.analyses)) {
      const p=state.posts.find(p=>p.id===id); if(p)try{validateAnalysis(output,p);state.analyses[id]=output;}catch{}
    }
  } else state.saved=new Set(JSON.parse(localStorage.getItem('pettinee-demo-saved')||'[]'));
} catch { notify('อ่านข้อมูลที่บันทึกเดิมไม่ได้ จึงเปิดชุด Demo เริ่มต้น'); }
for(const p of demoPosts.filter(p=>p.provenance==='simulated'&&!state.posts.some(existing=>existing.id===p.id)))state.posts.push(copy(p));
for(const p of state.posts.filter(p=>!p.fileName&&demoPosts.some(example=>example.id===p.id&&example.text===p.text))) { try { const a=analyzeDemo(p);validateAnalysis(a,p);state.analyses[p.id]=a; }catch{} }
if(!state.posts.some(p=>p.id===state.active))state.active=state.posts[0]?.id;
function persist(){ try{localStorage.setItem(STORE,JSON.stringify({posts:state.posts,saved:[...state.saved],analyses:state.analyses,batches:state.batches}));return true;}catch{notify('พื้นที่เบราว์เซอร์ไม่พอ ข้อมูลรอบนี้ใช้ได้ในหน้าปัจจุบัน แต่ยังบันทึกหลังปิดหน้าไม่ได้');return false;} }
fetch('/api/config').then(r=>r.ok?r.json():{}).then(c=>{state.aiAvailable=c.aiAvailable===true;}).catch(()=>{});

function postTitle(p){return p.title||p.text?.slice(0,85)||'โพสต์ที่ยังไม่มีข้อความ';}
function sourceLabel(p){return p.sourceLabel||(p.provenance==='simulated'?'เคสจำลอง':p.provenance==='paraphrased'?'ข้อมูลถอดความ':'ข้อมูลจากไฟล์นำเข้า');}
function statusLabel(p){return state.analyses[p.id]?'เปิดผล '+(state.analyses[p.id].mode==='ai'?'AI':'Demo')+' แล้ว':p.fileName?'นำเข้าสำเร็จ · ยังไม่ได้วิเคราะห์':p.inputKind==='manual'?'รับข้อมูลแล้ว · ยังไม่ได้วิเคราะห์':'ยังไม่ได้วิเคราะห์';}
function coverageText(p){if(!p.comments?.length)return p.commentSummary?'จากคอมเมนต์ที่เก็บได้ · มีเพียงสรุปคอมเมนต์ (ข้อมูลถอดความ) · '+(p.coverage==='partial'?'เก็บมาได้บางส่วน':p.coverage==='complete'?'ไฟล์ระบุว่าครบ แต่ไม่มีข้อความรายรายการให้ตรวจ':'ไม่ทราบว่าเก็บครบหรือไม่'):'ไม่มีข้อความคอมเมนต์ที่นำมาตรวจได้';return p.coverage==='complete'?'ไฟล์ระบุว่าเก็บคอมเมนต์ครบ · เว็บไม่ได้ตรวจเทียบ Facebook':p.coverage==='partial'?`จากคอมเมนต์ที่เก็บได้ ${p.comments.length} ข้อความ · เก็บมาได้บางส่วน`:`จากคอมเมนต์ที่เก็บได้ ${p.comments.length} ข้อความ · ไม่ทราบว่าเก็บครบหรือไม่`;}
function go(view){state.view=view;if(view==='feed')state.reading=false;document.querySelectorAll('[data-view]').forEach(b=>{if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});const tools=document.querySelector('.data-tools');if(tools)tools.open=false;render();}
function render(){if(state.view==='guides')guideUI.showPage();else if(state.view==='intent')intentUI.showPage();else if(state.view==='home')experience.showHome();else if(state.view==='care')experience.showCare();else if(state.view==='feed')renderFeedPage();else if(state.view==='import')renderImport();else renderOverview();document.body.dataset.page=state.view;}
function renderFeedPage(){
  $('workspace').innerHTML=`<div class="post-workspace"><section class="post-browser" id="post-browser" aria-label="เลือกโพสต์"><div class="browser-heading"><div><h1>เลือกโพสต์ที่อยากอ่าน</h1><p>ปรึกษาเรื่องแมว by ปอน</p></div><div class="browser-actions"><button class="text-button" data-action="load-public">เปิดชุด 200 โพสต์</button><button class="secondary" data-action="import-view">นำเข้า Excel</button></div></div><div class="browser-toolbar"><div class="searchbox"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="ค้นหาเรื่องที่สนใจ" aria-label="ค้นหาโพสต์" value="${esc(state.query)}"></div><div class="filter" id="filters"></div></div><div class="browser-count"><span id="feed-count"></span><button class="text-button" data-action="reset-filters" id="reset-filters" hidden>ล้างตัวกรอง</button></div><div class="feed-list" id="feed"></div><nav class="feed-pagination" id="feed-pagination" aria-label="หน้าของรายการโพสต์"></nav></section><section class="post-reader" id="post-reader" hidden><div class="reader-toolbar"><button class="back-to-posts" data-action="back-posts">กลับไปเลือกโพสต์</button><span id="reader-position"></span></div><article class="pane detail" id="detail" aria-label="รายละเอียดโพสต์"></article></section></div>`;
  renderList();if(state.reading)showReader();
}
const PAGE_SIZE=24;
function matchingPosts(){const q=state.query.trim().toLocaleLowerCase('th');return state.posts.filter(p=>(state.filter==='ทั้งหมด'||(state.filter==='บันทึกไว้'?state.saved.has(p.id):p.category===state.filter))&&(!q||[p.title,p.text,p.category,p.postId,p.url,p.commentSummary,...p.comments.map(c=>c.text)].join(' ').toLocaleLowerCase('th').includes(q)));}
function showReader(){state.reading=true;$('post-browser').hidden=true;$('post-reader').hidden=false;renderDetail();const posts=matchingPosts(),index=posts.findIndex(p=>p.id===state.active);$('reader-position').textContent=index>=0?`โพสต์ ${index+1} จาก ${posts.length}`:'';}
function showBrowser(){state.reading=false;$('post-browser').hidden=false;$('post-reader').hidden=true;renderList();[...document.querySelectorAll('[data-post]')].find(b=>b.dataset.post===state.active)?.focus();}
function renderList(){
  const categories=[...new Set(state.posts.map(p=>p.category||'ไม่ระบุหมวด'))];
  $('filters').innerHTML=`<label class="sr-only" for="category-select">หมวดโพสต์</label><select id="category-select"><option value="ทั้งหมด">ทุกหมวด</option>${categories.map(c=>`<option value="${esc(c)}"${state.filter===c?' selected':''}>${esc(c.replace(/^คำค้น:\s*/,''))}</option>`).join('')}</select><button class="chip saved-filter" data-filter="บันทึกไว้" aria-pressed="${state.filter==='บันทึกไว้'}">บันทึกไว้${state.saved.size?' ('+state.saved.size+')':''}</button>`;
  const posts=matchingPosts(),pages=Math.max(1,Math.ceil(posts.length/PAGE_SIZE));state.feedPage=Math.min(Math.max(1,state.feedPage),pages);
  $('feed-count').textContent=`${posts.length} โพสต์`;
  $('reset-filters').hidden=!state.query&&state.filter==='ทั้งหมด';
  $('feed').innerHTML=posts.slice((state.feedPage-1)*PAGE_SIZE,state.feedPage*PAGE_SIZE).map(p=>`<button class="post-item" data-post="${esc(p.id)}" aria-label="อ่านโพสต์: ${esc(postTitle(p))}"><span class="item-meta"><span class="post-category">${esc((p.category||'ไม่ระบุหมวด').replace(/^คำค้น:\s*/,''))}</span>${state.saved.has(p.id)?'<span class="saved-mark" aria-label="บันทึกแล้ว">★</span>':''}</span><strong>${esc(postTitle(p))}</strong>${p.title&&p.text!==p.title?`<span class="excerpt">${esc(p.text)}</span>`:''}<span class="post-card-footer"><span>${esc(p.provenance==='simulated'?'เคสจำลอง':p.provenance==='paraphrased'?'ถอดความ':p.postTextKind==='excerpt'?'ข้อความตัดตอน':!p.text?'มีเฉพาะลิงก์':'โพสต์นำเข้า')}</span><span class="read-label">อ่านโพสต์</span></span></button>`).join('')||'<div class="empty"><h3>ไม่พบโพสต์</h3><p>ลองเปลี่ยนคำค้นหรือเลือกหมวดอื่น</p><button class="secondary" data-action="reset-filters">ดูโพสต์ทั้งหมด</button></div>';
  $('feed-pagination').innerHTML=pages>1?`<button class="secondary" data-feed-page="${state.feedPage-1}"${state.feedPage===1?' disabled':''}>ก่อนหน้า</button><span>หน้า ${state.feedPage} / ${pages}</span><button class="secondary" data-feed-page="${state.feedPage+1}"${state.feedPage===pages?' disabled':''}>ถัดไป</button>`:'';
}
const fact=(title,text,soft=false)=>`<div class="fact${soft?' soft':''}"><h4>${esc(title)}</h4><p>${esc(text)}</p></div>`;
const sectionHead=(n,title,extra='')=>`<div class="section-heading"><h3>${esc(title)}</h3>${extra}</div>`;
function commentLinks(ids,p){return (ids||[]).map(id=>`<button class="evidence-link" data-comment="${esc(id)}">ดูคอมเมนต์ ${esc(p.comments.findIndex(c=>c.id===id)+1)}</button>`).join('');}
function threadItems(items,p){return (items||[]).map(item=>`<div class="thread-item">${esc(item.text)} ${commentLinks(item.commentIds,p)}</div>`).join('')||'<p class="muted">ไม่ทราบจากข้อมูลที่มี</p>';}
function renderDetail(){
  const p=state.posts.find(p=>p.id===state.active);
  if(!p){$('detail').innerHTML='<p class="empty">เลือกโพสต์เพื่อเริ่มอ่าน</p>';return;}
  if(p.readingMode==='post-only'||(p.provenance==='imported'&&!p.comments.length&&!p.commentSummary)){renderPostOnly(p);document.querySelector('#detail .detail-head')?.insertAdjacentHTML('afterend',guideCard(p)+intentCard(p));guideUI.loadPost(p);return;}
  const a=state.analyses[p.id];
  const url=safeURL(p.url);
  const isParaphrased=p.provenance==='paraphrased'||p.postTextKind==='paraphrased';
  let html=`<div class="detail-head"><div class="meta"><span class="pill">${esc(p.category||'ไม่ระบุหมวด')}</span><span class="pill ${p.provenance==='simulated'?'amber':'neutral'}">${esc(sourceLabel(p))}</span></div><h2>${esc(postTitle(p))}</h2><p class="source-caption">${isParaphrased?'ข้อความโพสต์ที่ถอดความจากชุดวิจัย':p.provenance==='simulated'?'ข้อความต้นทางจำลอง':p.inputKind==='manual'?'ข้อความที่คุณกรอกเอง':'ข้อความโพสต์จากไฟล์นำเข้า'}</p><div class="source-text">${esc(p.text||'ไม่มีข้อความโพสต์ในไฟล์')}</div><p class="notice">${esc(coverageText(p))}${p.commentDataNote?' · '+esc(p.commentDataNote):''}</p><div class="actions"><button class="secondary" data-action="save" aria-pressed="${state.saved.has(p.id)}">${state.saved.has(p.id)?'✓ บันทึกแล้ว':'☆ บันทึกโพสต์'}</button>${url?`<a class="secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">ดูโพสต์ต้นทาง</a>`:'<span class="notice">ไม่มีลิงก์ต้นทาง</span>'}<button class="primary" data-action="handoff">ถามต่อกับ MeongSilJang</button></div><p class="notice">สถานะ: ${esc(statusLabel(p))}${a?' · ผลตัวอย่างและข้อความต้นทางแสดงแยกกัน':''}</p></div>`;
  html+=guideCard(p)+intentCard(p);
  html+=`<details class="reader-care-link"><summary>เพิ่มข้อมูลแมวของฉัน</summary><button class="secondary" data-care-action="open-care">เปิดสมุดดูแล</button></details>`;
  if(p.fileName)html+=`<aside class="data-note"><p>ไฟล์ ${esc(p.fileName)} · ชีต ${esc(p.sheetName||'ไม่ทราบ')}${p.rowNumbers?.length?' · แถว '+esc(p.rowNumbers.join(', ')):''}</p>${p.missing?.length?`<p>ข้อมูลที่ขาดในไฟล์: ${esc(p.missing.join(' · '))}</p>`:''}</aside>`;
  const priorSources=Array.isArray(p.sourceVariants)?p.sourceVariants.filter(v=>v.text!==p.text||v.category!==p.category):[];
  if(priorSources.length)html+=`<details class="source-history"><summary>ข้อความโพสต์จากแหล่งข้อมูลก่อนหน้า (${priorSources.length})</summary>${priorSources.map(v=>`<div class="fact"><h4>${esc(v.sourceLabel||'แหล่งข้อมูลก่อนหน้า')} · ${esc(v.category||'ไม่ระบุหมวด')}</h4><p class="source-text">${esc(v.text)}</p>${v.fileName?`<p class="notice">${esc(v.fileName)} · ${esc(v.sheetName)} · แถว ${esc((v.rowNumbers||[]).join(', '))}</p>`:''}</div>`).join('')}</details>`;
  html+=`<nav class="jump-nav" aria-label="ส่วนต่าง ๆ ของโพสต์"><a href="#post-summary">สรุปโพสต์</a>${a?'<a href="#post-advice">คำแนะนำ</a>':''}<a href="#post-thread">สรุปคอมเมนต์</a><a href="#post-review">ตรวจข้ออ้าง</a>${a?'<a href="#post-unanswered">คำถามที่ยังไม่มีคำตอบ</a>':''}</nav>`;
  if(!a){
    html+=`<section class="detail-section" id="post-summary"><div class="analysis-empty"><span class="badge">ขั้นที่ 2</span><h3>รับข้อมูลแล้ว พร้อมเปิดผล Demo</h3><p>ข้อมูลถูกเก็บแยกจากผลวิเคราะห์แล้ว ขั้นตอนนี้ยังไม่ได้วิเคราะห์ด้วย AI กดเพื่อใช้แม่แบบคำตอบที่เตรียมไว้ล่วงหน้า สำหรับโพสต์ที่นำเข้าใหม่ Demo อาจยังแยกบริบทเฉพาะเรื่องไม่ได้</p><div class="actions"><button class="primary" data-action="analyze-demo">เปิดผลวิเคราะห์ Demo</button>${state.aiAvailable?'<button class="secondary" data-action="analyze-ai">วิเคราะห์ด้วย AI ผ่าน server</button>':'<span class="notice">AI จริง: ยังไม่ได้ตั้งค่าผู้ให้บริการฝั่ง server</span>'}</div></div></section>`;
    html+=`<section class="detail-section" id="post-thread">${sectionHead('03','ข้อมูลคอมเมนต์ที่นำเข้า')}<p class="coverage-notice">${esc(coverageText(p))}</p>${p.commentSummary?fact('สรุปคอมเมนต์จากไฟล์ · ข้อมูลถอดความ',p.commentSummary):''}${renderComments(p)}</section><section class="detail-section" id="post-review">${sectionHead('04','ตรวจคำแนะนำรายคอมเมนต์')}<p class="muted">${p.comments.length?'เปิดผล Demo เพื่อดูตัวอย่างการตรวจแต่ละข้ออ้าง':'ยังตรวจรายคอมเมนต์ไม่ได้ เพราะไม่มีข้อความรายรายการจริง'}</p></section>`;
  }else{
    html+=`<section class="detail-section" id="post-summary">${sectionHead('01','สรุปโพสต์',`<span class="pill neutral">${a.mode==='ai'?'AI':'คำตอบเตรียมไว้ล่วงหน้า'}</span>`)}<div class="two-cols">${fact('เกิดอะไรขึ้น',a.summary.happened)}${fact('ลองทำอะไรแล้ว',a.summary.tried)}${fact('กำลังตัดสินใจเรื่องไหน',a.summary.decision)}<div class="fact soft"><h4>ข้อมูลสำคัญที่ยังขาด</h4><ul>${a.summary.missing.map(t=>'<li>'+esc(t)+'</li>').join('')}</ul></div></div></section>`;
    html+=`<section class="detail-section" id="post-advice">${sectionHead('02','คำแนะนำสำหรับโพสต์นี้')}<div class="answer">${esc(a.recommendation.answer)}</div>${a.recommendation.options.map((o,i)=>`<div class="option"><span class="option-number">${i+1}</span><div><strong>${esc(o.action)}</strong><p>${esc(o.reason)}</p></div></div>`).join('')}${a.recommendation.comparison?.length?`<div class="table-wrap"><table><caption class="notice">เกณฑ์เปรียบเทียบสำหรับใช้ถามผู้ขายหรืออ่านคู่มือ</caption><thead><tr><th>เกณฑ์</th><th>ข้อมูลที่ควรเทียบ</th><th>ใช้กับบริบทใด</th></tr></thead><tbody>${a.recommendation.comparison.map(r=>`<tr><td><strong>${esc(r.criterion)}</strong></td><td>${esc(r.check)}</td><td>${esc(r.context)}</td></tr>`).join('')}</tbody></table></div>`:''}</section>`;
    html+=`<section class="detail-section" id="post-thread">${sectionHead('03','สรุปคอมเมนต์')}<p class="coverage-notice">${esc(coverageText(p))}${p.coverage!=='complete'&&p.comments.length?' · ข้อสรุปอธิบายเฉพาะข้อความส่วนนี้':''}</p><div class="thread-group"><h4>ประเด็นที่พูดถึงร่วมกัน</h4>${threadItems(a.thread.common,p)}</div><div class="thread-group"><h4>จุดที่เห็นต่าง</h4>${threadItems(a.thread.differences,p)}</div>${renderComments(p)}</section>`;
    html+=`<section class="detail-section" id="post-review">${sectionHead('04','ตรวจคำแนะนำรายคอมเมนต์')}<p class="notice">ประเมินแยกตามแต่ละข้ออ้าง คอมเมนต์เดียวอาจมีหลายสถานะ ตัวอย่าง Demo ไม่ใช้ยอดไลก์ จำนวนคนเห็นด้วย หรือคำตอบ AI เป็นหลักฐาน</p><div class="legend">${Object.entries(CLAIM_STATUSES).map(([k,v])=>'<span>'+k+') '+esc(v)+'</span>').join('')}</div>${!p.comments.length?'<div class="fact soft"><h4>ยังไม่เปิดการตรวจรายคอมเมนต์</h4><p>มีเพียงข้อมูลถอดความหรือไม่มีคอมเมนต์ต้นฉบับ จึงไม่สร้างคำพูดหรือข้ออ้างรายบุคคลขึ้นมาให้ตรวจ</p></div>':a.claims.map(c=>`<div class="claim"><span class="claim-status s${c.status}">${c.status}) ${esc(CLAIM_STATUSES[c.status])}</span>${commentLinks([c.commentId],p)}<blockquote>${esc(c.quote)}</blockquote><p><strong>เหตุผล:</strong> ${esc(c.reason)}</p><p><strong>ขอบเขตที่ใช้ได้:</strong> ${esc(c.scope)}</p><p class="muted"><strong>หลักฐาน:</strong> ${c.evidence.length?c.evidence.map(e=>esc(e.title||e.id||e)).join(', '):'ไม่มีแหล่งที่ทีมอนุมัติรองรับข้ออ้างนี้ใน Demo'}</p></div>`).join('')}</section>`;
    html+=`<section class="detail-section" id="post-unanswered">${sectionHead('05','คำถามที่ยังไม่มีคำตอบ')}<p class="notice">เฉพาะข้อมูลที่เก็บได้ เลือกประเด็นเพื่อเตรียมคำถามหนึ่งข้อไปถามต่อ</p>${a.thread.unanswered.map(u=>`<div class="unanswered"><p>${esc(u.text)} ${commentLinks(u.commentIds,p)}</p><button class="secondary" data-question="${esc(u.id)}">ใช้ประเด็นนี้ถามต่อ</button></div>`).join('')}</section>`;
  }

  $('detail').innerHTML=html;
  guideUI.loadPost(p);
}
function renderPostOnly(p){
  const guide=postOnlyGuide(p),url=safeURL(p.url),a=state.analyses[p.id];
  $('detail').innerHTML=`<div class="detail-head"><span class="pill neutral">${p.postTextKind==='excerpt'?'ข้อความตัดตอน · ไม่ใช่โพสต์เต็ม':'มีเฉพาะข้อความโพสต์'}</span><h2>${esc(postTitle(p))}</h2><p class="source-caption">${p.postTextKind==='excerpt'?'ข้อความที่เก็บได้จากหน้าสาธารณะ':'ข้อความที่นำเข้า'}</p><div class="source-text">${esc(p.text||'ยังไม่มีข้อความให้อ่าน มีเพียงลิงก์ต้นทาง')}</div><p class="notice">${esc(p.sourceNote||'ข้อมูลส่วนนี้อาจไม่ครบ ควรอ่านต้นทางก่อนนำไปใช้')}</p>${url?`<a class="evidence-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">เปิดโพสต์ต้นทาง</a>`:''}<div class="actions"><button class="secondary" data-action="save" aria-pressed="${state.saved.has(p.id)}">${state.saved.has(p.id)?'✓ บันทึกแล้ว':'☆ บันทึกโพสต์'}</button><button class="primary" data-action="handoff">เตรียมคำถามไปถามต่อ</button></div></div><details class="detail-section preparation-details" id="post-summary"><summary>เตรียมข้อมูลเพิ่มเติมก่อนถาม</summary><p class="notice">ไม่มีคอมเมนต์ให้ตรวจ รายการนี้เป็นแม่แบบช่วยเตรียมคำถาม</p><div class="simple-next"><ul>${guide.missing.map(t=>'<li>'+esc(t)+'</li>').join('')}</ul></div><button class="secondary" data-care-action="open-care">เพิ่มข้อมูลแมวของฉัน</button></details><section class="detail-section" id="post-unanswered"><h3>คำถามที่อาจอยากถามต่อ</h3><p class="simple-question">${esc(guide.question)}</p></section><details class="reader-extra"><summary>รายละเอียดข้อมูลและโหมด Demo</summary><p class="notice">${esc(p.category)} · ${esc(p.accessStatus||'ไม่ทราบสถานะการเข้าถึง')} · ${esc(statusLabel(p))}</p><p class="notice">การจัดหัวข้อตามคำค้นไม่ได้ยืนยันว่าแมวเป็นโรคนั้น และตัวเลขอธิบายเฉพาะชุดที่เก็บมา</p>${!a?'<button class="secondary" data-action="analyze-demo">เปิดผลวิเคราะห์ Demo</button>':'<p class="notice">เปิดแม่แบบ Demo แล้ว ไม่มีการเรียกโมเดล AI</p>'}</details>`;
}
function renderComments(p){if(!p.comments.length)return '';return `<details class="comments-list" id="source-comments"><summary>อ่านคอมเมนต์${p.provenance==='simulated'?'จำลอง':''}ที่เก็บได้ (${p.comments.length})</summary>${p.comments.map((c,i)=>`<div class="comment" id="comment-${esc(c.id)}"><small>คอมเมนต์ ${i+1}${p.provenance==='simulated'?' · ข้อความจำลอง':''}</small><p>${esc(c.text)}</p></div>`).join('')}</details>`;}

const mappingFields=[['postId','รหัสโพสต์ (postId)'],['category','หมวด'],['text','ข้อความโพสต์'],['url','ลิงก์ต้นทาง'],['comment','ข้อความคอมเมนต์รายรายการ'],['summary','สรุปคอมเมนต์ (ถอดความ)'],['coverage','สถานะการเก็บคอมเมนต์']];
function currentSheet(){return state.workbook?.sheets[state.sheet];}
function computePreview(){const sheet=currentSheet();state.previewError='';if(!sheet){state.preview=null;return;}try{state.preview=previewImport(sheet.rows,state.mapping,state.posts,{fileName:state.fileName,sheetName:sheet.name});
if(/ตัดตอนที่เห็นในหน้าโพสต์/.test(state.mapping.text||'')){
 for(const p of state.preview.posts){const row=sheet.rows.find(r=>r[state.mapping.postId]===p.postId)||{};p.postTextKind='excerpt';p.readingMode='post-only';p.sourceLabel='ข้อความตัดตอนจากหน้าสาธารณะ';p.sourceNote=row['หมายเหตุแหล่งข้อมูล']||'ไม่ใช่ข้อความโพสต์เต็ม';p.accessStatus=row['สถานะการเปิดหน้า']||'';p.category='คำค้น: '+(row['คำค้นที่พบ']||'ไม่ระบุ');p.missing=p.missing.filter(field=>field!=='ข้อมูลคอมเมนต์');}
 state.preview.missingCount=state.preview.posts.filter(p=>p.missing.length).length;
 state.preview.issues=state.preview.issues.filter(issue=>issue.type!=='missing');
}
if(state.coverage!=='auto')for(const p of [...state.preview.posts,...state.preview.newPosts])p.coverage=state.coverage;}catch(e){state.preview=null;state.previewError=e.message;}}
function renderImport(){
  const sheet=currentSheet(),pre=state.preview;
  $('workspace').innerHTML=`<section class="pane page-pane"><div class="page-title"><div><p class="eyebrow">ข้อมูลจาก TinyFish → Excel → Pettinee</p><h2>นำเข้า Excel</h2><p>เลือกไฟล์ที่คุณเก็บมาเอง ตรวจคอลัมน์และตัวอย่างก่อนบันทึก</p></div><span class="pill neutral">อ่านไฟล์ในเบราว์เซอร์เครื่องนี้</span></div><div class="steps"><div class="step"><span>1</span>เลือกไฟล์และชีต</div><div class="step"><span>2</span>เทียบคอลัมน์</div><div class="step"><span>3</span>ตรวจตัวอย่างและบันทึก</div><div class="step"><span>4</span>เปิดผล Demo แยกอีกขั้น</div></div><div class="upload"><label for="excel-file">ไฟล์ Excel จาก TinyFish (.xlsx)</label><input id="excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${state.importBusy?' disabled':''}><p>${state.fileName?'ไฟล์ที่เลือก: '+esc(state.fileName):'ไฟล์ไม่ถูกอัปโหลดไป TinyFish หรือ server · รองรับสูงสุด 12 MB'}</p><p class="notice">ไม่มีการเชื่อม TinyFish API ในต้นแบบนี้</p><p id="file-status" role="status">${state.importBusy?'กำลังอ่านไฟล์…':''}</p></div>${sheet?`<details class="import-options"><summary>เปลี่ยนชีตหรือคอลัมน์ (ถ้าจำเป็น)</summary><div class="mapping"><h3>เลือกชีตและเทียบคอลัมน์</h3><label for="sheet-select">ชีตในไฟล์ (${state.workbook.sheets.length})</label><select id="sheet-select">${state.workbook.sheets.map((s,i)=>`<option value="${i}"${i===state.sheet?' selected':''}>${esc(s.name)} · ${s.rows.length} แถว</option>`).join('')}</select><p class="notice">พบหัวตารางแถวที่ ${sheet.headerRow||1} · คอลัมน์ที่ไม่ได้เลือกจะไม่นำมาใช้ · เลือก “ไม่ใช้คอลัมน์” ได้</p><div class="mapping-grid">${mappingFields.map(([key,label])=>`<div><label for="map-${key}">${esc(label)}</label><select id="map-${key}" data-map="${key}"><option value="">— ไม่ใช้คอลัมน์ —</option>${sheet.headers.map(h=>`<option value="${esc(h)}"${state.mapping[key]===h?' selected':''}>${esc(h)}</option>`).join('')}</select></div>`).join('')}<div><label for="coverage-default">การเก็บคอมเมนต์ของรอบนี้</label><select id="coverage-default"><option value="auto"${state.coverage==='auto'?' selected':''}>ตามไฟล์ / ไม่ทราบถ้าไม่มีข้อมูล</option><option value="partial"${state.coverage==='partial'?' selected':''}>เก็บได้บางส่วน</option><option value="complete"${state.coverage==='complete'?' selected':''}>ผู้เก็บยืนยันว่าครบ</option><option value="unknown"${state.coverage==='unknown'?' selected':''}>ไม่ทราบว่าเก็บครบหรือไม่</option></select></div></div><p class="notice">รวมหลายแถวด้วย postId หรือลิงก์โพสต์เดียวกัน ข้อความที่ระบุว่า “ถอดความ” จะไม่ถูกใช้เป็นคอมเมนต์ต้นฉบับ</p></div></details><div id="import-preview">${previewHTML(pre)}</div>`:''}<div id="import-result" aria-live="polite"></div></section>`;
}
function publicPreview(pre){const count=pre.posts.filter(p=>p.text).length;return `<section class="mapping"><h3>ตรวจไฟล์ก่อนเปิดอ่าน</h3><div class="stats"><div class="stat"><strong>${pre.newCount}</strong><span>รายการใหม่</span></div><div class="stat"><strong>${pre.duplicateCount}</strong><span>รายการที่มีอยู่แล้ว</span></div><div class="stat"><strong>${count}</strong><span>มีข้อความตัดตอน จาก ${pre.posts.length} รายการ</span></div><div class="stat"><strong>${pre.posts.length-count}</strong><span>มีเพียงลิงก์ จาก ${pre.posts.length} รายการ</span></div></div><p class="coverage-notice">ข้อความไม่ครบทั้งโพสต์ และอาจมีคำอธิบายที่ Meta สร้างปะปน ใช้เตรียมคำถามได้ แต่ยังสรุปสาเหตุหรือคำแนะนำจากคอมเมนต์ไม่ได้</p><div class="table-wrap"><table><thead><tr><th>คำค้นที่พบ</th><th>ตัวอย่างข้อความที่เก็บได้</th></tr></thead><tbody>${pre.posts.slice(0,5).map(p=>`<tr class="preview-row"><td>${esc(p.category)}</td><td>${esc(p.text||'ไม่มีข้อความ มีเพียงลิงก์ต้นทาง')}</td></tr>`).join('')}</tbody></table></div><p class="notice">แสดง 5 จาก ${pre.posts.length} รายการ · ใช้เฉพาะชีตโพสต์ ไม่รวมชีตคอมเมนต์หรือช่องว่างสำหรับเก็บเพิ่ม</p><div class="actions"><button class="primary" data-action="commit-import">บันทึก ${pre.posts.length} รายการ แล้วเลือกอ่าน</button></div></section>`;}
function issueText(issue){if(typeof issue==='string')return issue;return issue.message||issue.reason||JSON.stringify(issue);}
function previewHTML(pre){if(pre?.posts.length&&pre.posts.every(p=>p.readingMode==='post-only'))return publicPreview(pre);if(!pre)return state.previewError?`<p class="issues" role="status">${esc(state.previewError)}</p>`:'';return `<div class="mapping"><h3>ตรวจตัวอย่างก่อนบันทึก</h3><div class="stats"><div class="stat"><strong>${pre.newCount}</strong><span>โพสต์ใหม่</span></div><div class="stat"><strong>${pre.duplicateCount}</strong><span>โพสต์ซ้ำกับข้อมูลเดิม</span></div><div class="stat"><strong>${pre.missingCount}</strong><span>โพสต์ที่มีข้อมูลขาด</span></div><div class="stat"><strong>${pre.mergedRowCount}</strong><span>แถวที่รวมเข้ากับโพสต์</span></div></div><p class="notice">${pre.rowCount} แถวในชีต → ${pre.posts.length} โพสต์หลังรวมแถว · โพสต์ที่ไม่มีข้อความยังบันทึกได้โดยติดป้ายว่าขาดข้อความ</p>${pre.issues?.length?`<div class="issues"><strong>ข้อมูลที่ควรตรวจ (${pre.issues.length})</strong><ul>${pre.issues.slice(0,8).map(i=>'<li>'+esc(issueText(i))+'</li>').join('')}</ul>${pre.issues.length>8?'<p>แสดง 8 รายการแรก ตรวจข้อมูลขาดของแต่ละโพสต์ได้หลังนำเข้า</p>':''}</div>`:''}<div class="table-wrap"><table><thead><tr><th>โพสต์ / หมวด</th><th>ข้อความโพสต์</th><th>ข้อมูลคอมเมนต์</th><th>ข้อมูลที่ขาด</th></tr></thead><tbody>${pre.posts.slice(0,8).map(p=>`<tr class="preview-row"><td><strong>${esc(p.category)}</strong><br><small>${esc(p.postId||p.id)}</small></td><td><div class="clamp">${esc(p.text||'ไม่มีข้อความโพสต์')}</div></td><td>${p.comments.length+' ข้อความรายรายการ'}${p.commentSummary?'<br>มีสรุปถอดความ':''}<br><small>${esc(coverageText(p))}</small></td><td>${esc(p.missing?.join(' · ')||'ไม่พบข้อมูลขาดในฟิลด์ที่ตรวจ')}</td></tr>`).join('')||'<tr><td colspan="4">ยังไม่มีโพสต์ที่นำเข้าได้ ตรวจการเลือกคอลัมน์ข้อความโพสต์</td></tr>'}</tbody></table></div><p class="notice">แสดง ${Math.min(pre.posts.length,8)} จาก ${pre.posts.length} โพสต์ · บันทึกโพสต์ซ้ำโดยรวมข้อมูลคอมเมนต์ที่เพิ่มมา ไม่สร้างโพสต์ซ้ำอีกใบ</p><div class="actions"><button class="primary" data-action="commit-import"${!pre.posts.length||!state.mapping.text?' disabled':''}>ยืนยันนำเข้าข้อมูล ${pre.posts.length} โพสต์</button><span class="notice">ขั้นนี้ยังไม่เรียก AI</span></div></div>`;}
async function loadExcel(file){
  if(!file)return;
  if(!/\.xlsx$/i.test(file.name)){notify('เลือกไฟล์ .xlsx เท่านั้น');return;}
  if(file.size>12*1024*1024){notify('ไฟล์ใหญ่เกิน 12 MB กรุณาแบ่งข้อมูลเป็นรอบเล็กลง');return;}
  state.importBusy=true;state.workbook=null;state.preview=null;state.fileName=file.name;renderImport();
  try{const wb=await readWorkbook(await file.arrayBuffer());if(!wb.sheets?.length)throw new Error('ไม่พบชีตในไฟล์นี้');state.workbook=wb;state.sheet=Math.max(0,wb.sheets.findIndex(s=>s.name==='โพสต์ 200 รายการ'||s.name==='100 โพสต์'));state.mapping=suggestMapping(currentSheet().headers);state.coverage='auto';computePreview();state.importBusy=false;if(state.view==='import'){renderImport();$('sheet-select')?.focus();}notify('อ่านไฟล์สำเร็จ ตรวจตัวอย่างก่อนยืนยันนำเข้า');}catch(e){state.importBusy=false;state.fileName='';state.workbook=null;state.preview=null;if(state.view==='import'){renderImport();$('file-status').textContent='อ่านไฟล์ไม่ได้: '+e.message;}else notify('อ่านไฟล์ไม่ได้: '+e.message);}
}
async function loadPublicFile(){
  go('import');
  try{const response=await fetch('/data/'+PUBLIC_FILE);if(!response.ok)throw new Error('อ่านไฟล์ตัวอย่างไม่ได้ เลือกไฟล์จากเครื่องด้วยปุ่มด้านบนได้');const buffer=await response.arrayBuffer();await loadExcel({name:PUBLIC_FILE,size:buffer.byteLength,arrayBuffer:async()=>buffer});}
  catch(error){notify(error.message);}
}
function importCommit(){
  if(!state.preview?.posts.length)return;
  const pre=state.preview,ids=pre.posts.map(p=>p.id),batchId='batch-'+Date.now();
  const prevActive=state.active;
  state.posts=commitImport(state.posts,pre);
  // Merging a new import can change source material; never reuse an old analysis.
  for(const id of ids)delete state.analyses[id];
  state.batches.unshift({id:batchId,fileName:state.fileName,sheetName:currentSheet().name,date:new Date().toISOString(),postIds:ids,posts:copy(pre.posts),rowCount:pre.rowCount,newCount:pre.newCount,duplicateCount:pre.duplicateCount,missingCount:pre.missingCount});
  state.active=ids[0]||prevActive;state.filter='ทั้งหมด';state.query='';
  const durable=persist();
  state.preview=null;
  renderImport();
  $('import-result').innerHTML=`<div class="success"><h3>✓ นำเข้าข้อมูลสำเร็จ${durable?' และบันทึกในเบราว์เซอร์แล้ว':''}</h3><p>โพสต์ใหม่ ${pre.newCount} · โพสต์ซ้ำ ${pre.duplicateCount} · รวม ${ids.length} โพสต์ในรอบนี้</p><p>ยังไม่ได้วิเคราะห์ด้วย AI เลือกโพสต์แล้วกด “เปิดผลวิเคราะห์ Demo” เป็นขั้นตอนถัดไป</p><div class="actions"><button class="primary" data-action="read-imported">เลือกอ่านโพสต์ที่นำเข้า</button><button class="secondary" data-action="overview-view">ดูภาพรวมรอบนี้</button></div></div>`;
  $('import-result').scrollIntoView({block:'center'});
}
function renderOverview(){
  const batches=state.batches;
  $('workspace').innerHTML=`<section class="pane page-pane"><div class="page-title"><div><p class="eyebrow">มองเห็นภาพของข้อมูลที่คุณเก็บมา</p><h2>ภาพรวมรอบนำเข้า</h2><p>ตัวเลขอธิบายเฉพาะชุดข้อมูลของแต่ละรอบ ไม่ใช่สัดส่วนของทั้งกลุ่ม Facebook</p></div><button class="secondary" data-action="import-view">นำเข้า Excel เพิ่ม</button></div>${!batches.length?'<div class="empty"><h3>ยังไม่มีรอบนำเข้า</h3><p>เริ่มจากนำเข้า Excel เพื่อดูหมวดที่พบและรายการที่ควรให้ทีมทบทวน</p></div>':batches.map(batch=>{
    const posts=Array.isArray(batch.posts)?batch.posts:batch.postIds.map(id=>state.posts.find(p=>p.id===id)).filter(Boolean),n=posts.length;
    const cats=Object.entries(posts.reduce((a,p)=>(a[p.category||'ไม่ระบุหมวด']=(a[p.category||'ไม่ระบุหมวด']||0)+1,a),Object.create(null))).sort((a,b)=>b[1]-a[1]);
    const review=posts.filter(p=>p.missing?.length||p.coverage!=='complete');
    const questions=new Map();for(const p of posts){for(const text of (p.text.match(/[^\n.!?。]*(?:\?|ไหม|หรือไม่)/gu)||[])){const q=text.trim();if(q.length>8){if(!questions.has(q))questions.set(q,new Set());questions.get(q).add(p.id);}}}
    const repeated=[...questions].filter(([,ids])=>ids.size>=2);
    return `<article class="batch"><h3>${esc(batch.sheetName)}</h3><p class="batch-meta">${esc(batch.fileName)} · ${esc(new Date(batch.date).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}))} · ${batch.rowCount} แถว</p><div class="stats"><div class="stat"><strong>${n}</strong><span>โพสต์ในรอบนี้</span></div><div class="stat"><strong>${batch.newCount}</strong><span>โพสต์ใหม่ตอนนำเข้า</span></div><div class="stat"><strong>${batch.duplicateCount}</strong><span>โพสต์ซ้ำตอนนำเข้า</span></div><div class="stat"><strong>${review.length}/${n}</strong><span>โพสต์ที่ควรให้ทีมทบทวน</span></div></div><div class="two-cols"><div class="fact"><h4>หมวดที่พบ</h4>${cats.map(([cat,k])=>`<div class="metric-row"><span>${esc(cat)}</span><strong>${k} จาก ${n} โพสต์</strong></div>`).join('')}</div><div class="fact"><h4>ความครบของข้อมูล</h4><div class="metric-row"><span>มีคอมเมนต์รายข้อความ</span><strong>${posts.filter(p=>p.comments.length).length} จาก ${n} โพสต์</strong></div><div class="metric-row"><span>มีเพียงสรุปถอดความ</span><strong>${posts.filter(p=>!p.comments.length&&p.commentSummary).length} จาก ${n} โพสต์</strong></div><div class="metric-row"><span>ไม่มีข้อมูลคอมเมนต์</span><strong>${posts.filter(p=>!p.comments.length&&!p.commentSummary).length} จาก ${n} โพสต์</strong></div></div></div><div class="thread-group"><h4>คำถามที่เกิดซ้ำในรอบนี้</h4>${repeated.length?repeated.slice(0,5).map(([q,ids])=>`<div class="metric-row"><span>${esc(q)}</span><strong>${ids.size} จาก ${n} โพสต์</strong></div>`).join(''):'<p class="notice">ไม่พบข้อความคำถามที่ตรงกันอย่างน้อย 2 โพสต์ในรอบนี้ Demo ยังไม่ได้จัดกลุ่มคำถามที่ใช้ถ้อยคำต่างกันด้วย AI</p>'}<p class="notice">นับจากข้อความคำถามที่ตรงกัน ไม่ใช้จำนวนคอมเมนต์แทนจำนวนโพสต์</p></div><div class="thread-group"><h4>โพสต์ที่ควรให้ทีมทบทวน (${review.length} จาก ${n} โพสต์)</h4><p class="notice">เลือกจากข้อมูลขาดหรือคอมเมนต์ไม่ยืนยันว่าครบ ณ เวลานำเข้า ไม่ใช่ระดับความเร่งด่วนทางสุขภาพ</p>${review.slice(0,8).map(p=>`<button class="review-link" data-review-post="${esc(p.id)}">${esc(postTitle(p))}</button>`).join('')}${review.length>8?'<p class="notice">แสดง 8 รายการแรก</p>':''}</div><p class="notice">รอบนี้มี ${n} โพสต์ ตัวเลขคงตามข้อมูลตอนนำเข้ารอบนี้ เมื่อกดอ่านโพสต์จะแสดงข้อมูลล่าสุดที่รวมแล้ว</p></article>`;
  }).join('')}</section>`;
}
function openHandoff(question,additional='',channel='ai'){
  const p=state.posts.find(p=>p.id===state.active);if(!p)return;
  // Preparing an editable handoff is also available before analysis; it does not mark the post analyzed.
  const a=state.analyses[p.id]||analyzeDemo(p);validateAnalysis(a,p);
  const extra=additional||experience?.getHandoffContext(p.id)||'';
  $('handoff-title').textContent=channel==='clinic'?'ตรวจสรุปก่อนคุยกับคลินิก':'ตรวจสรุปก่อนถาม MeongSilJang';
  $('open-meong').hidden=channel==='clinic';
  $('handoff-channel-note').textContent=channel==='clinic'?'คัดลอกแล้วติดต่อคลินิกผ่านช่องทางที่คุณมี เว็บยังไม่ได้จองนัดหรือส่งข้อมูลให้คลินิก':'คัดลอกแล้วเปิด MeongSilJang ภาษาไทย ไม่มีการส่งข้อความให้ปลายทางอัตโนมัติ';
  const handoffText=makeHandoff(p,a,question);
  $('handoff-text').value=(channel==='clinic'?handoffText.replace('อยากสอบถามเรื่องนี้เพิ่มเติม','อยากสอบถามทีมรักษาเพิ่มเติม'):handoffText)+(extra?'\n\n'+extra:'');
  $('handoff-preview').textContent=$('handoff-text').value;$('handoff-preview').hidden=false;$('handoff-text').hidden=true;$('edit-handoff').textContent='แก้ไขข้อความ';$('edit-handoff').setAttribute('aria-expanded','false');
  $('copy-status').textContent='';$('handoff').showModal();
}
async function analyze(mode){
  const p=state.posts.find(p=>p.id===state.active);if(!p)return;
  try{
    let output;if(mode==='ai'){const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({post:p})});const body=await response.json();if(!response.ok)throw new Error(body.error||'ยังวิเคราะห์ด้วย AI ไม่ได้');output=body.analysis;}else output=analyzeDemo(p);
    validateAnalysis(output,p);state.analyses[p.id]=output;persist();renderList();renderDetail();notify(mode==='ai'?'ผล AI ผ่านการตรวจรูปแบบแล้ว':'เปิดคำตอบ Demo ที่เตรียมไว้ล่วงหน้าแล้ว');
  }catch(e){notify('ยังไม่แสดงผลวิเคราะห์: '+e.message);}
}
document.addEventListener('input',e=>{if(e.target.id==='search'){state.query=e.target.value;state.feedPage=1;renderList();}});
document.addEventListener('change',e=>{
  if(e.target.id==='category-select'){state.filter=e.target.value;state.feedPage=1;renderList();}
  if(e.target.id==='excel-file')loadExcel(e.target.files[0]);
  if(e.target.id==='sheet-select'){state.sheet=Number(e.target.value);state.mapping=suggestMapping(currentSheet().headers);computePreview();renderImport();}
  if(e.target.dataset.map){state.mapping[e.target.dataset.map]=e.target.value;computePreview();$('import-preview').innerHTML=previewHTML(state.preview);}
  if(e.target.id==='coverage-default'){state.coverage=e.target.value;computePreview();$('import-preview').innerHTML=previewHTML(state.preview);}
});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.view){go(b.dataset.view);return;}
  if(b.dataset.filter){state.filter=state.filter===b.dataset.filter?'ทั้งหมด':b.dataset.filter;state.feedPage=1;renderList();return;}
  if(b.dataset.feedPage){state.feedPage=Number(b.dataset.feedPage);renderList();$('post-browser').scrollIntoView({block:'start'});return;}
  if(b.dataset.post||b.dataset.reviewPost){state.active=b.dataset.post||b.dataset.reviewPost;if(state.view!=='feed'){state.filter='ทั้งหมด';state.query='';go('feed');}showReader();$('post-reader').scrollIntoView({block:'start'});return;}
  if(b.dataset.comment){const list=$('source-comments');if(list)list.open=true;const node=$('comment-'+b.dataset.comment);node?.scrollIntoView({block:'center'});node?.classList.add('highlight');setTimeout(()=>node?.classList.remove('highlight'),2500);return;}
  if(b.dataset.question){const a=state.analyses[state.active];openHandoff(a?.thread.unanswered.find(q=>q.id===b.dataset.question));return;}
  switch(b.dataset.action){
    case 'load-public':loadPublicFile();break;
    case 'back-posts':showBrowser();break;
    case 'reset-filters':state.filter='ทั้งหมด';state.query='';state.feedPage=1;$('search').value='';renderList();break;
    case 'save':state.saved.has(state.active)?state.saved.delete(state.active):state.saved.add(state.active);persist();renderList();renderDetail();break;
    case 'import-view':go('import');break;
    case 'overview-view':go('overview');break;
    case 'read-imported':go('feed');break;
    case 'analyze-demo':analyze('demo');break;
    case 'analyze-ai':analyze('ai');break;
    case 'commit-import':importCommit();break;
    case 'handoff':openHandoff();break;
  }
});
$('close-handoff').addEventListener('click',()=>$('handoff').close());
$('edit-handoff').addEventListener('click',()=>{const editing=$('handoff-text').hidden;$('handoff-text').hidden=!editing;$('handoff-preview').hidden=editing;$('handoff-preview').textContent=$('handoff-text').value;$('edit-handoff').textContent=editing?'ดูข้อความก่อนคัดลอก':'แก้ไขข้อความ';$('edit-handoff').setAttribute('aria-expanded',String(editing));if(editing)$('handoff-text').focus();});
$('handoff-text').addEventListener('input',()=>$('handoff-preview').textContent=$('handoff-text').value);
$('handoff').addEventListener('click',e=>{if(e.target===$('handoff')){const r=$('handoff').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('handoff').close();}});
$('copy-summary').addEventListener('click',async()=>{const text=$('handoff-text').value;try{await navigator.clipboard.writeText(text);$('copy-status').textContent='คัดลอกข้อความแล้ว '+($('open-meong').hidden?'พร้อมใช้คุยกับคลินิกผ่านช่องทางของคุณ':'วางใน MeongSilJang ได้เมื่อพร้อม');}catch{$('handoff-text').hidden=false;$('handoff-preview').hidden=true;$('edit-handoff').setAttribute('aria-expanded','true');$('handoff-text').focus();$('handoff-text').select();$('copy-status').textContent='เบราว์เซอร์ไม่อนุญาตคัดลอกอัตโนมัติ เลือกข้อความไว้แล้ว กด Ctrl+C หรือแตะค้างแล้วเลือกคัดลอก';}});
experience=createExperience({
  workspace:$('workspace'),getPosts:()=>state.posts,getActive:()=>state.posts.find(p=>p.id===state.active),
  setActive:id=>{state.active=id;},go,notify,handoff:openHandoff,knowledgeUrl:safeURL(config.meongKnowledgeUrl),
  showPost:id=>{state.active=id;state.filter='ทั้งหมด';state.query='';go('feed');showReader();},
  addPost:post=>{state.posts.unshift(post);state.active=post.id;persist();},
});
intentUI=createIntentUI({workspace:$('workspace'),isActive:()=>state.view==='intent',getPost:id=>state.posts.find(p=>p.id===id),continue:(intent,text,id)=>{
  let post=state.posts.find(p=>p.id===id);
  if(!post){post={id:'intent-personal-'+Date.now(),postId:'',title:text.slice(0,65)||'เรื่องที่อยากถาม',text,category:'เรื่องของฉัน',inputKind:'manual',sourceLabel:'ข้อความที่คุณลองจำแนก',provenance:'imported',url:'',comments:[],commentSummary:'',coverage:'unknown',missing:[]};state.posts.unshift(post);persist();}
  state.active=post.id;experience.openCare(post.id,INTENTS[intent].tab);
}});
guideUI=createGuideUI({workspace:$('workspace')});
go(state.view);
