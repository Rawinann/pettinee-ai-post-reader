import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PETMOMMY_SYSTEM,commentBriefErrors} from '../../server/petmommy.mjs';
import {checkReply} from '../../lib/workflow-policy.mjs';
export function prepareReplyDataset(records,catalog){
 if(!Array.isArray(records))throw Error('Dataset ต้องเป็น array');
 const result={train:[],validation:[],skipped:0},seen=new Set(),known=new Map(catalog.articles.map(g=>[g.id,g]));
 for(const row of records){
  if(row.reviewedForTraining!==true||row.rightsConfirmed!==true||row.personalDataRemoved!==true){result.skipped++;continue;}
  if(!['train','validation'].includes(row.split)||typeof row.postText!=='string'||!row.postText.trim()||row.postText.length>10000||typeof row.groundedReply!=='string'||!row.groundedReply.trim()||!Array.isArray(row.guideIds)||!row.target||typeof row.target.hook!=='string'||typeof row.target.info!=='string')throw Error('รูปแบบตัวอย่างที่ตรวจแล้วไม่ครบ');
  const key=row.postText.normalize('NFC').replace(/\s+/gu,' ').trim();if(seen.has(key))throw Error('โพสต์ซ้ำ ห้ามให้เคสเดียวกันปะปน train/validation');seen.add(key);
  const guides=row.guideIds.map(id=>{const g=known.get(id);if(!g)throw Error('คู่มือไม่อยู่ใน catalog');return g;});
  const target={hook:row.target.hook.trim(),info:row.target.info.trim()},prose=target.hook+'\n\n'+target.info;
  if(/https?:|\]\s*\(|บ้านนี้|เราเคย|เคย(?:เจอ|พา|เลี้ยง)|แมวเรา/iu.test(prose)||checkReply(prose,{guides,safety:{}}).length||commentBriefErrors(prose,row.postText).length)throw Error('คำตอบฝึกมีลิงก์ ประสบการณ์ที่ไม่ยืนยัน หรือไม่ผ่านนโยบาย');
  const user={untrustedPost:row.postText.trim(),groundedReply:row.groundedReply.trim(),guideMetadata:guides.map(g=>({id:g.id,title:g.title,description:g.description,metadataOnly:true}))};
  if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?<!\d)0[689](?:[ -]?\d){8}(?!\d)/iu.test(JSON.stringify(user)))throw Error('พบข้อมูลติดต่อที่ต้องลบก่อน export');
  result[row.split].push({messages:[{role:'system',content:PETMOMMY_SYSTEM},{role:'user',content:JSON.stringify(user)},{role:'assistant',content:JSON.stringify(target)}]});
 }
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [input,out='data/runtime/reply-training']=process.argv.slice(2);if(!input)throw Error('ใช้ node ml/replies/prepare-dataset.mjs input.json output-directory');
 const output=resolve(out);if(!output.startsWith(resolve('.')+sep))throw Error('ให้ export ภายใน workspace นี้');
 const [records,catalog]=await Promise.all([readFile(input,'utf8').then(JSON.parse),readFile(new URL('../../data/guides/catalog.json',import.meta.url),'utf8').then(JSON.parse)]),result=prepareReplyDataset(records,catalog);
 if(!result.train.length||!result.validation.length)throw Error('ต้องมีตัวอย่างที่ทีมตรวจสำหรับ train และ validation ก่อน ยังไม่สร้างชุดฝึก');
 await mkdir(output,{recursive:true});for(const split of ['train','validation'])await writeFile(resolve(output,split+'.jsonl'),result[split].map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});
 console.log(JSON.stringify({train:result.train.length,validation:result.validation.length,skipped:result.skipped,trained:false,uploaded:false}));
}
