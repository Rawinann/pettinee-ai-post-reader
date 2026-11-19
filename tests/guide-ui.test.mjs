import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createGuideUI} from '../lib/guide-ui.mjs';
test('guide UI escapes source text, allows only catalog article links and keeps the latest query',async()=>{
 const {document,window}=parseHTML('<main id="workspace"></main>');
 const previousDocument=globalThis.document,previousFetch=globalThis.fetch;
 globalThis.document=document;const requests=[];
 globalThis.fetch=()=>new Promise(resolve=>requests.push(resolve));
 const result=title=>({topics:[{label:'<img src=x onerror=alert(1)>'}],catalogCount:1867,results:[
  {url:'https://evil.test/steal',title:'ไม่ควรแสดง'},
  {url:'https://pettinee.meongsiljang.com/th/guide/qa/cat-post-neuter-recovery-care',title,reason:'ตรงกับหัวข้อ',category:'การดูแล'},
 ]});
 try{
  const ui=createGuideUI({workspace:document.getElementById('workspace')});ui.showPage();
  const query=document.getElementById('guide-query'),form=document.getElementById('guide-search-form');
  query.value='เรื่องแรก';form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  query.value='เรื่องล่าสุด';form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  requests[1]({ok:true,json:async()=>result('<script>ข้อความล่าสุด</script>')});await new Promise(r=>setImmediate(r));
  requests[0]({ok:true,json:async()=>result('ข้อความเก่า')});await new Promise(r=>setImmediate(r));
  const target=document.getElementById('guide-page-results');
  assert.match(target.textContent,/ข้อความล่าสุด/);assert.doesNotMatch(target.textContent,/ข้อความเก่า|ไม่ควรแสดง/);
  assert.equal(target.querySelectorAll('script,img').length,0);
  assert.ok([...target.querySelectorAll('a')].every(a=>a.href.startsWith('https://pettinee.meongsiljang.com/th/guide/qa/')));
 }finally{globalThis.document=previousDocument;globalThis.fetch=previousFetch;}
});
