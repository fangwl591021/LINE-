import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSequenceEvidence,prepareSequenceEvidence} from '../worker/bonus-sequence-evidence.mjs';
import {rewardFixture,ADMIN,OTHER} from './fixtures/reward-unit-directory.mjs';
import {readFileSync} from 'node:fs';
const date={precision:'day',value:'2026-10-02'};
const at=s=>'2026-10-'+s+':00.000Z';
const evidence=events=>({payment_status:'paid',paid_at:'2026-09-01T00:00:00.000Z',service_open:1,service_start:'2026-09-01T00:00:00.000Z',service_end:'2027-09-01T00:00:00.000Z',service_recorded:'2026-09-01T00:00:00.000Z',service_state_events:JSON.stringify(events)});
const active=events=>assessSequenceEvidence(evidence(events),date).serviceAtDeal;
test('full interval requires continuous paid service without an unresolved suspension',()=>{
 assert.equal(active([]),true);
 assert.equal(active([{action:'suspend',effectiveAt:at('01T10:00')}]),false);
 assert.equal(active([{action:'suspend',effectiveAt:at('01T10:00')},{action:'resume',effectiveAt:at('01T16:00')}]),true);
 assert.equal(active([{action:'suspend',effectiveAt:at('01T16:00')}]),false);
 assert.equal(active([{action:'suspend',effectiveAt:at('02T00:00')},{action:'resume',effectiveAt:at('02T01:00')}]),false);
 assert.equal(active([{action:'suspend',effectiveAt:at('02T16:00')}]),true);
});
test('unreadable, excessive or not-yet-recorded evidence never proves service',()=>{
 assert.equal(active([{action:'suspend',effectiveAt:'invalid'}]),false);
 assert.equal(active(Array.from({length:101},()=>({action:'resume',effectiveAt:at('01T10:00')}))),false);
 const row=evidence([]);row.service_recorded='2026-10-03T00:00:00.000Z';assert.equal(assessSequenceEvidence(row,date).serviceAtDeal,false);
 delete row.service_state_events;assert.equal(assessSequenceEvidence(row,date).serviceAtDeal,false);
});
test('real evidence query includes suspension state for the matching buyer',async t=>{
 const f=rewardFixture();t.after(()=>f.sql.close());
 f.sql.exec("ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT ''");
 const schema=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');
 for(const name of ['orders','bonus_transactions'])f.sql.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 for(const name of ['0070_partner_bonus_v2','0074_partner_policy_11510','0077_hand_sign_contracts','0079_partner_full_service_evidence'])f.sql.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
 f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type,payment_status,paid_at) VALUES('order-1',?,'tenant_annual_fee','paid','2026-09-01T00:00:00.000Z')").run(OTHER);
 const add=f.sql.prepare('INSERT INTO partner_full_service_evidence VALUES(?,?,?,?,?,?,?,?,?,?,?)');
 add.run('open',OTHER,'open','order-1','2026-09-01T00:00:00.000Z','2027-09-01T00:00:00.000Z','proof','2026-09-01T00:00:00.000Z',ADMIN,'request-open','{}');
 const row=async()=> (await prepareSequenceEvidence(f.db,['order-1']).all()).results[0];
 assert.equal(assessSequenceEvidence(await row(),date).serviceAtDeal,true);
 add.run('suspend',OTHER,'suspend','','2026-10-02T00:00:00.000Z','','proof','2026-10-02T00:00:00.000Z',ADMIN,'request-stop','{}');
 assert.equal(assessSequenceEvidence(await row(),date).serviceAtDeal,false);
});
