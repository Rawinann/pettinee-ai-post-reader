// Opt-in: point TEST_DATABASE_URL at an isolated Neon staging branch.
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createCloudStore} from '../cloud/store.mjs';
import {digest} from '../cloud/auth.mjs';
test('two real PostgreSQL connections: concurrent edits and SKIP LOCKED claims', {skip:!process.env.TEST_DATABASE_URL},async t=>{
 const schema='pettinee_test_'+randomBytes(8).toString('hex'),admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});await admin.query('CREATE SCHEMA '+schema);const rawPool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:2});const pool={end:()=>rawPool.end(),async connect(){const c=await rawPool.connect();return {release:()=>c.release(),async query(sql,args){if(sql==='BEGIN'){await c.query('BEGIN');await c.query('SET LOCAL search_path='+schema);return {rows:[]};}return c.query(sql,args);}};},async query(sql,args){const c=await this.connect();try{await c.query('BEGIN');const r=await c.query(sql,args);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
 t.after(async()=>{await pool.end();if(!/^pettinee_test_[a-f0-9]{16}$/.test(schema))throw Error('Unsafe schema cleanup');await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});await pool.query(await readFile(new URL('../cloud/migrations/001-shared.sql',import.meta.url),'utf8'));const store=createCloudStore(pool,{origin:'https://test.example'}),token='a'.repeat(40);await store.provisionWorker({id:'a',label:'test',expectedAccount:'test',tokenHash:digest(token)});
 const p=(await store.ingest({sourceType:'import',externalId:'test',text:'เคสทดสอบ',url:'',publishedAt:''},'test')).post,worker=await store.authenticateWorker(token),claims=await Promise.all([store.claim(worker),store.claim(worker)]);assert.equal(claims.filter(Boolean).length,1);
 const doc={...p,status:'awaiting_review',draft:'ข้อความทดสอบครับ',revision:1};await pool.query('UPDATE pettinee_posts SET status=$2,revision=1,doc=$3 WHERE id=$1',[p.id,doc.status,doc]);const results=await Promise.allSettled([store.edit(p.id,{revision:1,text:'ฉบับ A ครับ'},'A'),store.edit(p.id,{revision:1,text:'ฉบับ B ครับ'},'B')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await store.get(p.id)).revision,2);
});
