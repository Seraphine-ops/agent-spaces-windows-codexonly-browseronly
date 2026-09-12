// Called only by the trusted Accounts UI. Never return the copied secret to
// the renderer, agent tools or activity log.
function copyAccountField(accounts,clipboard,{id,field}){
 if(!['username','email','password'].includes(field))throw Error('Invalid account field');
 accounts.check();
 const row=accounts.list().find(r=>r.id===id);
 if(!row)throw Error('Account not found');
 const value=field==='password'?accounts.reveal(id).password:row[field];
 if(typeof value!=='string'||!value)throw Error('This account field is empty');
 try{clipboard.writeText(value);if(clipboard.readText()!==value)throw Error();}
 catch{throw Error('Copy failed. Please try again.');}
 return {copied:true};
}
module.exports={copyAccountField};
