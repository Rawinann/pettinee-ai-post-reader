import {readFile,stat} from 'node:fs/promises';
export async function readCollectorStatus(path,{clock=Date.now}={}){
 const unavailable={available:false,active:false,state:'not_started',method:'browser-dom'};
 try{if((await stat(path)).size>20000)return unavailable;const raw=JSON.parse(await readFile(path,'utf8'));
  if(raw.version!==1||!/^\d+$/.test(raw.groupId)||!Number.isFinite(Date.parse(raw.updatedAt)))return unavailable;
  const fresh=clock()-Date.parse(raw.updatedAt)<45000&&clock()-Date.parse(raw.updatedAt)>=-5000;
  const states=['starting','needs_login','blocked','wrong_page','waiting_feed','running','no_posts','selector_changed','error','stopped'];
  const state=states.includes(raw.state)?raw.state:'error';
  const counts={};for(const name of ['total','delivered','pending','rejected','changed'])counts[name]=Math.max(0,Math.floor(Number(raw.counts?.[name])||0));
  return {available:true,active:fresh&&state==='running',fresh,state:fresh?state:'stale',groupId:raw.groupId,sourceUrl:'https://www.facebook.com/groups/'+raw.groupId+'/',updatedAt:raw.updatedAt,lastScanAt:raw.lastScanAt||null,lastCaptureAt:raw.lastCaptureAt||null,feedOrder:raw.feedOrder==='new_posts'?'new_posts':'unverified',counts,method:'browser-dom',message:String(raw.message||'').slice(0,500)};
 }catch{return unavailable;}
}
