const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Workspace}=require('../app/workspace.cjs');const {AccountConsent}=require('../app/account-consent.cjs');
test('custom tab names and task metadata survive page titles and restart',async()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'spaces-names-')),'tabs.json');
 const adapter={create:async url=>({webContents:{getURL:()=>url,getTitle:()=> 'Page changes its title',isLoading:()=>false}})};
 const w=new Workspace(adapter,{file});const t=await w.create(null,'https://example.test');w.tab(t.tabId).task='Task';w.rename(t.tabId,'My research');assert.equal(w.state().tabs[0].title,'My research');
 const restored=new Workspace(adapter,{file});await restored.restore();assert.equal(restored.state().tabs[0].title,'My research');assert.equal(restored.state().tabs[0].task,'Task');
});

test('unknown existing credentials require consent, decline forgets, known and agent-created save',()=>{
 let rows=[],saved=[];let now=0;const accounts={list:()=>rows,save:v=>{saved.push(v);return {saved:true};}};
 const q=new AccountConsent({accounts,now:()=>now});const v={site:'https://example.test',username:'person',password:'PRIVATE',captureIntent:'login'};
 assert.deepEqual(q.confirmed(v),{pendingConsent:true});assert.equal(saved.length,0);assert.ok(!JSON.stringify(q.list()).includes('PRIVATE'));q.answer(q.list()[0].id,false);assert.equal(saved.length,0);assert.equal(q.pending.size,0);
 q.confirmed(v);q.answer(q.list()[0].id,true);assert.equal(saved.length,1);
 rows=[{site:v.site,username:v.username}];q.confirmed(v);assert.equal(saved.length,2);
 rows=[];q.confirmed({...v,captureIntent:'signup',agentCreated:true});assert.equal(saved.length,3);
 q.confirmed({...v,captureIntent:'signup',agentCreated:false});assert.equal(saved.length,3);now=16*60*1000;assert.equal(q.list().length,0);
});

test('matching email alone cannot silently approve a different saved username',()=>{
 const accounts={list:()=>[{site:'https://example.test',username:'first',email:'same@example.test'}],save:()=>{throw Error('Unexpected save');}};
 const q=new AccountConsent({accounts});assert.equal(q.confirmed({site:'https://example.test',username:'second',email:'same@example.test',password:'synthetic',captureIntent:'login'}).pendingConsent,true);
});
