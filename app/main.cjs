const {selectAccount}=require('./account-selection.cjs');
const {copyAccountField}=require('./account-clipboard.cjs');
const {openPopup,popupInfo}=require('./browser-popup.cjs');
const {installEditShortcuts}=require('./edit-shortcuts.cjs');

const {BrowserHistory}=require('./browser-history.cjs');
const {fillScript,accountMatches}=require('./manual-account-fill.cjs');

const {app,BrowserWindow,screen,BaseWindow,WebContentsView,ipcMain,Menu,Tray,nativeImage,shell,safeStorage,Notification,dialog,clipboard}=require('electron');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const crypto=require('node:crypto');const {z}=require('zod');
const {BrowserAdapter,webURL}=require('./browser-adapter.cjs');const {Workspace}=require('./workspace.cjs');
const {WebView2Adapter}=require('./webview2-adapter.cjs');
const {Accounts}=require('./accounts.cjs');
const {CredentialCapture}=require('./credential-capture.cjs');
let credentialCapture,captureError=null;

const {setup:setupCodex}=require('./codex-setup.cjs');

const {HelpAlerts}=require('./help-alerts.cjs');let helpAlerts;
const {AccountConsent}=require('./account-consent.cjs');

let accountConsent,pendingRename=null;
const root=path.resolve(__dirname,'..');const data=require('../runtime-path.cjs').dataDirectory();
fs.mkdirSync(data,{recursive:true});fs.mkdirSync(path.join(data,'downloads'),{recursive:true});
app.setName('Agent Spaces');if(process.platform==='win32')app.setAppUserModelId('AgentSpaces.Browser');app.setPath('userData',path.join(data,'profile'));
if(!app.requestSingleInstanceLock()){app.quit();return;}
const accountRequests=new Map();let pendingClose=null;let accounts,section='workspace';let win,uiView,workspace,adapter,selected=null,server,tray,quitting=false,emitTimer,collapsed=false;
const settingsFile=path.join(data,'settings.json');let preferences={codexBrowserDefault:true,};try{preferences={...preferences,...JSON.parse(fs.readFileSync(settingsFile,'utf8'))}}catch{}

const backend=process.env.AGENT_SPACES_BACKEND||preferences.browserBackend||(fs.existsSync(path.join(__dirname,'webview2-host/publish/AgentSpaces.WebViewHost.exe'))?'webview2':'electron');
let codexStatus={enabled:preferences.codexBrowserDefault,busy:true,message:'Setting up Codex…'};
let setupRunning=false;
async function configureCodex(enabled){if(setupRunning)return codexStatus;setupRunning=true;codexStatus={...codexStatus,busy:true};emit();try{const result=await setupCodex({root,enabled,});preferences.codexBrowserDefault=enabled;fs.writeFileSync(settingsFile,JSON.stringify(preferences));codexStatus={...result,busy:false};}catch(e){codexStatus={enabled:false,busy:false,error:true,message:e.message};}setupRunning=false;emit();return codexStatus;}
function attentionItems(){if(!workspace)return [];const items=(accountConsent?.list()||[]).map(r=>({id:'save:'+r.id,title:'Save this login?',message:'Choose whether to save your successful login in Accounts.',section:'accounts'}));for(const t of workspace.tabs.values())if(t.owner&&(t.error||(t.needsHuman&&t.paused)))items.push({id:'tab:'+t.id,tabId:t.id,title:t.error?'An agent needs help':'Manual action required',message:t.error?'An action stopped. Open the tab to review it.':'Complete the manual step, then click Return to agent.'});for(const r of accountRequests.values())if(!r.choice&&!r.cancelled&&workspace.tabs.get(r.tabId)?.owner===r.clientId)items.push({id:'account:'+r.id,title:'Choose an account',message:'An agent is waiting for you to select a login.',section:'accounts'});return items;}
let notifiedAttention=new Set();
function openAttention(id){const item=attentionItems().find(a=>a.id===id);if(!item)return;section=item.section||'workspace';if(item.tabId)selected=item.tabId;win.show();if(win.isMinimized())win.restore();win.focus();emit();}
function notifyAttention(){const items=attentionItems();if(process.env.AGENT_SPACES_TEST!=='1'){if(!helpAlerts)helpAlerts=new HelpAlerts({BrowserWindow,screen,ipcMain,onOpen:openAttention});helpAlerts.sync(items,items.filter(item=>!notifiedAttention.has(item.id)));}notifiedAttention=new Set(items.map(a=>a.id));}

