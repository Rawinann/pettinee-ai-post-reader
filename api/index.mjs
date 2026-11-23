import {cloudPool} from '../cloud/db.mjs';
import {createCloudStore} from '../cloud/store.mjs';
import {createCloudAuth} from '../cloud/auth.mjs';
import {createCloudService,loadCloudCatalog} from '../cloud/service.mjs';
import {createCloudHTTP} from '../cloud/http.mjs';
let boot;
async function initialize(){const env=process.env,origin=env.PUBLIC_ORIGIN,secret=env.SESSION_SECRET;if(!origin)throw Error('ตั้ง PUBLIC_ORIGIN ก่อน');const store=createCloudStore(cloudPool(),{origin}),auth=createCloudAuth({origin,secret,users:JSON.parse(env.DASHBOARD_USERS_JSON||'[]'),store}),catalog=await loadCloudCatalog();return createCloudHTTP({store,auth,service:createCloudService({store,origin,secret,catalog,groupId:env.COLLECTOR_GROUP_ID||'1067156573375730',browserPublish:env.CLOUD_BROWSER_PUBLISH_ENABLED==='true'})});}
export default async function handler(req,res){try{const routedURL=new URL(req.url,'http://localhost'),route=routedURL.searchParams.get('route');if(route){if(!/^\/(?:api\/|g\/|r\/g\/)/.test(route)||route.includes('?')||route.includes('#'))throw Error('route');routedURL.searchParams.delete('route');req.url=route+(routedURL.searchParams.size?'?'+routedURL.searchParams:'');}boot??=initialize().catch(e=>{boot=null;throw e;});return await (await boot)(req,res);}catch{res.statusCode=503;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'ยังตั้งค่า Cloud ไม่ครบ ตรวจ DATABASE_URL, PUBLIC_ORIGIN, SESSION_SECRET และบัญชีผู้ดูแล'}));}}
