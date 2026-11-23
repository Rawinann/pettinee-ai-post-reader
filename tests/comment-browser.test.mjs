import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {inspectReplyPage,visibleCommentReceipts,findCommentSubmit,replyBrowserState} from '../automation/comment-dom.mjs';
import {createBrowserCommentPublisher} from '../automation/comment-driver.mjs';
const groupId='1067156573375730',postId='100',url=`https://www.facebook.com/groups/${groupId}/posts/${postId}/`;
const post={sourceType:'group',externalId:groupId+':'+postId,url,text:'หลังทำหมันแผลยังบวม อยากทราบข้อมูลเพิ่มเติม',draft:'ลองอ่านคู่มือการดูแลหลังทำหมันเพิ่มเติมค่ะ'};
function fixture({receipt=true,pending=false}={}){
 const {document}=parseHTML('<html><body><main><p id="source"></p><section id="composer"><div role="textbox" contenteditable="true" aria-label="Comment as Test Admin"></div><button aria-label="Post comment"></button></section></main></body></html>');
 document.location={href:url};document.getElementById('source').textContent=post.text;
 const editor=document.querySelector('[role="textbox"]');let now=0,clicks=0,closed=false;
 const addReceipt=({account='Test Admin',id='900',text=post.draft,target=url}={})=>{
  const row=document.createElement('article');row.setAttribute('role','article');row.setAttribute('aria-label','Comment by '+account);const p=document.createElement('p');p.textContent=text;row.append(p);const a=document.createElement('a');a.href=target+'?comment_id='+id;a.textContent='1 min';row.append(a);if(pending)row.append(document.createTextNode(' Pending approval'));document.querySelector('main').append(row);return row;
 };
 const composer={count:async()=>document.querySelectorAll('[role="textbox"]').length,fill:async text=>{editor.textContent=text;},innerText:async()=>editor.textContent,evaluateHandle:async fn=>{
  const button=fn(editor);return {asElement:()=>button?{click:async()=>{clicks++;if(receipt)addReceipt();editor.textContent='';}}:null,dispose:async()=>{}};
 }};
 const page={isClosed:()=>closed,setDefaultTimeout(){},goto:async target=>{document.location.href=target;},evaluate:async(fn,args)=>fn(args,document),getByRole:()=>composer,waitForTimeout:async ms=>{now+=ms;}};
 const context={on(){},newPage:async()=>page,close:async()=>{closed=true;}};
 const publisher=createBrowserCommentPublisher({groupId,profileDir:'tmp/reply-browser-fixture',verifyTimeoutMs:800,contextFactory:async()=>{closed=false;return context;},clock:()=>now});
 return {document,editor,publisher,addReceipt,clicks:()=>clicks};
}
test('DOM preflight rejects login, wrong target, changed source, multiple composers and reports existing draft',()=>{
 const f=fixture(),args={groupId,postId,sourceText:post.text};assert.equal(inspectReplyPage(args,f.document).state,'ready');
 const hiddenLogin=f.document.createElement('input');hiddenLogin.type='password';hiddenLogin.setAttribute('hidden','');f.document.body.append(hiddenLogin);assert.equal(inspectReplyPage(args,f.document).state,'ready');
 f.editor.textContent='private unsent text';assert.equal(inspectReplyPage(args,f.document).existingDraft,true);
 f.document.getElementById('source').textContent='another post';assert.equal(inspectReplyPage(args,f.document).state,'source_changed');
 f.document.location.href=url.replace('/100/','/101/');assert.equal(inspectReplyPage(args,f.document).state,'wrong_post');
 f.document.location.href='https://www.facebook.com/checkpoint/';assert.equal(inspectReplyPage(args,f.document).state,'blocked');
 f.document.location.href='https://www.facebook.com/login/';assert.equal(inspectReplyPage(args,f.document).state,'needs_login');
 f.document.location.href=url;f.editor.parentElement.append(f.editor.cloneNode());assert.equal(inspectReplyPage(args,f.document).state,'composer_unavailable');
});
test('receipt requires matching message, account, top-level comment ID and exact target; hidden/ambiguous submit is rejected',()=>{
 const f=fixture(),args={groupId,postId,text:post.draft,account:'Test Admin'};
 f.addReceipt({account:'Other Admin'});f.addReceipt({id:'901',text:'Other text'});f.addReceipt({id:'902',target:url.replace('/100/','/101/')});assert.deepEqual(visibleCommentReceipts(args,f.document),[]);
 f.addReceipt();assert.equal(visibleCommentReceipts(args,f.document)[0].id,'900');assert.ok(findCommentSubmit(f.editor));
 f.document.querySelector('button').setAttribute('hidden','');assert.equal(findCommentSubmit(f.editor),null);
 f.document.querySelector('button').removeAttribute('hidden');f.editor.parentElement.append(f.document.querySelector('button').cloneNode());assert.equal(findCommentSubmit(f.editor),null);
});
test('browser adapter prepares read-only and sends once only after rechecking account and approved draft',async t=>{
 const f=fixture();t.after(()=>f.publisher.close());const target=await f.publisher.prepare(post);assert.equal(f.editor.textContent,'');assert.equal(f.clicks(),0);assert.equal(target.account,'Test Admin');
 const sent=await f.publisher.send(post,target);assert.equal(f.clicks(),1);assert.equal(sent.id,'900');assert.equal(sent.pendingModeration,false);
 await assert.rejects(()=>f.publisher.send(post,target),e=>e.definitive===false);assert.equal(f.clicks(),1);
});
test('browser adapter refuses changed account, changed page, source or a user draft without clicking',async t=>{
 for(const change of [f=>f.editor.setAttribute('aria-label','Comment as Other'),f=>{f.document.location.href=url.replace('/100/','/101/');},f=>{f.document.getElementById('source').textContent='Changed';},f=>{f.editor.textContent='keep my draft';}]){
  const f=fixture();t.after(()=>f.publisher.close());const target=await f.publisher.prepare(post);change(f);await assert.rejects(()=>f.publisher.send(post,target),e=>e.definitive===true);assert.equal(f.clicks(),0);
 }
});
test('missing send button clears only the injected unsent draft; post-click timeout stays uncertain',async t=>{
 const f=fixture();t.after(()=>f.publisher.close());const target=await f.publisher.prepare(post);f.document.querySelector('button').remove();await assert.rejects(()=>f.publisher.send(post,target),e=>e.definitive===true);assert.equal(f.clicks(),0);assert.equal(f.editor.textContent,'');
 const g=fixture({receipt:false});t.after(()=>g.publisher.close());const expected=await g.publisher.prepare(post);await assert.rejects(()=>g.publisher.send(post,expected),e=>e.definitive===false);assert.equal(g.clicks(),1);
});
test('browser adapter reports group moderation independently from visible submission',async t=>{
 const f=fixture({pending:true});t.after(()=>f.publisher.close());const target=await f.publisher.prepare(post);const sent=await f.publisher.send(post,target);assert.equal(sent.pendingModeration,true);assert.equal(f.clicks(),1);
});
test('opening/closing/reopening the worker never fills or submits and status reflects login and checkpoint',async t=>{
 const f=fixture();t.after(()=>f.publisher.close());assert.equal(f.publisher.status().browserOpen,false);const opened=await f.publisher.open();assert.equal(opened.browserOpen,true);assert.equal(opened.state,'open');assert.equal(f.editor.textContent,'');assert.equal(f.clicks(),0);
 f.document.location.href='https://www.facebook.com/login/';assert.equal((await f.publisher.refreshStatus()).state,'needs_login');f.document.location.href='https://www.facebook.com/checkpoint/';assert.equal((await f.publisher.refreshStatus()).state,'blocked');
 await f.publisher.disconnect();assert.equal(f.publisher.status().state,'closed');await f.publisher.open();assert.equal(f.publisher.status().browserOpen,true);assert.equal(f.clicks(),0);
});
test('worker status does not claim the source is connected on a different group or a hidden login form',()=>{
 const f=fixture();f.document.location.href='https://www.facebook.com/groups/999/';assert.equal(replyBrowserState({groupId},f.document).state,'wrong_page');f.document.location.href=url;const hidden=f.document.createElement('input');hidden.type='password';hidden.hidden=true;f.document.body.append(hidden);assert.equal(replyBrowserState({groupId},f.document).state,'open');hidden.hidden=false;assert.equal(replyBrowserState({groupId},f.document).state,'needs_login');
});
test('collection reuses the worker and excludes sending or closing until it finishes',async t=>{const f=fixture();t.after(()=>f.publisher.close());let release;const gate=new Promise(r=>release=r);const collecting=f.publisher.withCollection(async()=>gate);await Promise.resolve();assert.equal(f.publisher.status().busy,true);await assert.rejects(f.publisher.prepare(post),e=>e.definitive===true);await assert.rejects(f.publisher.disconnect(),e=>e.definitive===true);release();await collecting;assert.equal(f.publisher.status().busy,false);assert.equal(f.publisher.status().browserOpen,true);assert.equal(f.clicks(),0);});
