import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
test('Cloud static build has complete imports and no private data; function graph excludes SQLite and local ML',async()=>{
 execFileSync(process.execPath,['hosting/build-cloud.mjs'],{stdio:'pipe'});const root=resolve('cloud-dist');
 async function walk(dir){const output=[];for(const f of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,f.name);output.push(...f.isDirectory()?await walk(p):[p]);}return output;}
 const files=await walk(root);assert.ok(files.length>5);assert.ok(files.every(p=>! /\.xlsx$|\.sqlite|runtime|\.env|demo-posts|catalog|models|annotations/i.test(p)));
 for(const file of files.filter(p=>p.endsWith('.mjs'))){const text=await readFile(file,'utf8');for(const m of text.matchAll(/from ['"](\.\.?\/[^'"]+)['"]/g))assert.ok(files.includes(resolve(dirname(file),m[1])),file+' missing '+m[1]);}
 const seen=new Set();async function trace(file){if(seen.has(file))return;seen.add(file);const text=await readFile(file,'utf8');assert.doesNotMatch(text,/from ['"]node:sqlite|from ['"].*(?:workflow-store|guides\/encoder|comment-driver)/);for(const m of text.matchAll(/from ['"](\.\.?\/[^'"]+)['"]/g))await trace(resolve(dirname(file),m[1]));}await trace(resolve('api/index.mjs'));
 const config=JSON.parse(await readFile('vercel.json','utf8'));assert.equal(config.outputDirectory,'cloud-dist');assert.ok(config.rewrites.some(r=>r.source==='/g/:token'));assert.match(await readFile('cloud/entry.mjs','utf8'),/api\/auth\/me/);assert.doesNotMatch(await readFile('cloud/entry.mjs','utf8'),/localStorage|DATABASE_URL|WORKER_TOKEN/);
});
