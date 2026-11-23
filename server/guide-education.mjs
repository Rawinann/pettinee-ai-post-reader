// Small, source-bound educational notes. These are paraphrases checked from
// the user-specified guide's indexed excerpt on 2026-11-23, not a full-article
// retrieval system, a clinical protocol or an assessment of an individual cat.
const guideId='cat-polyuria-polydipsia-qa',url='https://pettinee.meongsiljang.com/th/guide/qa/'+guideId;
export function guideEducation(post){
 if(post.safety?.urgent||!/(?:กินน้ำ|ดื่มน้ำ|กระหาย)/u.test(post.text)||!/(?:ฉี่|ปัสสาวะ)/u.test(post.text)||!post.guides?.some(g=>g.id===guideId&&g.url===url))return [];
 return [{guideId,sourceURL:url,checkedAt:'2026-11-23',scope:'ข้อมูลทั่วไปจากคู่มือ ไม่ยืนยันอาการรายเคส',facts:['คู่มือพิจารณาปริมาณการดื่มน้ำโดยอ้างอิงน้ำหนักตัวร่วมด้วย','คู่มือกล่าวถึงการบันทึกการเปลี่ยนแปลงการดื่มน้ำและปัสสาวะ'],notEstablished:['ยังสรุปไม่ได้ว่าก้อนฉี่ต่างกันเพราะสายพันธุ์','ไม่มีน้ำหนักตัวหรือปริมาณน้ำที่วัดแยกแต่ละตัว จึงยังเทียบเป็นเกณฑ์รายตัวไม่ได้']}];
}
