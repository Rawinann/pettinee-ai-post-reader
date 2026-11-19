import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeIntentText} from '../lib/intent.mjs';
const root=new URL('../',import.meta.url),corpus=JSON.parse(fs.readFileSync(new URL('data/intent/corpus.json',root),'utf8'));
const rows=corpus.records.filter(p=>p.text.trim()).map(p=>({id:p.id,text:p.text,url:p.url,sourceKind:p.sourceKind,sourceNote:p.sourceNote,contentHash:createHash('sha256').update(normalizeIntentText(p.text)).digest('hex')}));
const directory=new URL('data/retrieval/',root);fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(new URL('documents.jsonl',directory),rows.map(p=>JSON.stringify(p)).join('\n')+'\n');
fs.writeFileSync(new URL('manifest.json',directory),JSON.stringify({status:'not_indexed',documents:rows.length,excludedNoText:corpus.records.length-rows.length,embeddingModel:null,dimensions:null,warning:'Prepared corpus only. Semantic search has not been implemented. No document text has been sent to an embedding service.'},null,2));
console.log(`Prepared ${rows.length} documents. No vectors or semantic search yet.`);
