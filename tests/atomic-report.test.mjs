import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,rename,readdir} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {writeAtomicJSON} from '../automation/batch-report.mjs';
test('a temporarily locked report retries safely and leaves a readable final file without stale temp files',async t=>{const parent=resolve('tmp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'atomic-report-'));t.after(async()=>{if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe cleanup');await rm(dir,{recursive:true,force:true});});let attempts=0;const path=join(dir,'status.json');await writeAtomicJSON(path,{read:40,new:0},{renameFile:async(from,to)=>{if(++attempts===1)throw Object.assign(Error('Simulated temporary file lock'),{code:'EPERM'});return rename(from,to);},retryDelay:async()=>{}});assert.equal(attempts,2);assert.deepEqual(JSON.parse(await readFile(path,'utf8')),{read:40,new:0});assert.deepEqual(await readdir(dir),['status.json']);});
