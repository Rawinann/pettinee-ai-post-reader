// This function is serializable into the page. Read rendered post bodies only:
// no network interception, hidden application state, cookies, authors or comments.
export function extractVisiblePosts({groupId,messageSelector='',limit=40,excludeIds=[]},suppliedDocument){
 const doc=suppliedDocument||document;
 const articleSelector='[role="article"],article';
 const own=(node,article)=>node.closest(articleSelector)===article;
 const clean=value=>String(value||'').normalize('NFC').replace(/\u00a0/g,' ').trim();
 const readable=node=>clean(node.innerText??node.textContent);
 const canonical=href=>{
  try{
   const u=new URL(href,doc.location?.href||'https://www.facebook.com/');
   if(u.protocol!=='https:'||!['www.facebook.com','web.facebook.com','m.facebook.com','facebook.com'].includes(u.hostname)||u.username||u.password||u.searchParams.has('comment_id')||u.searchParams.has('reply_comment_id'))return null;
   const m=u.pathname.match(/^\/groups\/([0-9]+)\/(?:posts|permalink)\/([A-Za-z0-9_-]+)\/?$/);
   if(!m||m[1]!==groupId)return null;
   return {postId:m[2],url:'https://www.facebook.com/groups/'+groupId+'/posts/'+m[2]+'/'};
  }catch{return null;}
 };
 const result={posts:[],articles:0,skipped:{noPermalink:0,noMessage:0,oversized:0},selectorError:false};
 const found=new Set();
 const excluded=new Set(excludeIds),scope=doc.querySelector('[role="feed"]')||doc;
 for(const article of scope.querySelectorAll(articleSelector)){
  if(article.parentElement?.closest(articleSelector))continue; // nested comments
  result.articles++;
  const target=Array.from(article.querySelectorAll('a[href]')).filter(a=>own(a,article)).map(a=>canonical(a.getAttribute('href'))).find(Boolean);
  if(!target){result.skipped.noPermalink++;continue;}
  if(excluded.has(groupId+':'+target.postId))continue;
  if(found.has(target.postId))continue;
  const selectors=messageSelector?[messageSelector]:['[data-ad-preview="message"]','[data-ad-comet-preview="message"]','[data-ad-rendering-role="story_message"]'];
  let nodes=[];
  try{for(const selector of selectors){nodes=Array.from(article.querySelectorAll(selector)).filter(n=>own(n,article));if(nodes.length)break;}}catch{result.selectorError=true;return result;}
  if(!nodes.length&&!messageSelector){
   // Colored text posts expose their body as a heading. Author headings contain
   // profile links and are excluded. Never fall back to whole-article text.
   nodes=Array.from(article.querySelectorAll('h2,h3,[role="heading"]')).filter(n=>own(n,article)&&!n.closest('a,button')&&!n.querySelector('a,button,[role="button"]')&&readable(n).length>=12);
  }
  const parts=[...new Set(nodes.map(readable).filter(Boolean))];
  const text=parts.join('\n').replace(/(?:\n|\s)+(?:ดูเพิ่มเติม|See more)\s*$/u,'').trim();
  if(!text){result.skipped.noMessage++;continue;}
  if(text.length>10000){result.skipped.oversized++;continue;}
  const more=Array.from(article.querySelectorAll('button,[role="button"]')).some(n=>own(n,article)&&/^(ดูเพิ่มเติม|See more)$/iu.test(readable(n)));
  found.add(target.postId);
  result.posts.push({sourceType:'group',externalId:groupId+':'+target.postId,url:target.url,text,publishedAt:'',sourceMeta:{method:'browser-dom',groupId,completeness:more?'partial':'unknown'}});
  if(result.posts.length>=Math.max(1,Math.min(limit,100)))break;
 }
 return result;
}

export function sourcePageState({groupId},suppliedDocument){
 const doc=suppliedDocument||document,u=new URL(doc.location.href);
 if(!['www.facebook.com','web.facebook.com','m.facebook.com','facebook.com'].includes(u.hostname))return 'wrong_page';
 if(/\/checkpoint|\/challenge|\/two_step_verification/.test(u.pathname))return 'blocked';
 if(/\/login/.test(u.pathname)||doc.querySelector('input[type="password"],#login_form'))return 'needs_login';
 if(!new RegExp('^/groups/'+groupId+'/?$').test(u.pathname))return 'wrong_page';
 if(!doc.querySelector('[role="feed"],[role="article"],article'))return 'waiting_feed';
 return 'ready';
}
