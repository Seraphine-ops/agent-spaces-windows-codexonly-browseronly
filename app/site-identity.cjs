const {getDomain}=require('tldts');
function site(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;const domain=getDomain(u.hostname,{allowPrivateDomains:true})||u.hostname;return {origin:u.origin,domain,home:u.protocol+'//'+domain+(u.port?':'+u.port:'')+'/'};}catch{return null;}}
function accountMatches(saved,current){const a=site(saved),b=site(current);return !!a&&!!b&&a.domain===b.domain&&new URL(a.origin).protocol===new URL(b.origin).protocol&&new URL(a.origin).port===new URL(b.origin).port;}
module.exports={site,accountMatches};
