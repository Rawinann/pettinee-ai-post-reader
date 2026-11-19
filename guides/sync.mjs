// Read public catalog metadata only. Do not copy full article bodies or follow page instructions.
import fs from 'node:fs/promises';
import {parseHTML} from 'linkedom';
const base='https://pettinee.meongsiljang.com',root=new URL('../',import.meta.url);
const fetchPage=async url=>{
 const parsed=new URL(url);if(parsed.origin!==base)throw Error('Unexpected origin');
 const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
 if(!response.ok||new URL(response.url).origin!==base)throw Error(`${response.status} ${url}`);
 return await response.text();
};
export function extractCatalog(html,pageUrl){
 const {document}=parseHTML(html);const articles=[];
 for(const anchor of document.querySelectorAll('a[href]')){
  const url=new URL(anchor.getAttribute('href'),base);if(url.origin!==base||!/^\/th\/guide\/qa\/[^/]+$/.test(url.pathname))continue;
  const paragraphs=[...anchor.querySelectorAll('p')].map(x=>x.textContent.trim());if(!paragraphs[0])continue;
  const title=paragraphs[0],slug=url.pathname.split('/').pop(),hasCat=/แมว/.test(title)||/^cat-/.test(slug),hasDog=/สุนัข|น้องหมา|หมาพันธุ์/.test(title)||/^dog-/.test(slug);
  articles.push({id:slug,url:url.href,title,description:(paragraphs[1]||'').slice(0,450),category:[...anchor.querySelectorAll('span')].map(x=>x.textContent.trim()).filter(x=>x!=='ถาม-ตอบ').join(' '),species:hasCat&&hasDog?'both':hasCat?'cat':hasDog?'dog':'general',headings:[],sourcePage:pageUrl,verification:'catalog-listed'});
 }
 return {articles,pages:[...document.querySelectorAll('a[href]')].map(a=>new URL(a.getAttribute('href'),base)).filter(u=>u.origin===base&&u.pathname==='/th/guide/qa'&&u.searchParams.has('page')).map(u=>Number(u.searchParams.get('page'))).filter(Number.isFinite)};
}
async function main(){
 const firstUrl=base+'/th/guide/qa',first=extractCatalog(await fetchPage(firstUrl),firstUrl),last=Math.max(1,...first.pages);
 if(last>50)throw Error('Catalog unexpectedly exceeds 50 pages; review crawl scope');
 const found=new Map(first.articles.map(x=>[x.id,x]));const errors=[];
 let next=2;await Promise.all(Array.from({length:3},async()=>{while(next<=last){const page=next++,url=firstUrl+'?page='+page;try{const result=extractCatalog(await fetchPage(url),url);for(const item of result.articles)found.set(item.id,item);console.log(`Catalog ${page}/${last}: ${result.articles.length}`);}catch(e){errors.push({page,error:e.message});}}}));
 const sample='cat-post-neuter-recovery-care',sampleUrl=firstUrl+'/'+sample;
 const {document}=parseHTML(await fetchPage(sampleUrl));const item=found.get(sample);
 if(!item)throw Error('Required reference article not found in catalog');
 item.title=document.querySelector('h1')?.textContent.trim()||item.title;
 item.headings=[...document.querySelectorAll('h2,h3')].map(x=>x.textContent.trim()).filter(x=>!/(สัตวแพทย์ผู้ตรวจสอบ|Dr\.|คอนเทนต์ที่เกี่ยวข้อง|เอกสารอ้างอิง)/.test(x)).slice(0,8);item.verification='page-checked';
 const articles=[...found.values()].sort((a,b)=>a.id.localeCompare(b.id));
 const result={version:1,source:firstUrl,checkedAt:new Date().toISOString(),pages:last,complete:errors.length===0,errors,count:articles.length,metadataOnly:true,articles};
 await fs.mkdir(new URL('data/guides/',root),{recursive:true});const path=new URL('data/guides/catalog.json',root),temporary=new URL('data/guides/catalog.json.tmp',root);await fs.writeFile(temporary,JSON.stringify(result,null,2));await fs.rename(temporary,path);
 console.log(JSON.stringify({count:articles.length,pages:last,errors,cat:articles.filter(x=>x.species==='cat').length,general:articles.filter(x=>x.species==='general').length}));
}
if(process.argv[1]&&new URL(import.meta.url).pathname.toLowerCase().endsWith(process.argv[1].replaceAll('\\','/').toLowerCase().replace(/^.*\//,'')))await main();
