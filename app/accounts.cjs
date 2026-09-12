const {accountMatches}=require('./site-identity.cjs');
const fs=require('node:fs');const {randomUUID}=require('node:crypto');
class Accounts {
 constructor(file,storage){this.file=file;this.storage=storage;this.rows=[];this.error=null;try{if(fs.existsSync(file))this.rows=JSON.parse(storage.decryptString(fs.readFileSync(file)));const confirmed=this.rows.filter(r=>r.status==='created');if(confirmed.length!==this.rows.length){this.check();this.persist(confirmed);this.rows=confirmed;}}catch{this.error='Saved accounts could not be unlocked. Sign in with the Windows account that saved them.';}}
 check(){if(this.error)throw Error(this.error);if(!this.storage.isEncryptionAvailable()||this.storage.getSelectedStorageBackend?.()==='basic_text')throw Error('Secure account storage is unavailable. No credentials were saved.');}
 list(){return this.rows.map(({password,...r})=>({...r,hasPassword:!!password}));}
 persist(rows){const encrypted=this.storage.encryptString(JSON.stringify(rows));fs.writeFileSync(this.file+'.tmp',encrypted,{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 save(value){
  if(value.status!=='created')throw Error('Only confirmed successful accounts can be recorded.');
  this.check();const email=String(value.email||'').trim();const username=String(value.username||email).trim();
  if(!username||username.length>500||email.length>500||typeof value.password!=='string'||!value.password||value.password.length>10000)throw Error('A username or email and a password are required.');
  const u=new URL(value.site);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Invalid account website');const site=u.origin;
  let previous=this.rows.find(r=>r.site===site&&r.username===username);
  if(!previous&&email){const matches=this.rows.filter(r=>r.site===site&&(r.email||r.username).toLowerCase()===email.toLowerCase());if(matches.length===1&&(username===email||matches[0].username===email))previous=matches[0];}
  const now=new Date().toISOString();const row={...previous,...value,site,username:previous&&username===email&&previous.username!==email?previous.username:username,email:email||previous?.email||'',isDefault:previous?.isDefault||false,id:previous?.id||randomUUID(),createdAt:previous?.createdAt||now,updatedAt:now,confirmedAt:previous?.confirmedAt||now};const next=[row,...this.rows.filter(r=>r.id!==row.id)];this.persist(next);this.rows=next;return {accountId:row.id,saved:true,status:row.status};
 }
 setDefault(id,enabled=true){this.check();const row=this.rows.find(r=>r.id===id);if(!row)throw Error('Account not found');const next=this.rows.map(r=>accountMatches(r.site,row.site)?{...r,isDefault:enabled?r.id===id:(r.id===id?false:!!r.isDefault)}:r);this.persist(next);this.rows=next;return {saved:true};}
 delete(id){this.check();if(!this.rows.some(r=>r.id===id))throw Error('Account not found');const next=this.rows.filter(r=>r.id!==id);this.persist(next);this.rows=next;return {deleted:true};}
 reveal(id){this.check();const row=this.rows.find(r=>r.id===id);if(!row)throw Error('Account not found');return {password:row.password};}
}
module.exports={Accounts};
