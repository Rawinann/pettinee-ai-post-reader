import {topicsFor} from './guide-match.mjs';
export const VPC_TOPICS=Object.freeze([
 {id:'digestive',label:'อาเจียน / ท้องเสีย / การกินอาหาร',signals:['vomit','diarrhea','constipation','appetite']},
 {id:'skin-wound',label:'ผิวหนัง / บาดแผล / ขนร่วง',signals:['skin','fungus','wound']},
 {id:'recovery',label:'หลังทำหมัน / หลังรักษา',signals:['post-neuter','surgery']},
 {id:'ongoing-cost',label:'ปัสสาวะ / โรคเรื้อรัง / ค่ารักษา',signals:['urinary','kidney','cost']},
 {id:'daily-care',label:'อาหาร / พฤติกรรม / อุปกรณ์',signals:['food','behavior','water','dental','ear']},
]);
export const EMERGENCY_NOTICE='หากแมวกำลังปัสสาวะไม่ออก ควรพาไปโรงพยาบาลสัตว์ทันที ไม่ต้องรอคำตอบจาก Chatbot หรือ Televet';
export const URINARY_RULE={id:'current-no-urine-v1',source:'https://vcahospitals.com/know-your-pet/urinary-tract-disease-in-cats',purpose:'คำแนะนำให้เข้ารับการตรวจ ไม่ใช่การวินิจฉัย',clinicalApproval:'ต้องให้ทีมสัตวแพทย์ทบทวนก่อนใช้งาน production'};
export function classifyTopics(text){
 const signals=topicsFor(text),ids=new Set(signals.map(t=>t.id));
 const topics=VPC_TOPICS.filter(t=>t.signals.some(id=>ids.has(id))||(t.id==='recovery'&&/หลังรักษา|พักฟื้น/.test(text))||(t.id==='daily-care'&&/กรง|อุปกรณ์/.test(text))).map(({id,label,signals:keys})=>({id,label,matchedSignals:keys.filter(key=>ids.has(key)),confidence:null}));
 return {method:'rules_v1',status:topics.length?'matched':'uncertain',confidenceMeaning:'ตรวจวลี ไม่ใช่ความน่าจะเป็นหรือการวินิจฉัย',topics,signals};
}
export function currentUrinaryConcern(text){
 const clauses=text.split(/[\n.!?。]|แต่|ตอนนี้|วันนี้|ขณะนี้|ตอนเช้า/u);
 return clauses.some(clause=>{
  if(!/ฉี่ไม่ออก|ปัสสาวะไม่ออก|เบ่ง(?:ฉี่|ปัสสาวะ).{0,12}(?:ไม่ออก|ไม่มีปัสสาวะ)/u.test(clause))return false;
  if(/ไม่(?:ได้|มีอาการ|ใช่อาการ).{0,4}(?:ฉี่|ปัสสาวะ)ไม่ออก|ไม่มีปัญหา|ถ้า|หาก|กลัว.{0,6}จะ|เคย|ปีก่อน|หายแล้ว|หายดี|ฉี่ได้ปกติ|ปัสสาวะได้ปกติ/u.test(clause))return false;
  return true;
 });
}
export function evaluateSafety(text,{intent,topics,guides,sourceMeta}={}){
 const flags=[];const flag=(code,label)=>flags.push({code,label});
 const urgent=currentUrinaryConcern(text);
 if(urgent)flag('urgent-urinary','ข้อความกล่าวถึงปัสสาวะไม่ออก ต้องไม่ให้รอ Chatbot/Televet');
 if(sourceMeta?.method==='browser-dom')flag('browser-source',sourceMeta.completeness==='partial'?'ข้อความบนหน้าจอยังถูกย่อ ต้องเปิดต้นทางตรวจข้อมูล':'เก็บจากข้อความที่หน้าเว็บโหลดมา ยังไม่ได้ยืนยันว่าครบทั้งโพสต์');
 if(!text.trim())flag('missing-text','มีเพียงลิงก์ ยังไม่มีข้อความให้วิเคราะห์');
 else if(text.trim().length<25)flag('limited-context','ข้อความสั้น อาจยังไม่พอเข้าใจบริบท');
 if(intent?.status!=='suggestion')flag('intent-review','Intent ยังต้องให้ผู้ดูแลตรวจหรือเลือก');
 if(topics?.status!=='matched')flag('topic-review','ยังจับหัวข้อไม่ได้อย่างชัดเจน');
 if(!guides?.length)flag('no-guide','ยังไม่พบคู่มือที่เกี่ยวข้องเพียงพอ');
 if(/เปลี่ยนยา|หยุดยา|ขนาดยา|ยาตัวอื่น|ยาที่.*หาย/u.test(text))flag('medication','มีเรื่องยา ต้องตรวจข้อความอย่างระมัดระวัง');
 if(/หมอ.{0,12}(?:ไม่ดี|ผิด|ไม่เก่ง)|เปลี่ยนหมอ|รักษา.{0,16}(?:ไม่หาย|ไม่ดีขึ้น)/u.test(text))flag('treatment-belief','ยังสรุปคุณภาพการรักษาจากข้อความหรือระยะเวลาอย่างเดียวไม่ได้');
 if(/(?:ใช้|กิน|ทา|ฉีด).{0,25}(?:แล้วหาย|หายเลย)/u.test(text))flag('causation','ดีขึ้นหลังใช้วิธีหนึ่ง ยังไม่พิสูจน์ว่าวิธีนั้นเป็นสาเหตุ');
 if(/ignore.{0,20}instructions|system prompt|api.?key|ข้ามคำสั่ง|เปิดเผย.*(?:secret|โทเคน)/iu.test(text))flag('untrusted-instructions','พบข้อความคล้ายคำสั่งฝังในข้อมูล ไม่ทำตามคำสั่งนั้น');
 return {urgent,urgency:urgent?'seek-vet-immediately':'not-assessed',rule:urgent?URINARY_RULE:null,flags,requiresReview:flags.length>0};
}
export function verifiedGuides(result,catalog){
 if(!result||!Array.isArray(result.results))throw Error('รูปแบบผลค้นคู่มือไม่ถูกต้อง');
 const known=new Map(catalog.articles.map(a=>[a.id,a]));
 return result.results.slice(0,3).map(row=>{
  const source=known.get(row.id);if(!source||source.url!==row.url||source.title!==row.title||!Number.isFinite(row.relevance))throw Error('คู่มือไม่ตรงกับ catalog');
  const url=new URL(source.url);if(url.origin!=='https://pettinee.meongsiljang.com'||!/^\/th\/guide\/qa\/[^/]+$/.test(url.pathname)||url.search||url.hash)throw Error('URL คู่มือไม่ผ่านการตรวจ');
  return {id:source.id,title:source.title,url:source.url,description:source.description,score:row.relevance,semanticSimilarity:row.semanticSimilarity,matchedTopics:row.matchedTopics||[],reason:row.reason,metadataOnly:true,verification:source.verification};
 });
}
export function generateReply({text,topics,guides,safety}){
 if(safety.urgent)return EMERGENCY_NOTICE+(guides[0]?'\n\nคู่มือสำหรับอ่านเพิ่มเติมหลังติดต่อโรงพยาบาลสัตว์: '+guides[0].url:'');
 const parts=[];
 if(safety.flags.some(f=>f.code==='treatment-belief'))parts.push('ระยะเวลาที่อาการยังไม่ดีขึ้นอย่างเดียว ยังตัดสินคุณภาพการรักษาไม่ได้ ลองทบทวนสิ่งที่เปลี่ยนไปกับคลินิกที่ดูแลก่อนนะคะ');
 if(safety.flags.some(f=>f.code==='causation'))parts.push('ประสบการณ์ที่อาการดีขึ้นหลังใช้วิธีหนึ่ง ยังยืนยันไม่ได้ว่าวิธีนั้นเป็นสาเหตุที่ทำให้หายค่ะ');
 if(!guides.length){parts.push('ตอนนี้ยังไม่พบคู่มือที่ตรงกับข้อมูลนี้พอ จึงยังไม่มีข้อมูลอ้างอิงสำหรับตอบเรื่องการดูแลเฉพาะเคส หากเล่าเรื่องที่อยากถามเพิ่ม จะช่วยให้หาข้อมูลที่เกี่ยวข้องได้ค่ะ');return parts.join('\n\n');}
 const health=topics.topics.some(t=>t.id!=='daily-care');
 if(!parts.length)parts.push(health?'เข้าใจว่ามีข้อสงสัยเรื่องที่เล่ามานะคะ ข้อความอย่างเดียวยังไม่พอสรุปสาเหตุหรือวิธีดูแลเฉพาะตัวได้':'ลองเริ่มจากข้อมูลในคู่มือที่เกี่ยวข้อง แล้วเทียบกับเงื่อนไขของบ้านก่อนตัดสินใจนะคะ');
 parts.push('มีคู่มือ “'+guides[0].title+'” ให้อ่านเพิ่มเติมที่นี่ค่ะ\n'+guides[0].url);
 if(topics.signals.some(t=>t.id==='cost'))parts.push('เรื่องราคา ควรถามคลินิกว่ารวมรายการใดและมีค่าติดตามเพิ่มเติมหรือไม่ ตอนนี้ยังไม่มีราคาที่คลินิกยืนยันค่ะ');
 return parts.join('\n\n');
}
export function checkReply(reply,post){
 const errors=[];if(typeof reply!=='string'||!reply.trim()||reply.length>2400)return ['คำตอบต้องมีข้อความและยาวไม่เกิน 2,400 ตัวอักษร'];
 const allowed=new Set((post.guides||[]).map(g=>g.url));
 for(const url of reply.match(/https?:\/\/[^\s<>]+/g)||[])if(!allowed.has(url))errors.push('มีลิงก์ที่ไม่ได้อยู่ในคู่มือที่ตรวจไว้');
 if(/\d+(?:\.\d+)?\s*(?:mg|ml|มก\.?|มล\.?|มิลลิกรัม|มิลลิลิตร|เม็ด)(?![a-z])/iu.test(reply))errors.push('ไม่อนุญาตขนาดยาหรือคำสั่งให้ยาในคำตอบ');
 for(const match of reply.matchAll(/ให้ยา|(?:กิน|ทา|ฉีด|ป้อน|ใช้)ยา|(?:ให้|กิน|ทา|ฉีด|ป้อน|ใช้).{0,12}(?:พาราเซตามอล|ไอบูโพรเฟน|แอสไพริน|อะม็อกซีซิลลิน)/gu)){if(!/ไม่ควร|อย่า|ห้าม|ไม่แนะนำ|ไม่สั่ง/u.test(reply.slice(Math.max(0,match.index-24),match.index)))errors.push('ไม่อนุญาตคำสั่งใช้ยาสำหรับเคสนี้');}
 if(/เป็น.{0,30}(?:แน่นอน|ชัวร์)|วินิจฉัยว่า|ไม่ต้อง(?:ไป|พาไป|พบ).{0,8}(?:หมอ|สัตวแพทย์)|รอดู.{0,16}(?:วัน|ชั่วโมง)/u.test(reply))errors.push('มีข้อความวินิจฉัย ฟันธง หรืออาจทำให้เข้ารับการตรวจล่าช้า');
 for(const match of reply.matchAll(/เปลี่ยนยา|หยุดยา|เพิ่มยา|หมอรักษาผิด|หมอไม่ดี|หมอรักษาไม่ดี/gu)){if(!/ไม่ควร|อย่า|ห้าม|ไม่สามารถสรุป|ยังสรุปไม่ได้/u.test(reply.slice(Math.max(0,match.index-24),match.index)))errors.push('มีคำสั่งเปลี่ยนยา หรือกล่าวโทษสัตวแพทย์โดยไม่มีหลักฐาน');}
 if(/\d[\d,.]*\s*บาท/u.test(reply))errors.push('ไม่ใส่ราคาที่ระบบยังไม่ได้ยืนยันกับคลินิก');
 if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?<!\d)0[689](?:[ -]?\d){8}(?!\d)/iu.test(reply))errors.push('มีข้อมูลติดต่อส่วนบุคคลที่ไม่จำเป็น');
 if(post.safety?.urgent&&!reply.includes(EMERGENCY_NOTICE))errors.push('คำตอบต้องคงข้อความให้ไปโรงพยาบาลสัตว์ทันที ไม่ให้รอ Chatbot หรือ Televet');
 return [...new Set(errors)];
}
