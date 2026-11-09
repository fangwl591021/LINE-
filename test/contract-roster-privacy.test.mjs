import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handSignFixture,ADMIN,REWARD,OTHER} from './fixtures/hand-sign-applications.mjs';
test('手繪名冊按本人隔離，未核對的分支僅列指定成員，契約優先，不產生業績',async t=>{
 const f=await handSignFixture(t);
 f.sql.exec(readFileSync(new URL('../migrations/0083_partner_org_roster.sql',import.meta.url),'utf8')+";ALTER TABLE users ADD COLUMN crm_project_independent_at TEXT;CREATE TABLE partner_contract_enrollments(member_uid,sponsor_uid);CREATE TABLE partner_bonus_deal_confirmations(buyer_uid,recruiter_uid)");
 const put=(key,parent,alias='')=>f.sql.prepare('INSERT INTO partner_org_roster VALUES(?,?,?,?,?)').run(REWARD,key,parent,alias,'fixture');
 put(OTHER,REWARD);put('alias:one',OTHER,'待核稱呼');put('alias:two','','方向待核');
 f.sql.prepare('INSERT INTO partner_contract_enrollments VALUES(?,?)').run(ADMIN,OTHER);
 const self=async()=>(await f.call('partner','/organization',undefined,'reward')).organization;
 let chart=await self();assert.deepEqual(chart.unplaced,['方向待核']);
 let branch=chart.root.children[0];assert.equal(branch.status,'reported');assert.equal(branch.credited,false);
 assert.deepEqual(branch.children.map(x=>x.name),['待核稱呼']);
 const outsider=(await f.call('partner','/organization')).organization;assert.deepEqual(outsider.unplaced,[]);assert.doesNotMatch(JSON.stringify(outsider),/待核稱呼/);
 put(ADMIN,OTHER);chart=await self();branch=chart.root.children[0];assert.equal(branch.children.find(x=>x.name==='管理員').status,'verified');
 f.sql.prepare('INSERT INTO partner_contract_enrollments VALUES(?,?)').run(OTHER,ADMIN);assert.deepEqual((await self()).root.children,[]);
});
