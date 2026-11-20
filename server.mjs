import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAnalysisService, ProviderUnavailableError } from './server/provider.mjs';
import { createIntentService } from './server/intent.mjs';
import { createGuideService } from './server/guides.mjs';
import { createWorkflowService } from './server/workflow.mjs';
import { createWorkflowHTTP } from './server/workflow-http.mjs';

const projectDir = dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ['/', ['Pettinee_Feed_AI_Demo.html', 'text/html; charset=utf-8']],
  ['/Pettinee_Feed_AI_Demo.html', ['Pettinee_Feed_AI_Demo.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/workflow.css', ['workflow.css', 'text/css; charset=utf-8']],
  ['/config.js', ['config.js', 'text/javascript; charset=utf-8']],
  ['/lib/import.mjs', ['lib/import.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/analysis.mjs', ['lib/analysis.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/care.mjs', ['lib/care.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/public-posts.mjs', ['lib/public-posts.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/intent.mjs', ['lib/intent.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/intent-ui.mjs', ['lib/intent-ui.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/guide-ui.mjs', ['lib/guide-ui.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/workflow-ui.mjs', ['lib/workflow-ui.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/workflow-policy.mjs', ['lib/workflow-policy.mjs', 'text/javascript; charset=utf-8']],
  ['/lib/guide-match.mjs', ['lib/guide-match.mjs', 'text/javascript; charset=utf-8']],
  ['/data/Pettinee_Facebook_200_Posts_Public_Excerpts_19Nov2026.xlsx', ['data/Pettinee_Facebook_200_Posts_Public_Excerpts_19Nov2026.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']],
  ['/lib/experience-ui.mjs', ['lib/experience-ui.mjs', 'text/javascript; charset=utf-8']],
  ['/data/demo-posts.mjs', ['data/demo-posts.mjs', 'text/javascript; charset=utf-8']],
]);
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

function send(res, status, body, type = 'application/json; charset=utf-8', head = false) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, { ...securityHeaders, 'Content-Type': type, 'Content-Length': bytes.length });
  res.end(head ? undefined : bytes);
}

function fail(res, status, message) {
  send(res, status, { error: message });
}

function validHost(host) {
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host || '');
}

async function readJSON(req, limit) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size <= limit) parts.push(part);
  }
  if (size > limit) throw Object.assign(new Error('ข้อมูลใหญ่เกินขนาดที่รองรับ'), { statusCode: 413 });
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw Object.assign(new Error('รูปแบบ JSON ไม่ถูกต้อง'), { statusCode: 400 });
  }
}

function boundedString(value, name, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw Object.assign(new Error(`ข้อมูล ${name} ไม่ถูกต้อง`), { statusCode: 400 });
  }
  return value;
}

export function validatePostPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !payload.post || typeof payload.post !== 'object' || Array.isArray(payload.post)) {
    throw Object.assign(new Error('ต้องระบุข้อมูล post'), { statusCode: 400 });
  }
  const raw = payload.post;
  if (!Array.isArray(raw.comments) || raw.comments.length > 2000) {
    throw Object.assign(new Error('รายการคอมเมนต์ไม่ถูกต้อง'), { statusCode: 400 });
  }
  const comments = raw.comments.map((c) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw Object.assign(new Error('คอมเมนต์ไม่ถูกต้อง'), { statusCode: 400 });
    return { id: boundedString(c.id, 'comment.id', 200, true), text: boundedString(c.text, 'comment.text', 20000, true) };
  });
  if (new Set(comments.map(c => c.id)).size !== comments.length) {
    throw Object.assign(new Error('รหัสคอมเมนต์ต้องไม่ซ้ำกัน'), { statusCode: 400 });
  }
  const post = {
    id: boundedString(raw.id, 'id', 500, true),
    postId: boundedString(raw.postId, 'postId', 500),
    title: boundedString(raw.title, 'title', 1000),
    category: boundedString(raw.category, 'category', 500),
    text: boundedString(raw.text, 'text', 100000, true),
    url: boundedString(raw.url, 'url', 4000),
    commentSummary: boundedString(raw.commentSummary, 'commentSummary', 100000),
    sourceLabel: boundedString(raw.sourceLabel, 'sourceLabel', 1000),
    comments,
    coverage: ['complete', 'partial', 'unknown'].includes(raw.coverage) ? raw.coverage : 'unknown',
    provenance: ['paraphrased', 'simulated', 'imported'].includes(raw.provenance) ? raw.provenance : 'imported',
  };
  return post;
}

