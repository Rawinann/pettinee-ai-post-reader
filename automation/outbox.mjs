import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
const digest=text=>createHash('sha256').update(text.normalize('NFC').replace(/\s+/gu,' ').trim()).digest('hex');
export function createCollectorOutbox(path,{clock=Date.now}={}){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS collector_posts(id TEXT PRIMARY KEY,hash TEXT NOT NULL,event_json TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,workflow_id TEXT NOT NULL DEFAULT '',last_error TEXT NOT NULL DEFAULT '',first_seen TEXT NOT NULL,last_seen TEXT NOT NULL,changed_json TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS collector_batch_baselines(group_id TEXT PRIMARY KEY,ids_json TEXT NOT NULL,created_at TEXT NOT NULL);`);
 const now=()=>new Date(clock()).toISOString();
 return {
  batchBaseline(groupId){const prior=db.prepare('SELECT ids_json FROM collector_batch_baselines WHERE group_id=?').get(groupId);if(prior)return JSON.parse(prior.ids_json);const ids=db.prepare('SELECT id FROM collector_posts WHERE id LIKE ?').all(groupId+':%').map(r=>r.id);db.prepare('INSERT INTO collector_batch_baselines VALUES(?,?,?)').run(groupId,JSON.stringify(ids),now());return ids;},
  finishBatchBaseline(groupId){db.prepare('DELETE FROM collector_batch_baselines WHERE group_id=?').run(groupId);},
  capture(posts){const counts={new:0,seen:0,changed:0};db.exec('BEGIN IMMEDIATE');try{for(const post of posts){const hash=digest(post.text),prior=db.prepare('SELECT * FROM collector_posts WHERE id=?').get(post.externalId),event={...post,eventId:'browser:'+post.externalId+':'+hash,sourceMeta:{...post.sourceMeta,observedAt:now()}};
   if(!prior){db.prepare('INSERT INTO collector_posts(id,hash,event_json,first_seen,last_seen) VALUES(?,?,?,?,?)').run(post.externalId,hash,JSON.stringify(event),now(),now());counts.new++;}
   else if(prior.hash===hash){db.prepare('UPDATE collector_posts SET last_seen=? WHERE id=?').run(now(),post.externalId);counts.seen++;}
   else {db.prepare('UPDATE collector_posts SET changed_json=?,last_seen=? WHERE id=?').run(JSON.stringify(event),now(),post.externalId);counts.changed++;}
  }db.exec('COMMIT');return counts;}catch(e){db.exec('ROLLBACK');throw e;}},
  pending(limit=20){return db.prepare("SELECT * FROM collector_posts WHERE state='pending' AND next_at<=? ORDER BY first_seen,id LIMIT ?").all(clock(),limit).map(r=>({...r,event:JSON.parse(r.event_json)}));},
  delivered(id,workflowId){db.prepare("UPDATE collector_posts SET state='delivered',workflow_id=?,last_error='' WHERE id=?").run(workflowId,id);},
  failed(id,message,{permanent=false}={}){const row=db.prepare('SELECT attempts FROM collector_posts WHERE id=?').get(id);if(!row)return;const attempts=row.attempts+1;db.prepare('UPDATE collector_posts SET state=?,attempts=?,next_at=?,last_error=? WHERE id=?').run(permanent?'rejected':'pending',attempts,clock()+Math.min(300000,1000*2**Math.min(attempts-1,8)),String(message).slice(0,400),id);},
  stats(){return {...Object.fromEntries(db.prepare('SELECT state,COUNT(*) AS count FROM collector_posts GROUP BY state').all().map(r=>[r.state,r.count])),total:db.prepare('SELECT COUNT(*) AS n FROM collector_posts').get().n,changed:db.prepare("SELECT COUNT(*) AS n FROM collector_posts WHERE changed_json<>''").get().n};},
  close(){db.close();},
 };
}
export async function deliverPending(outbox,ingest){
 const result={delivered:0,duplicates:0,failed:0};
 for(const row of outbox.pending()){
  try{const sent=await ingest({...row.event,authorized:true});if(!sent?.post?.id)throw Error('Missing ingestion receipt');outbox.delivered(row.id,sent.post.id);result.delivered++;if(sent.duplicate)result.duplicates++;}
  catch(e){outbox.failed(row.id,e.statusCode?e.message:'ส่งเข้าคิวไม่สำเร็จ จะลองใหม่',{permanent:!!e.statusCode&&e.statusCode>=400&&e.statusCode<500});result.failed++;}
 }
 return result;
}
