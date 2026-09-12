import {readFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
let starting;
function read(file){try{const r=JSON.parse(readFileSync(file,'utf8'));if(!Number.isInteger(r.pid)||!Number.isInteger(r.port)||r.port<1||r.port>65535||typeof r.token!=='string')return;try{process.kill(r.pid,0);}catch{return;}return r;}catch{}}
export async function ensureRuntime(root,file){
 const ready=read(file);if(ready)return ready;
 if(process.platform!=='win32')throw Error('This Agent Spaces version requires Windows.');
 if(!starting)starting=(async()=>{
  let executable=path.join(root,'node_modules/electron/dist/electron.exe'),args=[root];
  if(!existsSync(executable)){
   let launch;try{launch=JSON.parse(readFileSync(path.join(path.dirname(file),'launch.json'),'utf8'));}catch{}
   if(!launch||launch.root!==root||!path.isAbsolute(launch.executable)||!existsSync(launch.executable)||!Array.isArray(launch.args))throw Error('Open Agent Spaces Browser once to finish setup, then retry.');
   executable=launch.executable;args=launch.args;
  }
  const child=spawn(executable,args,{cwd:root,detached:true,windowsHide:true,stdio:'ignore'});
  let failed=false;child.on('error',()=>{failed=true;});child.unref();
  for(let i=0;i<150&&!failed;i++){await new Promise(r=>setTimeout(r,200));const info=read(file);if(info)return info;}
  throw Error('Agent Spaces could not start. Open its Windows shortcut to check setup.');
 })().finally(()=>{starting=undefined;});
 return starting;
}
