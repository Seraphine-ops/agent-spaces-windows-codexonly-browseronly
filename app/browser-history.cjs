const fs=require('node:fs');const {randomUUID}=require('node:crypto');const {site}=require('./site-identity.cjs');
class BrowserHistory{
 constructor(file){this.file=file;this.rows=[];if(fs.existsSync(file))this.rows=JSON.parse(fs.readFileSync(file,'utf8'));else this.save();}
 save(){fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.rows,null,2));fs.renameSync(this.file+'.tmp',this.file);}
 add(tab,{action,outcome='complete',engine,actor='agent',url}){const s=site(url||tab.view?.webContents.getURL());this.rows.push({id:randomUUID(),tabId:tab.id,at:Date.now(),action,outcome,engine,actor,site:s?.origin||null,domain:s?.domain||null,home:s?.home||null});if(this.rows.length>50000)this.rows.splice(0,this.rows.length-50000);this.save();}
 remove(tabId){this.rows=this.rows.filter(r=>r.tabId!==tabId);this.save();}
 search({tabId,query=''}={}){return this.rows.filter(r=>(!tabId||r.tabId===tabId)&&(!query||[r.tabId,r.action,r.site,r.actor,r.engine,r.outcome,new Date(r.at).toISOString()].join(' ').toLowerCase().includes(query.toLowerCase()))).slice(-2000).reverse();}
 popular(){const counts=new Map();for(const r of this.rows)if(r.domain&&r.actor!=='system'&&r.action==='visited'&&r.outcome==='complete'){const p=counts.get(r.domain)||{domain:r.domain,url:r.home,count:0};p.count++;counts.set(r.domain,p);}return [...counts.values()].sort((a,b)=>b.count-a.count).slice(0,8);}
}
module.exports={BrowserHistory};
