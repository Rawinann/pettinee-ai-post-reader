// Topic phrases are explainable lexical signals, not a diagnosis or an LLM output.
export const TOPICS=[
 ['post-neuter','หลังทำหมัน',/หลัง(?:การ)?ทำหมัน|ทำหมันมา|ทำหมัน(?:ได้|วันที่)|เพิ่ง.{0,18}ทำหมัน|พึ่ง.{0,18}ทำหมัน|ทำหมัน.{0,12}(?:แล้ว|วัน)|post.neuter|spay.recovery|neuter.recovery/i],
 ['pre-neuter','ก่อนทำหมัน',/ก่อนทำหมัน|ยังไม่(?:ได้)?ทำหมัน|จะ.{0,15}ทำหมัน|เหมาะสม.{0,15}ทำหมัน|ทำหมัน.{0,12}เมื่อไหร่|pre.neuter|before.neuter|spay.neuter.timing/i],
 ['wound','แผล',/แผล|ตัดไหม|ไหมหลุด|wound|incision/i],
 ['swelling','บวม',/บวม|swelling/i],
 ['surgery','ผ่าตัด',/ผ่าตัด|surgery|surgical/i],
 ['vomit','อาเจียน',/อาเจียน|อ้วก|อวก|vomit/i],
 ['diarrhea','ถ่ายเหลว',/ท้องเสีย|ถ่ายเหลว|diarrhea/i],
 ['constipation','ท้องผูก',/ท้องผูก|อึไม่ออก|constipation/i],
 ['urinary','การปัสสาวะ',/ปัสสาวะ|ฉี่|นิ่ว|urinary|cystitis/i],
 ['kidney','ไต',/โรคไต|ค่าไต|ไตเรื้อรัง|kidney|renal/i],
 ['appetite','การกิน',/ไม่กิน|ไม่ยอมกิน|กินน้อย|เบื่ออาหาร|appetite/i],
 ['skin','ผิวหนังและขน',/ผิวหนัง|ขนร่วง|ขนหลุด|ผื่น|คัน|dermatitis|skin|hair.loss/i],
 ['fungus','เชื้อรา',/เชื้อรา|ringworm|fungal/i],
 ['ear','หู',/หูอักเสบ|เกาหู|ไรหู|otitis|ear.mite/i],
 ['breathing','การหายใจ',/หายใจ|แมวไอ|น้องไอ|ไอ(?:เป็น|บ่อย|เรื้อรัง|แห้ง)|จาม|respirat|cough|sneez/i],
 ['dental','ฟันและช่องปาก',/ฟัน|เหงือก|ช่องปาก|dental|gingivitis/i],
 ['vaccine','วัคซีน',/วัคซีน|vaccine/i],
 ['water','การดื่มน้ำ',/กินน้ำ|ดื่มน้ำ|น้ำพุ|water.intake|water.fountain/i],
 ['food','อาหาร',/อาหาร|โภชนาการ|nutrition|cat.food/i],
 ['behavior','พฤติกรรม',/พฤติกรรม|ขู่|ก้าวร้าว|กัดกัน|behavior|aggression/i],
 ['cost','ค่าใช้จ่าย',/ค่าใช้จ่าย|ค่ารักษา|กี่บาท|cost|price/i],
];
export function topicsFor(text,{allowBoth=false}={}){
 const found=TOPICS.filter(([, ,pattern])=>pattern.test(text)).map(([id,label])=>({id,label}));
 if(allowBoth)return found;
 if(/ยังไม่(?:ได้)?ทำหมัน|ก่อน(?:การ)?ทำหมัน/u.test(text))return found.filter(x=>x.id!=='post-neuter');
 return found.some(x=>x.id==='post-neuter')?found.filter(x=>x.id!=='pre-neuter'):found;
}
export function guideText(article){return [article.title,article.description?.slice(0,170),...(article.headings||[]).slice(0,3)].filter(Boolean).join('\n');}
export function expandGuideQuery(text){return text.replace(/อ้วก|อวก/g,'อาเจียน').replace(/ฉี่/g,'ปัสสาวะ').replace(/อึ/g,'อุจจาระ').replace(/พึ่ง/g,'เพิ่ง')+'\nหัวข้อที่กล่าวถึง '+topicsFor(text).map(t=>t.label).join(' ');}
export function cosine(a,b){if(a.length!==b.length)return 0;return a.reduce((sum,x,i)=>sum+x*b[i],0);}
const lexicalCaches=new WeakMap();
const grams=text=>{const chars=Array.from(text.toLowerCase().replace(/\s+/g,' ').trim()),counts=new Map();for(let n=3;n<=4;n++)for(let i=0;i+n<=chars.length;i++){const term=chars.slice(i,i+n).join('');counts.set(term,(counts.get(term)||0)+1);}return counts;};
function lexicalScores(catalog,text){
 let model=lexicalCaches.get(catalog);
 if(!model){const counts=catalog.articles.map(a=>grams(a.title+' '+a.title+' '+a.description)),df=new Map();for(const row of counts)for(const key of row.keys())df.set(key,(df.get(key)||0)+1);const idf=new Map([...df].map(([key,n])=>[key,1+Math.log((counts.length+1)/(n+1))]));
  const vectors=counts.map(row=>{const vector=new Map();let norm=0;for(const [term,count]of row){const value=(1+Math.log(count))*idf.get(term);vector.set(term,value);norm+=value*value;}norm=Math.sqrt(norm)||1;for(const [term,value]of vector)vector.set(term,value/norm);return vector;});model={idf,vectors};lexicalCaches.set(catalog,model);
 }
 const query=new Map();let norm=0;for(const [term,count]of grams(text)){if(!model.idf.has(term))continue;const v=(1+Math.log(count))*model.idf.get(term);query.set(term,v);norm+=v*v;}norm=Math.sqrt(norm)||1;
 return model.vectors.map(row=>{let score=0;for(const [term,value]of query)score+=(row.get(term)||0)*value/norm;return score;});
}
export function rankGuides(catalog,index,queryVector,query,{species='cat',limit=3,lexicalOnly=false}={}){
 const topics=topicsFor(query),ids=new Set(topics.map(x=>x.id)),lexical=lexicalScores(catalog,query.replace(/อ้วก|อวก/g,'อาเจียน').replace(/ฉี่/g,'ปัสสาวะ'));
 const rows=catalog.articles.map((article,articleIndex)=>{
  if(species!=='all'&&!['general','both',species].includes(article.species))return null;
  const vector=index.vectors[article.id];if(!vector&&!lexicalOnly)return null;
  const semantic=lexicalOnly?0:cosine(queryVector,vector),articleTopics=topicsFor(guideText(article)+' '+article.id,{allowBoth:true}),articleIds=new Set(articleTopics.map(t=>t.id)),matches=articleTopics.filter(t=>ids.has(t.id));
  if(lexicalOnly&&(!matches.length||lexical[articleIndex]<0.025))return null;
  const specific=['vomit','diarrhea','constipation','urinary','kidney','fungus','ear','dental','vaccine','breathing','appetite','skin','water','behavior'].filter(id=>ids.has(id));
  if(ids.has('post-neuter')){if(!articleIds.has('post-neuter')&&!(articleIds.has('wound')&&articleIds.has('surgery')))return null;}
  else if(ids.has('pre-neuter')){if(!articleIds.has('pre-neuter'))return null;}
  else if(specific.length&&!specific.some(id=>articleIds.has(id)))return null;
  if(/เคมีบำบัด|chemotherapy/i.test(article.title+' '+article.id)&&!/เคมีบำบัด|มะเร็ง|chemotherapy/i.test(query))return null;
  let score=0.45*semantic+0.55*lexical[articleIndex]+matches.reduce((sum,t)=>sum+(t.id==='post-neuter'||t.id==='pre-neuter'?0.14:t.id==='wound'?0.065:0.025),0);
  if(topicsFor(article.title,{allowBoth:true}).some(t=>specific.includes(t.id)))score+=0.12;
  if(/มะเร็ง|เนื้องอก|cancer|tumor/i.test(article.title+' '+article.id)&&!/มะเร็ง|เนื้องอก|ก้อน|cancer|tumor/i.test(query))score-=0.18;
  if(ids.has('pre-neuter')&&/post-neuter/.test(article.id))score-=0.3;
  if(ids.has('post-neuter')&&/pre-neuter/.test(article.id))score-=0.2;
  if(!lexicalOnly&&semantic<(topics.length?0.28:0.46))return null;
  return {id:article.id,title:article.title,url:article.url,description:article.description,category:article.category,species:article.species,relevance:score,semanticSimilarity:semantic,matchedTopics:matches.map(t=>t.label),reason:matches.length?'มีเนื้อหาเกี่ยวกับ '+matches.map(t=>t.label).join(' และ '):'โมเดลพบว่าเนื้อหามีความหมายใกล้กับข้อความที่ค้น',verification:article.verification};
 }).filter(Boolean).sort((a,b)=>b.relevance-a.relevance);
 return {topics,results:rows.slice(0,Math.max(1,Math.min(limit,8))),available:rows.length};
}
