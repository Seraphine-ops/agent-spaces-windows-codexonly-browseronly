import {mkdtempSync,writeFileSync,existsSync,readFileSync,readdirSync} from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import http from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const installed=path.resolve('dist/win-unpacked'),root=path.join(installed,'resources/app'),executable=path.join(installed,'Agent Spaces Browser.exe');
assert.ok(existsSync(executable));assert.ok(existsSync(path.join(root,'app/webview2-host/publish/AgentSpaces.WebViewHost.exe')));
assert.ok(!existsSync(path.join(root,'state')));assert.ok(!existsSync(path.join(root,'tests')));assert.ok(!existsSync(path.join(root,'app/desktop-agent.cjs')));
const hostFiles=readdirSync(path.join(root,'app/webview2-host/publish'));assert.ok(!hostFiles.some(x=>x.endsWith('.pdb')));
const server=http.createServer((req,res)=>res.end('<title>Packaged browser fixture</title><h1>Independent installation works</h1><input aria-label="Message"><button>Continue</button>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
const data=mkdtempSync(path.join(os.tmpdir(),'as-packaged-test-'));writeFileSync(path.join(data,'launch.json'),JSON.stringify({executable,args:[],root}));
const client=new Client({name:'packaged-smoke',version:'1.0'});
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'browser-mcp.mjs')],env:{...process.env,AGENT_SPACES_TEST:'1',AGENT_SPACES_DATA:data}}));
 const tools=await client.listTools();assert.ok(tools.tools.length>=20);assert.ok(tools.tools.every(x=>x.name.startsWith('browser_')));
 async function call(name,args){const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return JSON.parse(r.content[0].text);}
 const tab=await call('browser_new_tab',{url:'http://127.0.0.1:'+server.address().port,task:'Packaged smoke test'});
 const snap=await call('browser_snapshot',tab);assert.equal(snap.title,'Packaged browser fixture');assert.match(snap.text,/Independent installation works/);
 const input=snap.elements.find(x=>x.name==='Message');await call('browser_fill',{...tab,ref:input.ref,text:'Synthetic packaged input'});
 console.log('PASS: packaged MCP starts packaged application, exposes only browser tools and controls bundled WebView2 without source checkout dependencies');
}finally{
 await client.close();server.close();if(existsSync(path.join(data,'runtime.json'))){const info=JSON.parse(readFileSync(path.join(data,'runtime.json')));await fetch(`http://127.0.0.1:${info.port}/rpc`,{method:'POST',headers:{Authorization:'Bearer '+info.token,'Content-Type':'application/json'},body:JSON.stringify({op:'testUI',action:'quit'})});}
}
