import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {setTimeout as delay} from 'node:timers/promises';
import {createCommentUI} from '../lib/comment-ui.mjs';
async function waitFor(fn){for(let i=0;i<100;i++){if(fn())return;await delay(5);}assert.fail('Timed out');}
function fixture(t,{prepareError=null,sendError=null,approveError=null,editError=null}={}){
 const {document,window}=parseHTML('<html><body><main id="workspace"></main></body></html>');const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
 let post={id:'one',sourceType:'group',revision:1,draft:'ข้อความเดิมครับ',commentDelivery:{live:true}},release;const gate=new Promise(r=>release=r),requests=[],messages=[];let refreshes=0;
 const host={workspace:document.getElementById('workspace'),getPost:()=>post,getDraft:()=>document.getElementById('wf-draft').value,isDirty:()=>host.getDraft()!==post.draft,acceptPost:value=>{if(post.id===value.id)post={...post,...value};},pause(){},notify:message=>messages.push(message),refresh:async()=>{refreshes++;},request:async(path,body)=>{
  requests.push({path,body});
  if(path.endsWith('/draft')){if(editError)throw Error(editError);return {...post,draft:body.text,revision:body.revision+1};}
  if(path.endsWith('/approve')){if(approveError)throw Error(approveError);return {...post,approvedRevision:body.revision,status:'approved'};}
  if(path.endsWith('comment-preview')){await gate;if(prepareError)throw Error(prepareError);return {ticketId:'ticket',revision:post.revision};}
  if(sendError)throw Error(sendError);return {mode:'live'};
 }};
 const ui=createCommentUI(host);host.workspace.innerHTML='<textarea id="wf-draft"></textarea>'+ui.controls(post);document.getElementById('wf-draft').value=post.draft;
 return {document,requests,messages,release,refreshes:()=>refreshes,post:()=>post,edit:text=>{const field=document.getElementById('wf-draft');field.value=text;field.dispatchEvent(new window.Event('input',{bubbles:true}));},selectOther:()=>{post={...post,id:'two'};},click:()=>document.querySelector('[data-comment-action="send-live"]').dispatchEvent(new window.Event('click',{bubbles:true}))};
}

test('one click saves the visible edit, approves its new revision and sends exactly once',async t=>{
 const b=fixture(t);b.edit('ข้อความที่แก้แล้วครับ');assert.equal(b.document.querySelector('button').disabled,false);b.click();b.click();b.release();await waitFor(()=>b.messages.some(m=>m.includes('ส่งคำตอบไป')));
 assert.deepEqual(b.requests.map(r=>r.path.split('/').at(-1)),['draft','approve','comment-preview','comment-send']);assert.equal(b.requests[0].body.text,'ข้อความที่แก้แล้วครับ');assert.equal(b.requests[1].body.revision,2);assert.equal(b.requests[1].body.acknowledged,true);assert.equal(b.requests[2].body.revision,2);assert.equal(b.requests[3].body.revision,2);assert.equal(b.requests[3].body.confirmed,true);assert.equal(b.document.querySelector('dialog'),null);
});

test('login failure preserves the saved revision and edited text for the next explicit send',async t=>{
 const b=fixture(t,{prepareError:'ต้องล็อกอินก่อน'});b.edit('แก้ไว้ก่อนส่งครับ');b.click();b.release();await waitFor(()=>b.messages.some(m=>m.includes('ต้องล็อกอินก่อน')));assert.equal(b.requests.filter(r=>r.path.endsWith('comment-send')).length,0);assert.equal(b.post().revision,2);assert.equal(b.document.getElementById('wf-draft').value,'แก้ไว้ก่อนส่งครับ');assert.equal(b.document.querySelector('button').disabled,false);
 b.click();await waitFor(()=>b.requests.filter(r=>r.path.endsWith('comment-preview')).length===2);assert.equal(b.requests.filter(r=>r.path.endsWith('/draft')).length,1);assert.equal(b.requests.at(-1).body.revision,2);
});

test('changing the selected post during preflight cancels sending',async t=>{
 const b=fixture(t);b.click();await waitFor(()=>b.requests.some(r=>r.path.endsWith('comment-preview')));b.selectOther();b.release();await waitFor(()=>b.messages.some(m=>m.includes('ยังไม่ได้ส่งข้อความ')));assert.equal(b.requests.length,2);assert.equal(b.refreshes(),0);
});

test('a draft changed during preflight cancels sending and preserves the new unsaved text',async t=>{
 const b=fixture(t);b.click();await waitFor(()=>b.requests.some(r=>r.path.endsWith('comment-preview')));b.edit('เปลี่ยนระหว่างรอ');b.release();await waitFor(()=>b.messages.some(m=>m.includes('ยังไม่ได้ส่งข้อความ')));assert.equal(b.requests.length,2);assert.equal(b.refreshes(),0);assert.equal(b.document.getElementById('wf-draft').value,'เปลี่ยนระหว่างรอ');
});

test('validation failure stops before contacting the publisher',async t=>{
 const b=fixture(t,{approveError:'ข้อความนี้ยังตรวจไม่ผ่าน'});b.click();b.release();await waitFor(()=>b.messages.some(m=>m.includes('ตรวจไม่ผ่าน')));assert.deepEqual(b.requests.map(r=>r.path.split('/').at(-1)),['approve']);
});

test('an optimistic edit conflict preserves the edit and never approves a different revision',async t=>{
 const b=fixture(t,{editError:'คำตอบเปลี่ยนไปแล้ว'});b.edit('ร่างของฉัน');b.click();b.release();await waitFor(()=>b.messages.some(m=>m.includes('คำตอบเปลี่ยนไปแล้ว')));assert.equal(b.requests.length,1);assert.equal(b.refreshes(),0);assert.equal(b.document.getElementById('wf-draft').value,'ร่างของฉัน');
});

test('uncertain send refreshes status, reports failure and never retries on its own',async t=>{
 const b=fixture(t,{sendError:'ยังไม่ทราบผลส่ง'});b.click();b.click();b.release();await waitFor(()=>b.messages.some(m=>m.includes('ตรวจสถานะล่าสุด')));assert.equal(b.requests.length,3);assert.equal(b.refreshes(),1);assert.equal(b.requests[2].body.confirmed,true);assert.equal(b.requests[2].body.ticketId,'ticket');
});
