// Request-scoped choice only: never mutate the saved default.
function selectAccount(records,username){
 const name=String(username||'').trim().toLowerCase();
 const matches=name?records.filter(r=>[r.username,r.email].some(v=>String(v||'').trim().toLowerCase()===name)):records;
 const defaults=name?[]:matches.filter(r=>r.isDefault);
 return {matches,chosen:matches.length===1?matches[0]:defaults.length===1?defaults[0]:null};
}
module.exports={selectAccount};
