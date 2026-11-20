import {predictIntent} from '/lib/intent.mjs';
import {rankGuides,topicsFor} from '/lib/guide-match.mjs';
export function installBrowserAPI({fetcher=globalThis.fetch.bind(globalThis),workerFactory=()=>new Worker('/guide-worker.mjs',{type:'module'}),scope=globalThis}={}){
 let modelPromise,catalogPromise,indexPromise,worker,sequence=0,semanticEnabled=false;
 const waiting=new Map();
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const read=path=>fetcher(path).then(r=>{if(!r.ok)throw Error('โหลดข้อมูล ML ไม่สำเร็จ');return r.json();});
 const model=()=>modelPromise??=read('/ml-assets/intent-model.json');
 const catalog=()=>catalogPromise??=read('/ml-assets/guide-catalog.json');
 const index=()=>indexPromise??=read('/ml-assets/guide-index.json');
 function vector(text){
  if(!worker){worker=workerFactory();worker.onmessage=event=>{const data=event.data;if(data.progress){scope.dispatchEvent?.(new CustomEvent('pettinee-model-progress',{detail:data.progress}));return;}const work=waiting.get(data.id);if(work){waiting.delete(data.id);data.error?work.reject(Error(data.error)):work.resolve(data.vector);}};worker.onerror=()=>{for(const item of waiting.values())item.reject(Error('เบราว์เซอร์ยังโหลดโมเดลไม่ได้ กรุณาลองใหม่'));waiting.clear();worker.terminate();worker=null;};}
  return new Promise((resolve,reject)=>{const id=++sequence;waiting.set(id,{resolve,reject});worker.postMessage({id,text});});
 }
 scope.pettineeEnableSemantic=()=>{semanticEnabled=true;};
 scope.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'?input:input.url,scope.location?.href||'https://pettinee.invalid');
  if(url.origin!==(scope.location?.origin||'https://pettinee.invalid')||!url.pathname.startsWith('/api/'))return fetcher(input,options);
  let body;try{body=JSON.parse(options?.body||'{}');}catch{return json({error:'ข้อมูลไม่ใช่ JSON'},400);}
  try{
   switch(url.pathname){
    case '/api/config':return json({mode:'demo',aiAvailable:false,publicDemo:true,browserML:true,workflowAvailable:false});
    case '/api/workflow/status':return json({available:false,reason:'Node.js/SQLite backend required; no Facebook connection on static site'});
    case '/api/intent/status':{const m=await model();return json({ready:true,trainingLabelStatus:m.trainingLabelStatus,reviewedCount:0,draftCount:179,excludedCount:21,report:m.evaluation,publicDemo:true});}
    case '/api/intent/classify':{if(typeof body.text!=='string'||body.text.length>10000)return json({error:'ส่งข้อความไม่เกิน 10,000 ตัวอักษร'},400);const m=await model();return json({...predictIntent(m,body.text),trainingLabelStatus:m.trainingLabelStatus,modelVersion:m.version});}
    case '/api/intent/annotations':return json({error:'การตรวจป้ายชุดวิจัยใช้ได้เฉพาะเวอร์ชันภายในทีม'},403);
    case '/api/guides/status':return json({ready:true,count:(await catalog()).count,browserML:true});
    case '/api/guides/search':{
     if(typeof body.text!=='string'||body.text.length>10000||!['cat','dog','all',undefined].includes(body.species))return json({error:'กรุณาส่งข้อความไม่เกิน 10,000 ตัวอักษร'},400);
     const text=body.text.trim();if(text.length<4)return json({topics:[],results:[],available:0});
     const c=await catalog();let ranked,method;
     if(semanticEnabled){const [v,i]=await Promise.all([vector(text.slice(0,1500)),index()]);ranked=rankGuides(c,i,v,text,{species:body.species||'cat',limit:5});method='browser_semantic_hybrid';}
     else{ranked=rankGuides(c,{vectors:{}},[],text,{species:body.species||'cat',limit:5,lexicalOnly:true});method='topic_lexical_only';}
     return json({...ranked,method,catalogCount:c.count,checkedAt:c.checkedAt,metadataOnly:true,browserML:true});
    }
    case '/api/analyze':return json({error:'รุ่นออนไลน์นี้ใช้สรุป Demo ยังไม่ได้เชื่อม LLM'},503);
    default:return json({error:'ไม่พบการทำงานนี้'},404);
   }
  }catch{return json({error:'ยังประมวลผลไม่ได้ ลองใหม่หรือเปิดคลังคู่มือต้นฉบับ'},503);}
 };
 return {model,catalog};
}
