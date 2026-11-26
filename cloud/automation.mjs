import {randomUUID} from 'node:crypto';
import {workflowError as fail} from '../server/errors.mjs';
import {checkReply} from '../lib/workflow-policy.mjs';
import {commentBriefErrors} from '../server/petmommy.mjs';

const defaults={enabled:false,workerId:'',intervalMinutes:60,maxPerHour:6,startedAt:null,nextCollectAt:null,reason:''};
export async function automationState(c,lock=false){
 if(!(await c.query("SELECT to_regclass('pettinee_automation') AS name")).rows[0].name)return {...defaults,setupRequired:true};
 return (await c.query('SELECT doc FROM pettinee_automation WHERE id=1'+(lock?' FOR UPDATE':''))).rows[0]?.doc||defaults;
}
export async function writeAutomation(c,a){await c.query('UPDATE pettinee_automation SET doc=$1 WHERE id=1',[a]);return a;}
export async function configureAutomation(c,value,actor){
 const old=await automationState(c,true);if(old.setupRequired)throw fail('รัน cloud:migrate ก่อนเปิดอัตโนมัติ',409);
 let a={...old,enabled:false,reason:'หยุดโดยผู้ดูแล'};
 if(value.enabled===true){
  const worker=(await c.query('SELECT * FROM pettinee_workers WHERE id=$1 AND enabled=true',[value.workerId])).rows[0];
  if(!worker?.capabilities.collect||!worker.capabilities.publish)throw fail('เลือก worker ที่ดึงโพสต์และส่งได้',422);
  const intervalMinutes=Number(value.intervalMinutes),maxPerHour=Number(value.maxPerHour);
  if(!Number.isInteger(intervalMinutes)||intervalMinutes<5||intervalMinutes>1440||!Number.isInteger(maxPerHour)||maxPerHour<1||maxPerHour>30)throw fail('รอบดึง 5–1440 นาที และส่ง 1–30 โพสต์ต่อชั่วโมง',422);
  a={enabled:true,workerId:worker.id,intervalMinutes,maxPerHour,startedAt:new Date().toISOString(),nextCollectAt:new Date().toISOString(),reason:''};
 }
 // Cancel only automatic jobs that have not started; an in-flight send may already be on Facebook.
 const cancelled=(await c.query("UPDATE pettinee_jobs SET state='failed',result='{\"message\":\"หยุดโหมดอัตโนมัติ\"}' WHERE state='queued' AND snapshot->>'automatic'='true' RETURNING post_id")).rows;
 for(const {post_id:id} of cancelled)if(id){const row=(await c.query('SELECT doc FROM pettinee_posts WHERE id=$1 FOR UPDATE',[id])).rows[0];if(row){const p={...row.doc,status:'awaiting_review',stage:'ready',approvedRevision:null,approvedWorkerId:null};await c.query("UPDATE pettinee_posts SET status=$2,doc=$3 WHERE id=$1",[id,p.status,p]);}}
 await writeAutomation(c,a);await c.query("INSERT INTO pettinee_audit(kind,actor,data) VALUES('automation-configured',$1,$2)",[actor,a]);return a;
}
export async function scheduleCollection(c,worker){
 const a=await automationState(c,true);if(!a.enabled||a.workerId!==worker.id||Date.parse(a.nextCollectAt)>Date.now())return;
 await c.query("INSERT INTO pettinee_jobs(id,kind,worker_id,snapshot) VALUES($1,'collect',$2,$3) ON CONFLICT DO NOTHING",[randomUUID(),worker.id,{scope:'latest40',automatic:true,automationRun:a.startedAt}]);
 await writeAutomation(c,{...a,nextCollectAt:new Date(Date.now()+a.intervalMinutes*60000).toISOString()});
}
export function autoReplyReason(p,a){
 if(!a.enabled||p.automationRun!==a.startedAt)return 'โพสต์อยู่นอกรอบอัตโนมัติ';
 if(p.sourceType!=='group'||p.revision!==1)return 'ใช้เฉพาะโพสต์กลุ่มใหม่ที่ยังไม่แก้ร่าง';
 if(p.safety?.urgent||(p.safety?.flags||[]).some(f=>!['browser-source','intent-review'].includes(f.code)))return 'มีประเด็นที่ต้องตรวจ';
 if(p.sourceMeta?.completeness==='partial')return 'ข้อความต้นทางยังถูกย่อ';
 if(!p.guides?.length||!p.replyMeta?.links?.length)return 'ไม่มีคู่มือหรือลิงก์นับคลิก';
 if(!(p.guides[0].score>=0.25))return 'คู่มือยังใกล้เคียงไม่พอ';
 if(checkReply(p.draft,p).length||commentBriefErrors(p.draft,p.text).length)return 'คำตอบไม่ผ่านการตรวจ';
 const prose=p.draft.replace(/https?:\/\/\S+/gu,'');
 if(/[?？]|(?:ไหม|มั้ย|หรือเปล่า)\s*(?:ครับ|นะครับ)?/u.test(prose))return 'คำตอบยังมีประโยคคำถาม';
 return '';
}
export async function scheduleReply(c,p){
 const a=await automationState(c,true),reason=autoReplyReason(p,a);if(reason){if(p.automationRun)p.automationNote=reason;return;}
 const worker=(await c.query('SELECT * FROM pettinee_workers WHERE id=$1 AND enabled=true',[a.workerId])).rows[0];if(!worker?.capabilities.publish)return;
 p.approvedRevision=p.revision;p.approvedWorkerId=worker.id;p.approvedAccount=worker.expected_account;p.status='publishing';p.stage='queued-send';p.automationNote='เข้าคิวตอบอัตโนมัติ';
 await c.query("INSERT INTO pettinee_jobs(id,kind,post_id,worker_id,snapshot) VALUES($1,'publish',$2,$3,$4)",[randomUUID(),p.id,worker.id,{...p,workerId:worker.id,expectedAccount:worker.expected_account,mode:'browser',automatic:true,automationRun:a.startedAt}]);
 await c.query("INSERT INTO pettinee_audit(post_id,kind,actor,data) VALUES($1,'auto-approved','automation',$2)",[p.id,{workerId:worker.id,revision:p.revision,draft:p.draft}]);
}
export async function canClaimAutomatic(c,job){
 if(!job.snapshot.automatic)return true;
 const a=await automationState(c,true);
 if(!a.enabled||a.workerId!==job.worker_id||a.startedAt!==job.snapshot.automationRun)return false;
 if(job.kind!=='publish')return true;
 const n=(await c.query("SELECT count(*)::int AS n FROM pettinee_jobs WHERE kind='publish' AND snapshot->>'automatic'='true' AND state IN ('sent','processing','needs_verification') AND updated_at>now()-interval '1 hour'")).rows[0].n;
 return n<a.maxPerHour;
}
export async function pauseOnAutomaticError(c,job,reason){
 if(!job.snapshot.automatic)return;const a=await automationState(c,true);if(a.enabled&&a.startedAt===job.snapshot.automationRun)await writeAutomation(c,{...a,enabled:false,reason:String(reason).slice(0,300)});
}