let browserHistory;let shellOverlay=false;
function uiState(){const metrics=app.getAppMetrics();return {...workspace.state(),selected,collapsed,codexStatus,popularSites:browserHistory?.popular()||[],section,pendingClose,backend,browserBackend:preferences.browserBackend||backend,pendingRename,saveRequests:accountConsent?.list()||[],attention:attentionItems(),accounts:accounts?.list()||[],accountsError:accounts?.error||captureError,accountRequests:[...accountRequests.values()].filter(r=>!r.choice&&!r.cancelled&&workspace.tabs.get(r.tabId)?.owner===r.clientId).map(({clientId,...r})=>r),metrics:{memoryMB:Math.round(metrics.reduce((n,p)=>n+(p.memory?.workingSetSize||0),0)/1024),cpu:Math.round(metrics.reduce((n,p)=>n+(p.cpu?.percentCPUUsage||0),0)*10)/10,processes:metrics.length}};}
const token=crypto.randomBytes(32).toString('hex');const runtimeFile=path.join(data,'runtime.json');
function emit(){clearTimeout(emitTimer);emitTimer=setTimeout(()=>{if(win&&!win.isDestroyed()&&workspace){notifyAttention();layout();win.webContents.send('spaces:state',uiState());}},60);}
function modalVisible(){return shellOverlay||!!pendingClose||!!pendingRename||!!accountConsent?.list().length;}
function layout(){
 if(!win||!workspace)return;const [w,h]=win.getContentSize();
 for(const t of workspace.tabs.values()){
  const left=collapsed?64:240;
  const bounds={x:left+16,y:116,width:Math.max(300,w-left-332),height:Math.max(300,h-164)};
  if(t.view.native){const visible=!modalVisible()&&section==='workspace'&&selected===t.id&&t.view.webContents.getURL()!=='about:blank'&&!t.error;adapter.layout(t.view,bounds,visible,(!t.owner||t.paused||workspace.paused)&&!t.busy);}else{t.view.setBounds(bounds);t.view.setVisible(true);}
 }
 uiView.setBounds({x:0,y:0,width:w,height:h});win.contentView.addChildView(uiView);
 const t=workspace.tabs.get(selected);
 // Keep browser surfaces rendered behind the shell. Only manual control raises one.
 if(!modalVisible()&&section==='workspace'&&t&&t.view.webContents.getURL()!=='about:blank'&&!t.view.native&&(!t.owner||t.paused||workspace.paused)&&!t.busy&&!t.error)win.contentView.addChildView(t.view);
}
async function attachCreated(owner,url,id){const result=await workspace.create(owner,url,id);const t=workspace.tab(result.tabId);if(!t.view.native){win.contentView.addChildView(t.view);t.view.setVisible(false);}layout();return result;}
const rpcSchema=z.object({op:z.string(),afterPopup:z.number().int().min(0).optional(),timeoutMs:z.number().int().min(0).max(25000).optional(),name:z.string().trim().min(1).max(80).optional(),task:z.string().max(80).optional(),site:z.string().max(2000).optional(),username:z.string().max(500).optional(),email:z.string().max(500).optional(),password:z.string().max(10000).optional(),status:z.enum(['pending','created']).optional(),clientId:z.string().optional(),tabId:z.string().optional(),label:z.string().max(80).optional(),url:z.string().max(10000).optional(),ref:z.string().max(100).optional(),text:z.string().max(100000).optional(),key:z.enum(['Enter','Tab','Escape','Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown']).optional(),x:z.number().min(0).max(10000).optional(),y:z.number().min(0).max(10000).optional(),deltaY:z.number().min(-5000).max(5000).optional()}).strict();
async function rpc(raw){
 const a=rpcSchema.parse(raw);
 if(a.op==='register')return workspace.register(a.label);
 workspace.client(a.clientId);









 if(a.op==='heartbeat')return {ok:true};
 if(a.op==='request_human'||a.op==='wait_for_resume'){
  const owned=()=>{workspace.client(a.clientId);const t=workspace.tab(a.tabId);if(t.owner!==a.clientId)throw Error('You no longer own this tab');return t;};
  let t=owned();if(a.op==='request_human'){t.needsHuman=true;t.paused=true;t.error=null;if(!t.busy)await adapter.suspend(t.view);selected=t.id;section='workspace';workspace.log('Agent waiting for manual help. Click Return to agent when finished.');emit();return {status:'waiting',next:'Call browser_wait_for_resume until resumed. Do not end the task.'};}
  const deadline=Date.now()+25000;while(Date.now()<deadline){t=owned();if(!t.paused&&!workspace.paused&&!t.busy)return {status:'resumed',next:'Take a fresh snapshot or screenshot, then continue the task. Do not replay an old action blindly.'};await new Promise(r=>setTimeout(r,250));}
  return {status:'waiting',next:'Manual control is still active. Call browser_wait_for_resume again. Do not end the task or ask for a chat reply.'};
 }

 if(a.op==='disconnect'){workspace.disconnect(a.clientId);return {ok:true};}
 if(a.op==='list')return workspace.state(a.clientId);
 if(a.op==='wait_for_popup'){
  const until=Date.now()+(a.timeoutMs??10000);
  while(true){
   workspace.client(a.clientId);const t=workspace.tab(a.tabId);
   if(t.owner!==a.clientId)throw Error('You do not own this tab');
   const result=popupInfo(workspace,t,a.clientId,a.afterPopup||0);
   if(result.popups.some(p=>p.status!=='opening')||Date.now()>=until)return result;
   await new Promise(r=>setTimeout(r,100));
  }
 }

 if(a.op==='rename_tab'){const t=workspace.tab(a.tabId);if(t.owner!==a.clientId)throw Error('You do not own this tab');if(t.paused||workspace.paused)throw Error('Human control is active');return workspace.rename(t.id,a.name);}
 if(a.op==='show_tab'){const t=workspace.tab(a.tabId);if(t.owner!==a.clientId)throw Error('You do not own this tab');selected=t.id;section='workspace';emit();return {tabId:t.id,selected:true,paused:t.paused,workspacePaused:workspace.paused};}
 if(a.op==='create'){const r=await attachCreated(a.clientId,webURL(a.url||'about:blank'));workspace.tab(r.tabId).task=a.task||workspace.client(a.clientId).label;return r;}
 if(a.op==='list_accounts'){
  const t=workspace.tab(a.tabId);if(t.owner!==a.clientId)throw Error('You do not own this tab');accounts.check();const site=new URL(webURL(a.site)).origin;
  return {accounts:accounts.list().filter(r=>accountMatches(r.site,site)).map(({username,email,isDefault})=>({username,email:email||'',isDefault:!!isDefault}))};
 }
 if(a.op==='get_account'){
  const t=workspace.tab(a.tabId);if(t.owner!==a.clientId||t.paused||workspace.paused)throw Error('Account access requires your own active tab');accounts.check();const site=new URL(webURL(a.site)).origin;const selection=selectAccount(accounts.list().filter(r=>accountMatches(r.site,site)),a.username);const matches=selection.matches;if(!matches.length)return {status:'not_found',next:'This existing account is not saved. Request human control so the user can log in directly. Use browser_request_human then browser_wait_for_resume. After success the app offers Save to Accounts; never ask for a password in chat.'};
  const prior=accountRequests.get(a.clientId+':'+a.tabId+':'+site+':'+(a.username||'').trim().toLowerCase());if(prior?.cancelled)return {status:'cancelled',next:'Account selection was cancelled. Ask the user before trying another account.'};let chosen=selection.chosen;if(!chosen){const key=a.clientId+':'+a.tabId+':'+site+':'+(a.username||'').trim().toLowerCase();let r=accountRequests.get(key);if(!r){r={id:crypto.randomUUID(),clientId:a.clientId,tabId:a.tabId,site,task:t.task||workspace.client(a.clientId).label,options:matches.map(m=>({id:m.id,username:m.username,email:m.email||'',label:m.label||m.task}))};accountRequests.set(key,r);section='accounts';emit();if(process.env.AGENT_SPACES_TEST!=='1')win.show();}
   if(r.cancelled)return {status:'cancelled',next:'The user cancelled account selection. Do not log in.'};if(!r.choice)return {status:'waiting_for_user',next:'Ask the user to choose in Agent Spaces Accounts. Call browser_wait_for_account, then retry browser_get_account. Do not guess or end the task.'};chosen=matches.find(m=>m.id===r.choice);if(!chosen)throw Error('Selected account is no longer available');}
  return {status:'ready',site:chosen.site,username:chosen.username,email:chosen.email||'',...accounts.reveal(chosen.id)};
 }
 if(a.op==='wait_for_account'){const deadline=Date.now()+25000;while(Date.now()<deadline){const t=workspace.tab(a.tabId);if(t.owner!==a.clientId)throw Error('You no longer own this tab');workspace.client(a.clientId);const pending=[...accountRequests.values()].some(r=>r.clientId===a.clientId&&r.tabId===a.tabId&&!r.choice&&!r.cancelled);if(!pending)return {status:'answered',next:'Call browser_get_account to retrieve the result.'};await new Promise(r=>setTimeout(r,250));}return {status:'waiting_for_user',next:'Call browser_wait_for_account again without ending the task.'};}
 if(a.op==='record_account'){
const t=workspace.tab(a.tabId);if(t.owner!==a.clientId||t.paused||workspace.paused||t.busy)throw Error('Account recording requires your own active, idle tab');if((!a.username&&!a.email)||typeof a.password!=='string'||!a.status)throw Error('Account details and status are required');const site=new URL(webURL(a.site)).origin;const result=accounts.save({site,username:a.username,email:a.email,password:a.password,status:a.status,source:'agent',task:t.task||workspace.client(a.clientId).label,taskId:t.id,sessionId:a.clientId});workspace.log('Account details saved');emit();return result;}
 if(a.op==='claim')return workspace.claim(a.clientId,a.tabId);
 if(a.op==='close'){const result=workspace.close(a.tabId,a.clientId);credentialCapture.forget(a.tabId);return result;}
 if(['navigate','snapshot','screenshot','click','fill','type_text','key','scroll'].includes(a.op)){
  if(a.op==='navigate')webURL(a.url);
  if(a.op==='fill'&&(typeof a.text!=='string'||!a.ref))throw Error('fill requires ref and text');
  if(a.op==='type_text'&&typeof a.text!=='string')throw Error('text is required');
  if(a.op==='key'&&!a.key)throw Error('key is required');
  if(a.op==='scroll'&&a.deltaY===undefined)throw Error('deltaY is required');
  return workspace.act(a.clientId,a.tabId,a.op,a);
 }
 throw Error('Unsupported operation');
}
async function ui(action,a={}){
 if(action==='shellOverlay'){shellOverlay=a.open===true;layout();return;}
 if(action==='browserHistory')return {rows:browserHistory.search({tabId:a.tabId,query:String(a.query||'').slice(0,200)}),file:browserHistory.file};
 if(action==='openHistoryFile'){await shell.openPath(browserHistory.file);return;}
 if(action==='deleteHistory'){if(!a.tabId||workspace.tabs.has(a.tabId))throw Error('Use Delete tab and history for an open tab.');browserHistory.remove(a.tabId);emit();return;}
 if(action==='manualAccounts'){const t=workspace.tab(a.id);if(t.busy||t.owner&&!t.paused&&!workspace.paused)throw Error('Take control first');const origin=new URL(t.view.webContents.getURL()).origin;return {origin,accounts:accounts.list().filter(r=>accountMatches(r.site,origin)).map(({id,site,username,email,isDefault})=>({id,site,username,email,isDefault}))};}
 if(action==='fillSavedAccount'){
  const t=workspace.tab(a.id);if(t.busy||t.owner&&!t.paused&&!workspace.paused)throw Error('Take control first');
  const origin=new URL(t.view.webContents.getURL()).origin;if(origin!==a.origin)throw Error('Page changed. Choose the account again.');
  const record=accounts.list().find(r=>r.id===a.accountId);if(!record||!accountMatches(record.site,origin))throw Error('Account does not match this website');
  t.busy=true;emit();try{const script=fillScript(origin,{...record,...accounts.reveal(record.id)});const result=t.view.native?await adapter.request('manualFill',t.view.id,{script}):await adapter.script(t.view,script);browserHistory.add(t,{action:'saved_login_filled',actor:'human',engine:backend});return result;}catch{throw Error('Could not fill this login. Check the page has one visible login form; cross-origin frames may need manual typing.');}finally{t.busy=false;emit();}
 }







 if(action==='rename'){const t=workspace.tab(a.id);pendingRename={kind:'tab',id:t.id,name:t.customName||t.view.webContents.getTitle()||'New tab'};emit();return;}


 if(action==='cancelRename'){pendingRename=null;emit();return;}
 if(action==='confirmRename'){if(!pendingRename||a.id!==pendingRename.id)throw Error('Rename request expired');workspace.rename(a.id,a.name);pendingRename=null;emit();return;}
 if(action==='accountSaveConsent'){const result=accountConsent.answer(a.id,a.save===true);emit();return result;}


 if(action==='state')return uiState();
 if(action==='testBrowserFeatures'&&process.env.AGENT_SPACES_TEST==='1')return uiView.webContents.executeJavaScript("({blankVisible:!document.getElementById('tabStart').hidden,sites:document.querySelectorAll('#tabSites button').length,fillDisabled:document.getElementById('savedLogins').disabled,settingsContainsConnection:!!document.querySelector('#settingsDialog #codexToggle'),pauseInfo:document.getElementById('pauseInfoDialog').textContent})");

 if(action==='testShellPanel'&&process.env.AGENT_SPACES_TEST==='1'){if(!['settings','settingsCancel','accountsNav','engineInfo','pauseInfo','pauseInfoClose','tabHistory','historyNav','savedLogins'].includes(a.id))throw Error('Unknown fixture panel');await uiView.webContents.executeJavaScript('document.getElementById('+JSON.stringify(a.id)+').click()');return {ok:true};}
 if(action==='testAccountForm'&&process.env.AGENT_SPACES_TEST==='1')return uiView.webContents.executeJavaScript(`(()=>{const values=${JSON.stringify({accountSite:a.site||'',accountUsername:a.username||'',accountEmail:a.email||'',accountPassword:a.password||'',accountLabel:a.label||''})};for(const [id,value] of Object.entries(values))document.getElementById(id).value=value;const form=document.getElementById('accountForm');const valid=form.checkValidity();if(valid)form.requestSubmit(form.querySelector('button[type=submit]'));return {valid};})()`);
 if(action==='debuggerStatus'&&process.env.AGENT_SPACES_TEST==='1'){const v=workspace.tab(a.id).view;return v.native?adapter.request('debuggerStatus',v.id):{attached:v.webContents.debugger.isAttached(),manual:!!v.manualInput};}
 if(action==='previewStatus'&&process.env.AGENT_SPACES_TEST==='1')return uiView.webContents.executeJavaScript("({width:document.getElementById('preview').naturalWidth,error:document.getElementById('previewError').textContent})");
 if(action==='openAttention'){openAttention(a.id);return;}

 if(action==='setBackend'){if(!['electron','webview2'].includes(a.backend))throw Error('Unknown browser engine');if(a.backend==='webview2'&&process.platform!=='win32')throw Error('WebView2 requires Windows');preferences.browserBackend=a.backend;fs.writeFileSync(settingsFile,JSON.stringify(preferences));emit();return {message:'Browser engine saved. Quit and reopen Agent Spaces to apply. Existing profiles are retained.'};}
 if(action==='accounts'){section='accounts';emit();return;}
 if(action==='saveAccount'){const v=z.object({site:z.string().max(2000),username:z.string().trim().max(500).optional(),email:z.string().trim().max(500).optional(),password:z.string().min(1).max(10000),label:z.string().max(80)}).parse(a);const result=accounts.save({...v,site:new URL(webURL(v.site)).origin,status:'created',source:'manual',task:v.label||'Added manually',taskId:'manual'});emit();return result;}
 if(action==='chooseAccount'){const r=[...accountRequests.values()].find(r=>r.id===a.id);if(!r||workspace.tabs.get(r.tabId)?.owner!==r.clientId)throw Error('Account request expired');if(a.accountId===null)r.cancelled=true;else{if(!r.options.some(o=>o.id===a.accountId))throw Error('Invalid account choice');r.choice=a.accountId;}emit();return {ok:true};}
 if(action==='setDefaultAccount'){const result=accounts.setDefault(a.id,a.enabled!==false);const account=accounts.list().find(r=>r.id===a.id);if(a.enabled!==false)for(const r of accountRequests.values())if(accountMatches(r.site,account.site)&&r.options.some(o=>o.id===a.id)){r.choice=a.id;r.cancelled=false;}emit();return result;}
 if(action==='deleteAccount'){const account=accounts.list().find(r=>r.id===a.id);if(!account)throw Error('Account not found');pendingClose={kind:'account',id:account.id,title:account.username+' · '+account.site};emit();return;}
 if(action==='revealAccount')return accounts.reveal(a.id);
 if(action==='copyAccountField')return copyAccountField(accounts,clipboard,a);
 if(action==='codexSetup'){if(process.env.AGENT_SPACES_TEST==='1')throw Error('Setup is disabled in test profiles');return configureCodex(a.enabled!==false);}
 if(action==='collapse'){collapsed=!collapsed;emit();return;}
 if(action==='new'){section='workspace';const r=await attachCreated(null,a.url?webURL(a.url):'about:blank');selected=r.tabId;emit();return r;}
 if(action==='select'){section='workspace';if(a.id)workspace.tab(a.id);selected=a.id||null;emit();return;}
 if(action==='pauseAll'){workspace.paused=!workspace.paused;preferences.browserPaused=workspace.paused;fs.writeFileSync(settingsFile,JSON.stringify(preferences));for(const t of workspace.tabs.values()){if(workspace.paused&&!t.busy)await adapter.suspend(t.view);else if(!workspace.paused&&!t.paused)await adapter.resume(t.view);}workspace.log(workspace.paused?'All agent tools paused':'Agent tools resumed');return;}
 if(action==='control'){const t=workspace.tab(a.id);browserHistory.add(t,{action:'control',engine:backend,actor:'human'});if(t.error){t.error=null;t.paused=true;}else t.paused=!t.paused;if(t.paused&&!t.busy)await adapter.suspend(t.view);else if(!t.paused&&!workspace.paused)await adapter.resume(t.view);workspace.log(t.paused?'Manual control requested':'Agent input resumed');return;}
 if(action==='approve'){const t=workspace.tab(a.id);browserHistory.add(t,{action:'approve',engine:backend,actor:'human'});t.error=null;t.paused=false;if(!workspace.paused)await adapter.resume(t.view);workspace.log('Agent input approved');return;}
 if(action==='halt'){const t=workspace.tab(a.id);browserHistory.add(t,{action:'halt',engine:backend,actor:'human'});t.error=null;t.paused=true;if(!t.busy)await adapter.suspend(t.view);workspace.log('Agent input halted');return;}
 if(action==='release'){const t=workspace.tab(a.id);browserHistory.add(t,{action:'release',engine:backend,actor:'human'});if(t.busy)throw Error('Wait for the current action to finish');t.owner=null;t.paused=false;emit();return;}
 if(action==='close'){const t=workspace.tab(a.id);if(t.busy)throw Error('Wait for the current action to finish before deleting this tab.');pendingClose={id:t.id,title:t.view.webContents.getTitle()||'New tab'};emit();return;}
 if(action==='cancelClose'){pendingClose=null;emit();return;}
 if(action==='confirmClose'){if(!pendingClose||pendingClose.id!==a.id)throw Error('Open the delete confirmation first.');if(pendingClose.kind==='account'){accounts.delete(a.id);for(const r of accountRequests.values())if(r.options.some(o=>o.id===a.id)){r.options=r.options.filter(o=>o.id!==a.id);r.choice=null;r.cancelled=true;}}else{if(workspace.tabs.has(a.id)){workspace.close(a.id);credentialCapture.forget(a.id);if(a.deleteHistory===true)browserHistory.remove(a.id);}if(selected===a.id)selected=null;}pendingClose=null;emit();return {deleted:true};}
 if(action==='preview'){
  const t=workspace.tab(a.id);
  // CDP captures a background agent tab reliably even while the shell covers it.
  // Never attach a debugger while the user has manual control.
  if(!t.view.native&&t.owner&&!t.paused&&!workspace.paused)return adapter.screenshot(t.view);
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
   try{const capture=await t.view.webContents.capturePage();if(capture.isEmpty())throw Error('The browser has not produced a frame yet.');return {image:capture.toPNG().toString('base64')};}
   catch(e){lastError=e;if(attempt<2)await new Promise(r=>setTimeout(r,100));}
  }
  throw lastError;
 }
 if(action==='navigate'||action==='back'||action==='forward'||action==='reload'){
  const t=workspace.tab(a.id);if(t.busy||(t.owner&&!t.paused&&!workspace.paused))throw Error('Take control of this tab first');
  if(action==='navigate')await t.view.webContents.loadURL(webURL(a.url));
  if(action==='reload')t.view.webContents.reload();
  if(action==='back'&&t.view.webContents.navigationHistory.canGoBack())t.view.webContents.navigationHistory.goBack();
  if(action==='forward'&&t.view.webContents.navigationHistory.canGoForward())t.view.webContents.navigationHistory.goForward();
  return;
 }
 if(action==='downloads'){await shell.openPath(path.join(data,'downloads'));return;}
 if(action==='help'){section='workspace';selected=null;emit();return;}
 if(action==='quit'){setTimeout(()=>app.quit(),50);return;}
 throw Error('Unknown UI action');
}
app.on('second-instance',()=>{win?.show();win?.focus();});
app.whenReady().then(async()=>{
 Menu.setApplicationMenu(null);
 if(process.platform!=='win32')throw Error('This beta requires Windows.');
 if(process.env.AGENT_SPACES_TEST!=='1')fs.writeFileSync(path.join(data,'launch.json'),JSON.stringify({executable:process.execPath,args:app.isPackaged?[]:[root],root}));

 accounts=new Accounts(path.join(data,'accounts.enc'),safeStorage);
 accountConsent=new AccountConsent({accounts,onChange:emit});


 credentialCapture=new CredentialCapture({save:value=>accountConsent.confirmed(value),onSaved:result=>{captureError=null;workspace.log(result?.saved?'Confirmed login saved in Accounts':'Confirmed login is waiting for your save choice');emit();}});
 win=new BaseWindow({icon:nativeImage.createFromPath(path.join(__dirname,'assets','agent-spaces.png')),width:1440,height:900,minWidth:1100,minHeight:650,title:'Agent Spaces',backgroundColor:'#1E1E20',show:false});
 win.setIcon(nativeImage.createFromPath(path.join(__dirname,'assets','agent-spaces.png')));
 if(process.platform==='win32')win.setAppDetails({appId:'AgentSpaces.Browser',appIconPath:path.join(__dirname,'assets','agent-spaces-workspace.ico'),appIconIndex:0,relaunchCommand:'"'+process.execPath+'"'+(app.isPackaged?'':' "'+root+'"') ,relaunchDisplayName:'Agent Spaces'});
 uiView=new WebContentsView({webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.contentView.addChildView(uiView);win.webContents=uiView.webContents;
 installEditShortcuts(uiView.webContents);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 adapter=new (backend==='webview2'?WebView2Adapter:BrowserAdapter)({data,parent:win,downloadDir:path.join(data,'downloads'),onCredential:(view,source,message)=>{
   const t=[...workspace?.tabs.values()||[]].find(t=>t.view===view);if(!t)return;
   try{credentialCapture.observe(t.id,source,message,{parentTabId:t.parentTabId||null,task:t.task||workspace.clients.get(t.owner)?.label||'Manual browser session',taskId:t.id,sessionId:t.owner||null,agentCreated:!!t.owner&&!t.paused&&!workspace.paused});}
   catch{captureError='A confirmed login could not be saved. Check Accounts or add it using the local form.';emit();}
  },onChange:()=>{if(workspace){try{workspace.save()}catch{}emit()}},onPopup:(view,url)=>{const parent=[...workspace.tabs.values()].find(t=>t.view===view);openPopup({workspace,parent,url,create:attachCreated,isParentVisible:()=>section==='workspace'&&selected===parent?.id,show:id=>{selected=id;}}).then(()=>emit()).catch(e=>workspace.log(e.message));}});

 browserHistory=new BrowserHistory(path.join(data,'browser-history.json'));
 workspace=new Workspace(adapter,{file:path.join(data,'tabs.json'),onChange:emit,history:browserHistory,engine:backend});workspace.paused=preferences.browserPaused===true;
 ipcMain.handle('spaces:ui',async(event,action,args)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Untrusted UI caller');return ui(action,args)});
 server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.headers.host!==`127.0.0.1:${server.address().port}`||req.headers.origin||req.headers.authorization!==`Bearer ${token}`){res.writeHead(403);res.end(JSON.stringify({error:'Forbidden'}));return;}
  if(req.method!=='POST'||req.url!=='/rpc'){res.writeHead(404);res.end('{}');return;}
  let body='';try{
   for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1200000)throw Error('Request too large');}
   const input=JSON.parse(body);
   let result;
   if(process.env.AGENT_SPACES_TEST==='1'&&input.op==='testUI')result=await ui(input.action,input.args);
   else if(process.env.AGENT_SPACES_TEST==='1'&&input.op==='testWorkspaceLayout')result=await uiView.webContents.executeJavaScript("({browserHidden:document.getElementById('browserChildren').hidden,desktopPresent:!!document.getElementById('desktopNav'),inspectorVisible:getComputedStyle(document.querySelector('.inspector')).display!=='none'})");
   else if(process.env.AGENT_SPACES_TEST==='1'&&input.op==='testCapture')result=await adapter.screenshot(uiView);
   else result=await rpc(input);
   res.end(JSON.stringify({result:result??null}));
  }catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const pixels=Buffer.alloc(32*32*4);const line=(x,y,w,h)=>{for(let a=x;a<x+w;a++)for(let b=y;b<y+h;b++){const i=(b*32+a)*4;pixels[i]=220;pixels[i+1]=220;pixels[i+2]=224;pixels[i+3]=255;}};for(const x of [2,19]){line(x,8,11,2);line(x,19,11,2);line(x,8,2,13);line(x+9,8,2,13);line(x+5,21,2,3);line(x+2,24,8,2);}line(15,4,1,24);
 tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'assets','agent-spaces-workspace.ico')));tray.setToolTip('Agent Spaces. Browser workspace');
 tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Agent Spaces',click:()=>{win.show();win.focus();}},{label:'Quit Agent Spaces',click:()=>app.quit()}]));tray.on('double-click',()=>win.show());
 win.on('focus',()=>win.flashFrame(false));
 win.on('resize',()=>{layout();emit()});win.on('close',event=>{if(!quitting){event.preventDefault();win.hide();}});
 await win.webContents.loadFile(path.join(__dirname,'ui','index.html'));if(process.env.AGENT_SPACES_TEST!=='1')win.show();else if(process.env.AGENT_SPACES_RENDER_TEST==='1'){// Hosted CI needs an on-screen surface; local tests stay off the user's desktop.
 if(process.env.CI==='true')win.setPosition(0,0);else win.setPosition(-20000,-20000);win.showInactive();}
 await workspace.restore();for(const t of workspace.tabs.values()){if(!t.view.native){win.contentView.addChildView(t.view);t.view.setVisible(false);}}emit();
 fs.writeFileSync(runtimeFile,JSON.stringify({port:server.address().port,token,pid:process.pid}),{mode:0o600});
 setInterval(()=>{workspace.expire();credentialCapture.sweep();},15000).unref();
 setInterval(emit,3000).unref();
 if(process.env.AGENT_SPACES_TEST!=='1')configureCodex(preferences.codexBrowserDefault);else codexStatus={enabled:false,busy:false,message:'Test profile. Codex settings unchanged.'};
}).catch(e=>{console.error(e);app.quit();});
app.on('before-quit',()=>{quitting=true;try{workspace?.save();helpAlerts?.close();server?.close();adapter?.dispose?.();fs.unlinkSync(runtimeFile)}catch{}});
