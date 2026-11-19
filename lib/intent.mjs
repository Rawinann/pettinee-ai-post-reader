export const INTENTS=Object.freeze({
 advice:{label:'ขอข้อมูลหรือคำแนะนำ',action:'เพิ่มข้อมูลก่อนถามต่อ',tab:'context'},
 compare:{label:'ขอรีวิวหรือเปรียบเทียบ',action:'เปิดตารางเทียบตัวเลือก',tab:'compare'},
 cost:{label:'ถามค่าใช้จ่ายหรือบริการ',action:'เตรียมคำถามเรื่องค่าใช้จ่าย',tab:'cost'},
 experience:{label:'เล่าประสบการณ์หรือแบ่งปันข้อมูล',action:'เปิดสมุดบันทึก',tab:'journal'},
 unclear:{label:'ยังระบุความต้องการไม่ได้',action:'ระบุคำถามหลักด้วยตัวเอง',tab:'context'},
});
export function normalizeIntentText(text){return text.normalize('NFC').toLowerCase().replace(/\s+/gu,' ').trim();}
export function predictIntent(model,text){
 const normalized=normalizeIntentText(text);
 if(!normalized||Array.from(normalized).length<8)return {status:'insufficient_text',intent:'unclear',label:INTENTS.unclear.label,candidates:[],reason:'ข้อความสั้นหรือไม่มีข้อความให้จำแนก'};
 const chars=Array.from(normalized),counts=new Map();
 for(let n=model.ngramRange[0];n<=model.ngramRange[1];n++)for(let i=0;i+n<=chars.length;i++){const term=chars.slice(i,i+n).join('');if(Object.hasOwn(model.vocabulary,term)){const index=model.vocabulary[term];counts.set(index,(counts.get(index)||0)+1);}}
 const features=[];let norm=0;
 for(const [index,count]of counts){const value=(1+Math.log(count))*model.idf[index];features.push([index,value]);norm+=value*value;}
 if(!features.length)return {status:'needs_review',intent:'unclear',label:INTENTS.unclear.label,candidates:[],reason:'ไม่มีลักษณะข้อความที่โมเดลรู้จักเพียงพอ'};
 norm=Math.sqrt(norm);const scores=model.weights.map((weights,i)=>features.reduce((sum,[j,v])=>sum+weights[j]*v/norm,model.intercepts[i]));
 const max=Math.max(...scores),exp=scores.map(x=>Math.exp(x-max)),sum=exp.reduce((a,b)=>a+b,0);
 const candidates=model.classes.map((intent,i)=>({intent,label:INTENTS[intent].label,score:exp[i]/sum})).sort((a,b)=>b.score-a.score);
 const top=candidates[0],review=top.score<model.reviewThreshold||top.intent==='unclear';
 return {status:review?'needs_review':'suggestion',intent:review?'unclear':top.intent,label:INTENTS[review?'unclear':top.intent].label,candidates:candidates.slice(0,3),modelVersion:model.version,trainingLabelStatus:model.trainingLabelStatus,reason:review?'ยังไม่ชัดเจน ให้ผู้ใช้เลือกความต้องการเอง':'ข้อเสนอจากโมเดลทดลอง ผู้ใช้เปลี่ยนได้'};
}
