import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {setTimeout as delay} from 'node:timers/promises';
import {createCommentUI} from '../lib/comment-ui.mjs';
async function waitFor(fn){for(let i=0;i<100;i++){if(fn())return;await delay(5);}assert.fail('Timed out');}
function fixture(t,{prepareError=null,sendError=null}={}){
 const {document,window}=parseHTML('<html><body><main id="workspace"></main></body></html>');const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
 let post={id:'one',revision:1,commentDelivery:{live:true}},dirty=false,release;const gate=new Promise(r=>release=r),requests=[],messages=[];let refreshes=0;
 const host={workspace:document.getElementById('workspace'),getPost:()=>post,isDirty:()=>dirty,pause(){},notify:message=>messages.push(message),refresh:async()=>{refreshes++;},request:async(path,body)=>{requests.push({path,body});if(path.endsWith('comment-preview')){await gate;if(prepareError)throw Error(prepareError);return {ticketId:'ticket',revision:1};}if(sendError)throw Error(sendError);return {mode:'live'};}};
 const ui=createCommentUI(host);host.workspace.innerHTML=ui.controls(post);
 return {document,requests,messages,release,refreshes:()=>refreshes,setDirty:()=>{dirty=true;},selectOther:()=>{post={...post,id:'two'};},click:()=>document.querySelector('[data-comment-action="send-live"]').dispatchEvent(new window.Event('click',{bubbles:true}))};
}
test('one-click send stops at login failure without requesting publication',async t=>{
 const b=fixture(t,{prepareError:'ต้องล็อกอินก่อน'});b.click();b.release();await waitFor(()=>b.messages.some(m=>m.includes('ต้องล็อกอินก่อน')));assert.equal(b.requests.length,1);assert.equal(b.requests[0].body.mode,'live');assert.equal(b.document.querySelector('dialog'),null);
});
test('changing the selected post during preflight cancels sending',async t=>{
 const b=fixture(t);b.click();b.selectOther();b.release();await waitFor(()=>b.messages.some(m=>m.includes('ยังไม่ได้ส่งข้อความ')));assert.equal(b.requests.length,1);
});
test('editing during preflight cancels sending and preserves the unsaved draft',async t=>{
 const b=fixture(t);b.click();b.setDirty();b.release();await waitFor(()=>b.messages.some(m=>m.includes('ยังไม่ได้ส่งข้อความ')));assert.equal(b.requests.length,1);assert.equal(b.refreshes(),0);assert.equal(b.document.querySelector('[data-comment-action="send-live"]').disabled,true);
});
test('uncertain send refreshes status, reports failure and never retries on its own',async t=>{
 const b=fixture(t,{sendError:'ยังไม่ทราบผลส่ง'});b.click();b.click();b.release();await waitFor(()=>b.messages.some(m=>m.includes('ตรวจสถานะล่าสุด')));assert.equal(b.requests.length,2);assert.equal(b.refreshes(),1);assert.equal(b.requests[1].body.confirmed,true);assert.equal(b.requests[1].body.ticketId,'ticket');
});
