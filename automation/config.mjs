import {resolve} from 'node:path';
export const DEFAULT_GROUP_URL='https://web.facebook.com/groups/1067156573375730';
export function collectorConfig(root,env=process.env){
 const url=new URL(env.COLLECTOR_GROUP_URL||DEFAULT_GROUP_URL);
 const match=url.pathname.match(/^\/groups\/(\d+)\/?$/);
 if(url.protocol!=='https:'||!['www.facebook.com','web.facebook.com','facebook.com'].includes(url.hostname)||url.username||url.password||!match)throw Error('COLLECTOR_GROUP_URL ต้องเป็นลิงก์หน้ากลุ่ม Facebook แบบ HTTPS');
 const integer=(key,fallback,min,max)=>{const n=Number(env[key]||fallback);if(!Number.isInteger(n)||n<min||n>max)throw Error(key+' อยู่นอกช่วงที่รองรับ');return n;};
 url.search='';url.hash='';
 return {groupId:match[1],groupUrl:url.href,channel:env.COLLECTOR_BROWSER_CHANNEL||'chrome',profileDir:resolve(root,env.COLLECTOR_PROFILE_DIR||'data/runtime/collector-profile'),outboxPath:resolve(root,env.COLLECTOR_OUTBOX_PATH||'data/runtime/collector.sqlite'),statusPath:resolve(root,'data/runtime/collector-status.json'),workflowPath:resolve(root,env.WORKFLOW_DB_PATH||'data/runtime/workflow.sqlite'),appPort:integer('COLLECTOR_APP_PORT',4187,1024,65535),refreshMs:integer('COLLECTOR_REFRESH_SECONDS',60,30,3600)*1000,maxScrolls:integer('COLLECTOR_MAX_SCROLLS',3,0,10),maxPosts:integer('COLLECTOR_MAX_POSTS',40,1,100),messageSelector:env.COLLECTOR_MESSAGE_SELECTOR||''};
}
