import fs from 'node:fs';
const corpus=JSON.parse(fs.readFileSync('data/intent/corpus.json','utf8'));
// Reviewed against the literal excerpts by the assistant. NOT human gold labels.
// Row numbers below are workbook record numbers, not labels inferred from search terms.
const advice=[1,2,3,4,7,8,9,11,13,14,15,16,23,25,28,36,44,45,46,47,54,56,68,69,70,71,73,77,78,81,82,83,84,86,88,89,90,91,92,94,96,97,99,100,102,103,105,106,109,111,112,113,122,123,134,136,143,144,145,146,148,149,162,165,169,172,174,175,179,180,181,184,185,186,187,188,192,196,199,200];
const compare=[127,128,129,130,131,132,133,139,153,154,155,156,157,158,159,160,161,164,167];
const cost=[57,59,62,63,64,67,95];
const experience=[30,31,53,55,85,110,118,138,150,151,166,189];
const lookup=new Map();for(const [label,rows]of Object.entries({advice,compare,cost,experience}))for(const n of rows){if(lookup.has(n))throw Error('Duplicate row');lookup.set(n,label);}
const labels=corpus.records.map((p,i)=>({id:p.id,label:p.text?(lookup.get(i+1)||'unclear'):null,status:p.text?'draft':'excluded',labelSource:'assistant_manual_draft',reviewer:null,note:p.text?(lookup.has(i+1)?'ป้ายร่างจากการอ่านข้อความตัดตอน ต้องให้คนตรวจ':'ข้อความยังไม่ระบุความต้องการชัดพอ จึงไม่เดาเจตนาจากอาการ'):'ไม่มีข้อความ ไม่นำเข้า train/test'}));
if(fs.existsSync('data/intent/annotations.json'))throw Error('Annotations already exist; never overwrite reviewed work');
fs.writeFileSync('data/intent/annotations.json',JSON.stringify({version:1,labels},null,2));
