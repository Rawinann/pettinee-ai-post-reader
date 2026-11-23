import {createHmac,createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {workflowError} from '../server/errors.mjs';
export const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function passwordHash(password,salt=randomBytes(16).toString('hex')){if(typeof password!=='string'||password.length<14||password.length>200)throw Error('ใช้รหัสผ่าน 14–200 ตัวอักษร');return salt+':'+scryptSync(password,salt,32).toString('hex');}
export function createCloudAuth({secret,users,origin,store,clock=Date.now}){
 const url=new URL(origin);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('PUBLIC_ORIGIN ต้องเป็น HTTPS');
 if(typeof secret!=='string'||secret.length<32)throw Error('SESSION_SECRET ต้องยาวอย่างน้อย 32 ตัวอักษร');
 if(!Array.isArray(users)||!users.length||users.length>2||users.some(u=>!/^\S+@\S+\.\S+$/.test(u.email)||! /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(u.passwordHash)))throw Error('กำหนดผู้ดูแล 1–2 บัญชีพร้อม password hash');
 if(new Set(users.map(u=>u.email.toLowerCase())).size!==users.length)throw Error('อีเมลผู้ดูแลซ้ำ');
 const sign=value=>createHmac('sha256',secret).update(value).digest('base64url'),cookie='pettinee_session';
 const cookieHeader=value=>`${cookie}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value?28800:0}${url.protocol==='https:'?'; Secure':''}`;
 return {
  checkOrigin(req){if(req.headers.origin!==url.origin)throw workflowError('Origin ไม่ตรงกับเว็บไซต์ผู้ดูแล',403);},
  async login(req,body){
   const email=typeof body.email==='string'?body.email.toLowerCase().trim().slice(0,200):'',password=typeof body.password==='string'?body.password:'';
   const bucket=Math.floor(clock()/900000),ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
   for(const [key,max] of [['all',40],['email:'+email,8],['ip:'+ip,15]])if(!await store.loginAttempt(digest(secret+bucket+key),max))throw workflowError('ลองเข้าสู่ระบบหลายครั้ง รอ 15 นาทีแล้วลองใหม่',429);
   const user=users.find(u=>u.email.toLowerCase()===email),hash=user?.passwordHash||'0'.repeat(32)+':'+ '0'.repeat(64),[salt,expected]=hash.split(':');
   const actual=scryptSync(password.slice(0,200),salt,32).toString('hex');if(!user||password.length>200||!equal(actual,expected))throw workflowError('อีเมลหรือรหัสผ่านไม่ถูกต้อง',401);
   const payload=Buffer.from(JSON.stringify({email:user.email,exp:clock()+28800000,version:digest(hash)})).toString('base64url');return {user:{email:user.email},cookie:cookieHeader(payload+'.'+sign(payload))};
  },
  user(req){const value=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookie+'='))?.slice(cookie.length+1)||'';if(value.length>2000)throw workflowError('กรุณาเข้าสู่ระบบ',401);const [payload,signature,...rest]=value.split('.');try{if(rest.length||!payload||!signature||!equal(signature,sign(payload)))throw Error();const data=JSON.parse(Buffer.from(payload,'base64url')),user=users.find(u=>u.email===data.email);if(!user||data.exp<=clock()||data.exp>clock()+28800000||data.version!==digest(user.passwordHash))throw Error();return {email:user.email};}catch{throw workflowError('กรุณาเข้าสู่ระบบ',401);}},
  logout:()=>cookieHeader(''),
 };
}
