import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
const repository='Xenova/paraphrase-multilingual-MiniLM-L12-v2',directory=new URL('../models/guide-encoder/',import.meta.url);
let previous;try{previous=JSON.parse(await fs.readFile(new URL('manifest.json',directory),'utf8'));}catch{}
const metadata=previous?.repository===repository?{sha:previous.revision}:await(await fetch('https://huggingface.co/api/models/'+repository,{signal:AbortSignal.timeout(45000)})).json();
if(!/^[a-f0-9]{40}$/.test(metadata.sha||''))throw Error('Model revision unavailable');
const files=['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/model_quantized.onnx'];
await fs.mkdir(new URL('onnx/',directory),{recursive:true});const checksums={};
for(const file of files){
 const target=new URL(file,directory),url=`https://huggingface.co/${repository}/resolve/${metadata.sha}/${file}`;
 let exists=false;try{exists=(await fs.stat(target)).size>0;}catch{}
 if(!exists){const response=await fetch(url,{signal:AbortSignal.timeout(300000)});if(!response.ok)throw Error(`${response.status}: ${file}`);const temporary=new URL(file+'.tmp',directory);await pipeline(Readable.fromWeb(response.body),createWriteStream(temporary));await fs.rename(temporary,target);console.log('Downloaded',file,(await fs.stat(target)).size);}
 const data=await fs.readFile(target);checksums[file]=createHash('sha256').update(data).digest('hex');if(previous?.checksums?.[file]&&previous.checksums[file]!==checksums[file])throw Error('Encoder checksum mismatch: '+file);
}
await fs.writeFile(new URL('manifest.json',directory),JSON.stringify({repository,revision:metadata.sha,dtype:'q8',pooling:'mean',dimensions:384,checksums,license:'apache-2.0',source:'https://huggingface.co/'+repository},null,2));
console.log('Encoder ready for offline inference');
