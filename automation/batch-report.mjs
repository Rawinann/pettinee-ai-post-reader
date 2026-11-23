import {mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
export async function writeAtomicJSON(path,value,{renameFile=rename,retryDelay=delay}={}){
 await mkdir(dirname(path),{recursive:true});const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2));
 try{for(let attempt=0;;attempt++){try{await renameFile(temp,path);break;}catch(error){if(attempt>=5||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;await retryDelay(50*(attempt+1));}}}finally{await unlink(temp).catch(()=>{});}
}
export async function persistBatchReport(directory,report){
 if(!/^[a-f\d-]{36}$/.test(report.runId))throw Error('Invalid batch report ID');
 await mkdir(directory,{recursive:true});
 const path=join(directory,report.runId+'.json');await writeAtomicJSON(path,report);return path;
}
