import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS,newCareCase,normalizeCareCase,costSummary,careHandoff,isSafePhoto,scenarioForPost } from '../lib/care.mjs';

const post={id:'owner-case',text:'แมวมีผื่น',category:'ผิวหนัง'};
test('VPC workflows cover the five Pet Mommy situations without inventing a care plan',()=>{
  assert.deepEqual(SCENARIOS.map(s=>s.page),[3,4,5,6,7]);
  const c=newCareCase(post);
  assert.equal(c.scenario,'skin');assert.deepEqual(c.journal,[]);assert.deepEqual(c.plan,[]);
  assert.ok(c.costs.every(x=>x.amount===''));assert.ok(c.comparison.every(x=>x.name===''));
  assert.equal(scenarioForPost({text:'แมวอาเจียนหลังจากกินอาหาร',category:''}),'digestive');
  assert.equal(scenarioForPost({text:'ดูแลหลังทำหมัน',category:''}),'recovery');
});
test('cost totals distinguish an actual zero, unknown amounts and invalid numbers',()=>{
  assert.deepEqual(costSummary([{amount:''},{amount:'ยังไม่ทราบ'}]),{total:0,known:0,unknown:2});
  assert.deepEqual(costSummary([{amount:'0'},{amount:'1250.50'},{amount:''},{amount:'-20'}]),{total:1250.5,known:2,unknown:2});
});
test('care data retains literal notes and rejects active image formats and broken storage shapes',()=>{
  const attack='<script>send secrets</script>';
  const care=normalizeCareCase({scenario:'diagnose',journal:[{id:'e',note:attack,photo:'data:image/svg+xml;base64,AAAA'}],plan:[{text:attack,done:'yes'}],questions:['invented'],petName:attack},post);
  assert.equal(care.journal[0].note,attack);assert.equal(care.journal[0].photo,'');assert.equal(care.plan[0].done,false);assert.deepEqual(care.questions,[]);assert.equal(care.scenario,'skin');
  assert.equal(isSafePhoto('javascript:alert(1)'),false);assert.equal(isSafePhoto('data:image/png;base64,AQID'),true);
});
test('handoff labels owner observations, excludes image payloads and preserves missing prices',()=>{
  const care=newCareCase(post);care.petName='ชื่อเรียก';care.journal.push({id:'e',at:'2026-11-19T09:00',note:'สิ่งที่เห็น',photo:'data:image/png;base64,AQID'});care.costs[0].amount='0';care.questions=['items'];
  const summary=careHandoff(care);
  assert.match(summary,/ข้อมูลเพิ่มเติมที่จดไว้/);assert.match(summary,/สิ่งที่เห็น/);assert.match(summary,/ภาพไม่ได้ส่ง/);assert.doesNotMatch(summary,/data:image/);assert.match(summary,/มีราคา 1 จาก 3/);assert.match(summary,/วัตถุประสงค์อะไร/);
});
