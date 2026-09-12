// In-memory attempts only. Failed/pending attempts never reach disk.
class CredentialCapture {
 constructor({save,onSaved=()=>{},now=Date.now,maxAge=15*60*1000}){this.save=save;this.onSaved=onSaved;this.now=now;this.maxAge=maxAge;this.pending=new Map();}
 forget(id){this.pending.delete(id);}
 sweep(){for(const [id,a] of this.pending)if(this.now()-a.at>this.maxAge)this.forget(id);}
 observe(id,source,message,context={}){
  let origin;try{const u=new URL(source);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))return;origin=u.origin;}catch{return;}
  if(!message||message.version!==1||message.origin!==origin||typeof message.documentId!=='string')return;
  // Verification may finish in another tab (for example a link from webmail).
  // Match one submitted attempt by BOTH site and explicit authenticated identity.
  // Never correlate by a generic logout button or by temporal proximity alone.
  if(message.kind==='authenticated'&&context.parentTabId&&!this.pending.has(id)&&['github-user-login','authenticated-identity'].includes(message.evidence)){
   this.sweep();const norm=s=>String(s||'').trim().toLowerCase();
   const matches=[...this.pending.entries()].filter(([attemptId,a])=>attemptId===context.parentTabId&&a.origin===origin&&a.submitted&&a.password&&
    ((message.username&&a.username&&norm(message.username)===norm(a.username))||(message.email&&a.email&&norm(message.email)===norm(a.email)))&&
    !(message.username&&a.username&&norm(message.username)!==norm(a.username))&&
    !(message.email&&a.email&&norm(message.email)!==norm(a.email)));
   if(matches.length===1)return this.observe(matches[0][0],source,message);
  }
  const key=id;let attempt=this.pending.get(key);
  if(attempt&&(attempt.origin!==origin||this.now()-attempt.at>this.maxAge)){this.forget(key);attempt=null;}
  if(message.kind==='cancelled'){this.forget(key);return;}
  if(message.kind==='rejected'||(message.kind==='form'&&attempt?.documentId!==message.documentId)){if(attempt)attempt.submitted=false;return;}
  if(message.kind==='candidate'){
   if(message.alreadyAuthenticated)return;
   const fields={};for(const name of ['username','email','password'])if(typeof message[name]==='string'&&message[name].length<=(name==='password'?10000:500))fields[name]=name==='password'?message[name]:message[name].trim();
   if(!Object.keys(fields).length)return;
   attempt={...attempt,...fields,origin,at:this.now(),context,documentId:message.documentId,path:message.path,intent:message.intent||'login',submitted:message.submitted===true?true:attempt?.submitted===true};
   // Editing after an attempted submission invalidates the success gate until
   // the revised credentials are submitted again.
   if(message.submitted!==true&&this.pending.has(key)&&Object.entries(fields).some(([k,v])=>this.pending.get(key)[k]!==v))attempt.submitted=false;
   this.pending.set(key,attempt);return;
  }
  if(message.kind!=='authenticated'||!attempt?.submitted||!attempt.password||(!attempt.username&&!attempt.email))return;
  if(!['github-user-login','authenticated-identity','logout-control'].includes(message.evidence))return;
  if(attempt.documentId===message.documentId&&attempt.path===message.path)return;
  const norm=s=>String(s||'').trim().toLowerCase();
  if(message.username&&attempt.username&&norm(message.username)!==norm(attempt.username))return;
  if(message.email&&attempt.email&&norm(message.email)!==norm(attempt.email))return;
  // A generic logout signal is insufficient for new-account creation: require
  // an identity confirmation or the explicit agent-confirmed record tool.
  if(attempt.intent==='signup'&&message.evidence==='logout-control')return;
  const username=message.username||attempt.username||attempt.email;
  const result=this.save({site:origin,username,email:attempt.email||message.email||'',password:attempt.password,status:'created',source:'automatic',captureIntent:attempt.intent,...attempt.context});
  this.forget(key);this.onSaved(result);return result;
 }
}
module.exports={CredentialCapture};
