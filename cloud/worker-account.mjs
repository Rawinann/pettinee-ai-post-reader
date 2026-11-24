export function encodeWorkerAccount(account){
 if(typeof account!=='string'||!account.trim()||account.length>200)throw Error('ชื่อบัญชี Facebook ไม่ถูกต้อง');
 return Buffer.from(account,'utf8').toString('base64url');
}

export function readWorkerAccount(env){
 if(!env.CLOUD_FACEBOOK_ACCOUNT_B64)return env.CLOUD_FACEBOOK_ACCOUNT||'';
 const encoded=env.CLOUD_FACEBOOK_ACCOUNT_B64;
 if(!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error('ชื่อบัญชี worker ในไฟล์ตั้งค่าไม่ถูกต้อง');
 const account=Buffer.from(encoded,'base64url').toString('utf8');
 if(encodeWorkerAccount(account)!==encoded)throw Error('ชื่อบัญชี worker ในไฟล์ตั้งค่าไม่ถูกต้อง');
 return account;
}
