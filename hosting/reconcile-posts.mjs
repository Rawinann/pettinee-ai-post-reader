// Browser-local reconciliation only. Original imports and notebook IDs remain intact.
const sourceFile='pettinee_facebook_200_posts_public_excerpts_19nov2026.xlsx';
const normal=text=>String(text||'').normalize('NFC').toLowerCase().replace(/\s+/gu,'');
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const masks=/\[(?:ปกปิดชื่อ|สถานพยาบาล|ปกปิดเบอร์โทร|ปกปิดอีเมล|ปกปิดบัญชี|ปกปิดลิงก์)\]/g;
const fromSource=post=>post.publicLegacy===true||String(post.fileName||'').split(/[\\/]/).pop().toLowerCase().replace(/\s*\(\d+\)(?=\.xlsx$)/,'')===sourceFile;
export function reconcilePublicDataset(existing,published,saved=new Set()){
 const ids=new Set(published.map(p=>p.id)),bookmarks=new Set(saved),base=published.map(p=>({...p}));
 const exact=new Map();for(const post of base){const key=normal(post.text);const list=exact.get(key)||[];list.push(post);exact.set(key,list);}
 const redacted=base.filter(p=>/\[ปกปิด|\[สถานพยาบาล/.test(p.text)).map(post=>({post,pattern:new RegExp('^'+normal(post.text).split(masks).map(escape).join('.{1,160}?')+'$','u')}));
 let archived=0;
 const remaining=existing.filter(p=>!ids.has(p.id)).map(original=>{
  const post={...original};if(!fromSource(post)||post.inputKind==='manual')return post;
  const text=normal(post.text),matches=exact.get(text)||redacted.filter(x=>x.pattern.test(text)).map(x=>x.post);
  if(matches.length===1||!text){
   post.publicLegacy=true;archived++;
   if(matches.length===1){post.publicCanonicalId=matches[0].id;if(bookmarks.has(post.id)){bookmarks.delete(post.id);bookmarks.add(matches[0].id);}}
  }
  return post;
 });
 return {posts:[...base,...remaining],saved:bookmarks,archived};
}
export function inPublicFeed(post,filter){
 if(filter==='นำเข้าเดิม')return post.publicLegacy===true;
 if(filter==='บันทึกไว้')return !post.publicLegacy||!post.publicCanonicalId;
 return !post.publicLegacy;
}
