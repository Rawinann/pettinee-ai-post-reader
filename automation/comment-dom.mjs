// Serializable DOM-only inspections. They never read cookies or hidden app state.
export function replyBrowserState({groupId},suppliedDocument){
 const doc=suppliedDocument||document,u=new URL(doc.location.href);
 const visible=el=>!el.closest('[hidden],[aria-hidden="true"]')&&(typeof getComputedStyle!=='function'||(getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&el.getClientRects().length>0));
 if(/\/checkpoint|\/challenge|\/two_step_verification/.test(u.pathname))return {state:'blocked'};
 if(/\/login/.test(u.pathname)||Array.from(doc.querySelectorAll('input[type="password"],#login_form')).some(visible))return {state:'needs_login'};
 if(!['www.facebook.com','web.facebook.com','facebook.com'].includes(u.hostname)||!new RegExp('^/groups/'+groupId+'(?:/|$)').test(u.pathname))return {state:'wrong_page'};
 return {state:doc.querySelector('main,[role="main"],[role="feed"],[role="article"]')?'open':'waiting_page'};
}
export function inspectReplyPage({groupId,postId,sourceText},suppliedDocument){
 const doc=suppliedDocument||document,normal=value=>String(value||'').normalize('NFC').replace(/\s+/gu,' ').trim();
 const u=new URL(doc.location.href);
 const visible=el=>!el.closest('[hidden],[aria-hidden="true"]')&&(typeof getComputedStyle!=='function'||(getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&el.getClientRects().length>0));
 if(/\/checkpoint|\/challenge|\/two_step_verification/.test(u.pathname))return {state:'blocked'};
 if(/\/login/.test(u.pathname)||Array.from(doc.querySelectorAll('input[type="password"],#login_form')).some(visible))return {state:'needs_login'};
 const match=u.pathname.match(/^\/groups\/(\d+)\/(?:posts|permalink)\/([A-Za-z0-9_-]+)\/?$/);
 if(!['www.facebook.com','web.facebook.com','facebook.com'].includes(u.hostname)||!match||match[1]!==groupId||match[2]!==postId)return {state:'wrong_post'};
 const label=el=>normal(el.getAttribute('aria-label')||el.getAttribute('placeholder')||(el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>doc.getElementById(id)?.textContent||'').join(' '));
 const editors=Array.from(doc.querySelectorAll('[role="textbox"][contenteditable="true"],textarea[aria-label]')).filter(el=>visible(el)&&/^(แสดงความคิดเห็นในชื่อ|Comment as)\s+.+/iu.test(label(el)));
 if(editors.length!==1)return {state:'composer_unavailable',composerCount:editors.length};
 const editor=editors[0],editorLabel=label(editor),account=editorLabel.replace(/^(แสดงความคิดเห็นในชื่อ|Comment as)\s+/iu,'').trim();
 const scope=doc.querySelector('main,[role="main"]');
 const sourcePrefix=normal(sourceText).slice(0,80),sourceMatched=!!sourcePrefix&&!!scope&&normal(scope.innerText??scope.textContent).includes(sourcePrefix);
 return {state:sourceMatched?'ready':'source_changed',account,editorLabel,existingDraft:normal(editor.value??editor.innerText??editor.textContent).length>0};
}

export function visibleCommentReceipts({groupId,postId,text,account},suppliedDocument){
 const doc=suppliedDocument||document,normal=value=>String(value||'').normalize('NFC').replace(/\s+/gu,' ').trim(),expected=normal(text),name=normal(account),receipts=[];
 const scope=doc.querySelector('main,[role="main"]');if(!scope||!expected||!name)return receipts;
 for(const row of scope.querySelectorAll('[role="article"][aria-label],article[aria-label]')){
  const label=normal(row.getAttribute('aria-label'));
  if(!label.startsWith('ความคิดเห็นจาก '+name)&&!label.toLowerCase().startsWith('comment by '+name.toLowerCase()))continue;
  const own=node=>node.closest('[role="article"],article')===row;
  const body=Array.from(row.querySelectorAll('div,span,p')).find(n=>own(n)&&!n.closest('[contenteditable="true"]')&&normal(n.innerText??n.textContent)===expected);
  if(!body)continue;
  for(const anchor of row.querySelectorAll('a[href]')){
   if(!own(anchor))continue;
   try{const u=new URL(anchor.getAttribute('href'),doc.location.href),m=u.pathname.match(/^\/groups\/(\d+)\/(?:posts|permalink)\/([A-Za-z0-9_-]+)\/?$/),id=u.searchParams.get('comment_id');
    if(u.protocol!=='https:'||!['www.facebook.com','web.facebook.com','facebook.com'].includes(u.hostname)||!m||m[1]!==groupId||m[2]!==postId||!id||!/^[A-Za-z0-9_-]+$/.test(id)||u.searchParams.has('reply_comment_id'))continue;
    receipts.push({id,url:'https://www.facebook.com/groups/'+groupId+'/posts/'+postId+'/?comment_id='+id,pendingModeration:/รอ.{0,12}อนุมัติ|รอดำเนินการ|pending approval|pending review/iu.test(row.innerText??row.textContent)});break;
   }catch{}
  }
 }
 return receipts;
}

// Return a visible, uniquely labelled button in the nearest composer container.
// A parent containing several editors is ambiguous and is never used.
export function findCommentSubmit(editor){
 const visible=el=>!el.closest('[hidden],[aria-hidden="true"]')&&(typeof getComputedStyle!=='function'||(getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&el.getClientRects().length>0));
 for(let node=editor.parentElement,depth=0;node&&depth<8;node=node.parentElement,depth++){
  if(node.matches('body,main,[role="main"]'))break;
  const editors=Array.from(node.querySelectorAll('[contenteditable="true"][role="textbox"],textarea')).filter(visible);if(editors.length>1)break;
  const buttons=Array.from(node.querySelectorAll('button,[role="button"],input[type="submit"]')).filter(el=>visible(el)&&/^(แสดงความคิดเห็น|ส่งความคิดเห็น|โพสต์ความคิดเห็น|ส่ง|Comment|Post comment|Post|Send)$/iu.test((el.getAttribute('aria-label')||el.textContent||el.value||'').trim()));
  if(buttons.length===1)return buttons[0];if(buttons.length>1)return null;
 }
 return null;
}
