const {spawn}=require('node:child_process');const path=require('node:path');const {randomUUID}=require('node:crypto');const readline=require('node:readline');const {nativeImage}=require('electron');const {BrowserAdapter,webURL}=require('./browser-adapter.cjs');
const {credentialObserver}=require('./credential-observer.cjs');
class WebView2Adapter {
 constructor({onChange,onPopup,onCredential=()=>{},downloadDir,data,parent}){
  this.onChange=onChange;this.onPopup=onPopup;this.views=new Map();this.pending=new Map();this.sequence=0;
  const exe=process.env.AGENT_SPACES_WEBVIEW2_EXE||path.join(__dirname,'webview2-host','publish','AgentSpaces.WebViewHost.exe');
  const handle=parent.getNativeWindowHandle();const hwnd=handle.length===8?handle.readBigUInt64LE().toString():String(handle.readUInt32LE());
  this.child=spawn(exe,[hwnd,path.join(data,'webview2-profile'),downloadDir],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
  this.ready.catch(()=>{});
  this.child.on('error',e=>this.fail(e));this.child.on('exit',()=>this.fail(Error('WebView2 browser host stopped. Restart Agent Spaces.')));
  this.child.stderr.on('data',()=>{});
  readline.createInterface({input:this.child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line)}catch{return;}
   if(m.ready){this.resolveReady();return;}if(m.fatal){this.fail(Error(m.fatal));return;}
   if(m.change){const v=this.views.get(m.change.id);if(v){Object.assign(v.meta,m.change);this.onChange();}return;}
   if(m.popup){const v=this.views.get(m.popup.id);if(v)this.onPopup(v,m.popup.url);return;}
   if(m.credential){const v=this.views.get(m.credential.id);if(v)onCredential(v,m.credential.source,m.credential.observation);return;}
   const p=this.pending.get(m.requestId);if(p){clearTimeout(p.timer);this.pending.delete(m.requestId);m.error?p.reject(Error(m.error)):p.resolve(m.result);}
  });
 }
 fail(error){this.failure=error;this.rejectReady(error);for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();for(const v of this.views.values()){v.initialError=error.message;v.meta.loading=false;}this.onChange();}
 async request(op,id,args={}){if(this.failure)throw this.failure;await this.ready;return new Promise((resolve,reject)=>{const requestId=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(requestId);reject(Error('WebView2 operation timed out'));},55000);this.pending.set(requestId,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({...args,op,id,requestId})+'\n',e=>{if(e){clearTimeout(timer);this.pending.delete(requestId);reject(e);}});});}
 async create(url='about:blank'){
  url=webURL(url);const id=randomUUID();const v={native:true,id,meta:{url,title:'New tab',loading:true},manualInput:false,destroyed:false,setBounds(){},setVisible(){}};this.views.set(id,v);
  const run=(op,args={})=>this.request(op,id,args);const fire=op=>run(op).catch(e=>{v.initialError=e.message;this.onChange();});
  v.webContents={getURL:()=>v.meta.url,getTitle:()=>v.meta.title,isLoading:()=>v.meta.loading,isDestroyed:()=>v.destroyed,loadURL:async url=>{Object.assign(v.meta,await run('loadURL',{url:webURL(url)}));},reload:()=>fire('reload'),navigationHistory:{canGoBack:()=>v.meta.back,canGoForward:()=>v.meta.forward,goBack:()=>fire('back'),goForward:()=>fire('forward')},capturePage:async()=>nativeImage.createFromBuffer(Buffer.from((await run('preview')).image,'base64'))};
  const credentialScript=`(${credentialObserver.toString()})(m=>chrome.webview.postMessage({agentSpacesCredential:m}));`;
  try{Object.assign(v.meta,await run('create',{url,credentialScript}));v.initialError=v.meta.error;return v;}catch(e){this.views.delete(id);throw e;}
 }
 async suspend(v){v.manualInput=true;await this.request('suspend',v.id);}
 async resume(v){await this.request('resume',v.id);v.manualInput=false;}
 async screenshot(v){if(!v.native){const capture=await v.webContents.capturePage();return {image:capture.toPNG().toString('base64')};}return this.request('screenshot',v.id);}
 async act(v,op,args){const script=await BrowserAdapter.prototype.snapshot.call({script:(_v,code)=>code},null);return this.request(op,v.id,{...args,...(op==='snapshot'?{script}:op==='navigate'?{snapshotScript:script}:{} )});}
 layout(v,bounds,visible,interactive){const values={...bounds,visible,interactive};const key=JSON.stringify(values);if(v.layoutKey===key)return;v.layoutKey=key;this.request('layout',v.id,values).catch(e=>{v.layoutKey=null;v.initialError=e.message;});}
 close(v){v.destroyed=true;this.views.delete(v.id);this.request('close',v.id).catch(()=>{});}
 dispose(){this.child.stdin.end();}
}
module.exports={WebView2Adapter};
