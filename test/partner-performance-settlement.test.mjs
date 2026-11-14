import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN,REWARD,OTHER,mapper} from './fixtures/reward-unit-directory.mjs';
import {partnerContractContext11510,createTenantReceivable,markPartnerV2OrderPaid,handlePartnerContracts} from '../worker/partner-bonus-v2.mjs';
import {handlePartnerSettlement11510} from '../worker/partner-settlement-11510.mjs';
import {handleBonusPerformanceDate} from '../worker/bonus-performance-date.mjs';
import {monthlyPerformance} from '../worker/partner-renewal-11511.mjs';

const VERSION='cocreator-115.10-v3',NEXT='cocreator-115.11-v4';
function fixture(t){
 const f=rewardFixture();t.after(()=>f.sql.close());
 f.sql.exec("ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT '';ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT '';");
 const schema=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');
 for(const name of ['orders','bonus_transactions'])f.sql.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 for(const name of ['0070_partner_bonus_v2','0074_partner_policy_11510','0075_partner_settlement_11510'])f.sql.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
 f.sql.prepare(`INSERT INTO partner_contract_enrollments(id,member_uid,policy_version,signed_at,effective_at,expires_at,document_sha256,evidence_ref,sponsor_uid,purchase_status,verified_by,verified_at,request_key,request_json) VALUES(?,?,?,'2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z','2027-08-01T00:00:00.000Z',?,'fixture','','not_purchased',?,'2026-08-01T00:00:00.000Z',?,'{}')`).run('contract',REWARD,VERSION,'a'.repeat(64),ADMIN,crypto.randomUUID());
 f.sql.prepare("INSERT INTO partner_contract_11510_terms VALUES('contract','115.10','{}')").run();
 f.seed=(id,{month='2026-09',policy=VERSION,type='tenant_annual_fee',recipientPolicy=VERSION,otherPolicy=''}={})=>{
  const at='2026-10-18T02:00:00.000Z';
  f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type,payment_status,bonus_policy_type,net_amount) VALUES(?,?,?,'paid',?,6000)").run(id,OTHER,type,policy);
  f.sql.prepare('INSERT INTO partner_bonus_order_snapshots VALUES(?,?,?,?,?,?,?)').run(id,'contract',policy,REWARD,OTHER,at,'{}');
  const facts=month?JSON.stringify({performanceReportingDate:{eventId:'event-'+id,version:1,precision:'month',value:month,month}}):'{}';
  f.sql.prepare("INSERT INTO partner_bonus_deal_confirmations VALUES(?,?,?,?, 'receipt',?,?,?,1,?,'{}',?,'{}')").run(id,REWARD,OTHER,type,at,at,ADMIN,facts,crypto.randomUUID());
  f.sql.prepare("INSERT INTO bonus_transactions(tx_id,order_id,beneficiary_id,bonus_type,amount,status,created_at,raw_json) VALUES(?,?,?,'direct',1500,'review_required',?,?)").run(id+'-tx',id,REWARD,at,JSON.stringify({beneficiaryPolicyVersion:recipientPolicy}));
  if(otherPolicy)f.sql.prepare("INSERT INTO bonus_transactions(tx_id,order_id,beneficiary_id,bonus_type,amount,status,created_at,raw_json) VALUES(?,?,?,'other',1500,'review_required',?,?)").run(id+'-other',id,OTHER,at,JSON.stringify({beneficiaryPolicyVersion:otherPolicy}));
 };
 f.statement=(month,extra={},now='2026-11-15T02:00:00.000Z')=>handlePartnerSettlement11510('/settlement/statements',{target_uid:REWARD,month,deliveredAt:'2026-11-01T02:00:00.000Z',evidenceRef:'fixture delivery',confirmed:true,requestKey:crypto.randomUUID(),...extra},{...partnerContractContext11510(f.db,ADMIN,f.sql.prepare('SELECT * FROM users WHERE line_id=?').get(ADMIN)),stamp:()=>now});
 return f;
}

