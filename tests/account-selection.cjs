const {test}=require('node:test');const assert=require('node:assert/strict');const {selectAccount}=require('../app/account-selection.cjs');
const records=[{username:'FixtureDefault',isDefault:true},{username:'FixtureAlternate',email:'fixture@example.test',isDefault:false}];
test('explicit name overrides default without changing it',()=>{const before=JSON.stringify(records);assert.equal(selectAccount(records,'FixtureAlternate').chosen,records[1]);assert.equal(JSON.stringify(records),before);});
test('unspecified account uses default',()=>assert.equal(selectAccount(records).chosen,records[0]));
test('multiple accounts without a default need a choice',()=>assert.equal(selectAccount(records.map(r=>({...r,isDefault:false}))).chosen,null));
test('missing explicit name never falls back to default or fuzzy match',()=>{assert.equal(selectAccount(records,'Seraphine').chosen,null);assert.equal(selectAccount(records,'Seraphine').matches.length,0);});
test('email and case-insensitive exact name select the requested account',()=>assert.equal(selectAccount(records,' FIXTURE@example.test ').chosen,records[1]));
test('duplicate explicit identities require a choice even with a default',()=>assert.equal(selectAccount([{username:'same',isDefault:true},{username:'same'}],'same').chosen,null));
