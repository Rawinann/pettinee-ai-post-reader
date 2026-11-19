import {pipeline,env} from '/vendor/transformers.min.js';
import {expandGuideQuery} from '/lib/guide-match.mjs';
env.allowLocalModels=false;
env.allowRemoteModels=true;
env.useBrowserCache=true;
env.backends.onnx.wasm.wasmPaths='/vendor/';
env.backends.onnx.wasm.numThreads=1;
let loading,queue=Promise.resolve();
self.onmessage=event=>{const {id,text}=event.data;queue=queue.catch(()=>{}).then(async()=>{
 try{
  if(!loading)loading=fetch('/ml-assets/encoder-manifest.json').then(r=>r.json()).then(manifest=>pipeline('feature-extraction',manifest.repository,{revision:manifest.revision,device:'wasm',dtype:'q8',progress_callback:progress=>self.postMessage({progress:{status:progress.status,progress:progress.progress,file:progress.file}})})).catch(e=>{loading=null;throw e;});
  const encoder=await loading,out=await encoder([expandGuideQuery(text)],{pooling:'mean',normalize:true,truncation:true,max_length:128});self.postMessage({id,vector:out.tolist()[0]});
 }catch{self.postMessage({id,error:'โหลดโมเดลความหมายไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่'});}
});};
