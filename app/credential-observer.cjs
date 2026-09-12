// Executed inside a browser document. Credentials travel only to the local
// runtime; never console, page storage, snapshots, diagnostics or the tool API.
function credentialObserver(send) {
 if (window.top !== window || !/^https?:$/.test(location.protocol)) return;
 const visible=e=>!!e&&!!(e.getBoundingClientRect().width&&e.getBoundingClientRect().height)&&getComputedStyle(e).visibility!=='hidden';
 const value=e=>String(e?.value||'').slice(0,10000);
 const inputs=()=>[...document.querySelectorAll('input')].slice(0,150);
 const kind=e=>{
  if(e?.tagName!=='INPUT')return null;
  const name=[e.name,e.id,e.autocomplete,e.getAttribute('aria-label'),e.placeholder].join(' ').toLowerCase();
  if(/one.?time|otp|verification|security.?code|passcode/.test(name))return null;
  if(e.type==='password')return /confirm|repeat/.test(name)?'confirmation':'password';
  if(e.type==='email'||/\bemail\b|e-mail/.test(name))return 'email';
  if(/username|user_name|user-login|user_login|login_field|\blogin\b|\bhandle\b/.test(name)||e.autocomplete==='username')return 'username';
  return null;
 };
 const hasLogout=()=>[...document.querySelectorAll('a[href],form[action],button')].some(e=>{
  const link=e.getAttribute('href')||e.getAttribute('action')||'';
  return /(?:^|\/)(?:logout|log_out|signout|sign_out)(?:[/?#]|$)/i.test(link)||(/^(sign out|log out)$/i.test((e.innerText||'').trim())&&visible(e));
 });
 const auth=()=>{
  if(document.querySelector('input[type=password]')&&[...document.querySelectorAll('input[type=password]')].some(visible))return null;
  if(/verify (?:your )?(?:email|account)|check your (?:email|inbox)|verification (?:code|email)|confirm your email|enter the code|complete (?:your )?verification/i.test((document.body?.innerText||'').slice(0,16000)))return null;
  if(/\/(?:login|log-in|signin|sign-in|signup|sign-up|join|register|verify|verification|mfa|two-factor|sessions\/two-factor)(?:[/?#-]|$)/i.test(location.pathname))return null;
  const login=document.querySelector('meta[name="user-login"]')?.content?.trim();
  if(location.origin==='https://github.com'&&login&&/^[a-z\d-]{1,39}$/i.test(login))return {username:login,evidence:'github-user-login'};
  if(!hasLogout())return null;
  const identity=document.querySelector('meta[name="user-login"],meta[name="username"],meta[name="user-email"],[data-current-user-login],[data-current-user-email]');
  if(identity){const id=identity.content||identity.getAttribute('data-current-user-login')||identity.getAttribute('data-current-user-email');if(id)return {...(id.includes('@')?{email:id}:{username:id}),evidence:'authenticated-identity'};}
  return {evidence:'logout-control'};
 };
 const emit=payload=>{try{send({version:1,origin:location.origin,path:location.pathname,documentId,...payload});}catch{}};
 const documentId=crypto.randomUUID();let last='',timer;
 function capture(submitted=false,target=null){
  const all=inputs(),passwords=all.filter(e=>kind(e)==='password'&&value(e));
  if(passwords.length>1||/\/(?:settings|password-reset|password_reset|reset-password|reset_password|forgot|recover|password\/reset|account\/password)(?:\/|$)/i.test(location.pathname))return;
  const password=passwords[0];const scope=password?.form||target?.form||null;
  const fields=all.filter(e=>(!scope||e.form===scope)&&!e.disabled);
  const row={};for(const name of ['username','email','password']){
   const matches=fields.filter(e=>kind(e)===name);
   if(matches.length===1)row[name]=value(matches[0]);
  }
  if(row.username?.includes('@')&&!row.email){row.email=row.username;row.username='';}
  if(!Object.keys(row).length)return;
  const confirmation=fields.find(e=>kind(e)==='confirmation'&&value(e));
  if(confirmation&&row.password!==value(confirmation))return;
  const signature=JSON.stringify(row)+submitted;
  if(signature===last&&!submitted)return;last=signature;
  emit({kind:'candidate',...row,submitted,alreadyAuthenticated:hasLogout(),intent:password?.autocomplete==='new-password'||/signup|sign-up|join|register/.test(location.pathname)?'signup':'login'});
 }
 function check(){
  const text=(document.body?.innerText||'').slice(0,16000);
  if(/(?:incorrect|invalid|wrong) (?:username|email|password|credentials)|(?:username|email).{0,35}(?:already taken|already exists|unavailable)|authentication failed/i.test(text)){emit({kind:'rejected'});return;}
  const found=auth();if(found)emit({kind:'authenticated',...found});
 }
 document.addEventListener('input',e=>{if(kind(e.target))capture(false,e.target);},true);
 document.addEventListener('change',e=>{if(kind(e.target))capture(false,e.target);},true);
 document.addEventListener('submit',e=>capture(true,e.target),true);
 document.addEventListener('keydown',e=>{if(e.key==='Enter'&&kind(e.target))capture(true,e.target);},true);
 document.addEventListener('click',e=>{const b=e.target.closest?.('button,input[type=submit],a,[role=button]');if(!b)return;
  const text=(b.innerText||b.value||b.getAttribute('aria-label')||'').trim();
  if(/(?:continue|sign ?in|sign ?up|log ?in) with (?:google|apple|github|microsoft|facebook|sso)/i.test(text)){emit({kind:'cancelled'});return;}
  if(b.type==='submit'||/^(?:sign ?in|log ?in|sign ?up|create (?:an? )?account|join|register|continue|next|verify)(?:\b|$)/i.test(text))capture(true,b);
 },true);
 const start=()=>{if(inputs().some(e=>kind(e)==='password'&&visible(e)))emit({kind:'form'});check();new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(check,350);}).observe(document.documentElement,{childList:true,subtree:true});setInterval(check,1500);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
module.exports={credentialObserver};
