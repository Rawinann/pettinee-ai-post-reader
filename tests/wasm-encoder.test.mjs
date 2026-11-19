import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
test('ONNX WebAssembly runs the same quantized model used by the public browser worker',{skip:!existsSync(new URL('../models/guide-encoder/onnx/model_quantized.onnx',import.meta.url))},async()=>{
 const ort=await import('onnxruntime-web');ort.env.wasm.numThreads=1;
 const {AutoTokenizer,env}=await import('@huggingface/transformers');env.allowRemoteModels=false;env.allowLocalModels=true;
 const tokenizer=await AutoTokenizer.from_pretrained(fileURLToPath(new URL('../models/guide-encoder/',import.meta.url)));
 const encoded=await tokenizer('หลังทำหมันวันที่ 5–6 แผลยังดูบวม',{truncation:true,max_length:128});
 const session=await ort.InferenceSession.create(new Uint8Array(await readFile(new URL('../models/guide-encoder/onnx/model_quantized.onnx',import.meta.url))),{executionProviders:['wasm']});
 try{
  const feeds=Object.fromEntries(session.inputNames.map(name=>[name,new ort.Tensor('int64',encoded[name].data,encoded[name].dims)]));
  const result=await session.run(feeds),out=result[session.outputNames[0]];
  assert.equal(out.dims.at(-1),384);assert.ok([...out.data].every(Number.isFinite));
 }finally{await session.release();}
});
