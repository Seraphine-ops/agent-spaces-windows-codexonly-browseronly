const {randomUUID}=require('node:crypto');
// Unknown existing logins require local consent. This queue never reaches disk.
class AccountConsent {
 constructor({accounts,onChange=()=>{},now=Date.now}){this.accounts=accounts;this.onChange=onChange;this.now=now;this.pending=new Map();}
 confirmed(value){
  const norm=s=>String(s||'').toLowerCase();
  const known=this.accounts.list().some(a=>a.site===value.site&&(norm(a.username)===norm(value.username)||(a.email&&value.email&&norm(a.email)===norm(value.email)&&(norm(value.username)===norm(value.email)||norm(a.username)===norm(a.email)))));
  if(value.captureIntent==='signup'&&value.agentCreated||known)return this.accounts.save(value);
  const existing=[...this.pending.values()].find(p=>p.value.site===value.site&&p.value.username===value.username);
  if(existing)this.pending.delete(existing.id);
  const id=randomUUID();this.pending.set(id,{id,value,at:this.now()});this.onChange();return {pendingConsent:true};
 }
 list(){this.sweep();return [...this.pending.values()].map(({id,value})=>({id,site:value.site,username:value.username,email:value.email||''}));}
 answer(id,save){const p=this.pending.get(id);if(!p)throw Error('Login save request expired');if(this.now()-p.at>15*60*1000){this.pending.delete(id);throw Error('Login save request expired');}let result={saved:false};if(save)result=this.accounts.save(p.value);this.pending.delete(id);this.onChange();return result;}
 sweep(){for(const [id,p] of this.pending)if(this.now()-p.at>15*60*1000)this.pending.delete(id);}
}
module.exports={AccountConsent};
