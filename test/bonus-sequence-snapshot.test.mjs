import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,OTHER} from './fixtures/reward-unit-directory.mjs';
import {readSequenceSnapshot} from '../worker/bonus-sequence-snapshot.mjs';

function fixture(t){
 const f=rewardFixture();t.after(()=>f.sql.close());
 f.sql.exec("ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT ''; ALTER TABLE users ADD COLUMN crm_project_independent_at TEXT");
 const schema=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');
 for(const name of ['orders','bonus_transactions'])f.sql.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 for(const name of ['0070_partner_bonus_v2','0074_partner_policy_11510','0075_partner_settlement_11510','0077_hand_sign_contracts','0079_partner_full_service_evidence','0087_partner_performance_date_candidates'])f.sql.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
 f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type) VALUES('order-1',?,'tenant_annual_fee')").run(OTHER);
 f.source=()=>f.db.prepare('SELECT order_id AS orderId FROM orders WHERE order_id IN (SELECT value FROM json_each(?))').bind('["order-1"]');
 return f;
}
test('all selected and authority data come from one bounded D1 read batch',async t=>{
 const f=fixture(t);let batches=0;f.onBatch(()=>{batches++;});
 const result=await readSequenceSnapshot(f.db,['order-1'],f.source());assert.equal(batches,1);assert.equal(result.status,'ok');
 assert.match(result.data.asOf,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
 assert.equal(result.data.selectedSources[0].orderId,'order-1');assert.equal(result.data.selectedEvidence[0].order_id,'order-1');
 for(const key of ['orders','users','identityLinks','contracts','terms','lifecycle','attributions','confirmations','awards','statements','dateEvents','projectEvents','snapshots','serviceEvents'])assert.ok(Array.isArray(result.data[key]),key);
});
test('an exceeded authority-table bound refuses every partial snapshot',async t=>{
 const f=fixture(t),insert=f.sql.prepare("INSERT INTO users(row_id,line_id,role) VALUES(?,?,'user')");
 for(let n=0;n<2000;n++){const id='U'+String(n).padStart(32,'0');insert.run(id,id);}
 const result=await readSequenceSnapshot(f.db,['order-1'],f.source());assert.equal(result.status,'review_required');assert.deepEqual(result.reasons,['SNAPSHOT_BOUNDS_EXCEEDED']);assert.equal(result.source,'users');assert.equal(result.data,undefined);
});
test('missing authority tables fail closed rather than silently returning partial facts',async t=>{
 const f=fixture(t);f.sql.exec('DROP TABLE partner_attribution_events');
 await assert.rejects(readSequenceSnapshot(f.db,['order-1'],f.source()));
});
