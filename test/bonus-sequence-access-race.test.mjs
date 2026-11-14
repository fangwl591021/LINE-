import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN,OTHER,mapper} from './fixtures/reward-unit-directory.mjs';
import {handleBonusOrderSequence} from '../worker/bonus-order-sequence.mjs';

test('a revoked administrator receives no preview data',async t=>{
 const f=rewardFixture();t.after(()=>f.sql.close());
 f.sql.exec("ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT '';ALTER TABLE users ADD COLUMN crm_project_independent_at TEXT;");
 const schema=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');
 for(const name of ['orders','bonus_transactions'])f.sql.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 for(const n of ['0070_partner_bonus_v2','0074_partner_policy_11510','0075_partner_settlement_11510','0077_hand_sign_contracts','0079_partner_full_service_evidence','0087_partner_performance_date_candidates','0088_bonus_order_sequence_drafts'])f.sql.exec(readFileSync(new URL('../migrations/'+n+'.sql',import.meta.url),'utf8'));
 f.sql.prepare("INSERT INTO orders(order_id,buyer_id,buyer_name,order_type,payment_status) VALUES('order-a',?,'fixture','tenant_annual_fee','paid')").run(OTHER);
 const batchId=crypto.randomUUID(),req=crypto.randomUUID(),payload=JSON.stringify({batchId,expectedVersion:0,requestKey:req,confirmedComplete:true,evidenceRef:'fixture',periodFrom:'2026-10',periodTo:'2026-10',orderIds:['order-a']});
 f.sql.prepare("INSERT INTO bonus_order_sequence_draft_events VALUES(?,?,1,?,?,?,'2026-11-01T00:00:00.000Z')").run(crypto.randomUUID(),batchId,req,payload,ADMIN);
 f.onBatch(()=>{f.onBatch(null);f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN)});
 const response=await handleBonusOrderSequence(new Request('https://test/v1/admin/bonus-order-sequence?batch_id='+batchId,{headers:{Authorization:'Bearer admin'}}),f.env,mapper,async()=>Response.json({userId:ADMIN}));
 const body=await response.json();assert.equal(response.status,403,JSON.stringify(body));assert.equal(body.items,undefined);
});

test('a non-clock payment change after the snapshot cannot mix evidence from different moments',async t=>{
 const f=rewardFixture();t.after(()=>f.sql.close());
 f.sql.exec("ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT '';ALTER TABLE users ADD COLUMN crm_project_independent_at TEXT;");
 const schema=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');
 for(const name of ['orders','bonus_transactions'])f.sql.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 for(const n of ['0070_partner_bonus_v2','0074_partner_policy_11510','0075_partner_settlement_11510','0077_hand_sign_contracts','0079_partner_full_service_evidence','0087_partner_performance_date_candidates','0088_bonus_order_sequence_drafts'])f.sql.exec(readFileSync(new URL('../migrations/'+n+'.sql',import.meta.url),'utf8'));
 f.sql.prepare("INSERT INTO orders(order_id,buyer_id,buyer_name,order_type,payment_status,paid_at) VALUES('order-a',?,'fixture','tenant_annual_fee','paid','2026-10-01T00:00:00.000Z')").run(OTHER);
 const batchId=crypto.randomUUID(),req=crypto.randomUUID(),payload=JSON.stringify({batchId,expectedVersion:0,requestKey:req,confirmedComplete:true,evidenceRef:'fixture',periodFrom:'2026-10',periodTo:'2026-10',orderIds:['order-a']});
 f.sql.prepare("INSERT INTO bonus_order_sequence_draft_events VALUES(?,?,1,?,?,?,'2026-11-01T00:00:00.000Z')").run(crypto.randomUUID(),batchId,req,payload,ADMIN);
 const original=f.env.ACTMASTER_DB.batch.bind(f.env.ACTMASTER_DB);let changed=false;
 f.env.ACTMASTER_DB.batch=async stmts=>{const result=await original(stmts);if(stmts.length>=10&&!changed){changed=true;f.sql.exec("UPDATE orders SET payment_status='pending_payment' WHERE order_id='order-a'");}return result;};
 const request=()=>handleBonusOrderSequence(new Request('https://test/v1/admin/bonus-order-sequence?batch_id='+batchId,{headers:{Authorization:'Bearer admin'}}),f.env,mapper,async()=>Response.json({userId:ADMIN}));
 const first=await (await request()).json();assert.equal(first.success,true);assert.ok(first.snapshotAt);assert.equal(first.items[0].reviewReasons.includes('ORDER_NOT_PAID'),false);
 const second=await (await request()).json();assert.ok(second.items[0].reviewReasons.includes('ORDER_NOT_PAID'));
});
