import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN,REWARD,OTHER} from './fixtures/reward-unit-directory.mjs';
import {partnerContractContext11510} from '../worker/partner-bonus-v2.mjs';
import {handlePartnerSettlement11510,readPartnerSettlement11510,statementDeadline11510} from '../worker/partner-settlement-11510.mjs';
const VERSION='cocreator-115.10-v3';
function fixture(t){
 const f=rewardFixture();t.after(()=>f.sql.close());
 f.sql.exec("ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT '';ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT '';");
 const schema=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');
 for(const name of ['orders','bonus_transactions'])f.sql.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 for(const file of ['0070_partner_bonus_v2','0074_partner_policy_11510','0075_partner_settlement_11510'])f.sql.exec(readFileSync(new URL('../migrations/'+file+'.sql',import.meta.url),'utf8'));
 let now='2026-10-20T02:00:00.000Z';
 f.ctx=()=>({...partnerContractContext11510(f.db,ADMIN,f.sql.prepare('SELECT * FROM users WHERE line_id=?').get(ADMIN)),stamp:()=>now});
 f.time=value=>{now=value;};
 f.sql.prepare(`INSERT INTO partner_contract_enrollments(id,member_uid,policy_version,signed_at,effective_at,expires_at,document_sha256,evidence_ref,sponsor_uid,purchase_status,verified_by,verified_at,request_key,request_json) VALUES(?,?,?,'2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z','2027-08-01T00:00:00.000Z',?,'合成已簽文件','','not_purchased',?,'2026-08-01T00:00:00.000Z',?,'{}')`).run('contract',REWARD,VERSION,'a'.repeat(64),ADMIN,crypto.randomUUID());
 f.sql.prepare("INSERT INTO partner_contract_11510_terms VALUES('contract','115.10','{}')").run();
 f.seed=(id,version=VERSION,amount=1500,month='2026-09')=>{
  const at=month+'-18T02:00:00.000Z';
  f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type,payment_status,bonus_policy_type,net_amount) VALUES(?,?,'tenant_renewal_fee','paid',?,6000)").run(id,OTHER,version);
  f.sql.prepare('INSERT INTO partner_bonus_order_snapshots VALUES(?,?,?,?,?,?,?)').run(id,'contract',version,REWARD,OTHER,at,'{}');
  f.sql.prepare("INSERT INTO partner_bonus_deal_confirmations VALUES(?,?,?,'tenant_renewal_fee','合成收款',?,?,?,1,'{}','{}',?,'{}')").run(id,REWARD,OTHER,at,at,ADMIN,crypto.randomUUID());
  f.sql.prepare("INSERT INTO bonus_transactions(tx_id,order_id,beneficiary_id,bonus_type,amount,status,created_at) VALUES(?,?,?,'renewal_referral',?,'review_required',?)").run(id+'-tx',id,REWARD,amount,at);
 };
 f.post=(route,data)=>handlePartnerSettlement11510('/settlement/'+route,{...data,confirmed:true,requestKey:data.requestKey||crypto.randomUUID()},f.ctx());
 f.statement=(extra={})=>f.post('statements',{target_uid:REWARD,month:'2026-09',deliveredAt:'2026-10-02T02:00:00.000Z',evidenceRef:'合成實際交付紀錄',...extra});
 f.claim=(id,extra={})=>f.post('claims',{statementId:id,completedAt:'2026-10-03T02:00:00.000Z',evidenceRef:'合成合法請款完整文件',...extra});
 f.seed('known');return f;
}
test('statement snapshots only eligible115.10 quarter, closedmonth and server deadlines; GET never mutates',async t=>{
 const f=fixture(t);f.seed('old','cocreator-2026-10-25-v2');
 f.sql.prepare("INSERT INTO partner_bonus_11510_holds(order_id,portion,amount,status,reason,created_at,resolved_at) VALUES('known','renewal_placement',1500,'pending','missing_consent','2026-09-18','')").run();
 // The unresolved half is absent from the payable ledger by design.
 const before=f.sql.prepare('SELECT * FROM bonus_transactions').all(),view=await readPartnerSettlement11510(f.ctx(),REWARD);assert.equal(view.outstanding.length,1);assert.deepEqual(f.sql.prepare('SELECT * FROM bonus_transactions').all(),before);
 const r=await f.statement(),s=r.statement;assert.equal(s.total_amount,1500);assert.equal(s.statement_due_at,'2026-10-05T15:59:59.999Z');assert.equal(s.objection_due_at,'2026-10-07T15:59:59.999Z');assert.equal(s.late,1);assert.equal(statementDeadline11510('2026-12'),'2027-01-05T15:59:59.999Z');
 assert.deepEqual(f.sql.prepare('SELECT * FROM bonus_transactions').all(),before);
 await assert.rejects(()=>f.statement({month:'2026-10'}),/已結束/);
 await assert.rejects(()=>f.statement({month:'2026-09',deliveredAt:'2026-10-25T00:00:00.000Z'}),/未來/);
 await assert.rejects(()=>f.statement(),/已有對帳單|沒有尚未/);
});
test('claim counts verified official workingdays, and payment records evidence without bank side effects',async t=>{
 const f=fixture(t),s=(await f.statement()).statement,claim=(await f.claim(s.id)).claim;
 assert.equal(claim.calendar_status,'verified');assert.ok(claim.payment_due_at>'2026-10-14');
 assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE tx_id='known-tx'").get().status,'payable');
 const paid=await f.post('payments',{statementId:s.id,paidAt:'2026-10-20T01:00:00.000Z',paymentRef:'合成銀行已付款證據'});assert.equal(paid.recordedOnly,true);assert.equal(paid.payment.amount,1500);assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE tx_id='known-tx'").get().status,'paid');assert.equal(f.calls.length,0);
});
test('documented objections hold only named tx and release cannot rewrite paid awards',async t=>{
 const f=fixture(t);f.seed('other');const s=(await f.statement()).statement;
 const d=(await f.post('disputes',{statementId:s.id,txId:'other-tx',reason:'合成來源待核',handlingDueAt:'2026-10-25T02:00:00.000Z',evidenceRef:'合成異議憑證'})).dispute;
 await f.claim(s.id);assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE tx_id='other-tx'").get().status,'review_required');
 const paid=await f.post('payments',{statementId:s.id,paidAt:'2026-10-20T01:00:00.000Z',paymentRef:'第一筆合成憑證'});assert.equal(paid.payment.amount,1500);
 await f.post('resolve',{disputeId:d.id,resolution:'release',reason:'核對同意證據完成',evidenceRef:'合成核對證明'});assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE tx_id='other-tx'").get().status,'payable');
 const paid2=await f.post('payments',{statementId:s.id,paidAt:'2026-10-20T01:00:00.000Z',paymentRef:'第二筆合成憑證'});assert.equal(paid2.payment.amount,1500);
 await assert.rejects(()=>f.post('resolve',{disputeId:d.id,resolution:'cancel',reason:'改寫已付',evidenceRef:'合成'}),/已結案/);
});
test('fresh role and financial revision fence prevent stale writes; old ledger stays unchanged',async t=>{
 const f=fixture(t),before=f.sql.prepare('SELECT * FROM bonus_transactions').all();
 f.onBatch(()=>{f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN);});
 await assert.rejects(()=>f.statement(),/權限或財務狀態/);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_11510_statements').get().n,0);assert.deepEqual(f.sql.prepare('SELECT * FROM bonus_transactions').all(),before);
});
test('lifecycle or refund between qualification read and write invalidates whole operation',async t=>{
 const f=fixture(t);f.onBatch(()=>{f.sql.exec('UPDATE partner_bonus_v2_clock SET revision=revision+1 WHERE id=1');});
 await assert.rejects(()=>f.statement(),/權限或財務狀態/);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_11510_statements').get().n,0);
});
test('payment before objection window and future times rejected; missing calendar keeps claim on hold',async t=>{
 const f=fixture(t);f.time('2026-10-06T02:00:00.000Z');const s=(await f.statement()).statement;await f.claim(s.id);
 await assert.rejects(()=>f.post('payments',{statementId:s.id,paidAt:'2026-10-06T01:00:00.000Z',paymentRef:'合成'}),/異議期/);
 const g=fixture(t);g.seed('uncalendared',VERSION,1500,'2025-12');
 const gs=(await g.statement({month:'2025-12',deliveredAt:'2026-01-02T02:00:00.000Z'})).statement;
 // 2026 is available, use a completed date whose ten workday deadline reaches 2028.
 g.time('2028-01-15T00:00:00.000Z');
 const gc=(await g.claim(gs.id,{completedAt:'2028-01-03T00:00:00.000Z'})).claim;assert.equal(gc.payment_due_at,null);assert.equal(gc.calendar_status,'calendar_review');
 assert.equal(g.sql.prepare("SELECT status FROM bonus_transactions WHERE tx_id='uncalendared-tx'").get().status,'review_required');
});
test('exact request replay immutable, altered payload rejected, termination and refunds cannot be paid',async t=>{
 const f=fixture(t),key=crypto.randomUUID(),first=await f.statement({requestKey:key});assert.equal((await f.statement({requestKey:key})).statement.id,first.statement.id);
 await assert.rejects(()=>f.statement({requestKey:key,evidenceRef:'改寫憑證'}),/不同內容/);
 await f.claim(first.statement.id);f.sql.exec("UPDATE bonus_transactions SET status='reversed' WHERE tx_id='known-tx'");
 await assert.rejects(()=>f.post('payments',{statementId:first.statement.id,paidAt:'2026-10-20T01:00:00.000Z',paymentRef:'合成'}),/沒有/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_11510_payments').get().n,0);
});
test('supplemental statements keep one item once and each maximum batch stays below D1 free query budget',async t=>{
 const f=fixture(t);for(let n=0;n<11;n++)f.seed('many-'+n);
 assert.equal((await readPartnerSettlement11510(f.ctx(),REWARD)).hasMoreOutstanding,true);
 const before=f.queries.length,s=(await f.statement()).statement,queryCount=f.queries.length-before;
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_11510_statement_items WHERE statement_id=?').get(s.id).n,10);assert.ok(queryCount<90,'query count '+queryCount);
 const second=(await f.statement()).statement;assert.equal(second.total_amount,3000);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_11510_statement_items').get().n,12);
 assert.equal((await readPartnerSettlement11510(f.ctx(),REWARD)).hasMoreOutstanding,false);
});
test('new contract cannot revive award extinguished by an earlier effective termination',async t=>{
 const f=fixture(t),s=(await f.statement()).statement;await f.claim(s.id);
 // An advance-recorded notice becomes effective without a cron updating rows.
 f.sql.prepare(`INSERT INTO partner_contract_lifecycle_events(id,contract_id,action,effective_at,notice_at,ground,evidence_sha256,evidence_ref,reason,verified_by,verified_at,request_key,request_json) VALUES('ended','contract','termination','2026-10-15T00:00:00.000Z','2026-09-15T00:00:00.000Z','notice',?,'合成通知','合成終止',?,'2026-09-15T00:00:00.000Z',?,'{}')`).run('b'.repeat(64),ADMIN,crypto.randomUUID());
 f.sql.prepare(`INSERT INTO partner_contract_enrollments SELECT 'resigned',member_uid,policy_version,'2026-10-16T00:00:00.000Z','2026-10-16T00:00:00.000Z','2027-10-16T00:00:00.000Z',document_sha256,evidence_ref,sponsor_uid,purchase_status,purchase_order_id,verified_by,'2026-10-16T00:00:00.000Z',verified_revision,?,'{}' FROM partner_contract_enrollments WHERE id='contract'`).run(crypto.randomUUID());
 f.sql.exec("INSERT INTO partner_contract_11510_terms VALUES('resigned','115.10','{}')");
 assert.ok(await f.ctx().activeContract(f.db,REWARD,'2026-10-20T02:00:00.000Z'));
 await assert.rejects(()=>f.post('payments',{statementId:s.id,paidAt:'2026-10-20T01:00:00.000Z',paymentRef:'合成'}),/沒有已完成條件/);
 const view=await readPartnerSettlement11510(f.ctx(),REWARD);assert.equal(view.statements[0].items[0].effectiveStatus,'cancelled_by_contract');
 assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE tx_id='known-tx'").get().status,'payable');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_11510_payments').get().n,0);
});
function endedAndResigned(f){
 f.sql.prepare(`INSERT INTO partner_contract_lifecycle_events(id,contract_id,action,effective_at,notice_at,ground,evidence_sha256,evidence_ref,reason,verified_by,verified_at,request_key,request_json) VALUES('ended','contract','termination','2026-09-20T00:00:00.000Z','2026-08-20T00:00:00.000Z','notice',?,'合成通知','合成終止',?,'2026-08-20T00:00:00.000Z',?,'{}')`).run('b'.repeat(64),ADMIN,crypto.randomUUID());
 f.sql.prepare(`INSERT INTO partner_contract_enrollments SELECT 'resigned',member_uid,policy_version,'2026-09-21T00:00:00.000Z','2026-09-21T00:00:00.000Z','2027-09-21T00:00:00.000Z',document_sha256,evidence_ref,sponsor_uid,purchase_status,purchase_order_id,verified_by,'2026-09-21T00:00:00.000Z',verified_revision,?,'{}' FROM partner_contract_enrollments WHERE id='contract'`).run(crypto.randomUUID());
 f.sql.exec("INSERT INTO partner_contract_11510_terms VALUES('resigned','115.10','{}')");
}
function laterAward(f,id){f.seed(id);f.sql.prepare("UPDATE partner_bonus_deal_confirmations SET confirmed_at='2026-09-25T02:00:00.000Z' WHERE order_id=?").run(id);f.sql.prepare("UPDATE bonus_transactions SET created_at='2026-09-25T02:00:00.000Z' WHERE order_id=?").run(id);}
test('more than a batch of terminated old awards cannot starve a new award in the same month',async t=>{
 const f=fixture(t);for(let n=0;n<13;n++)f.seed('a-old-'+n);laterAward(f,'z-new');endedAndResigned(f);
 const view=await readPartnerSettlement11510(f.ctx(),REWARD);assert.deepEqual(view.outstanding.map(x=>x.order_id),['z-new']);assert.equal(view.hasMoreOutstanding,false);
 const s=(await f.statement()).statement;assert.equal(s.total_amount,1500);await f.claim(s.id);
 const p=await f.post('payments',{statementId:s.id,paidAt:'2026-10-20T01:00:00.000Z',paymentRef:'新合作有效獎勵合成憑證'});assert.equal(p.payment.amount,1500);
 assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE tx_id='z-new-tx'").get().status,'paid');assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM bonus_transactions WHERE tx_id!='z-new-tx' AND status='paid'").get().n,0);
});
test('mixed historical statement holds terminated portion while claiming and paying valid new portion',async t=>{
 const f=fixture(t);laterAward(f,'new');const s=(await f.statement()).statement;endedAndResigned(f);
 const claim=await f.claim(s.id);assert.equal(claim.claim.calendar_status,'verified');
 assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE tx_id='known-tx'").get().status,'review_required');assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE tx_id='new-tx'").get().status,'payable');
 const view=await readPartnerSettlement11510(f.ctx(),REWARD);assert.equal(view.statements[0].items.find(x=>x.tx_id==='known-tx').effectiveStatus,'cancelled_by_contract');
 const p=await f.post('payments',{statementId:s.id,paidAt:'2026-10-20T01:00:00.000Z',paymentRef:'部分有效合成憑證'});assert.equal(p.payment.amount,1500);assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE tx_id='known-tx'").get().status,'review_required');
});
