// Owner-entered planning data. These helpers do not assess symptoms or prescribe care.
export const SCENARIOS = Object.freeze([
  { id:'digestive', name:'กินหรือขับถ่ายเปลี่ยนไป', pain:'กังวล แต่อธิบายลำดับอาการไม่ถูก', help:'จดสิ่งที่สังเกต พร้อมคำถามที่อยากให้ผู้เชี่ยวชาญช่วยตอบ', page:3, sample:'S3', tab:'journal', tag:'จัดข้อมูลก่อนถาม' },
  { id:'skin', name:'ผิวหนัง แผล หรือขนร่วง', pain:'ไม่แน่ใจว่าสิ่งที่ลองอยู่เหมาะไหม', help:'เก็บภาพและการเปลี่ยนแปลงตามวัน แล้วทบทวนข้ออ้างที่อ่านมา', page:4, sample:'S1', tab:'journal', tag:'เห็นความเปลี่ยนแปลง' },
  { id:'recovery', name:'ดูแลต่อหลังกลับจากคลินิก', pain:'มีหลายเรื่องต้องจำ และกลัวทำตกหล่น', help:'เปลี่ยนแผนที่คุณได้รับเป็นรายการ พร้อมวันนัดและข้อสงสัย', page:5, sample:'41', tab:'plan', tag:'กลับมาดูต่อได้' },
  { id:'ongoing', name:'รักษาต่อเนื่องและค่าใช้จ่าย', pain:'กังวลทั้งอาการที่เป็นซ้ำและงบที่ต้องเตรียม', help:'รวมประวัติ สิ่งที่ยังไม่ทราบ และคำถามเรื่องรายการค่ารักษา', page:6, sample:'S4', tab:'cost', tag:'เตรียมคุยเรื่องงบ' },
  { id:'choice', name:'เลือกอาหารหรืออุปกรณ์', pain:'รีวิวเยอะ แต่ไม่รู้ว่าเหมาะกับบ้านเราหรือเปล่า', help:'กำหนดเงื่อนไขของบ้าน แล้วเทียบตัวเลือกจากข้อมูลที่มีจริง', page:7, sample:'100', tab:'compare', tag:'เทียบก่อนตัดสินใจ' },
]);

export const COST_QUESTIONS = Object.freeze([
  { id:'items', text:'รายการตรวจหรือบริการแต่ละอย่างมีวัตถุประสงค์อะไร และคิดค่าใช้จ่ายแยกอย่างไร?' },
  { id:'followup', text:'มีค่าใช้จ่ายติดตาม อุปกรณ์ หรือค่าใช้จ่ายต่อเนื่องอะไรที่ควรเตรียมเพิ่ม?' },
  { id:'options', text:'มีทางเลือกตามงบที่ยังสอดคล้องกับแผนรักษาหรือไม่ ควรปรึกษาใครเรื่องนี้?' },
  { id:'contact', text:'ติดต่อทีมรักษาหรือสอบถามเรื่องค่าใช้จ่ายได้ช่วงเวลาใด ผ่านช่องทางไหน?' },
]);

