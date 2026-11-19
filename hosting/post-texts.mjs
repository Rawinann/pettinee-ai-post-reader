import {topicsFor} from '../lib/guide-match.mjs';

// Reviewed identifiers in this supplied snapshot. These substitutions are not
// a general-purpose guarantee of anonymity for arbitrary future datasets.
const reviewedNames=['พี่ส้ม','กังฟู','ไอ้อ๊อด','เจ้าตุ๋ย','น้องจิ๊ง'];
export function publishableText(value){
 let text=String(value||'').trim();
 text=text.replace(/\b(?:https?:\/\/|www\.)[^\s<>]+/gi,'[ปกปิดลิงก์]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[ปกปิดอีเมล]')
  .replace(/(?<![\dA-Za-z])(?:0[689](?:[ -]?\d){8}|\+66[689](?:[ -]?\d){8})(?![\dA-Za-z])/g,'[ปกปิดเบอร์โทร]')
  .replace(/@[\p{L}\p{N}_.-]+/gu,'[ปกปิดบัญชี]');
 for(const name of reviewedNames)text=text.replaceAll(name,'[ปกปิดชื่อ]');
 return text.replace(/รพ\s*เกษตร/gu,'[สถานพยาบาล]');
}
function categoryFor(text){
 const ids=new Set(topicsFor(text).map(t=>t.id));
 if(ids.has('cost'))return 'ค่าใช้จ่าย';
 if(['post-neuter','pre-neuter','wound','surgery'].some(id=>ids.has(id))||/ทำหมัน/.test(text))return 'ทำหมันและแผล';
 if(['kidney','urinary'].some(id=>ids.has(id)))return 'ปัสสาวะและไต';
 if(['skin','fungus'].some(id=>ids.has(id)))return 'ผิวหนังและขน';
 if(ids.has('ear'))return 'หู';if(ids.has('dental'))return 'ฟันและช่องปาก';if(ids.has('breathing'))return 'การหายใจ';
 if(ids.has('water'))return 'น้ำดื่มและน้ำพุ';if(ids.has('behavior'))return 'พฤติกรรม';
 if(['vomit','diarrhea','constipation','appetite','food'].some(id=>ids.has(id)))return 'การกินและขับถ่าย';
 if(/กรง|อุปกรณ์/.test(text))return 'อุปกรณ์';return 'เรื่องอื่น ๆ';
}
export function createPublicPosts(rows){
 return rows.filter(row=>String(row.text||'').trim()).map((row,index)=>{
  const text=publishableText(row.text);
  return {id:'published-'+String(index+1).padStart(3,'0'),postId:'',text,title:text.slice(0,85),category:categoryFor(text),url:'',comments:[],commentSummary:'',coverage:'unknown',provenance:'imported',postTextKind:'excerpt',readingMode:'post-only',publicDataset:'post-texts-v1',sourceLabel:'ข้อความโพสต์จากชุด 200 รายการ',sourceNote:'มีเฉพาะข้อความตัดตอน ไม่ใช่โพสต์เต็ม · หัวข้อจัดจากคำที่พบในข้อความ',missing:[]};
 });
}
