import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readWorkbook,suggestMapping,previewImport} from '../lib/import.mjs';
import {publicPostRows,PUBLIC_FILE} from '../lib/public-posts.mjs';
import {createPublicPosts} from '../hosting/post-texts.mjs';
import {reconcilePublicDataset,inPublicFeed} from '../hosting/reconcile-posts.mjs';
const workbook=await readWorkbook(await readFile(new URL('../data/'+PUBLIC_FILE,import.meta.url)));
const sheet=workbook.sheets.find(s=>s.name==='โพสต์ 200 รายการ');
const legacy=previewImport(sheet.rows,suggestMapping(sheet.headers),[],{fileName:PUBLIC_FILE,sheetName:sheet.name}).posts;
const published=createPublicPosts(publicPostRows(workbook));
const demos=Array.from({length:6},(_,i)=>({id:'demo-'+i,text:'เคสจำลอง '+i,provenance:'simulated',comments:[]}));
test('385 stored posts display 185 in main feed while retaining all 200 original imports',()=>{
 const before=structuredClone(legacy),saved=new Set([legacy[0].id]);
 const result=reconcilePublicDataset([...published,...demos,...legacy],published,saved);
 assert.equal(result.posts.length,385);assert.equal(result.archived,200);
 assert.equal(result.posts.filter(p=>inPublicFeed(p,'ทั้งหมด')).length,185);
 assert.equal(result.posts.filter(p=>inPublicFeed(p,'นำเข้าเดิม')).length,200);
 assert.equal(result.posts.filter(p=>p.publicCanonicalId).length,179);
 assert.ok(result.saved.has('published-001'));assert.ok(!result.saved.has(legacy[0].id));
 assert.deepEqual(legacy,before);assert.ok(saved.has(legacy[0].id));
 for(const old of legacy){const retained=result.posts.find(p=>p.id===old.id);assert.equal(retained.text,old.text);assert.equal(retained.url,old.url);assert.deepEqual(retained.comments,old.comments);}
});
test('reconciliation is idempotent and preserves personal posts, unrelated imports and saved link-only records',()=>{
 const missing=legacy.find(p=>!p.text),personal={...legacy[0],id:'personal',inputKind:'manual'},other={...legacy[0],id:'other',fileName:'my-other-data.xlsx'};
 const first=reconcilePublicDataset([...legacy,...demos,personal,other],published,new Set([missing.id,personal.id,other.id]));
 const again=reconcilePublicDataset(first.posts,published,first.saved);
 assert.deepEqual(again,first);assert.equal(first.posts.filter(p=>inPublicFeed(p,'ทั้งหมด')).length,187);
 assert.ok(first.saved.has(missing.id));assert.ok(inPublicFeed(first.posts.find(p=>p.id===missing.id),'บันทึกไว้'));
 assert.ok(inPublicFeed(first.posts.find(p=>p.id==='personal'),'ทั้งหมด'));assert.ok(inPublicFeed(first.posts.find(p=>p.id==='other'),'ทั้งหมด'));
});
test('ambiguous text matches are kept instead of assigning the wrong saved post',()=>{
 const matches=[{...published[0],id:'a'},{...published[0],id:'b'}];
 const result=reconcilePublicDataset([legacy[0]],matches,new Set([legacy[0].id]));assert.equal(result.archived,0);assert.ok(result.saved.has(legacy[0].id));
});
