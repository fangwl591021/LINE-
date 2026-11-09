import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {handSignFixture,ADMIN,REWARD,OTHER} from './fixtures/hand-sign-applications.mjs';

test('本人及管理員可依審核通過的簽署關係逐代讀取，排除加入來源及未核對訂單', async t=>{
 const f=await handSignFixture(t);
 f.sql.exec(readFileSync(new URL('../migrations/0083_partner_org_roster.sql',import.meta.url),'utf8'));
 f.sql.exec("ALTER TABLE users ADD COLUMN crm_project_independent_at TEXT; CREATE TABLE partner_contract_enrollments(member_uid,sponsor_uid); CREATE TABLE partner_bonus_deal_confirmations(buyer_uid,recruiter_uid)");
 f.sql.prepare('UPDATE users SET member_number=?,crm_project_independent_at=? WHERE line_id=?').run('20261001001','2026-11-09',REWARD);
 f.sql.prepare('UPDATE users SET member_number=? WHERE line_id=?').run('20261001002',OTHER);
 const scanOnly='U'+'e'.repeat(32);
 f.sql.prepare('INSERT INTO users(row_id,line_id,referrer_id,name,role) VALUES(?,?,?,?,?)').run(scanOnly,scanOnly,REWARD,'僅掃碼','user');
 const add=(id,child,number,decision)=>{
  const signed={attribution_mode:'applicant_performance_v1',fields:{performance_owner_member_number:number}};
  f.sql.prepare('INSERT INTO partner_applications VALUES(?,?,?,?,?,?,?,?)').run(id,child,'合成','合成',JSON.stringify(signed),'{}','0','2026-11-08');
  if(decision)f.sql.prepare('INSERT INTO partner_application_reviews VALUES(?,?,?,?,?)').run(id,ADMIN,decision,'','2026-11-09');
 };
 add('child',OTHER,'20261001001','accepted');
 add('pending',scanOnly,'20261001001');
 add('rejected',scanOnly,'20261001001','rejected');
 f.sql.prepare('INSERT INTO partner_contract_enrollments VALUES(?,?)').run(ADMIN,OTHER);
 const self=()=>f.call('partner','/organization',undefined,'reward');
 const result=await self();assert.equal(result.http,200);const root=result.organization.root;
 assert.equal(root.independent,true);assert.equal(root.children.length,1);
 assert.equal(root.children[0].number,'20261001002');assert.equal(root.children[0].credited,false);assert.equal(root.children[0].children[0].name,'管理員');
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PHONE|U[abcde]{32}|僅掃碼/);
 const admin=await f.call('partner','/admin/organization?target='+REWARD,undefined,'admin');assert.deepEqual(admin.organization,result.organization);
 assert.equal((await f.call('partner','/organization?target='+REWARD)).http,400);
 assert.equal((await f.call('partner','/admin/organization?target='+REWARD)).http,403);
 assert.equal((await f.call('partner','/organization',undefined,'invalid')).http,401);
 assert.equal((await f.call('partner','/organization?depth=-3')).http,400);
 f.sql.prepare('INSERT INTO partner_contract_enrollments VALUES(?,?)').run(REWARD,ADMIN);
 assert.equal((await self()).organization.root.children[0].children[0].children.length,0);
 f.sql.prepare('INSERT INTO partner_contract_enrollments VALUES(?,?)').run(OTHER,ADMIN);
 assert.equal((await self()).organization.root.children.length,0);
});

