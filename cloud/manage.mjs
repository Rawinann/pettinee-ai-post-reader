import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {cloudPool,transaction} from './db.mjs';
import {passwordHash,digest} from './auth.mjs';
import {createCloudStore} from './store.mjs';
import {importSQLiteSnapshot,backupCloud,restoreCloud} from './legacy.mjs';
const [command,arg]=process.argv.slice(2),env=process.env;let pool;
try{
 if(command==='user'){if(!/^\S+@\S+\.\S+$/.test(env.PETTINEE_USER_EMAIL||''))throw Error('ตั้ง PETTINEE_USER_EMAIL ก่อน');console.log(JSON.stringify({email:env.PETTINEE_USER_EMAIL,passwordHash:passwordHash(env.PETTINEE_USER_PASSWORD)}));}
 else{
  pool=cloudPool();
  if(command==='migrate'){const sql=await readFile(new URL('./migrations/001-shared.sql',import.meta.url),'utf8');await transaction(pool,c=>c.query(sql));console.log('Migration 001-shared สำเร็จ');}
  else if(command==='worker'){const id=env.CLOUD_WORKER_ID,account=env.CLOUD_FACEBOOK_ACCOUNT;if(!/^[A-Za-z0-9_-]{1,50}$/.test(id||'')||!account)throw Error('ตั้ง CLOUD_WORKER_ID และ CLOUD_FACEBOOK_ACCOUNT ก่อน');const token=randomBytes(32).toString('base64url'),output=resolve('data/runtime/cloud-'+id+'.env');await mkdir(resolve('data/runtime'),{recursive:true});await writeFile(output,`CLOUD_ORIGIN=${env.PUBLIC_ORIGIN}\nCLOUD_WORKER_ID=${id}\nCLOUD_FACEBOOK_ACCOUNT=${JSON.stringify(account)}\nCLOUD_WORKER_TOKEN=${token}\nCLOUD_WORKER_PUBLISH_ENABLED=false\nREPLY_LLM_ENABLED=true\nREPLY_LLM_PROVIDER=ollama\nREPLY_LLM_MODEL=qwen2.5:7b-instruct\n`,{flag:'wx'});await createCloudStore(pool,{origin:env.PUBLIC_ORIGIN}).provisionWorker({id,label:env.CLOUD_WORKER_LABEL||id,expectedAccount:account,tokenHash:digest(token),capabilities:{analyse:true,collect:true,publish:process.argv.includes('--allow-browser-publish')}});console.log('บันทึก worker แล้ว เก็บไฟล์นี้เป็น .env.worker บนเครื่องเจ้าของเท่านั้น: '+output);}
  else if(command==='import-sqlite'){if(!arg)throw Error('ระบุ path SQLite');const db=new DatabaseSync(resolve(arg),{readOnly:true});let snapshot;try{db.exec('BEGIN');const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'workflow_%' ORDER BY name").all().map(r=>r.name);snapshot={};for(const name of names){if(!/^workflow_[a-z_]+$/.test(name))throw Error('Table name ไม่ถูกต้อง');snapshot[name]=db.prepare('SELECT * FROM '+name).all();}db.exec('COMMIT');}finally{db.close();}console.log(JSON.stringify(await importSQLiteSnapshot(pool,snapshot)));}
  else if(command==='backup'){const output=resolve(arg||'data/runtime/cloud-backup-'+Date.now()+'.json');if(!output.startsWith(resolve('data/runtime')+'\\')&&!arg)throw Error('เส้นทาง backup ไม่ถูกต้อง');await mkdir(resolve('data/runtime'),{recursive:true});await writeFile(output,JSON.stringify(await backupCloud(pool)),{flag:'wx'});console.log('สำรองข้อมูลไว้ที่ '+output+' — เก็บเป็นข้อมูลส่วนตัว');}
  else if(command==='restore'){if(!arg)throw Error('ระบุไฟล์ backup');console.log(JSON.stringify(await restoreCloud(pool,JSON.parse(await readFile(resolve(arg),'utf8')))));}
  else throw Error('ใช้ migrate / user / worker / import-sqlite / backup / restore');
 }
}catch(error){console.error(error.message?.includes('password')?'คำสั่งไม่สำเร็จ ตรวจค่าตั้งต้น':error.code?'คำสั่งไม่สำเร็จ ตรวจฐานข้อมูล/สิทธิ์/ไฟล์ปลายทาง':error.message);process.exitCode=1;}finally{await pool?.end();}
