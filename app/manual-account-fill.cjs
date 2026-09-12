const {accountMatches}=require('./site-identity.cjs');
function fillScript(origin,account){return '('+fillDocument.toString()+')('+JSON.stringify(origin)+','+JSON.stringify({username:account.username,email:account.email,password:account.password})+')';}
function fillDocument(origin,account){
 if(location.origin!==origin)throw Error('Page changed. Open saved logins again.');
 const inputs=[],roots=[document];for(let i=0;i<roots.length;i++){for(const el of roots[i].querySelectorAll('*')){if(el.shadowRoot)roots.push(el.shadowRoot);if(el.tagName==='IFRAME'){try{if(el.contentDocument&&el.contentWindow.location.origin===origin)roots.push(el.contentDocument);}catch{}}if(el.tagName==='INPUT'&&!el.disabled&&!el.readOnly&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')inputs.push(el);}}
 const passwords=inputs.filter(e=>e.type==='password'&&e.autocomplete!=='new-password');
 const identities=inputs.filter(e=>e.autocomplete==='username'||e.type==='email'||/^(username|email|login|identifier)$/i.test(e.name||e.id));
 if(passwords.length>1||identities.length>1)throw Error('More than one login form found. Fill this page manually.');
 if(!passwords.length&&!identities.length)throw Error('No supported login fields found. Cross-origin frames may need manual typing.');
 let count=0;function set(e,value){const setter=Object.getOwnPropertyDescriptor(e.ownerDocument.defaultView.HTMLInputElement.prototype,'value').set;setter.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));count++;}
 if(identities[0])set(identities[0],identities[0].type==='email'||/email/i.test(identities[0].name||identities[0].id)?account.email||account.username:account.username||account.email);
 if(passwords[0])set(passwords[0],account.password);
 return {filled:count,submitted:false};
}
module.exports={fillScript,accountMatches};
