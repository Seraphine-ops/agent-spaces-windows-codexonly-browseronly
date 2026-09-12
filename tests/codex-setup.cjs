const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {setup,merge,BLOCK}=require('../app/codex-setup.cjs');
test('browser preference preserves unrelated instructions and disables cleanly',()=>{
 const existing='# My instructions\nUse careful changes.\n';const enabled=merge(existing,true);
 assert.ok(enabled.startsWith(existing));assert.equal(merge(enabled,true),enabled);assert.equal(merge(enabled,false).trim(),existing.trim());assert.equal(merge(existing,false),existing);
 assert.doesNotMatch(BLOCK,/desktop_|VM|BNBot/);assert.match(BLOCK,/browser_wait_for_popup/);assert.match(BLOCK,/username/);
 assert.throws(()=>merge('<!-- agent-spaces:browser-default:start -->broken',true),/incomplete/);
});
test('Codex registration is idempotent, paths with spaces remain arguments, override file preserved',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'as-codex-test-'));const file=path.join(home,'AGENTS.override.md');fs.writeFileSync(file,'Existing custom rules\n');const root=path.join(home,'App With Spaces');let current,calls=[];
 const runner={node:'C:\\Program Files\\nodejs\\node.exe',run:async args=>{calls.push(args);if(args[1]==='get'){if(!current)throw Error('Absent');return JSON.stringify(current);}current={transport:{command:args[4],args:args.slice(5)}};return '';}};
 await setup({root,codexHome:home,runner});await setup({root,codexHome:home,runner});assert.equal(calls.filter(a=>a[1]==='add').length,1);
 assert.deepEqual(current.transport.args,[path.join(root,'browser-mcp.mjs')]);assert.match(fs.readFileSync(file,'utf8'),/^Existing custom rules/);assert.ok(fs.readdirSync(home).some(n=>n.includes('backup')));
 await setup({root,codexHome:home,enabled:false,runner});assert.equal(fs.readFileSync(file,'utf8').trim(),'Existing custom rules');
});