test('fixed 115.10 awards with adjusted month stay pending instead of creating a statement',async t=>{
 const f=fixture(t);f.seed('fixed');
 await assert.rejects(()=>f.statement('2026-10'),/沒有尚未/);
 await assert.rejects(()=>f.statement('2026-09'),/成交先後/);
 assert.equal(f.sql.prepare('SELECT confirmed_at FROM partner_bonus_deal_confirmations WHERE order_id=?').get('fixed').confirmed_at,'2026-10-18T02:00:00.000Z');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_11510_statement_items').get().n,0);
});
test('115.11, renewal and mixed-policy adjustments stay pending',async t=>{
 for(const [name,options] of [['new-policy',{policy:NEXT,recipientPolicy:NEXT}],['renewal',{type:'tenant_renewal_fee'}],['mixed',{otherPolicy:NEXT}]]){
  const f=fixture(t);f.seed(name,options);
  await assert.rejects(()=>f.statement('2026-09'),/成交先後/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_11510_statements').get().n,0);
 }
});
test('orders without an adjusted month retain the original confirmed month',async t=>{
 const f=fixture(t);f.seed('legacy',{month:''});
 await assert.rejects(()=>f.statement('2026-09'),/沒有尚未/);
 assert.equal((await f.statement('2026-10')).statement.month,'2026-10');
});
test('115.11 tier waits when the attribution and confirmation months straddle its performance window',async t=>{
 const f=fixture(t);f.seed('cross-window');
 f.sql.prepare("UPDATE partner_bonus_deal_confirmations SET confirmed_at='2026-11-18T02:00:00.000Z' WHERE order_id='cross-window'").run();
 f.sql.prepare("INSERT INTO partner_service_year_claims(order_id,buyer_uid,service_year_start,service_year_end,admission,claimed_at) VALUES('cross-window',?,'2026-11-18','2027-11-18','new','2026-11-18')").run(OTHER);
 await assert.rejects(()=>monthlyPerformance(f.db,REWARD,'2026-11'),/115.11續約級距/);
 f.sql.prepare("UPDATE partner_bonus_deal_confirmations SET facts_json=? WHERE order_id='cross-window'").run(JSON.stringify({performanceReportingDate:{month:'2026-12'}}));
 const result=await monthlyPerformance(f.db,REWARD,'2026-12');
 assert.equal(result.count,1);assert.equal(result.percent,20);
});

test('adjusted orders stay pending, including a concurrent edit; withdrawal preserves legacy settlement',async t=>{
 for(const mode of ['changed','withdrawn']){
 const f=fixture(t),orderId='end-to-end',proof=crypto.randomUUID();
 f.sql.exec("ALTER TABLE users ADD COLUMN member_joined_at TEXT DEFAULT '';ALTER TABLE users ADD COLUMN member_date_source TEXT DEFAULT '';CREATE TABLE full_applications(id TEXT PRIMARY KEY,owner_uid TEXT,snapshot_json TEXT,content_sha256 TEXT,signed_at TEXT);CREATE TABLE full_application_reviews(application_id TEXT PRIMARY KEY,decision TEXT);");
 f.sql.exec(readFileSync(new URL('../migrations/0087_partner_performance_date_candidates.sql',import.meta.url),'utf8'));
 f.sql.exec(readFileSync(new URL('../migrations/0089_bonus_release_control.sql',import.meta.url),'utf8'));
 f.sql.prepare("INSERT INTO bonus_release_control_events VALUES(1,1,0,?,'fixture','2026-11-14',?,'{}')").run(ADMIN,crypto.randomUUID());
 f.sql.prepare('UPDATE users SET member_number=? WHERE line_id=?').run('20261026002',REWARD);
 for(let n=0;n<2;n++){
  const prior='prior-'+n,buyer='U'+String(n+1).repeat(32),at='2026-10-01T00:00:00.000Z';
  f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type,payment_status,net_amount) VALUES(?,?,'tenant_annual_fee','paid',6000)").run(prior,buyer);
  f.sql.prepare("INSERT INTO partner_bonus_deal_confirmations VALUES(?,?,?,'tenant_annual_fee','fixture',?,?,?,?,?,?,?,?)").run(prior,REWARD,buyer,at,at,ADMIN,n+1,'{}','{}',crypto.randomUUID(),'{}');
 }
 f.sql.prepare('INSERT INTO full_applications VALUES(?,?,?,?,?)').run(proof,OTHER,JSON.stringify({form_kind:'full',signer_uid:OTHER,fields:{performance_owner_member_number:'20261026002'}}),'a'.repeat(64),'2026-10-01T00:00:00.000Z');
 f.sql.prepare("INSERT INTO full_application_reviews VALUES(?,'accepted')").run(proof);
 await createTenantReceivable(f.env,{orderId,orderType:'tenant_annual_fee',buyerId:OTHER,grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5,currency:'TWD'},ADMIN);
 await markPartnerV2OrderPaid(f.env,{orderId,authenticatedUserId:ADMIN});
 const saveDate=async(precision,value,expectedVersion)=>handleBonusPerformanceDate(new Request('https://test/v1/admin/bonus-performance-date',{method:'POST',headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:JSON.stringify({orderId,precision,value,reason:'fixture',expectedVersion,requestKey:crypto.randomUUID()})}),f.env,mapper,async()=>Response.json({userId:ADMIN}));
 let response=await saveDate('month','2026-10',0);assert.equal(response.status,200,await response.text());
 const call=async(path,data)=>{
  const response=await handlePartnerContracts(new Request('https://test/v1/partner-contracts'+path,{method:'POST',headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:JSON.stringify(data)}),f.env,mapper,async()=>Response.json({userId:ADMIN}));
  return {status:response.status,...await response.json()};
 };
 const reviewed=await call('/order-referral',{orderId,target_uid:OTHER,memberNumber:'20261026002',applicationId:proof,note:'fixture signed review',confirmed:true,requestKey:crypto.randomUUID()});
 assert.equal(reviewed.status,200,JSON.stringify(reviewed));
 const snap=f.sql.prepare('SELECT * FROM partner_bonus_order_snapshots WHERE order_id=?').get(orderId);
 assert.equal(JSON.parse(snap.snapshot_json).performanceReportingDate,undefined);
 response=await saveDate('month','2026-09',1);assert.equal(response.status,200,await response.text());
 response=await saveDate('none','',2);assert.equal(response.status,200,await response.text());
 response=await saveDate('month','2026-10',3);assert.equal(response.status,200,await response.text());
 const {anniversary}=await import('../worker/partner-policy-11510.mjs');
 const confirmationData={orderId,receiptRef:'fixture receipt',serviceOpenedAt:snap.captured_at,serviceYearStart:snap.captured_at,serviceYearEnd:anniversary(snap.captured_at),serviceAdmission:'new',confirmed:true,requestKey:crypto.randomUUID()};
 if(mode==='withdrawn'){
  response=await saveDate('none','',4);assert.equal(response.status,200,await response.text());
 }
 else{
 const blocked=await call('/deals/confirm',confirmationData);
 assert.equal(blocked.status,409,JSON.stringify(blocked));assert.match(blocked.error,/成交先後/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM bonus_transactions WHERE order_id=?').get(orderId).n,0);
 for(const [precision,value,version] of [['month','2026-11',4],['day','2026-11-01',5],['minute','2026-11-01T12:00',6]]){
  response=await saveDate(precision,value,version);assert.equal(response.status,200,await response.text());
  const sameMonth=await call('/deals/confirm',confirmationData);
  assert.equal(sameMonth.status,409,JSON.stringify(sameMonth));assert.match(sameMonth.error,/成交先後/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM bonus_transactions WHERE order_id=?').get(orderId).n,0);
 }
 response=await saveDate('none','',7);assert.equal(response.status,200,await response.text());
 f.onBatch(()=>{
  f.onBatch(null);
  f.sql.prepare("INSERT INTO partner_bonus_performance_date_events VALUES(?,?,9,'none','','month','2026-09','concurrent fixture','2026-11-14T00:00:00.000Z',?,?, '{}')").run(crypto.randomUUID(),orderId,ADMIN,crypto.randomUUID());
  f.sql.exec('UPDATE partner_bonus_v2_clock SET revision=revision+1 WHERE id=1');
 });
 const raced=await call('/deals/confirm',confirmationData);
 assert.equal(raced.status,409,JSON.stringify(raced));assert.match(raced.error,/成交先後/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM bonus_transactions WHERE order_id=?').get(orderId).n,0);
 response=await saveDate('none','',9);assert.equal(response.status,200,await response.text());
 }
 const confirmed=await call('/deals/confirm',confirmationData);
 assert.equal(confirmed.status,200,JSON.stringify(confirmed));
 const facts=JSON.parse(confirmed.confirmation.facts_json);
 assert.equal(facts.performanceReportingDate,undefined);assert.equal(facts.performanceReportingDateWithdrawal.precision,'none');
 response=await saveDate('month','2026-10',mode==='withdrawn'?5:10);assert.equal(response.status,409);
 const report=await f.statement('2026-11',{deliveredAt:'2026-12-01T02:00:00.000Z'},'2026-12-20T02:00:00.000Z');
 assert.equal(report.statement.month,'2026-11');
 assert.equal(f.sql.prepare('SELECT order_id FROM partner_11510_statement_items').get().order_id,orderId);
 }
});
