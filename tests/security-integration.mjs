import {spawn} from 'node:child_process';import {mkdtempSync,existsSync,readFileSync} from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';
const root=process.cwd(),delay=ms=>new Promise(r=>setTimeout(r,ms));let brokerPort;
const fixture=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<title>Untrusted page</title><p id="isolation"></p><p id="access">waiting</p><script>document.getElementById('isolation').textContent='require:'+typeof require+' process:'+typeof process+' spaces:'+typeof window.spaces;fetch('http://127.0.0.1:${brokerPort}/rpc',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({op:'register',label:'Untrusted page'})}).then(()=>document.getElementById('access').textContent='broker readable').catch(()=>document.getElementById('access').textContent='broker blocked');</script>`);});await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
try{for(const backend of ['electron','webview2']){
 const data=mkdtempSync(path.join(os.tmpdir(),'as-security-'));const app=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[root],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,AGENT_SPACES_TEST:'1',AGENT_SPACES_DATA:data,AGENT_SPACES_BACKEND:backend}});let info;
 async function rpc(body,headers={}){return new Promise((resolve,reject)=>{const request=http.request({hostname:'127.0.0.1',port:info.port,path:'/rpc',method:'POST',headers:{Authorization:'Bearer '+info.token,'Content-Type':'application/json',...headers}},response=>{let text='';response.on('data',part=>text+=part);response.on('end',()=>{try{resolve({status:response.statusCode,...JSON.parse(text)});}catch(e){reject(e);}});});request.on('error',reject);request.end(JSON.stringify(body));});}
 try{
  for(let i=0;i<150&&!existsSync(path.join(data,'runtime.json'));i++)await delay(100);info=JSON.parse(readFileSync(path.join(data,'runtime.json')));brokerPort=info.port;
  assert.equal((await rpc({op:'register'},{Authorization:'Bearer wrong'})).status,403);assert.equal((await rpc({op:'register'},{Origin:'https://untrusted.test'})).status,403);assert.equal((await rpc({op:'register'},{Host:'untrusted.test'})).status,403);
  const {clientId}= (await rpc({op:'register',label:'Security fixture'})).result;assert.ok(clientId);
  for(const url of ['file:///C:/Windows/win.ini','javascript:alert(1)','https://user:password@example.test','ms-settings:'])assert.equal((await rpc({op:'create',clientId,url})).status,400);
  const {tabId}=(await rpc({op:'create',clientId,url:`http://127.0.0.1:${fixture.address().port}`})).result;let snap;
  for(let i=0;i<30;i++){snap=(await rpc({op:'snapshot',clientId,tabId})).result;if(snap?.text.includes('broker blocked'))break;await delay(100);}
  assert.match(snap.text,/require:undefined process:undefined spaces:undefined/);assert.match(snap.text,/broker blocked/);
  const other=(await rpc({op:'register',label:'Other session'})).result.clientId;assert.equal((await rpc({op:'snapshot',clientId:other,tabId})).status,400);
  const site='https://example.test';await rpc({op:'record_account',clientId,tabId,site,username:'fixture',password:'SYNTHETIC-VAULT-ONLY',status:'created'});
  const state=(await rpc({op:'testUI',action:'state'})).result;assert.ok(!JSON.stringify(state).includes('SYNTHETIC-VAULT-ONLY'));assert.ok(!readFileSync(path.join(data,'accounts.enc')).includes(Buffer.from('SYNTHETIC-VAULT-ONLY')));
  assert.equal((await rpc({op:'get_account',clientId:other,tabId,site})).status,400);await rpc({op:'testUI',action:'control',args:{id:tabId}});assert.equal((await rpc({op:'get_account',clientId,tabId,site})).status,400);
  console.log('PASS '+backend+': untrusted page isolation, broker token/origin/host checks, blocked URL schemes, ownership and encrypted credential boundaries');
 }finally{if(info&&app.exitCode===null)await rpc({op:'testUI',action:'quit'});for(let i=0;i<50&&app.exitCode===null;i++)await delay(100);if(app.exitCode===null){app.kill();throw Error('Security fixture app did not exit');}}
}}finally{fixture.close();}
