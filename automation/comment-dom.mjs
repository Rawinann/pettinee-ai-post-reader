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
 const dialogs=Array.from(doc.querySelectorAll('[role="dialog"]')).filter(el=>visible(el)&&el.querySelector('[role="article"],article'));
 const scope=dialogs.at(-1)||doc.querySelector('main,[role="main"]');
 if(!scope)return {state:'waiting_page'};
 const sourcePrefix=normal(sourceText).slice(0,80);
 if(!sourcePrefix||!normal(scope.innerText??scope.textContent).includes(sourcePrefix))return {state:'source_changed'};
 const label=el=>normal(el.getAttribute('aria-label')||el.getAttribute('placeholder')||(el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>doc.getElementById(id)?.textContent||'').join(' '));
 const editors=Array.from(scope.querySelectorAll('[role="textbox"][contenteditable="true"],textarea[aria-label]')).filter(el=>visible(el)&&(/^(แสดงความคิดเห็นในชื่อ|ตอบในชื่อ|Comment as|Reply as)\s+.+/iu.test(label(el))||/^(เขียนความคิดเห็นที่แสดงต่อสาธารณะ|Write a public comment|เขียนคำตอบ|Write a reply)/iu.test(label(el))));
 if(editors.length!==1)return {state:'composer_unavailable',composerCount:editors.length};
 const editor=editors[0],editorLabel=label(editor),account=editorLabel.replace(/^(แสดงความคิดเห็นในชื่อ|ตอบในชื่อ|Comment as|Reply as)\s+/iu,'').trim();
 if(account===editorLabel)return {state:'account_unavailable',editorLabel};
 return {state:'ready',account,editorLabel,existingDraft:normal(editor.value??editor.innerText??editor.textContent).length>0};
}

// Read only the identity explicitly marked as selected in Facebook's visible
// profile switcher. A generic composer label alone is never identity proof.
export function selectedCommentAccount(_args,suppliedDocument){
 const doc=suppliedDocument||document,normal=value=>String(value||'').normalize('NFC').replace(/\s+/gu,' ').trim();
 const visible=el=>!el.closest('[hidden],[aria-hidden="true"]')&&(typeof getComputedStyle!=='function'||(getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&el.getClientRects().length>0));
 const menus=Array.from(doc.querySelectorAll('[role="dialog"]')).filter(el=>visible(el)&&/โปรไฟล์และเพจของคุณ|Your profiles and Pages/iu.test(normal(el.textContent)));
 const menu=menus.at(-1);if(!menu)return null;
 const selected=Array.from(menu.querySelectorAll('button,[role="button"]')).filter(el=>visible(el)&&/เลือกไว้ในขณะนี้|currently selected/iu.test(normal(el.getAttribute('aria-label')||el.textContent)));
 if(selected.length!==1)return null;
 const raw=normal(selected[0].innerText??selected[0].textContent??selected[0].getAttribute('aria-label'));
 const account=raw.replace(/\s*(?:\d+\s*)?(?:การอัพเดต|การอัปเดต|การแจ้งเตือน|unread updates|notifications?|เลือกไว้ในขณะนี้|currently selected).*$/iu,'').trim();
 return account&&account.length<=200?account:null;
}

export function visibleCommentReceipts({groupId,postId,text,account},suppliedDocument){
 const doc=suppliedDocument||document,normal=value=>String(value||'').normalize('NFC').replace(/\s+/gu,' ').trim(),expected=normal(text),name=normal(account),receipts=[];
 const expectedUrls=Array.from(expected.matchAll(/https:\/\/\S+/gu),m=>{try{return new URL(m[0]);}catch{return null;}}).filter(Boolean);
 const expectedWords=normal(expected.replace(/https:\/\/\S+/gu,''));
 const visible=el=>!el.closest('[hidden],[aria-hidden="true"]')&&(typeof getComputedStyle!=='function'||(getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&el.getClientRects().length>0));
 const dialogs=Array.from(doc.querySelectorAll('[role="dialog"]')).filter(el=>visible(el)&&el.querySelector('[role="article"],article'));
 const scope=dialogs.at(-1)||doc.querySelector('main,[role="main"]');if(!scope||!expected||!name)return receipts;
 for(const row of scope.querySelectorAll('[role="article"][aria-label],article[aria-label]')){
  const label=normal(row.getAttribute('aria-label'));
  if(!label.startsWith('ความคิดเห็นจาก '+name)&&!label.toLowerCase().startsWith('comment by '+name.toLowerCase()))continue;
  const own=node=>node.closest('[role="article"],article')===row;
  const exactBody=Array.from(row.querySelectorAll('div,span,p')).some(n=>own(n)&&!n.closest('[contenteditable="true"]')&&normal(n.innerText??n.textContent)===expected);
  const anchors=Array.from(row.querySelectorAll('a[href]')).filter(own);
  const matchesGuide=target=>anchors.some(anchor=>{try{let u=new URL(anchor.getAttribute('href'),doc.location.href);if(u.hostname==='l.facebook.com'&&u.searchParams.has('u'))u=new URL(u.searchParams.get('u'));return u.protocol==='https:'&&u.origin===target.origin&&u.pathname===target.pathname&&Array.from(target.searchParams).every(([key,value])=>u.searchParams.get(key)===value);}catch{return false;}});
  const linkedBody=expectedUrls.length>0&&expectedWords.length>=20&&normal(row.innerText??row.textContent).includes(expectedWords)&&expectedUrls.every(matchesGuide);
  if(!exactBody&&!linkedBody)continue;
  for(const anchor of anchors){
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
