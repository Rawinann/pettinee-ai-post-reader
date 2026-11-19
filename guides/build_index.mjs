import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {embed} from './encoder.mjs';
import {guideText} from '../lib/guide-match.mjs';
const root=new URL('../',import.meta.url),catalog=JSON.parse(await fs.readFile(new URL('data/guides/catalog.json',root),'utf8'));
const manifest=JSON.parse(await fs.readFile(new URL('models/guide-encoder/manifest.json',root),'utf8'));
const vectors={},batch=16;
for(let i=0;i<catalog.articles.length;i+=batch){
 const articles=catalog.articles.slice(i,i+batch),result=await embed(articles.map(guideText));
 for(let j=0;j<articles.length;j++)vectors[articles[j].id]=result[j].map(v=>Math.round(v*1e7)/1e7);
 if(i%128===0)console.log(`Embedded ${Math.min(i+batch,catalog.articles.length)}/${catalog.articles.length}`);
}
const result={version:1,model:manifest.repository,revision:manifest.revision,dimensions:384,pooling:'mean',normalized:true,metadataOnly:true,catalogHash:createHash('sha256').update(JSON.stringify(catalog.articles)).digest('hex'),count:catalog.count,vectors};
const path=new URL('data/guides/index.json',root),temporary=new URL('data/guides/index.json.tmp',root);await fs.writeFile(temporary,JSON.stringify(result));await fs.rename(temporary,path);console.log(`Index ready: ${catalog.count} guides`);
