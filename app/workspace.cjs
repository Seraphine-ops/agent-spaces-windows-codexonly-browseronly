const {popupInfo}=require('./browser-popup.cjs');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');

// Resource ownership and lifecycle live here; browser automation is an adapter.
// A future desktop adapter can implement an exclusive whole-desktop lease.
class Workspace{
 constructor(adapter,{file,onChange,history,engine}){this.adapter=adapter;this.history=history;this.engine=engine;this.file=file;this.onChange=onChange;this.tabs=new Map();this.clients=new Map();this.events=[];this.paused=false;}
 log(message,level='info'){this.events.push({id:randomUUID(),at:Date.now(),message,level});if(this.events.length>12000)this.events.splice(0,this.events.length-12000);this.changed();}
 changed(){this.onChange?.();}
 save(){for(const t of this.tabs.values()){const url=t.view.webContents.getURL();if(t.historyURL!==url){t.historyURL=url;if(url!=='about:blank')this.history?.add(t,{action:'visited',engine:this.engine,actor:this.restoring?'system':t.owner?'agent':'human',url});}}fs.writeFileSync(this.file,JSON.stringify([...this.tabs.values()].map(t=>({id:t.id,url:t.view.webContents.getURL(),title:t.title,customName:t.customName||null,task:t.task||null})),null,2));}
 async restore(){this.restoring=true;let saved=[];try{saved=JSON.parse(fs.readFileSync(this.file,'utf8'))}catch{} for(const t of saved.slice(0,16)){try{await this.create(null,t.url,t.id);const restored=this.tab(t.id);restored.customName=t.customName||null;restored.task=t.task||null}catch{}}this.restoring=false;this.save();}
 register(label){const id=randomUUID();this.clients.set(id,{id,label:String(label||'Codex agent').slice(0,80),lastSeen:Date.now()});this.log('Agent connected');return {clientId:id,capabilities:{browser:true,desktop:false}};}
 client(id){const c=this.clients.get(id);if(!c)throw Error('Agent session expired. Reconnect.');c.lastSeen=Date.now();return c;}
 expire(){for(const [id,c] of this.clients)if(Date.now()-c.lastSeen>60000&&![...this.tabs.values()].some(t=>t.owner===id&&t.busy))this.disconnect(id);}
 disconnect(id){this.clients.delete(id);for(const t of this.tabs.values())if(t.owner===id){t.owner=null;t.paused=false;}this.changed();}
 async create(owner,url='about:blank',id=randomUUID()){
  if(owner)this.client(owner);if(this.paused&&owner)throw Error('Browser agents are paused across Agent Spaces, including new tasks. Click Resume browser agents in AS. Closing tabs or restarting AS does not clear this pause.');if(this.tabs.size>=24)throw Error('Workspace tab limit reached (24). Close a tab first.');
  const view=await this.adapter.create(url);const t={id,view,owner,paused:!!view.initialError,error:view.initialError||null,busy:false,title:'New tab'};this.tabs.set(id,t);this.history?.add(t,{action:this.restoring?'restored':'opened',engine:this.engine,actor:this.restoring?'system':owner?'agent':'human'});this.save();this.log(view.initialError|| (owner?'Agent opened a tab':'Tab opened'),view.initialError?'error':'info');return {tabId:id,...(view.initialError?{error:view.initialError}:{})};
 }
 rename(id,name){const t=this.tab(id);name=String(name||'').trim();if(!name||name.length>80)throw Error('Use a name between 1 and 80 characters');t.customName=name;this.save();this.changed();return {ok:true};}
 tab(id){const t=this.tabs.get(id);if(!t)throw Error('Tab not found');return t;}
 claim(clientId,tabId){this.client(clientId);const t=this.tab(tabId);if(t.owner&&t.owner!==clientId)throw Error('This tab belongs to another agent. Create your own tab.');if(t.paused||t.busy||this.paused)throw Error('Tab is paused or busy');t.owner=clientId;this.changed();return {tabId};}
 async act(clientId,tabId,action,args={}){
  this.client(clientId);const t=this.tab(tabId);
  if(t.owner!==clientId)throw Error('You do not own this tab. Claim an available tab or create your own.');
  if(this.paused)throw Error('Browser agents are paused across Agent Spaces. Click Resume browser agents in AS; new tasks are paused too.');if(t.paused)throw Error('Human control is active. Wait for the user to resume.');
  if(t.busy)throw Error('An action is already running on this tab. Wait for it to finish.');
  t.busy=true;t.currentActionId=randomUUID();t.action=action;t.error=null;const started=Date.now();this.history?.add(t,{action,outcome:'started',engine:this.engine});this.log(`${this.clients.get(clientId)?.label||'Agent'}: executing ${action}`);
  try{await this.adapter.resume(t.view);const r=await this.adapter.act(t.view,action,args);this.history?.add(t,{action,engine:this.engine});this.log(`${action}: completed in ${Date.now()-started} ms`,'complete');return {...r,actionId:t.currentActionId,...popupInfo(this,t,clientId)};}
  catch(e){this.history?.add(t,{action,outcome:'failed',engine:this.engine});t.error=e.message;t.paused=true;this.log(`${action}: ${e.message}`,'error');throw e;}
  finally{try{if(t.paused||this.paused)await this.adapter.suspend(t.view);}finally{t.busy=false;t.action=null;t.currentActionId=null;this.save();this.changed();}}
 }
 close(id,clientId=null){const t=this.tab(id);if(t.busy)throw Error('Wait for the current action to finish.');if(clientId&&(t.owner!==clientId||t.paused||this.paused))throw Error('Cannot close an unowned or paused tab');this.history?.add(t,{action:'closed',engine:this.engine,actor:clientId?'agent':'human'});this.adapter.close(t.view);this.tabs.delete(id);this.save();this.changed();return {ok:true};}
 state(clientId=null){return {paused:this.paused,clients:[...this.clients.values()].map(c=>({id:c.id,label:c.label})),tabs:[...this.tabs.values()].map(t=>({id:t.id,parentTabId:t.parentTabId||null,...(clientId&&t.owner===clientId?popupInfo(this,t,clientId):{}),title:t.customName||t.view.webContents.getTitle()||'New tab',task:t.task||null,url:t.view.webContents.getURL(),owner:t.owner,ownerLabel:this.clients.get(t.owner)?.label||null,paused:t.paused,busy:t.busy,action:t.action||null,error:t.error||null,loading:t.view.webContents.isLoading(),ownedByYou:clientId?t.owner===clientId:false})),events:this.events,capabilities:{browser:true,desktop:false}};}
}
module.exports={Workspace};
