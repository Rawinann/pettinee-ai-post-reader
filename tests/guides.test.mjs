import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {topicsFor} from '../lib/guide-match.mjs';
import {createGuideService} from '../server/guides.mjs';
import {createAppServer} from '../server.mjs';
import {extractCatalog} from '../guides/sync.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const example='หลังทำหมันวันที่ 5–6 แผลยังดูบวม จึงถามว่าปกติหรือไม่';
const service=createGuideService(root);
test('guide metadata is sourced, deduplicated and aligned with 384-dimensional index',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../data/guides/catalog.json',import.meta.url)));
 const index=JSON.parse(await readFile(new URL('../data/guides/index.json',import.meta.url)));
 assert.equal(catalog.complete,true);assert.equal(catalog.pages,19);assert.equal(catalog.count,1867);
 assert.equal(new Set(catalog.articles.map(a=>a.url)).size,catalog.count);
 assert.equal(index.catalogHash,createHash('sha256').update(JSON.stringify(catalog.articles)).digest('hex'));
 for(const article of catalog.articles){assert.equal(new URL(article.url).origin,'https://pettinee.meongsiljang.com');assert.equal(index.vectors[article.id].length,384);}
 const source=catalog.articles.find(a=>a.id==='cat-post-neuter-recovery-care');assert.equal(source.verification,'page-checked');assert.ok(source.headings.length);
});
test('topic phrases distinguish before and after neutering without inferring a diagnosis',()=>{
 assert.deepEqual(topicsFor(example).map(t=>t.id),['post-neuter','wound','swelling']);
 assert.ok(!topicsFor('ยังไม่ได้ทำหมัน อยากรู้ว่าควรทำตอนไหน').some(t=>t.id==='post-neuter'));
 assert.ok(topicsFor('เพิ่งพาแมวไปทำหมันมา ก่อนกลับบ้าน').some(t=>t.id==='post-neuter'));
});

test('the two-cat water and litter-clump example ranks the supplied educational guide first',async()=>{
 const text='ที่บ้านเลี้ยง 2 ตัว ดญ. ทั้งคู่ อายุห่างกัน 20 วัน กินน้ำเยอะพอๆกัน เป็นแบบนี้ตั้งแต่เลี้ยงมา ฉี่ก้อนใหญ่ของบริชติช ก้อนเล็กของสกอตติช แบบนี้ปกติไหมครับ',result=await service.search({text,species:'cat'});assert.equal(result.results[0].id,'cat-polyuria-polydipsia-qa');assert.equal(result.results[0].url,'https://pettinee.meongsiljang.com/th/guide/qa/cat-polyuria-polydipsia-qa');
});
test('catalog parser captures metadata and excludes unrelated and foreign links',()=>{
 const {articles:rows}=extractCatalog('<a href="/th/guide/qa/cat-example"><p>ชื่อคู่มือแมว</p><p>คำอธิบาย</p><span>การดูแล</span></a><a href="https://evil.test/th/guide/qa/fake"><p>ปลอม</p></a><a href="/th/guide/qa?page=2">2</a>','https://pettinee.meongsiljang.com/th/guide/qa');
 assert.equal(rows.length,1);assert.equal(rows[0].title,'ชื่อคู่มือแมว');
});
test('real offline embedding matches the supplied example and handles slang and pre-neuter queries',async()=>{
 const originalFetch=globalThis.fetch;let networkCalls=0;
 globalThis.fetch=()=>{networkCalls++;throw Error('runtime network disabled');};
 try{
  const result=await service.search({text:example});
  assert.equal(result.results[0].id,'cat-post-neuter-recovery-care');assert.equal(result.catalogCount,1867);
  assert.ok(result.results[0].matchedTopics.includes('หลังทำหมัน'));
  assert.ok(result.results.every(a=>a.species!=='dog'));
  const before=await service.search({text:'ยังไม่ได้ทำหมัน อยากรู้ว่าควรทำตอนไหน'});
  assert.notEqual(before.results[0].id,'cat-post-neuter-recovery-care');assert.match(before.results[0].id,/timing|pre-neuter/);
  const slang=await service.search({text:'แมวอ้วกบ่อยหลังอาหาร'});
  assert.ok(slang.results.length);assert.ok(slang.results[0].matchedTopics.includes('อาเจียน'));
  const unrelated=await service.search({text:'อยากซื้อรถยนต์ไปเที่ยวต่างจังหวัด'});assert.equal(unrelated.results.length,0);
  assert.equal(networkCalls,0);
 }finally{globalThis.fetch=originalFetch;}
});
test('guide HTTP API runs actual local ML and rejects invalid payloads and cross-origin calls',async()=>{
 const server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const status=await fetch(base+'/api/guides/status');assert.equal((await status.json()).count,1867);
  const search=text=>fetch(base+'/api/guides/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
  const response=await search(example);assert.equal(response.status,200);assert.equal((await response.json()).results[0].url,'https://pettinee.meongsiljang.com/th/guide/qa/cat-post-neuter-recovery-care');
  assert.equal((await search('x'.repeat(10001))).status,400);
  assert.equal((await (await search('')).json()).results.length,0);
  assert.equal((await fetch(base+'/api/guides/search',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:JSON.stringify({text:example})})).status,403);
  assert.equal((await fetch(base+'/models/guide-encoder/config.json')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
