import {fileURLToPath} from 'node:url';
let loading;
export async function encoder(){
 if(!loading)loading=(async()=>{
  const {pipeline,env}=await import('@huggingface/transformers');
  env.allowRemoteModels=false;env.allowLocalModels=true;
  env.backends.onnx.logSeverityLevel=3;
  return await pipeline('feature-extraction',fileURLToPath(new URL('../models/guide-encoder/',import.meta.url)),{device:'cpu',dtype:'q8',session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
 })().catch(error=>{loading=null;throw error;});
 return loading;
}
export async function embed(texts){
 const model=await encoder();const output=await model(texts,{pooling:'mean',normalize:true,truncation:true,max_length:128});return output.tolist();
}
