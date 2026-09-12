const {test}=require('node:test');const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('browser-only release has complete local UI assets and no desktop connector',()=>{
 const mcp=fs.readFileSync(path.join(root,'browser-mcp.mjs'),'utf8');const names=[...mcp.matchAll(/tool\('([^']+)'/g)].map(m=>m[1]);assert.ok(names.length>=20);assert.ok(names.every(n=>n.startsWith('browser_')));
 for(const file of ['index.html','help-alert.html']){const html=fs.readFileSync(path.join(root,'app/ui',file),'utf8');for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(/^(?:https?:|data:)/.test(m[1]))continue;assert.ok(fs.existsSync(path.join(root,'app/ui',m[1])),file+': '+m[1]);}assert.doesNotMatch(html,/id="desktopNav"|desktop-input\.js/);}
 const main=fs.readFileSync(path.join(root,'app/main.cjs'),'utf8');assert.doesNotMatch(main,/require\(['"]\.\/desktop-|new Projects|BNBot/);
});
test('packaging allowlist excludes runtime data, tests, source maps and VM code',()=>{
 const p=require('../package.json');assert.equal(p.build.asar,false);assert.ok(!p.build.files.some(x=>/state|tests|\.env|\*\*\/\*/.test(x)&&!x.startsWith('app/')));assert.ok(p.build.files.includes('runtime-path.cjs'));assert.ok(p.build.files.includes('browser-mcp.mjs'));
 const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');for(const value of ['state/','node_modules/','dist/','*.enc','runtime.json','.env'])assert.ok(ignore.includes(value));
});
