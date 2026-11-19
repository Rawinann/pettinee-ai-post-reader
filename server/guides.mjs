import fs from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {embed} from '../guides/encoder.mjs';
import {rankGuides,topicsFor,expandGuideQuery} from '../lib/guide-match.mjs';
export function createGuideService(root,{embedder=embed}={}){
 let loading,queue=Promise.resolve(),pending=0;const cache=new Map();
 async function data(){
  if(!loading)loading=(async()=>{const [catalog,index]=await Promise.all(['catalog.json','index.json'].map(file=>fs.readFile(join(root,'data/guides',file),'utf8').then(JSON.parse)));
   const hash=createHash('sha256').update(JSON.stringify(catalog.articles)).digest('hex');if(hash!==index.catalogHash)throw Error('Catalog changed; rebuild guide index');return {catalog,index};})().catch(e=>{loading=null;throw e;});return loading;
 }
 return {
  async status(){try{const{catalog,index}=await data();return {ready:true,count:catalog.count,checkedAt:catalog.checkedAt,model:index.model,source:catalog.source,metadataOnly:true};}catch{return {ready:false,source:'https://pettinee.meongsiljang.com/th/guide/qa'};}},
  async search(payload){
   if(!payload||typeof payload.text!=='string'||payload.text.length>10000||!['cat','dog','all',undefined].includes(payload.species))throw Object.assign(Error('กรุณาส่งข้อความไม่เกิน 10,000 ตัวอักษร'),{statusCode:400});
   const text=payload.text.trim(),species=payload.species||'cat';
   if(text.length<4)return {topics:topicsFor(text),results:[],available:0,method:'multilingual_embedding_with_topic_signals',source:'https://pettinee.meongsiljang.com/th/guide/qa'};
   const key=species+'|'+text;if(cache.has(key))return cache.get(key);
   if(pending>=8)throw Object.assign(Error('กำลังค้นหาหลายรายการ กรุณาลองอีกครั้ง'),{statusCode:429});pending++;
   const work=queue.then(async()=>{
    try{const {catalog,index}=await data(),vectors=await embedder([expandGuideQuery(text.slice(0,1500))]),ranked=rankGuides(catalog,index,vectors[0],text,{species,limit:5});
     const result={...ranked,method:'multilingual_embedding_with_topic_signals',model:index.model,checkedAt:catalog.checkedAt,catalogCount:catalog.count,source:catalog.source,metadataOnly:true};cache.set(key,result);if(cache.size>32)cache.delete(cache.keys().next().value);return result;
    }catch(e){throw Object.assign(Error('ยังค้นหาคู่มือในเครื่องไม่ได้ กรุณาตรวจโมเดลและดัชนี หรือเปิดคลังคู่มือโดยตรง'),{statusCode:503,cause:e});}
   }).finally(()=>pending--);queue=work.catch(()=>{});return work;
  },
 };
}
