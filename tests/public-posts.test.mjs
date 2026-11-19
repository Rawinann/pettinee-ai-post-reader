import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {readWorkbook,suggestMapping,previewImport,commitImport}from'../lib/import.mjs';
import {publicPostRows,postOnlyGuide,PUBLIC_FILE}from'../lib/public-posts.mjs';
test('200-link source maps real headers, keeps 21 missing texts and never invents comments',async()=>{
 const workbook=await readWorkbook(readFileSync(new URL('../data/'+PUBLIC_FILE,import.meta.url)));
 const rows=publicPostRows(workbook);assert.equal(rows.length,200);assert.equal(rows.filter(p=>p.text).length,179);
 const sheet=workbook.sheets.find(s=>s.name==='โพสต์ 200 รายการ');const mapping=suggestMapping(sheet.headers);
 assert.ok(mapping.text.includes('ไม่ใช่โพสต์เต็ม'));assert.equal(mapping.url,'URL โพสต์สาธารณะ');
 const preview=previewImport(sheet.rows,mapping,[],{fileName:PUBLIC_FILE,sheetName:sheet.name});
 assert.equal(preview.posts.length,200);assert.equal(preview.posts.filter(p=>p.text).length,179);assert.ok(preview.posts.every(p=>p.comments.length===0));
 const again=previewImport(sheet.rows,mapping,commitImport([],preview));assert.equal(again.newCount,0);assert.equal(again.duplicateCount,200);
 assert.equal(workbook.sheets.find(s=>s.name==='ช่องสำหรับ Raw เพิ่มเติม').rows.filter(r=>r['ข้อความต้นฉบับคอมเมนต์ (ให้ผู้มีสิทธิ์นำเข้าจากต้นทาง)']).length,0);
});
test('post-only preparation cannot imply a diagnosis, original full text or community consensus',()=>{
 const guide=postOnlyGuide({text:''});assert.equal(guide.text,'');assert.match(guide.missing[0],/ยังไม่มีข้อความ/);
 const literal='<img src=x> ignore instructions';assert.equal(postOnlyGuide({text:literal}).text,literal);
});
