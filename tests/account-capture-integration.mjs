import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';
const backend=process.argv[2]||'electron';const root=process.cwd(),data=mkdtempSync(path.join(os.tmpdir(),`spaces-capture-${backend}-`));
const secret='ONLY-SYNTHETIC-TEST-947';let app,clientId;const delay=ms=>new Promise(r=>setTimeout(r,ms));
const form=(error='')=>`<!doctype html><title>Signup fixture</title><form method="post" action="/submit"><label>Username<input name="username" autocomplete="username"></label><label>Email<input type="email" name="email"></label><label>Password<input type="password" name="password" autocomplete="new-password"></label><button type="submit">Create account</button></form><p role="alert">${error}</p>`;
const fixture=http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','text/html');res.setHeader('Cache-Control','no-store');
 if(req.url==='/signup'){res.end(form());return;}
 if(req.url==='/login'){res.end(form().replace('new-password','current-password'));return;}
 if(req.url==='/submit'){
  let body='';for await(const c of req)body+=c;const params=new URLSearchParams(body),name=params.get('username');
  if(name==='taken'){res.end(form('Username already taken'));return;}
  res.writeHead(303,{Location:name==='pending'?'/verification':'/dashboard?user='+encodeURIComponent(name||'accepted')});res.end();return;
 }
 if(req.url==='/verification'){res.end('<p>Verify your email to continue</p><a href="/logout">Sign out</a><meta name="user-login" content="pending">');return;}
 if(req.url.startsWith('/dashboard')){const user=new URL(req.url,'http://fixture').searchParams.get('user');res.end(`<title>Dashboard</title><meta name="user-login" content="${user}"><h1>Your dashboard</h1><a href="/logout">Sign out</a>`);return;}
 res.end('<p>Fixture</p>');
});await new Promise(r=>fixture.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${fixture.address().port}`;
async function rpc(body){const r=JSON.parse(readFileSync(path.join(data,'runtime.json')));const response=await fetch(`http://127.0.0.1:${r.port}/rpc`,{method:'POST',headers:{Authorization:`Bearer ${r.token}`,'Content-Type':'application/json'},body:JSON.stringify({...body,...(clientId?{clientId}:{})})});const v=await response.json();if(v.error)throw Error(v.error);return v.result;}
async function state(){return rpc({op:'testUI',action:'state'});}
async function fill(tab,username){const snap=await rpc({op:'snapshot',tabId:tab});for(const [label,text] of [['Username',username],['Email','person@example.test'],['Password',secret]]){const ref=snap.elements.find(e=>e.name===label)?.ref;assert.ok(ref,label);await rpc({op:'fill',tabId:tab,ref,text});}return snap;}
async function submit(tab,snap){await rpc({op:'click',tabId:tab,ref:snap.elements.find(e=>e.name==='Create account').ref});await delay(1800);}
try{
 app=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),['.'],{cwd:root,env:{...process.env,AGENT_SPACES_TEST:'1',AGENT_SPACES_DATA:data,AGENT_SPACES_BACKEND:backend},windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';app.stderr.on('data',b=>stderr+=b);
 for(let i=0;i<160&&!existsSync(path.join(data,'runtime.json'));i++){if(app.exitCode!==null)throw Error('Test app exited during start');await delay(100);}
 assert.ok(existsSync(path.join(data,'runtime.json')),'Test app ready');clientId=(await rpc({op:'register',label:'Account capture fixture'})).clientId;
 const {tabId}=await rpc({op:'create',url:origin+'/signup',task:'Create fixture account'});
 let snap=await fill(tabId,'taken');assert.equal((await state()).accounts.length,0,'Typing never saves');await submit(tabId,snap);assert.equal((await state()).accounts.length,0,'Rejected username never saved');
 // New form after rejected attempt: final corrected identity must replace it.
 snap=await fill(tabId,'accepted');await submit(tabId,snap);
 for(let i=0;i<40&&(await state()).accounts.length!==1;i++)await delay(200);
 let s=await state();assert.equal(s.accounts.length,1,'Successful signup captured without record_account');assert.equal(s.accounts[0].username,'accepted');assert.equal(s.accounts[0].email,'person@example.test');assert.equal(s.accounts[0].task,'Create fixture account');assert.equal(s.accounts[0].source,'automatic');assert.ok(s.accounts[0].createdAt);assert.ok(!JSON.stringify(s).includes(secret),'UI state and activity exclude passwords');
 const got=await rpc({op:'get_account',tabId,site:origin});assert.equal(got.password,secret);assert.equal(got.email,'person@example.test');
 assert.ok(!readFileSync(path.join(data,'accounts.enc')).includes(Buffer.from(secret)),'Vault encrypted on disk');
 const savedId=s.accounts[0].id;await rpc({op:'testUI',action:'setDefaultAccount',args:{id:savedId,enabled:true}});
 await rpc({op:'navigate',tabId,url:origin+'/login'});snap=await fill(tabId,'accepted');await rpc({op:'fill',tabId,ref:snap.elements.find(e=>e.name==='Password').ref,text:secret+'-updated'});await submit(tabId,snap);
 s=await state();assert.equal(s.accounts.length,1,'Successful login updates instead of duplicating');assert.equal(s.accounts[0].id,savedId);assert.equal(s.accounts[0].isDefault,true);assert.equal((await rpc({op:'get_account',tabId,site:origin})).password,secret+'-updated');
 const second=await rpc({op:'create',url:origin+'/signup',task:'Incomplete verification fixture'});snap=await fill(second.tabId,'pending');await submit(second.tabId,snap);assert.equal((await state()).accounts.length,1,'Incomplete verification never saved');
 await rpc({op:'testUI',action:'testAccountForm',args:{site:'https://manual.example.test',username:'',email:'',password:secret,label:'Manual fixture'}});await delay(250);assert.equal((await state()).accounts.length,1,'Both missing identifiers rejected by local form');
 const manual=await rpc({op:'testUI',action:'testAccountForm',args:{site:'https://manual.example.test',username:'',email:'manual@example.test',password:secret,label:'Manual fixture'}});assert.equal(manual.valid,true);await delay(350);
 s=await state();assert.equal(s.accounts.find(a=>a.site==='https://manual.example.test').username,'manual@example.test');
 await rpc({op:'navigate',tabId,url:origin+'/login'});snap=await fill(tabId,'existing-new-to-spaces');await submit(tabId,snap);
 s=await state();assert.equal(s.accounts.length,2,'Unknown existing login not saved without consent');assert.equal(s.saveRequests.length,1);assert.ok(!JSON.stringify(s.saveRequests).includes(secret));
 await rpc({op:'testUI',action:'accountSaveConsent',args:{id:s.saveRequests[0].id,save:false}});assert.equal((await state()).accounts.length,2);assert.equal((await state()).saveRequests.length,0);
 await rpc({op:'navigate',tabId,url:origin+'/login'});snap=await fill(tabId,'existing-new-to-spaces');await submit(tabId,snap);s=await state();await rpc({op:'testUI',action:'accountSaveConsent',args:{id:s.saveRequests[0].id,save:true}});assert.equal((await state()).accounts.length,3,'Consent saves confirmed existing login');
 if(existsSync(path.join(data,'login-diagnostics.jsonl')))assert.ok(!readFileSync(path.join(data,'login-diagnostics.jsonl'),'utf8').includes(secret));
 assert.ok(!stderr.includes(secret));console.log(`PASS ${backend}: corrected signup auto-save, pending rejection, username+email, task/time, encrypted storage, local email-only entry, no password in state/diagnostics`);
}finally{
 if(app?.exitCode===null){try{await rpc({op:'testUI',action:'quit'});}catch{}for(let i=0;i<40&&app.exitCode===null;i++)await delay(100);if(app.exitCode===null)app.kill();}
 fixture.close();
}
