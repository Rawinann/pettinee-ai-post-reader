import fs from 'node:fs';
import {readWorkbook} from '../lib/import.mjs';
import {publicPostRows,PUBLIC_FILE} from '../lib/public-posts.mjs';
const root=new URL('../',import.meta.url),path=new URL('data/intent/corpus.json',root);
const rows=publicPostRows(await readWorkbook(fs.readFileSync(new URL('data/'+PUBLIC_FILE,root))));
const corpus={version:1,sourceFile:PUBLIC_FILE,records:rows.map((p,i)=>({id:p.postId,text:p.text,url:p.url,row:i+2,sourceKind:'public_excerpt',sourceNote:p.sourceNote}))};
if(fs.existsSync(path)&&JSON.stringify(JSON.parse(fs.readFileSync(path,'utf8')))!==JSON.stringify(corpus))throw Error('Corpus changed. Preserve the old dataset/split/report before making a new version.');
fs.mkdirSync(new URL('data/intent/',root),{recursive:true});fs.writeFileSync(path,JSON.stringify(corpus,null,2));
console.log(`Corpus: ${rows.length} records, ${rows.filter(p=>p.text.trim()).length} with text. No labels inferred from search terms.`);
