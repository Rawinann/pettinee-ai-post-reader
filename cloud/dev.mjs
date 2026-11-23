import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import handler from '../api/index.mjs';
const root=resolve('cloud-dist'),types={html:'text/html',css:'text/css',mjs:'text/javascript'};
createServer(async(req,res)=>{if(req.url.startsWith('/api/')||/^\/(?:r\/)?g\//.test(req.url))return handler(req,res);const path=new URL(req.url,'http://localhost').pathname;const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+sep)){res.writeHead(404).end();return;}try{res.setHeader('Content-Type',types[file.split('.').at(-1)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(file));}catch{res.writeHead(404).end();}}).listen(4190,'127.0.0.1',()=>console.log('Cloud adapter dev: http://127.0.0.1:4190 (requires DATABASE_URL and migrations)'));
