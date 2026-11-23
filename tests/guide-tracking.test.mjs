import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {createWorkflowStore} from '../server/workflow-store.mjs';
import {createGuideTracking,guideDestination} from '../server/guide-tracking.mjs';
import {checkReply} from '../lib/workflow-policy.mjs';
import {createAppServer} from '../server.mjs';
const guide={id:'cat-post-neuter-recovery-care',title:'คู่มือหลังทำหมัน',url:'https://pettinee.meongsiljang.com/th/guide/qa/cat-post-neuter-recovery-care'};
function setup(store,origin='',sourceType='import'){const {post}=store.ingest({sourceType,externalId:'tracking',text:'เคสจำลอง ไม่มีข้อมูลบุคคล',url:'',publishedAt:'',sourceMeta:{}});const tracking=createGuideTracking({store,origin}),result=tracking.attach({...post,guides:[guide]},'อ่านคู่มือได้ที่นี่ค่ะ\n'+guide.url);return {post,tracking,result,token:result.links[0].token};}
test('UTM links stay usable without our public server; never include source URL, source ID or case text',()=>{
 const store=createWorkflowStore(':memory:');try{const {post,tracking,result,token}=setup(store);const u=new URL(result.links[0].url);assert.equal(u.searchParams.get('utm_source'),'facebook');assert.equal(u.searchParams.get('utm_content'),token);assert.equal(u.origin,'https://pettinee.meongsiljang.com');assert.equal(tracking.status().mode,'utm');assert.doesNotMatch(u.href,new RegExp(post.id+'|tracking|เคสจำลอง'));assert.deepEqual(checkReply(result.draft,{guides:[guide],replyMeta:{links:result.links}}),[]);assert.ok(checkReply(result.draft,{guides:[guide]}).length);assert.equal(tracking.report().clicks,0);}finally{store.close();}
});
test('landing and outbound counts are separate, previews and HEAD never become guide clicks',()=>{
 const store=createWorkflowStore(':memory:');try{const {tracking,result,token}=setup(store,'https://reader.example.org');assert.equal(result.links[0].url,'https://reader.example.org/r/g/'+token);tracking.resolve(token,{method:'HEAD'});assert.equal(tracking.report().pageViews,0);tracking.resolve(token,{userAgent:'facebookexternalhit/1.1'});tracking.resolve(token,{userAgent:'Mozilla/5.0'});tracking.resolve(token,{method:'POST',outbound:true,userAgent:'Mozilla/5.0'});const report=tracking.report();assert.equal(report.previews,1);assert.equal(report.pageViews,1);assert.equal(report.clicks,1);assert.equal(report.countsReaders,false);assert.equal(report.countsUniquePeople,false);assert.equal(tracking.resolve('bad'),null);assert.throws(()=>guideDestination('https://evil.test'));assert.throws(()=>createGuideTracking({store,origin:'http://localhost:4173'}));}finally{store.close();}
});
test('HTTP public landing exposes only guide title, requires explicit POST for outbound and protects analytics',async t=>{
 const parent=resolve('tmp');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'guide-track-'));const server=createAppServer({workflowOptions:{dbPath:join(dir,'db.sqlite'),autoRun:false,operatorToken:'test-operator'}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await server.workflow.close();await new Promise(r=>server.close(r));if(!resolve(dir).startsWith(parent+sep))throw Error('Unsafe cleanup');await rm(dir,{recursive:true,force:true});});const base='http://127.0.0.1:'+server.address().port;
 const {tracking,token}=setup(server.workflow.store,'https://reader.example.org');let response=await fetch(base+'/r/g/'+token,{method:'HEAD'});assert.equal(response.status,200);assert.equal(tracking.report().pageViews,0);
 response=await fetch(base+'/r/g/'+token);const html=await response.text();assert.match(html,/อ่านคู่มือ/);assert.doesNotMatch(html,/เคสจำลอง|source_type|facebook.com\/groups/);assert.equal(response.status,200);assert.equal(tracking.report().pageViews,1);
 assert.match(html,/guide-landing.css/);assert.equal((await fetch(base+'/guide-landing.css')).status,200);
 assert.equal((await fetch(base+'/r/g/'+token+'/open')).status,405);
 response=await fetch(base+'/r/g/'+token+'/open',{method:'POST',redirect:'manual'});assert.equal(response.status,303);assert.ok(response.headers.get('location').startsWith(guide.url+'?'));assert.equal(tracking.report().clicks,1);
 assert.equal((await fetch(base+'/api/workflow/guide-clicks')).status,401);response=await fetch(base+'/api/workflow/guide-clicks',{headers:{Authorization:'Bearer test-operator'}});assert.equal(response.status,200);assert.equal((await response.json()).clicks,1);assert.equal((await fetch(base+'/r/g/'+'0'.repeat(32))).status,404);
});
test('Demo visits stay separate from actual campaign counts',()=>{const store=createWorkflowStore(':memory:');try{const {tracking,token}=setup(store,'https://reader.example.org','mock');tracking.resolve(token);tracking.resolve(token,{method:'POST',outbound:true});const report=tracking.report();assert.equal(report.pageViews,0);assert.equal(report.clicks,0);assert.equal(report.demoClicks,1);assert.equal(report.demoPageViews,1);}finally{store.close();}});
