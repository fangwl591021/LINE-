import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN,REWARD,OTHER} from './fixtures/reward-unit-directory.mjs';
import {partnerContractContext11510} from '../worker/partner-bonus-v2.mjs';
import {readSequenceSnapshot} from '../worker/bonus-sequence-snapshot.mjs';
import {readSequenceQualification} from '../worker/bonus-sequence-chain.mjs';
import {readSnapshotQualification} from '../worker/bonus-sequence-snapshot-qualification.mjs';
const P='cocreator-115.10-v3',start='2026-10-01T16:00:00.000Z',end='2026-10-02T16:00:00.000Z';

test('snapshot qualification agrees with the original SQL-backed reader on a complete chain',async t=>{
 const f=rewardFixture();t.after(()=>f.sql.close());
 f.sql.exec("ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT '';ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT '';ALTER TABLE users ADD COLUMN crm_project_independent_at TEXT;");
 const schema=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');
 for(const name of ['orders','bonus_transactions'])f.sql.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 for(const n of ['0070_partner_bonus_v2','0074_partner_policy_11510','0075_partner_settlement_11510','0077_hand_sign_contracts','0079_partner_full_service_evidence','0087_partner_performance_date_candidates'])f.sql.exec(readFileSync(new URL('../migrations/'+n+'.sql',import.meta.url),'utf8'));
 const ins=f.sql.prepare(`INSERT INTO partner_contract_enrollments(id,member_uid,policy_version,signed_at,effective_at,expires_at,document_sha256,evidence_ref,sponsor_uid,purchase_status,verified_by,verified_at,request_key,request_json) VALUES(?,?,?,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z',?,'fixture',?,'not_purchased',?,'2026-01-01T00:00:00.000Z',?,'{}')`);
 ins.run('a',ADMIN,P,'a'.repeat(64),'',ADMIN,crypto.randomUUID());ins.run('b',REWARD,P,'b'.repeat(64),ADMIN,ADMIN,crypto.randomUUID());
 f.sql.exec("INSERT INTO partner_contract_11510_terms VALUES('a','115.10','{}');INSERT INTO partner_contract_11510_terms VALUES('b','115.10','{}')");
 f.sql.prepare("INSERT INTO orders(order_id,buyer_id,recruiter_id,order_type,payment_status,bonus_policy_type,net_amount,paid_at) VALUES('o',?,?,'tenant_annual_fee','paid',?,6000,'2026-09-01T00:00:00.000Z')").run(OTHER,REWARD,P);
 f.sql.prepare('INSERT INTO partner_bonus_order_snapshots VALUES(?,?,?,?,?,?,?)').run('o','b',P,REWARD,OTHER,'2026-11-01T00:00:00.000Z','{}');
 const order=f.sql.prepare("SELECT * FROM orders WHERE order_id='o'").get(),snap=f.sql.prepare("SELECT * FROM partner_bonus_order_snapshots WHERE order_id='o'").get();
 const db=f.env.ACTMASTER_DB,ctx=partnerContractContext11510(db),sql=await readSequenceQualification(ctx,snap,order,{start,end},{db});
 const read=await readSequenceSnapshot(db,['o'],db.prepare("SELECT order_id FROM orders WHERE order_id='o'"));assert.equal(read.status,'ok');
 const memory=readSnapshotQualification(read.data,snap,order,{start,end});
 assert.equal(sql.status,'locally_verified_qualification',JSON.stringify(sql));
 const compact=r=>({status:r.status,participants:r.participants,prior:r.facts?.priorValidDeals,selfPurchased:r.facts?.selfPurchased,sponsor:r.facts?.directSponsor,upline:r.facts?.upline});
 assert.deepEqual(compact(memory),compact(sql));assert.equal(memory.status,'locally_verified_qualification');
});
