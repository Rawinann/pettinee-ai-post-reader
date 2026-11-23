import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
const output=resolve('cloud-dist');await mkdir(output,{recursive:true});
const files=['styles.css','workflow.css','guide-landing.css','lib/workflow-ui.mjs','lib/comment-ui.mjs','lib/collection-ui.mjs','lib/workflow-policy.mjs','lib/import.mjs','lib/guide-match.mjs'];
for(const file of files){await mkdir(dirname(resolve(output,file)),{recursive:true});await cp(file,resolve(output,file));}
await writeFile(resolve(output,'index.html'),await readFile('cloud/index.html'));await cp('cloud/entry.mjs',resolve(output,'cloud-entry.mjs'));
console.log('Built Cloud dashboard shell; no posts, workbooks, SQLite, secrets, ML weights or browser profiles in static output.');
