import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const launchers=[
 'start-pettinee-worker.cmd',
 'login-pettinee-worker.cmd',
 'start-pettinee-page-worker.cmd',
 'login-pettinee-page-worker.cmd',
];

test('Windows worker launchers use CMD-safe ASCII and CRLF',async()=>{
 for(const name of launchers){
  const bytes=await readFile(new URL('../'+name,import.meta.url));
  assert.ok(bytes.length>0,name);
  assert.ok(bytes.every(byte=>byte<128),`${name} contains non-ASCII bytes`);
  for(let i=0;i<bytes.length;i++)if(bytes[i]===10)assert.equal(bytes[i-1],13,`${name} contains a bare LF`);
  assert.match(bytes.toString('ascii'),/^@echo off\r\n/u,name);
 }
});
