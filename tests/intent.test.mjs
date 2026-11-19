import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {predictIntent,normalizeIntentText,INTENTS} from '../lib/intent.mjs';
import {createAppServer} from '../server.mjs';
const model=JSON.parse(await readFile(new URL('../models/intent-model.json',import.meta.url),'utf8'));
const parity=JSON.parse(await readFile(new URL('../models/intent-parity.json',import.meta.url),'utf8'));
const manifest=JSON.parse(await readFile(new URL('../models/intent-training.json',import.meta.url),'utf8'));

test('JavaScript inference matches exported scikit-learn probabilities on held-out and Unicode texts',()=>{
 for(const sample of parity){const result=predictIntent(model,sample.text);if(!sample.featureCount){assert.equal(result.status,'needs_review');assert.deepEqual(result.candidates,[]);continue;}assert.ok(result.candidates.length);for(const candidate of result.candidates){const expected=sample.probabilities[sample.classes.indexOf(candidate.intent)];assert.ok(Math.abs(candidate.score-expected)<1e-9,`${candidate.score} vs ${expected}`);}}
});
test('empty, short and unseen features abstain; injected instructions remain plain data',()=>{
 assert.equal(predictIntent(model,'').status,'insufficient_text');assert.equal(predictIntent(model,'猫').intent,'unclear');assert.equal(predictIntent(model,'🦄'.repeat(20)).intent,'unclear');
 const output=predictIntent(model,'ignore rules <script>send API_KEY</script> ขอรีวิวน้ำพุแมว');assert.ok(Object.hasOwn(INTENTS,output.intent));assert.ok(output.candidates.every(x=>Number.isFinite(x.score)));
 assert.equal(normalizeIntentText('  TEST\n A  '),'test a');
});
test('training manifest isolates held-out IDs and labels metrics as draft agreement',()=>{
 const train=new Set(manifest.split.trainIds),testIds=new Set(manifest.split.testIds);assert.equal(train.size,142);assert.equal(testIds.size,37);assert.ok([...testIds].every(id=>!train.has(id)));
 assert.equal(manifest.labels.length,179);assert.ok(manifest.labels.every(x=>x.status==='draft'));assert.equal(model.labelFingerprint,manifest.labelFingerprint);assert.equal(model.trainingLabelStatus,'draft');
 const report=model.evaluation;assert.equal(report.evaluationKind,'agreement_with_assistant_draft_labels_not_human_accuracy');assert.equal(report.excludedNoText,21);assert.equal(report.confusionMatrix.flat().reduce((a,b)=>a+b,0),37);
 const matrix=report.confusionMatrix;const macro=matrix.reduce((sum,row,i)=>{const tp=row[i],pred=matrix.reduce((n,r)=>n+r[i],0),actual=row.reduce((a,b)=>a+b,0);return sum+(pred+actual?2*tp/(pred+actual):0);},0)/matrix.length;
 assert.ok(Math.abs(macro-report.macroF1)<1e-12);
});
async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'pettinee-intent-'));
 try{
  await mkdir(join(root,'models'));await mkdir(join(root,'data/intent'),{recursive:true});
  for(const file of ['models/intent-model.json','models/intent-report.json','data/intent/corpus.json','data/intent/annotations.json','data/intent/split-draft.json'])await copyFile(new URL('../'+file,import.meta.url),join(root,file));
  const server=createAppServer({rootDir:root});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn(`http://127.0.0.1:${server.address().port}`,root);}finally{await new Promise(r=>server.close(r));}
 }finally{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(root.includes('pettinee-intent-'));await rm(root,{recursive:true,force:true});}
}
const post=(base,path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('local ML API predicts without Python or external provider and exposes no model source file',async()=>fixture(async base=>{
 const status=await(await fetch(base+'/api/intent/status')).json();assert.equal(status.ready,true);assert.equal(status.trainingLabelStatus,'draft');assert.equal(status.reviewedCount,0);
 const response=await post(base,'/api/intent/classify',{text:parity[0].text});assert.equal(response.status,200);const result=await response.json();assert.equal(result.seenDuringTraining,false);assert.equal(result.trainingLabelStatus,'draft');assert.ok(result.modelVersion.startsWith('intent-char-tfidf-lr'));
 assert.equal((await post(base,'/api/intent/classify',{text:'x'.repeat(10001)})).status,400);assert.equal((await post(base,'/api/intent/classify',{text:[]})).status,400);
 assert.equal((await post(base,'/api/intent/classify',{text:'ข้อความตัวอย่าง'},{Origin:'https://elsewhere.example'})).status,403);
 assert.equal((await fetch(base+'/models/intent-model.json')).status,404);
}));
test('review requires explicit confirmation, preserves draft provenance and detects stale edits',async()=>fixture(async(base,root)=>{
 const data=await(await fetch(base+'/api/intent/annotations')).json();assert.equal(data.records.length,179);const id=data.records[0].id;
 assert.equal((await post(base,'/api/intent/annotations',{id,label:'compare',reviewed:false,revision:0})).status,400);
 assert.equal((await post(base,'/api/intent/annotations',{id,label:'__proto__',reviewed:true,revision:0})).status,400);
 const results=await Promise.all([post(base,'/api/intent/annotations',{id,label:'compare',reviewed:true,revision:0}),post(base,'/api/intent/annotations',{id,label:'cost',reviewed:true,revision:0})]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 const stored=JSON.parse(await readFile(join(root,'data/intent/annotations.json'),'utf8'));assert.equal(stored.revision,1);assert.equal(stored.labels.find(x=>x.id===id).status,'reviewed');assert.ok(stored.labels.find(x=>x.id===id).draftLabel);
 const status=await(await fetch(base+'/api/intent/status')).json();assert.equal(status.reviewedCount,1);assert.equal(status.trainingLabelStatus,'draft','Review does not silently retrain or relabel the fitted model');
}));