const text = (v, max=3000) => typeof v==='string' ? v.slice(0,max) : '';
const array = v => Array.isArray(v) ? v.slice(0,100) : [];
export const isSafePhoto = value => typeof value==='string' && value.length<=450000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
export function scenarioForPost(post) {
  const s=`${post.category||''} ${post.text||''}`;
  if(/หลังรักษา|หลังผ่า|ทำหมัน|พักฟื้น|หลังกลับ.*คลินิก/.test(s))return 'recovery';
  if(/ผื่น|ผิวหนัง|ขนร่วง|แผล/.test(s))return 'skin';
  if(/เรื้อรัง|ปัสสาวะ|ค่ารักษา|ค่าใช้จ่าย|คลินิก/.test(s))return 'ongoing';
  if(/อาเจียน|ท้องเสีย|ไม่กิน|กินน้อย/.test(s))return 'digestive';
  if(/น้ำพุ|อุปกรณ์|รีวิว|อาหาร|พฤติกรรม/.test(s))return 'choice';
  return 'digestive';
}
export function newCareCase(post,scenario=scenarioForPost(post)) {
  return { scenario,petName:'',age:'',background:'',concern:'',appointment:'',clinic:'',contact:'',budget:'',priorities:'',journal:[],plan:[],costs:[{id:'consult',label:'ค่าปรึกษาหรือตรวจ',amount:''},{id:'care',label:'รายการดูแลตามแผนที่ได้รับ',amount:''},{id:'followup',label:'ติดตามหรือรายการอื่น',amount:''}],questions:[],comparison:[{id:'option-a',name:'',material:'',power:'',cleaning:'',price:'',recurring:''},{id:'option-b',name:'',material:'',power:'',cleaning:'',price:'',recurring:''}],outcome:'',updatedAt:'' };
}
export function normalizeCareCase(raw,post) {
  const result=newCareCase(post);
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return result;
  if(SCENARIOS.some(s=>s.id===raw.scenario))result.scenario=raw.scenario;
  for(const key of ['petName','age','background','concern','appointment','clinic','contact','budget','priorities','outcome','updatedAt'])result[key]=text(raw[key]);
  result.journal=array(raw.journal).filter(x=>x&&typeof x.note==='string').map(x=>({id:text(x.id,100),at:text(x.at,40),note:text(x.note),location:text(x.location,200),photo:isSafePhoto(x.photo)?x.photo:'',photoName:text(x.photoName,200)}));
  result.plan=array(raw.plan).filter(x=>x&&typeof x.text==='string').map(x=>({id:text(x.id,100),text:text(x.text,1000),when:text(x.when,200),done:x.done===true}));
  if(Array.isArray(raw.costs))result.costs=array(raw.costs).map(x=>({id:text(x?.id,100),label:text(x?.label,200),amount:text(x?.amount,30)}));
  result.questions=array(raw.questions).filter(id=>COST_QUESTIONS.some(q=>q.id===id));
  if(Array.isArray(raw.comparison)&&raw.comparison.length)result.comparison=raw.comparison.slice(0,3).map((x,i)=>Object.fromEntries(['id','name','material','power','cleaning','price','recurring'].map(k=>[k,k==='id'?text(x?.id,100)||`option-${i}`:text(x?.[k],500)])));
  return result;
}
export function costSummary(rows) {
  let total=0,known=0;
  for(const row of rows){const value=String(row.amount??'').trim();if(value!==''&&/^\d+(?:\.\d{1,2})?$/.test(value)){total+=Number(value);known++;}}
  return {total:Math.round(total*100)/100,known,unknown:rows.length-known};
}
export function careHandoff(care) {
  const lines=[],details=[];
  if(care.petName)details.push(`แมวชื่อเรียกว่า ${care.petName}`);if(care.age)details.push(`อายุ ${care.age}`);if(care.background)details.push(`ประวัติที่จดไว้คือ ${care.background}`);if(care.concern)details.push(`เรื่องที่อยากให้ช่วยคือ ${care.concern}`);
  if(details.length)lines.push('มีข้อมูลเพิ่มเติมที่จดไว้ว่า '+details.join(' และ '));
  if(care.journal.length)lines.push('จากบันทึกที่สังเกตไว้ '+care.journal.map(x=>`${x.at?x.at.replace('T',' ')+' ':''}${x.location?'ที่'+x.location+' ':''}${x.note}${x.photo?' (มีภาพเก็บในเครื่อง ภาพไม่ได้ส่งไปด้วย)':''}`).join(' ต่อมา '));
  if(care.plan.length)lines.push('คำแนะนำจากคลินิกที่คัดลอกเก็บไว้มี '+care.plan.map(x=>`“${x.text}”${x.when?' โดยระบุว่า '+x.when:''}${x.done?' ซึ่งผู้ดูแลทำเครื่องหมายว่าทำแล้ว':' ซึ่งยังไม่ได้ทำเครื่องหมายว่าทำแล้ว'}`).join(' และ '));
  if(care.clinic||care.appointment||care.contact)lines.push([care.clinic?'คลินิกที่ดูแลคือ '+care.clinic:'',care.appointment?'มีนัดที่จดไว้ '+care.appointment:'',care.contact?'ช่องทางติดต่อที่เก็บไว้คือ '+care.contact:''].filter(Boolean).join(' และ '));
  const totals=costSummary(care.costs);
  if(care.budget)lines.push('งบหรือข้อจำกัดที่อยากปรึกษาคือ '+care.budget);
  if(totals.known)lines.push(`ค่าใช้จ่ายที่จดไว้รวม ${totals.total.toLocaleString('th-TH')} บาท โดยมีราคา ${totals.known} จาก ${care.costs.length} รายการ จึงยังไม่ใช่ยอดทั้งหมดหรือราคาที่คลินิกยืนยัน`);
  if(care.questions.length)lines.push('เรื่องค่าใช้จ่ายที่ยังอยากถามเพิ่มคือ '+COST_QUESTIONS.filter(q=>care.questions.includes(q.id)).map(q=>q.text).join(' '));
  const choices=care.comparison.filter(x=>x.name.trim());
  if(care.priorities)lines.push('เงื่อนไขสำคัญของบ้านคือ '+care.priorities);
  if(choices.length)lines.push('ตอนนี้กำลังเทียบ '+choices.map(x=>`${x.name} ซึ่งระบุวัสดุ ${x.material||'ยังไม่ทราบ'} แหล่งไฟหรือแบตเตอรี่ ${x.power||'ยังไม่ทราบ'} การถอดล้าง ${x.cleaning||'ยังไม่ทราบ'} ราคา ${x.price||'ยังไม่ทราบ'} และค่าใช้จ่ายต่อเนื่อง ${x.recurring||'ยังไม่ทราบ'}`).join(' กับ '));
  if(care.outcome)lines.push('หลังจากถามต่อ มีบันทึกเพิ่มว่า '+care.outcome);
  return lines.join('\n\n');
}
