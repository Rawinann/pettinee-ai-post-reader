import {installBrowserAPI} from '/browser-api.mjs';
installBrowserAPI();
await import('/app.mjs');
document.body.classList.add('public-demo');
function semanticButton(){
 for(const id of ['guide-results','guide-page-results']){
  const target=document.getElementById(id);if(!target||!target.querySelector('.guide-method')||target.querySelector('[data-enable-semantic]')||target.hasAttribute('data-semantic-active'))continue;
  const button=document.createElement('button');button.className='secondary semantic-opt-in';button.dataset.enableSemantic='true';button.textContent='ค้นหาเพิ่มด้วย ML ความหมาย';
  const note=document.createElement('p');note.className='notice';note.textContent='ดาวน์โหลดโมเดลประมาณ 135 MB ครั้งแรก ประมวลผลในเบราว์เซอร์ ข้อความไม่ถูกส่งออก';target.append(button,note);
 }
}
new MutationObserver(semanticButton).observe(document.getElementById('workspace'),{childList:true,subtree:true});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-enable-semantic]');if(!button)return;
 window.pettineeEnableSemantic();button.disabled=true;button.textContent='กำลังโหลดโมเดล…';
 const target=button.closest('#guide-results,#guide-page-results');
 let text,species='cat';
 if(target.id==='guide-page-results'){text=document.getElementById('guide-query').value;species=document.getElementById('guide-species').value;}
 else text=document.querySelector('#detail .source-text')?.textContent;
 if(!text)return;
 window.dispatchEvent(new CustomEvent('pettinee-semantic-query',{detail:{text,species,targetId:target.id}}));
});
window.addEventListener('pettinee-model-progress',event=>{
 const p=event.detail;
 for(const button of document.querySelectorAll('[data-enable-semantic][disabled]'))button.textContent=p.status==='progress'&&Number.isFinite(p.progress)?`กำลังโหลดโมเดล… ${Math.round(p.progress)}%`:'กำลังเตรียมโมเดล…';
});
