import {randomBytes} from 'node:crypto';
export const TRACKING_CAMPAIGN='petmommy_guide';
export function guideDestination(url){const u=new URL(url);if(u.origin!=='https://pettinee.meongsiljang.com'||!/^\/th\/guide\/qa\/[a-z0-9-]+$/.test(u.pathname)||u.search||u.hash||u.username||u.password)throw Error('Unapproved guide target');return u.href;}
export function taggedGuide(url,token){const u=new URL(guideDestination(url));u.searchParams.set('utm_source','facebook');u.searchParams.set('utm_medium','community_reply');u.searchParams.set('utm_campaign',TRACKING_CAMPAIGN);u.searchParams.set('utm_content',token);return u.href;}
export function createGuideTracking({store,origin=''}={}){
 let base='';if(origin){const u=new URL(origin);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw Error('GUIDE_TRACKING_ORIGIN ต้องเป็น HTTPS origin สาธารณะของ server ตัวนี้');base=u.origin;}
 return {
  status:()=>({mode:base?'landing':'utm',configuredOrigin:base||null,publicReachabilityVerified:false,countsReaders:false,countsUniquePeople:false}),
  attach(post,draft){const links=[];for(const guide of post.guides){if(!draft.includes(guide.url))continue;const destination=guideDestination(guide.url);let token;do{token=randomBytes(9).toString('base64url');}while(store.guideLink(token));const mode=base?'landing':'utm',url=base?base+'/g/'+token:taggedGuide(destination,token);store.addGuideLink({token,postId:post.id,guideId:guide.id,title:guide.title,destination,url,mode});draft=draft.split(guide.url).join(url);links.push({guideId:guide.id,url,token,mode});}return {draft,links};},
  resolve(token,{method='GET',userAgent='',purpose='',outbound=false}={}){
   const link=store.guideLink(token);if(!link)return null;
   const destination=taggedGuide(link.destination,token);
   if(method==='GET'||method==='POST'){const preview=/bot|crawler|spider|facebookexternalhit|facebot|meta-external|preview|slack|discord|twitter|whatsapp|telegram/iu.test(userAgent)||/prefetch|preview/iu.test(purpose);store.countGuideRequest(token,preview?'preview':outbound?'guide':'page');}
   return {destination,title:link.title,token};
  },
  report:()=>({...store.guideClickReport(),...{mode:base?'landing':'utm',countsReaders:false,countsUniquePeople:false}}),
 };
}