export function createAppServer({ provider = null, rootDir = projectDir, maxBodyBytes = 1_000_000, workflowOptions = null, publicOrigin = '' } = {}) {
  const service = createAnalysisService({ provider });
  const intent = createIntentService(rootDir);
  const guides = createGuideService(rootDir);
  const configuredOrigin=publicOrigin?new URL(publicOrigin).origin:'';
  if(configuredOrigin&&!configuredOrigin.startsWith('https://'))throw Error('PUBLIC_ORIGIN must use HTTPS');
  if(configuredOrigin&&(!workflowOptions?.operatorToken||workflowOptions.operatorToken.length<32))throw Error('Public operator server requires OPERATOR_TOKEN of at least 32 characters');
  const workflow=workflowOptions?createWorkflowService({rootDir,dbPath:resolve(rootDir,'data/runtime/workflow.sqlite'),intent,guides,...workflowOptions}):null;
  const workflowHTTP=workflow?createWorkflowHTTP(workflow,workflowOptions):null;
  const server = createServer(async (req, res) => {
    try {
      if (!validHost(req.headers.host)&&!(configuredOrigin&&req.headers.host?.toLowerCase()===new URL(configuredOrigin).host.toLowerCase())) return fail(res, 403, 'ชื่อเครื่องไม่อยู่ในรายการที่อนุญาต');
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`&&req.headers.origin!==configuredOrigin) return fail(res, 403, 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น');
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
      } catch {
        return fail(res, 400, 'ที่อยู่ไม่ถูกต้อง');
      }
      if (pathname.includes('\\') || pathname.includes('\0')) return fail(res, 400, 'ที่อยู่ไม่ถูกต้อง');

      if(pathname.startsWith('/api/workflow/')||pathname==='/api/sources/events'||pathname==='/webhooks/meta'){
        if(!workflowHTTP)return fail(res,503,'ระบบ Inbox ต้องใช้ Node server พร้อม SQLite');
        const result=await workflowHTTP(req,new URL(req.url,configuredOrigin||`http://${req.headers.host}`));
        return send(res,result.status||200,result.body,result.type||'application/json; charset=utf-8');
      }

      if (pathname === '/api/config' && req.method === 'GET') {
        return send(res, 200, { mode: service.available ? 'ai' : 'demo', aiAvailable: service.available,...(workflow?{workflowAvailable:true,operatorAuthRequired:!!workflowOptions.operatorToken,brand:'แอพคุณหมอใจดี'}:{}) });
      }
      if(pathname==='/api/intent/status'&&req.method==='GET')return send(res,200,await intent.status());
      if(pathname==='/api/guides/status'&&req.method==='GET')return send(res,200,await guides.status());
      if(pathname==='/api/guides/search'&&req.method==='POST'){
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return fail(res,415,'กรุณาส่ง JSON');
        return send(res,200,await guides.search(await readJSON(req,Math.min(maxBodyBytes,100000))));
      }
      if(pathname==='/api/intent/annotations'&&req.method==='GET')return send(res,200,await intent.reviewData());
      if(['/api/intent/classify','/api/intent/annotations'].includes(pathname)&&req.method==='POST'){
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return fail(res,415,'กรุณาส่ง JSON');
        const payload=await readJSON(req,Math.min(maxBodyBytes,100000));
        return send(res,200,pathname.endsWith('/classify')?await intent.classify(payload):await intent.review(payload));
      }
      if (pathname === '/api/analyze' && req.method === 'POST') {
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return fail(res, 415, 'กรุณาส่งข้อมูลเป็น JSON');
        const post = validatePostPayload(await readJSON(req, maxBodyBytes));
        if (!service.available) return fail(res, 503, new ProviderUnavailableError().message);
        try {
          return send(res, 200, { analysis: await service.analyze(post) });
        } catch {
          return fail(res, 502, 'ผล AI ไม่ผ่านการตรวจรูปแบบหรือผู้ให้บริการทำงานไม่สำเร็จ ยังไม่แสดงผลวิเคราะห์');
        }
      }
      if (pathname.startsWith('/api/')) return fail(res, 405, 'ไม่รองรับคำขอนี้');
      if (!['GET', 'HEAD'].includes(req.method)) return fail(res, 405, 'ไม่รองรับคำขอนี้');
      let entry = files.get(pathname);
      if (!entry && /^\/samples\/[A-Za-z0-9_-]+\.xlsx$/.test(pathname)) {
        entry = [pathname.slice(1), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
      }
      if (!entry) return fail(res, 404, 'ไม่พบหน้าเว็บ');
      try {
        const body = await readFile(resolve(rootDir, entry[0]));
        return send(res, 200, body, entry[1], req.method === 'HEAD');
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return fail(res, 404, 'ไม่พบไฟล์');
        throw error;
      }
    } catch (error) {
      if (!res.headersSent) fail(res, error.statusCode || 500, error.statusCode ? error.message : 'ไม่สามารถดำเนินการได้ในขณะนี้');
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.workflow=workflow;
  if(workflow)server.on('close',()=>{workflow.close().catch(()=>{});});
  return server;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (direct) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  const listenHost=process.env.HOST||'127.0.0.1';
  if(!['127.0.0.1','localhost','::1'].includes(listenHost)&&(!process.env.PUBLIC_ORIGIN||!process.env.OPERATOR_TOKEN))throw Error('External hosting requires PUBLIC_ORIGIN and OPERATOR_TOKEN');
  const server = createAppServer({publicOrigin:process.env.PUBLIC_ORIGIN||'',workflowOptions:{
    ...(process.env.WORKFLOW_DB_PATH?{dbPath:resolve(process.env.WORKFLOW_DB_PATH)}:{}),operatorToken:process.env.OPERATOR_TOKEN||'',ingestToken:process.env.INGEST_TOKEN||'',
    chatbotUrl:process.env.MEONGSILJANG_URL||'https://meongsiljang.com/th',televetUrl:process.env.TELEVET_URL||'',
    meta:{pageId:process.env.META_PAGE_ID||'',appId:process.env.META_APP_ID||'',accessToken:process.env.META_PAGE_ACCESS_TOKEN||'',appSecret:process.env.META_APP_SECRET||'',verifyToken:process.env.META_VERIFY_TOKEN||'',graphVersion:process.env.META_GRAPH_VERSION||'',publishEnabled:process.env.META_PAGE_PUBLISH_ENABLED==='true'},
  }});
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Set PORT to another port.` : 'Unable to start Pettinee local server.');
    process.exitCode = 1;
  });
  server.listen(port, listenHost, () => {
    console.log(`แอพคุณหมอใจดี โดย Pettinee: ${process.env.PUBLIC_ORIGIN||'http://127.0.0.1:'+port}`);
    console.log('SQLite Inbox + local ML. Human review is required; Facebook and product connections depend on configuration.');
  });
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
}
