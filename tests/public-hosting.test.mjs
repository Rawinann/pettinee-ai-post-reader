import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';
import {setTimeout as delay} from 'node:timers/promises';
const dist=new URL('../sites/pettinee-public/dist/',import.meta.url);
const available=await stat(dist).then(()=>true,()=>false);
test('public build excludes research data and uses fictional examples', {skip:!available},async()=>{
 const files=await readdir(dist,{recursive:true});
 assert.ok(files.includes('index.html'));assert.ok(files.includes('vendor/ort-wasm-simd-threaded.jsep.wasm')||files.includes('vendor\\ort-wasm-simd-threaded.jsep.wasm'));
 for(const path of files)assert.doesNotMatch(path,/\.xlsx$|corpus\.json|annotations\.json|documents\.jsonl|\.env|server\.mjs/);
 const source=await readFile(new URL('data/demo-posts.mjs',dist),'utf8');assert.doesNotMatch(source,/facebook\.com|ถอดความจากชุดวิจัย/);
 const {demoPosts}=await import(new URL('data/demo-posts.mjs',dist));assert.equal(demoPosts.length,6);assert.ok(demoPosts.every(p=>p.provenance==='simulated'));
 const model=JSON.parse(await readFile(new URL('ml-assets/intent-model.json',dist)));assert.equal(model.evaluation.errors,undefined);assert.equal(model.trainTextHashes,undefined);
});
test('public browser adapter performs actual intent inference and lexical matching without sending user data', {skip:!available},async()=>{
 let moduleSource=await readFile(new URL('../hosting/browser-api.mjs',import.meta.url),'utf8');
 for(const name of ['intent','guide-match'])moduleSource=moduleSource.replace('/lib/'+name+'.mjs',new URL('../lib/'+name+'.mjs',import.meta.url).href);
 const {installBrowserAPI}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
 const calls=[],scope={location:{origin:'https://demo.test',href:'https://demo.test/'}};
 const fetcher=async path=>{calls.push(path);return new Response(await readFile(new URL(path.slice(1),dist)),{headers:{'Content-Type':'application/json'}});};
 installBrowserAPI({fetcher,scope,workerFactory:()=>{throw Error('No encoder should load before opt-in');}});
 const query=async(path,body)=>{const response=await scope.fetch(path,{method:'POST',body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};
 const classified=await query('/api/intent/classify',{text:'ขอรีวิวน้ำพุแมว ถอดล้างง่าย มีรุ่นไหนแนะนำบ้าง'});assert.ok(classified.candidates.length);assert.equal(classified.trainingLabelStatus,'draft');
 const related=await query('/api/guides/search',{text:'หลังทำหมันวันที่ 5–6 แผลยังดูบวม จึงถามว่าปกติหรือไม่'});assert.equal(related.method,'topic_lexical_only');assert.equal(related.results[0].id,'cat-post-neuter-recovery-care');
 const unrelated=await query('/api/guides/search',{text:'อยากซื้อรถยนต์ไปเที่ยวต่างจังหวัด'});assert.equal(unrelated.results.length,0);
 const review=await scope.fetch('/api/intent/annotations');assert.equal(review.status,403);
 assert.ok(calls.every(path=>path.startsWith('/ml-assets/')&&!path.includes('?')));assert.equal(calls.length,2);
});
test('public DOM flow selects fictional post, shows guide, edits and copies natural handoff',{skip:!available},async t=>{
 const {window,document}=parseHTML(await readFile(new URL('index.html',dist),'utf8'));
 const descriptors=new Map(),copied=[],saved=new Map();
 const put=(key,value)=>{descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
 put('document',document);put('window',window);put('location',new URL('https://public.test/'));put('navigator',{clipboard:{writeText:async text=>copied.push(text)}});put('localStorage',{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)});put('matchMedia',()=>({matches:false}));
 window.HTMLElement.prototype.scrollIntoView=function(){};window.HTMLElement.prototype.focus=function(){};window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
 let source=await readFile(new URL('../hosting/browser-api.mjs',import.meta.url),'utf8');for(const name of ['intent','guide-match'])source=source.replace('/lib/'+name+'.mjs',new URL('../lib/'+name+'.mjs',import.meta.url).href);
 const {installBrowserAPI}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 put('fetch',globalThis.fetch);
 installBrowserAPI({fetcher:async path=>new Response(await readFile(new URL(String(path).slice(1),dist)),{headers:{'Content-Type':'application/json'}})});
 t.after(()=>{for(const [key,value]of descriptors){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 const click=selector=>{const element=document.querySelector(selector);assert.ok(element,selector);element.dispatchEvent(new window.Event('click',{bubbles:true}));};
 await import(new URL('app.mjs?public-flow',dist));
 assert.equal(document.getElementById('post-reader').hidden,true);assert.equal(document.querySelectorAll('[data-post]').length,6);
 click('[data-post="41"]');assert.equal(document.getElementById('post-browser').hidden,true);
 for(let i=0;i<100&&!document.querySelector('#guide-results .guide-item');i++)await delay(10);
 assert.ok(document.querySelector('#guide-results .guide-item a'));
 click('[data-action="handoff"]');const textarea=document.getElementById('handoff-text');assert.ok(textarea.value.includes('การดูแลแผล'));
 assert.doesNotMatch(textarea.value,/Meta|กรณีนี้อ้างอิง/);click('#edit-handoff');assert.equal(textarea.hidden,false);
 textarea.value+='\nอยากถามเรื่องนี้เพิ่มเติม';textarea.dispatchEvent(new window.Event('input',{bubbles:true}));click('#copy-summary');await delay(0);assert.equal(copied[0],textarea.value);
 const destination=new URL(document.getElementById('open-meong').getAttribute('href'));assert.equal(destination.search,'');assert.equal(destination.hash,'');
 click('#close-handoff');click('[data-action="back-posts"]');assert.equal(document.getElementById('post-reader').hidden,true);
});

test('public UI copy retains entry point and does not offer bundled Facebook research or public label editing',{skip:!available},async()=>{
 const html=await readFile(new URL('index.html',dist),'utf8');const {document}=parseHTML(html);assert.equal(document.querySelector('script[type="module"]').getAttribute('src'),'/entry.mjs');
 const app=await readFile(new URL('app.mjs',dist),'utf8');assert.ok(app.includes('เขียนเรื่องของฉัน'));assert.ok(!app.includes('data-action="load-public"'));
 const intent=await readFile(new URL('lib/intent-ui.mjs',dist),'utf8');assert.ok(!intent.includes('data-intent-action="load-review"'));
});
