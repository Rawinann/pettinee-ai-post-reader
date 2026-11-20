import {mkdir,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
export async function persistBatchReport(directory,report){
 if(!/^[a-f\d-]{36}$/.test(report.runId))throw Error('Invalid batch report ID');
 await mkdir(directory,{recursive:true});
 const path=join(directory,report.runId+'.json'),temp=path+'.tmp';
 await writeFile(temp,JSON.stringify(report,null,2));await rename(temp,path);return path;
}
