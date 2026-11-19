import {readFile,writeFile,rename,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {INTENTS,normalizeIntentText,predictIntent} from '../lib/intent.mjs';
const error=(message,statusCode)=>Object.assign(new Error(message),{statusCode});
export function createIntentService(root){
 let cached=null,stamp=0,queue=Promise.resolve();
 const modelPath=join(root,'models/intent-model.json'),annotationPath=join(root,'data/intent/annotations.json');
 async function model(){
  try{const info=await stat(modelPath);if(cached&&stamp===info.mtimeMs)return cached;const value=JSON.parse(await readFile(modelPath,'utf8'));
   if(!Array.isArray(value.classes)||value.classes.some(k=>!INTENTS[k])||value.classes.length!==5||value.weights.length!==5||value.weights.some(w=>w.length!==value.idf.length))throw Error('Invalid model');
   cached=value;stamp=info.mtimeMs;return value;
  }catch{throw error('ยังไม่มีโมเดลที่อ่านได้ กรุณาเทรนด้วย python ml/train.py',503);}
 }
 async function annotations(){return JSON.parse(await readFile(annotationPath,'utf8'));}
 return {
  async status(){
   try{const m=await model(),a=await annotations(),report=m.evaluation||JSON.parse(await readFile(join(root,'models/intent-report.json'),'utf8'));
    return {ready:true,version:m.version,trainingLabelStatus:m.trainingLabelStatus,reviewedCount:a.labels.filter(x=>x.status==='reviewed').length,draftCount:a.labels.filter(x=>x.status==='draft').length,excludedCount:a.labels.filter(x=>x.status==='excluded').length,report};
   }catch{return {ready:false,trainingLabelStatus:'unavailable'};}
  },
  async classify(payload){
   if(!payload||typeof payload.text!=='string'||payload.text.length>10000)throw error('ส่งข้อความไม่เกิน 10,000 ตัวอักษร',400);
   const m=await model(),result=predictIntent(m,payload.text);
   return {...result,seenDuringTraining:m.trainTextHashes.includes(createHash('sha256').update(normalizeIntentText(payload.text)).digest('hex')),trainingLabelStatus:m.trainingLabelStatus,modelVersion:m.version,scoreMeaning:'model ranking score; not calibrated confidence or clinical evidence'};
  },
  async reviewData(){
   const [a,c]=await Promise.all([annotations(),readFile(join(root,'data/intent/corpus.json'),'utf8').then(JSON.parse)]);
   const labels=new Map(a.labels.map(x=>[x.id,x]));let split={testIds:[]};try{split=JSON.parse(await readFile(join(root,'data/intent/split-draft.json'),'utf8'));}catch{}
   return {revision:a.revision||0,records:c.records.filter(p=>p.text.trim()).map(p=>({...p,annotation:labels.get(p.id),split:split.testIds.includes(p.id)?'test':'train'}))};
  },
  async review(payload){
   if(!payload||typeof payload.id!=='string'||!Object.hasOwn(INTENTS,payload.label)||payload.reviewed!==true||!Number.isInteger(payload.revision))throw error('ต้องเลือกป้าย ยืนยันการตรวจ และส่ง revision',400);
   const work=queue.then(async()=>{
    const a=await annotations();if((a.revision||0)!==payload.revision)throw error('ข้อมูลถูกแก้จากหน้าต่างอื่น กรุณาโหลดรายการใหม่',409);
    const row=a.labels.find(x=>x.id===payload.id);if(!row||row.status==='excluded')throw error('ไม่พบข้อความสำหรับตรวจป้าย',404);
    row.draftLabel=row.draftLabel||row.label;row.label=payload.label;row.status='reviewed';row.labelSource='user_review';row.reviewer='local_user';row.reviewedAt=new Date().toISOString();a.revision=(a.revision||0)+1;
    await writeFile(annotationPath+'.tmp',JSON.stringify(a,null,2),'utf8');await rename(annotationPath+'.tmp',annotationPath);
    return {revision:a.revision,annotation:row,retrainingRequired:true};
   });queue=work.catch(()=>{});return work;
  },
 };
}
