const {WebContentsView,session,ipcMain}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {credentialObserver}=require('./credential-observer.cjs');
const {installEditShortcuts}=require('./edit-shortcuts.cjs');

function webURL(value){
 if(value==='about:blank')return value;
 const u=new URL(value);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Use an http:// or https:// URL without embedded credentials.');
 return u.href;
}
class BrowserAdapter {
 constructor({onChange,onPopup,onCredential=()=>{},downloadDir,data}){
  this.onChange=onChange;this.onPopup=onPopup;
  this.onCredential=onCredential;this.credentialViews=new Map();
  this.credentialPreload=path.join(data||downloadDir,'credential-preload.cjs');
  fs.writeFileSync(this.credentialPreload,`const {ipcRenderer}=require('electron');\n(${credentialObserver.toString()})(m=>ipcRenderer.send('spaces:credential-observation',m));`,{mode:0o600});
  this.credentialListener=(event,message)=>{const view=this.credentialViews.get(event.sender.id);if(!view||event.senderFrame!==event.sender.mainFrame)return;this.onCredential(view,event.senderFrame.url,message);};
  ipcMain.on('spaces:credential-observation',this.credentialListener);
  this.session=session.fromPartition('persist:agent-browser');
  this.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  this.session.setPermissionCheckHandler(()=>false);
  this.session.on('will-download',(_event,item)=>{
   item.setSavePath(path.join(downloadDir,`${Date.now()}-${path.basename(item.getFilename())}`));
  });
 }
 async create(url='about:blank'){
  url=webURL(url);
  const view=new WebContentsView({webPreferences:{session:this.session,preload:this.credentialPreload,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,webSecurity:true}});
  view.setBounds({x:0,y:0,width:1200,height:800});
  const wc=view.webContents;
  installEditShortcuts(wc);
  this.credentialViews.set(wc.id,view);
  wc.once('destroyed',()=>this.credentialViews.delete(wc.id));
  wc.setWindowOpenHandler(({url})=>{try{this.onPopup(view,webURL(url));}catch{} return {action:'deny'};});
  wc.on('will-navigate',(event,url)=>{try{webURL(url)}catch{event.preventDefault()}});
  wc.on('will-redirect',(event,url)=>{try{webURL(url)}catch{event.preventDefault()}});
  for(const name of ['did-navigate','did-navigate-in-page','page-title-updated','did-stop-loading','did-start-loading'])wc.on(name,()=>this.onChange());
  try{await wc.loadURL(url)}catch(e){view.initialError=e.message;}
  return view;
 }
 async suspend(view){
  view.manualInput=true;if(view.suspending)return view.suspending;
  const d=view.webContents.debugger;view.suspending=(async()=>{if(d.isAttached()){try{await d.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:false});}finally{if(d.isAttached())d.detach();}}})();
  try{await view.suspending;}finally{view.suspending=null;}
 }
 async resume(view){if(view.suspending)await view.suspending;view.manualInput=false;}
 async command(view,name,args={}){
  if(view.manualInput)throw Error('Human control is active. Wait for the user to resume.');
  const d=view.webContents.debugger;if(!d.isAttached()){d.attach('1.3');await d.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});}
  return d.sendCommand(name,args);
 }
 async script(view,code){const r=await view.webContents.executeJavaScriptInIsolatedWorld(999,[{code:`(()=>{try{return {value:(${code})}}catch(e){return {error:e.message}}})()`}],true);if(r.error)throw Error(r.error);return r.value;}
 async snapshot(view){
  return this.script(view,`(()=>{
   const epoch=crypto.randomUUID(); const refs=new Map(); let n=0;
   function visible(e){const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'}
   const elements=[];const roots=[document];
   for(let r=0;r<roots.length;r++)for(const el of roots[r].querySelectorAll('*')){
    if(el.shadowRoot)roots.push(el.shadowRoot);
    if(elements.length>=250||!visible(el)||!el.matches('a,button,input,textarea,select,[role],[contenteditable="true"],summary'))continue;
    const id=epoch+':'+(++n);refs.set(id,el);
    const label=el.getAttribute('aria-label')||el.labels?.[0]?.innerText||el.getAttribute('placeholder')||el.innerText||el.getAttribute('title')||'';
    const rect=el.getBoundingClientRect();elements.push({ref:id,tag:el.tagName.toLowerCase(),role:el.getAttribute('role'),name:label.trim().slice(0,250),type:el.getAttribute('type'),disabled:!!el.disabled,x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)});
   }
   globalThis.agentSpacesRefs=refs;
   return {url:location.href,title:document.title,text:(document.body?.innerText||'').slice(0,22000),elements,frames:[...document.querySelectorAll('iframe')].map(f=>({title:f.title,src:f.src})),note:'Refs describe this observation only. Refresh after navigation or DOM changes. Cross-origin iframe contents require screenshot coordinates.'};
  })()`);
 }
 async target(view,ref){
  return this.script(view,`(()=>{const e=globalThis.agentSpacesRefs?.get(${JSON.stringify(ref)});if(!e||!e.isConnected)throw Error('Stale element ref. Take another snapshot.');e.scrollIntoView({behavior:'instant',block:'center',inline:'center'});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('Element is hidden');return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 }
 async click(view,{ref,x,y}){
  if(ref){await this.target(view,ref);return this.script(view,`(()=>{const e=globalThis.agentSpacesRefs.get(${JSON.stringify(ref)});if(e.disabled)throw Error('Element is disabled');e.focus();e.click();return {ok:true};})()`);}
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>10000||y>10000)throw Error('Provide a current element ref or valid coordinates.');
  await this.command(view,'Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
  await this.command(view,'Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  return {ok:true};
 }
 async fill(view,{ref,text}){
  await this.target(view,ref);
  await this.script(view,`(()=>{const e=globalThis.agentSpacesRefs.get(${JSON.stringify(ref)});if(!e.matches('input,textarea,[contenteditable="true"]'))throw Error('Target is not editable');e.focus();if(e.select)e.select();else{const s=getSelection(),r=document.createRange();r.selectNodeContents(e);s.removeAllRanges();s.addRange(r)}})()`);
  await this.command(view,'Input.insertText',{text});return {ok:true};
 }
 async key(view,{key}){
  const keys={Enter:13,Tab:9,Escape:27,Backspace:8,Delete:46,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Home:36,End:35,PageUp:33,PageDown:34};
  if(!(key in keys))throw Error('Unsupported key');
  await this.command(view,'Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:keys[key],...(key==='Enter'?{text:'\r'}:{})});
  await this.command(view,'Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:keys[key]});return {ok:true};
 }
 async screenshot(view){const {data}=await this.command(view,'Page.captureScreenshot',{format:'png',captureBeyondViewport:false});return {image:data};}
 async act(view,action,args){
  if(action==='navigate'){await view.webContents.loadURL(webURL(args.url));return this.snapshot(view)}
  if(action==='snapshot')return this.snapshot(view);
  if(action==='screenshot')return this.screenshot(view);
  if(action==='click')return this.click(view,args);
  if(action==='fill')return this.fill(view,args);
  if(action==='type_text'){await this.command(view,'Input.insertText',{text:args.text});return {ok:true};}
  if(action==='key')return this.key(view,args);
  if(action==='scroll'){await this.command(view,'Input.dispatchMouseEvent',{type:'mouseWheel',x:300,y:300,deltaX:0,deltaY:args.deltaY});return {ok:true}}
  throw Error('Unknown browser action');
 }
 close(view){if(!view.webContents.isDestroyed())view.webContents.close();}
 dispose(){ipcMain.removeListener('spaces:credential-observation',this.credentialListener);this.credentialViews.clear();}
}
module.exports={BrowserAdapter,webURL};
