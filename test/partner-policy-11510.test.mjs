import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN as A,REWARD as B,OTHER as C,mapper} from './fixtures/reward-unit-directory.mjs';
import {handlePartnerContracts,createPartnerV2Order,markPartnerV2OrderPaid,updatePartnerV2OrderStatus,calculatePartnerBonusV2,PARTNER_POLICY_VERSION as V2,partnerContractContext11510} from '../worker/partner-bonus-v2.mjs';
import {PARTNER_POLICY_11510 as V3,anniversary,contract11510State,calculatePartnerBonus11510} from '../worker/partner-policy-11510.mjs';
const D='U'+'d'.repeat(32),E='U'+'e'.repeat(32),now=()=>new Date().toISOString(),past=()=>new Date(Date.now()-86400000).toISOString();
function fixture(t){
 const f=rewardFixture();t.after(()=>f.sql.close());
 f.sql.exec("ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT '';ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT '';ALTER TABLE users ADD COLUMN member_joined_at TEXT DEFAULT '';ALTER TABLE users ADD COLUMN member_date_source TEXT DEFAULT '';");
 const schema=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');for(const name of ['orders','bonus_transactions'])f.sql.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 for(const name of ['0070_partner_bonus_v2.sql','0074_partner_policy_11510.sql'])f.sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 for(const id of [D,E])f.sql.prepare("INSERT INTO users(row_id,line_id,role) VALUES(?,?,'user')").run(id,id);
 f.sql.prepare('UPDATE users SET member_number=? WHERE line_id=?').run('20261026001',A);f.sql.prepare('UPDATE users SET member_number=? WHERE line_id=?').run('20261026002',B);
 f.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(A,B);for(const id of [C,D,E])f.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(B,id);
 f.call=async(path='',data,token='admin')=>{const r=await handlePartnerContracts(new Request('https://test/v1/partner-contracts'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),f.env,mapper,async(url,opts)=>{const id={admin:A,user:C,reward:B}[opts.headers.Authorization.slice(7)];return id?Response.json({userId:id}):new Response('',{status:401});});return {http:r.status,...await r.json()};};
 f.enrollment=(id,extra={})=>({target_uid:id,templateVersion:'115.10',signedAt:past(),effectiveAt:past(),documentSha256:'a'.repeat(64),evidenceRef:'ISOLATED_SIGNED_PROOF',confirmed:true,requestKey:crypto.randomUUID(),purchaseStatus:'not_purchased',partyType:'natural_person',partyName:'合成簽約人',representativeName:'',referrerName:id===A?'':'合成推薦人',referrerMemberNumber:id===A?'':id===B?'20261026001':'20261026002',bankName:'合成銀行',bankCode:'000',bankBranch:'合成分行',bankAccountHolder:'合成簽約人',bankAccount:'000001234567',...extra});
 f.enroll=async(id,extra={})=>{const data=f.enrollment(id,extra);data.effectiveAt=data.signedAt;const r=await f.call('',data);assert.equal(r.http,200,JSON.stringify(r));return r.contract;};
 f.seedAdvanced=async(id=A)=>{for(let n=0;n<2;n++){const buyer='U'+String(n+1).repeat(32),order='prior-'+id+n;f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type,payment_status,net_amount) VALUES(?,?,'tenant_annual_fee','paid',6000)").run(order,buyer);f.sql.prepare("INSERT INTO partner_bonus_deal_confirmations VALUES(?,?,?,'tenant_annual_fee','fixture',?,?,?,?,?,?,?,?)").run(order,id,buyer,past(),past(),A,n+1,'{}','{}',crypto.randomUUID(),'{}');}};
 f.order=async(id,buyer=C,type='tenant_annual_fee')=>{const order={orderId:id,orderType:type,buyerId:buyer,grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5};await createPartnerV2Order(f.env,order);await markPartnerV2OrderPaid(f.env,{orderId:id,paymentNo:'ISOLATED-'+id});return order;};
 f.confirmData=(id,extra={})=>{const captured=f.sql.prepare('SELECT captured_at FROM partner_bonus_order_snapshots WHERE order_id=?').get(id).captured_at;return {orderId:id,receiptRef:'ISOLATED_RECEIPT',serviceOpenedAt:captured,serviceYearStart:captured,serviceYearEnd:anniversary(captured),serviceAdmission:'new',reviewReason:'當下歸屬人欠缺同意文件，待管理員確認',reviewHandlingDueAt:new Date(Date.now()+7*86400000).toISOString(),confirmed:true,requestKey:crypto.randomUUID(),...extra};};
 f.confirm=(id,extra={})=>f.call('/deals/confirm',f.confirmData(id,extra));
 f.ready=async()=>{await f.enroll(A);await f.seedAdvanced();return f.enroll(B);};
 return f;
}
test('project waiver has zero cash and BV; first verified new deal pays the independent recruiter',async t=>{
 const f=fixture(t);
 f.sql.exec(readFileSync(new URL('../migrations/0082_partner_project_qualification.sql',import.meta.url),'utf8'));
 await f.enroll(A);await f.seedAdvanced();await f.enroll(B);
 await f.order('before-project',D);
 const grant={target_uid:B,waiveFee:true,independent:true,reason:'合成專案例外',confirmed:true,requestKey:crypto.randomUUID()};
 assert.equal((await f.call('/project',grant,'user')).http,403);
 const result=await f.call('/project',grant);assert.equal(result.http,200,JSON.stringify(result));
 assert.equal((await f.call('/project',grant)).replayed,true);
 const fee=f.sql.prepare("SELECT * FROM orders WHERE buyer_id=? AND payment_status='project_waived'").all(B);
 assert.equal(fee.length,1);assert.deepEqual([fee[0].gross_amount,fee[0].bv,fee[0].paid_at],[0,0,'']);
 await assert.rejects(markPartnerV2OrderPaid(f.env,{orderId:fee[0].order_id}),/不能收款/);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM bonus_transactions WHERE order_id=?").get(fee[0].order_id).n,0);
 await f.order('project-first');const sale=await f.confirm('project-first');
 assert.equal(sale.http,200,JSON.stringify(sale));assert.deepEqual(sale.plan.transactions.map(x=>[x.memberId,x.amount]),[[B,3000]]);
 assert.equal(f.sql.prepare("SELECT ordinal FROM partner_bonus_deal_confirmations WHERE order_id='project-first'").get().ordinal,1);
 const earlier=await f.confirm('before-project');assert.equal(earlier.http,200,JSON.stringify(earlier));assert.ok(earlier.plan.transactions.every(x=>x.memberId!==B));
});
test('115.10 renewal holds only disputed quarter; original v2 all-or-nothing is preserved',()=>{
 const facts={orderType:'tenant_renewal_fee',netAmount:6000,priorValidDeals:0,originalReferrer:B,currentOwner:'',originalEligible:true,ownerEligible:false};
 const plan=calculatePartnerBonus11510(facts,calculatePartnerBonusV2);assert.equal(plan.status,'partially_held');assert.deepEqual(plan.transactions.map(t=>[t.memberId,t.amount]),[[B,1500]]);assert.deepEqual(plan.holds.map(h=>[h.portion,h.amount]),[['renewal_placement',1500]]);assert.equal(calculatePartnerBonusV2(facts).transactions.length,0);
 const same=calculatePartnerBonus11510({...facts,currentOwner:B,ownerEligible:true},calculatePartnerBonusV2);assert.equal(same.transactions.reduce((n,t)=>n+t.amount,0),3000);assert.equal(same.holds.length,0);
});
test('115.10 automatic yearly extension clamps leap anniversaries and honors verified notices',()=>{
 assert.equal(anniversary('2024-02-29T00:00:00.000Z'),'2025-02-28T00:00:00.000Z');assert.equal(anniversary('2024-02-28T16:30:00.000Z'),'2025-02-27T16:30:00.000Z');
 const c={policy_version:V3,signed_at:'2024-02-29T00:00:00.000Z',effective_at:'2024-02-29T00:00:00.000Z',verified_at:'2024-02-29T00:00:00.000Z'};
 assert.equal(contract11510State(c,[],'2028-02-29T00:00:00.000Z').active,true);
 assert.equal(contract11510State(c,[{action:'nonrenewal',effective_at:'2026-02-28T00:00:00.000Z',verified_at:'2026-01-01T00:00:00.000Z'}],'2026-02-28T00:00:00.000Z').active,false);
});
test('explicit template is separate from signed SHA; cached enrollment and invalid party/source data reject',async t=>{
 const f=fixture(t),data=f.enrollment(B);data.effectiveAt=data.signedAt;
 assert.equal((await f.call('',{...data,templateVersion:undefined})).http,409);
 assert.equal((await f.call('',{...data,templateVersion:V2,signedAt:now(),effectiveAt:now()})).http,409);
 assert.equal((await f.call('',{...data,partyType:'company'})).http,400);
 assert.equal((await f.call('',{...data,referrerMemberNumber:'20261026009'})).http,409);
 const result=await f.call('',data);assert.equal(result.http,200,JSON.stringify(result));assert.equal(result.contract.document_sha256,'a'.repeat(64));assert.equal(result.contract.terms.templateVersion,'115.10');assert.equal(result.contract.policy_version,V3);
 assert.equal((await f.call('',data)).replayed,true);assert.equal((await f.call('',{...data,partyName:'changed'})).http,409);
 const summary=await f.call('?target='+B);assert.notEqual(summary.templateSha256,result.contract.document_sha256);assert.equal(summary.contracts[0].contractStatus.active,true);assert.equal(summary.contracts[0].quota.eligibleForReview,false);
});
test('only verified future-created orders adopt11510; expired first term extends without old fallback',async t=>{
 const f=fixture(t);await f.enroll(B);const enrollment=f.sql.prepare('SELECT id FROM partner_contract_enrollments WHERE member_uid=?').get(B);f.sql.prepare('UPDATE partner_contract_enrollments SET signed_at=?,effective_at=?,expires_at=?,verified_at=? WHERE id=?').run('2024-01-01T00:00:00.000Z','2024-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','2024-01-01T00:00:00.000Z',enrollment.id);
 f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type,gross_amount,net_amount,currency,bonus_policy_type) VALUES('old',?,'tenant_annual_fee',6300,6000,'TWD','left_right_independent_split')").run(C);
 await f.order('new');assert.equal(f.sql.prepare("SELECT bonus_policy_type FROM orders WHERE order_id='new'").get().bonus_policy_type,V3);assert.equal(f.sql.prepare("SELECT bonus_policy_type FROM orders WHERE order_id='old'").get().bonus_policy_type,'left_right_independent_split');
});
test('confirmed11510 service-year admits one claim and two deals promote the third unchanged',async t=>{
 const f=fixture(t);await f.ready();
 for(const [i,buyer]of [C,D,E].entries()){await f.order('annual-'+i,buyer);const r=await f.confirm('annual-'+i);assert.equal(r.http,200,JSON.stringify(r));assert.deepEqual(r.plan.transactions.map(t=>[t.memberId,t.amount]),i<2?[[A,1500],[A,1500]]:[[B,3000]]);}
 const contracts=await f.call('?target='+B);assert.equal(contracts.validDealCount,3);assert.equal(contracts.contracts[0].quota.validNewDeals,3);
 const count=f.sql.prepare('SELECT COUNT(*) n FROM bonus_transactions').get().n;await f.order('duplicate',C,'tenant_renewal_fee');const previous=f.sql.prepare("SELECT service_year_start,service_year_end FROM partner_service_year_claims WHERE order_id='annual-0'").get();const r=await f.confirm('duplicate',{serviceAdmission:'renewal',serviceYearStart:previous.service_year_start,serviceYearEnd:previous.service_year_end});assert.equal(r.http,409);assert.match(r.error,/服務年度/);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM bonus_transactions').get().n,count);
});
test('renewal independent hold resolves only to audited owner once; original ledger never rewritten',async t=>{
 const f=fixture(t);await f.ready();await f.order('origin');assert.equal((await f.confirm('origin')).http,200);await f.order('renewal',C,'tenant_renewal_fee');const year=f.sql.prepare("SELECT service_year_end FROM partner_service_year_claims WHERE order_id='origin'").get().service_year_end;
 const r=await f.confirm('renewal',{serviceAdmission:'renewal',serviceYearStart:year,serviceYearEnd:anniversary(year)});assert.equal(r.http,200,JSON.stringify(r));assert.equal(r.plan.transactions[0].memberId,B);assert.equal(r.plan.holds.length,1);
 const before=f.sql.prepare("SELECT * FROM bonus_transactions WHERE order_id='renewal'").all();const payload={orderId:'renewal',portion:'renewal_placement',beneficiaryUid:A,consentSha256:'b'.repeat(64),evidenceRef:'ISOLATED_CONSENT',reason:'已核對同意紀錄',confirmed:true,requestKey:crypto.randomUUID()};assert.equal((await f.call('/renewals/resolve',payload)).http,409);
 assert.equal((await f.call('/attribution',{target_uid:C,manager_uid:A,effectiveAt:past(),consentSha256:'b'.repeat(64),evidenceRef:'ISOLATED_CONSENT',confirmed:true,requestKey:crypto.randomUUID()})).http,200);
 assert.equal((await f.call('/renewals/resolve',payload)).http,200);assert.equal((await f.call('/renewals/resolve',payload)).replayed,true);assert.equal((await f.call('/renewals/resolve',{...payload,requestKey:crypto.randomUUID()})).http,409);assert.deepEqual(f.sql.prepare('SELECT * FROM bonus_transactions WHERE tx_id=?').get(before[0].tx_id),before[0]);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM bonus_transactions WHERE order_id='renewal'").get().n,2);
});
test('termination cancels only unpaid11510 beneficiary awards; retains paid and all old v2 entries',async t=>{
 const f=fixture(t);await f.ready();await f.order('origin');await f.confirm('origin');await f.order('renewal',C,'tenant_renewal_fee');const year=f.sql.prepare("SELECT service_year_end FROM partner_service_year_claims WHERE order_id='origin'").get().service_year_end;await f.confirm('renewal',{serviceAdmission:'renewal',serviceYearStart:year,serviceYearEnd:anniversary(year)});
 f.sql.prepare("INSERT INTO bonus_transactions(tx_id,order_id,beneficiary_id,amount,status) VALUES('old-paid','old',?,3000,'paid')").run(B);const paid=f.sql.prepare("SELECT * FROM bonus_transactions WHERE tx_id='old-paid'").get();f.sql.prepare("UPDATE bonus_transactions SET status='payable' WHERE beneficiary_id=? AND order_id='renewal'").run(B);
 const contract=f.sql.prepare('SELECT id FROM partner_contract_enrollments WHERE member_uid=?').get(B);const payload={contractId:contract.id,action:'termination',effectiveAt:now(),terminationGround:'breach',evidenceSha256:'c'.repeat(64),evidenceRef:'ISOLATED_BREACH_PROOF',reason:'合成終止原因',confirmed:true,requestKey:crypto.randomUUID()};const result=await f.call('/lifecycle',payload);assert.equal(result.http,200,JSON.stringify(result));assert.equal((await f.call('/lifecycle',payload)).replayed,true);assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE beneficiary_id=? AND order_id='renewal'").get(B).status,'reversed');assert.deepEqual(f.sql.prepare("SELECT * FROM bonus_transactions WHERE tx_id='old-paid'").get(),paid);
 await assert.rejects(()=>f.order('after-stop',D),/已停止/);assert.equal((await partnerContractContext11510(f.db).activeContract(f.db,B,now())),null);
});
test('quota counts rolling12 months only and excludes renewals/reactivations; never automatically terminates',async t=>{
 const f=fixture(t),contract=await f.ready();await f.order('new');await f.confirm('new');let summary=await f.call('?target='+B);assert.equal(summary.contracts[0].quota.validNewDeals,1);f.sql.exec("UPDATE partner_service_year_claims SET admission='reactivation'");summary=await f.call('?target='+B);assert.equal(summary.contracts[0].quota.validNewDeals,0);assert.equal(summary.contracts[0].contractStatus.active,true);assert.equal(summary.contracts[0].quota.automaticTermination,false);
 const payload={contractId:contract.id,action:'termination',effectiveAt:now(),terminationGround:'annual_quota',evidenceSha256:'c'.repeat(64),evidenceRef:'ISOLATED_QUOTA',reason:'尚未滿12月不能取消',confirmed:true,requestKey:crypto.randomUUID()};assert.equal((await f.call('/lifecycle',payload)).http,409);
 f.sql.prepare('UPDATE partner_contract_enrollments SET signed_at=?,effective_at=? WHERE id=?').run('2024-01-01T00:00:00.000Z','2024-01-01T00:00:00.000Z',contract.id);payload.reason='完整12月不足6新約';payload.effectiveAt=now();assert.equal((await f.call('/lifecycle',payload)).http,200);
});
test('refund cancels unpaid awards and held quarter without changing paid ledger',async t=>{
 const f=fixture(t);await f.ready();await f.order('origin');await f.confirm('origin');await f.order('renewal',C,'tenant_renewal_fee');const year=f.sql.prepare("SELECT service_year_end FROM partner_service_year_claims WHERE order_id='origin'").get().service_year_end;await f.confirm('renewal',{serviceAdmission:'renewal',serviceYearStart:year,serviceYearEnd:anniversary(year)});f.sql.exec("UPDATE bonus_transactions SET status='payable' WHERE order_id='renewal'");await updatePartnerV2OrderStatus(f.env,{orderId:'renewal',authenticatedUserId:A},'refunded');assert.equal(f.sql.prepare("SELECT status FROM partner_bonus_11510_holds WHERE order_id='renewal'").get().status,'cancelled');assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE order_id='renewal'").get().status,'reversed');
});
test('CAS race reclassifies terminated contract, rejects revoked administrator and preserves identity fences',async t=>{
 const f=fixture(t),contract=await f.enroll(B);let once=false;f.onBatch(()=>{if(once)return;once=true;f.sql.prepare("INSERT INTO partner_contract_lifecycle_events VALUES(?,?,'termination',?,?,'breach',?,'fixture','fixture',?,?,?,?)").run(crypto.randomUUID(),contract.id,past(),past(),'c'.repeat(64),A,past(),crypto.randomUUID(),'{}');f.sql.exec("UPDATE partner_bonus_v2_clock SET revision=revision+1,last_key='race' WHERE id=1");});await assert.rejects(()=>f.order('race'),/已停止/);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM orders WHERE order_id='race'").get().n,0);
 f.onBatch(()=>f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(A));assert.equal((await f.call('',f.enrollment(D))).http,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_contract_enrollments WHERE member_uid=?').get(D).n,0);
});
test('stopped original referrer preserves owner renewal25 and permanently cancels original25',async t=>{
 const f=fixture(t),contract=await f.ready();await f.order('origin');await f.confirm('origin');
 assert.equal((await f.call('/attribution',{target_uid:C,manager_uid:A,effectiveAt:past(),consentSha256:'b'.repeat(64),evidenceRef:'ISOLATED_CONSENT',confirmed:true,requestKey:crypto.randomUUID()})).http,200);
 assert.equal((await f.call('/lifecycle',{contractId:contract.id,action:'termination',effectiveAt:now(),terminationGround:'breach',evidenceSha256:'c'.repeat(64),evidenceRef:'ISOLATED_TERMINATION',reason:'合成終止',confirmed:true,requestKey:crypto.randomUUID()})).http,200);
 await f.order('renewal-after-stop',C,'tenant_renewal_fee');const snapshot=f.sql.prepare("SELECT snapshot_json,contract_id FROM partner_bonus_order_snapshots WHERE order_id='renewal-after-stop'").get();assert.equal(JSON.parse(snapshot.snapshot_json).policyBasisMemberUid,A);assert.equal(JSON.parse(snapshot.snapshot_json).originalRecruiterUid,B);
 const year=f.sql.prepare("SELECT service_year_end FROM partner_service_year_claims WHERE order_id='origin'").get().service_year_end,r=await f.confirm('renewal-after-stop',{serviceAdmission:'renewal',serviceYearStart:year,serviceYearEnd:anniversary(year)});assert.equal(r.http,200,JSON.stringify(r));assert.deepEqual(r.plan.transactions.map(t=>[t.memberId,t.amount]),[[A,1500]]);assert.equal(r.plan.holds.length,0);assert.equal(r.plan.cancellations[0].portion,'renewal_referral');assert.equal(f.sql.prepare("SELECT status FROM partner_bonus_11510_holds WHERE order_id='renewal-after-stop'").get().status,'cancelled');
});
test('later re-sign never revives an earlier established award cancelled by future termination',async t=>{
 const f=fixture(t),contract=await f.ready();await f.order('origin');await f.confirm('origin');await f.order('renewal',C,'tenant_renewal_fee');const year=f.sql.prepare("SELECT service_year_end FROM partner_service_year_claims WHERE order_id='origin'").get().service_year_end;await f.confirm('renewal',{serviceAdmission:'renewal',serviceYearStart:year,serviceYearEnd:anniversary(year)});
 const future=new Date(Date.now()+86400000).toISOString();f.sql.prepare("INSERT INTO partner_contract_lifecycle_events VALUES(?,?,'termination',?,?,'breach',?,'fixture','fixture',?,?,?,?)").run(crypto.randomUUID(),contract.id,future,now(),'c'.repeat(64),A,now(),crypto.randomUUID(),'{}');
 const resigned={id:crypto.randomUUID()},restarted=new Date(Date.parse(future)+1000).toISOString();f.sql.prepare('INSERT INTO partner_contract_enrollments SELECT ?,member_uid,policy_version,?,?,expires_at,document_sha256,evidence_ref,sponsor_uid,purchase_status,purchase_order_id,verified_by,?,verified_revision,?,request_json FROM partner_contract_enrollments WHERE id=?').run(resigned.id,restarted,restarted,restarted,crypto.randomUUID(),contract.id);f.sql.prepare("INSERT INTO partner_contract_11510_terms SELECT ?,'115.10',terms_json FROM partner_contract_11510_terms WHERE contract_id=?").run(resigned.id,contract.id);
 const after=new Date(Date.parse(future)+2000).toISOString(),ctx=partnerContractContext11510(f.db);assert.ok(await ctx.activeContract(f.db,B,after));assert.equal(await ctx.awardEligibility(B,'renewal',after),false);
});
test('stale annual quota and contract facts cannot terminate after a sixth deal changes the CAS revision',async t=>{
 const f=fixture(t),contract=await f.ready();await f.order('seed');await f.confirm('seed');f.sql.prepare('UPDATE partner_contract_enrollments SET signed_at=?,effective_at=? WHERE id=?').run('2024-01-01T00:00:00.000Z','2024-01-01T00:00:00.000Z',contract.id);
 const original=f.db.prepare.bind(f.db);let once=false;f.db.prepare=query=>{const st=original(query);if(!query.includes('COUNT(*) AS n'))return st;const bind=st.bind.bind(st);st.bind=(...args)=>{const result=bind(...args),get=result.first.bind(result);result.first=async()=>{const row=await get();if(!once){once=true;for(let n=0;n<5;n++){const id='sixth-'+n,buyer='U'+String(n+3).repeat(32);f.sql.prepare('INSERT INTO orders SELECT ?,order_type,?,buyer_name,network_id,product_code,product_name,gross_amount,net_amount,tax_amount,tax_rate,bv,currency,payment_status,payment_provider,payment_no,paid_at,bonus_status,sponsor_id,recruiter_id,placement_parent_id,placement_side,bonus_policy_type,raw_json,created_at,updated_at FROM orders WHERE order_id=\'seed\'').run(id,buyer);f.sql.prepare('INSERT INTO partner_bonus_order_snapshots SELECT ?,contract_id,policy_version,recruiter_uid,?,captured_at,snapshot_json FROM partner_bonus_order_snapshots WHERE order_id=\'seed\'').run(id,buyer);f.sql.prepare('INSERT INTO partner_bonus_deal_confirmations SELECT ?,recruiter_uid,?,deal_type,receipt_ref,service_opened_at,confirmed_at,confirmed_by,ordinal,facts_json,plan_json,?,request_json FROM partner_bonus_deal_confirmations WHERE order_id=\'seed\'').run(id,buyer,crypto.randomUUID());f.sql.prepare('INSERT INTO partner_service_year_claims SELECT ?,?,service_year_start,service_year_end,admission,claimed_at FROM partner_service_year_claims WHERE order_id=\'seed\'').run(id,buyer);}f.sql.exec("UPDATE partner_bonus_v2_clock SET revision=revision+1,last_key='sixth-confirmed' WHERE id=1");}return row;};return result;};return st;};
 const r=await f.call('/lifecycle',{contractId:contract.id,action:'termination',terminationGround:'annual_quota',effectiveAt:now(),evidenceSha256:'c'.repeat(64),evidenceRef:'ISOLATED_QUOTA',reason:'合成六件競態',confirmed:true,requestKey:crypto.randomUUID()});assert.equal(r.http,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_contract_lifecycle_events').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_service_year_claims').get().n,6);
});
test('historical paid full service qualifies11510 first-quarter; refunded evidence holds without guess',async t=>{
 const f=fixture(t);await f.enroll(A);await f.seedAdvanced();f.sql.prepare("INSERT INTO orders(order_id,buyer_id,recruiter_id,order_type,gross_amount,net_amount,tax_amount,tax_rate,payment_status,paid_at,bonus_policy_type) VALUES('own-old',?,?,'tenant_annual_fee',6300,6000,300,5,'paid','2023-01-01T00:00:00.000Z','left_right_independent_split')").run(B,A);await f.enroll(B,{purchaseStatus:'purchased',purchaseOrderId:'own-old'});await f.order('old-purchase-valid');let r=await f.confirm('old-purchase-valid');assert.equal(r.http,200,JSON.stringify(r));assert.deepEqual(r.plan.transactions.map(x=>[x.memberId,x.amount]),[[B,1500],[A,1500]]);f.sql.exec("UPDATE orders SET payment_status='refunded' WHERE order_id='own-old'");await f.order('refunded-proof',D);r=await f.confirm('refunded-proof');assert.equal(r.http,409);assert.match(r.reviewReasons.join(','),/purchase_status/);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM bonus_transactions WHERE order_id='refunded-proof'").get().n,0);
});
test('an existing pending v2 order keeps its original eligibility rules after v3 termination',async t=>{
 const f=fixture(t),legacy=uid=>({target_uid:uid,templateVersion:V2,signedAt:'2026-10-24T00:00:00.000Z',effectiveAt:'2026-10-24T00:00:00.000Z',documentSha256:'b'.repeat(64),evidenceRef:'ISOLATED_OLD_SIGNED',confirmed:true,requestKey:crypto.randomUUID(),purchaseStatus:'not_purchased'});
 for(const uid of [A,B])assert.equal((await f.call('',legacy(uid))).http,200);await f.seedAdvanced();await f.order('pending-v2');assert.equal(f.sql.prepare("SELECT bonus_policy_type FROM orders WHERE order_id='pending-v2'").get().bonus_policy_type,V2);
 const upgraded=await f.enroll(A);assert.equal((await f.call('/lifecycle',{contractId:upgraded.id,action:'termination',terminationGround:'breach',effectiveAt:now(),evidenceSha256:'c'.repeat(64),evidenceRef:'ISOLATED_V3_STOP',reason:'合成新版終止不溯及舊制訂單',confirmed:true,requestKey:crypto.randomUUID()})).http,200);
 const captured=f.sql.prepare("SELECT captured_at FROM partner_bonus_order_snapshots WHERE order_id='pending-v2'").get().captured_at,r=await f.call('/deals/confirm',{orderId:'pending-v2',receiptRef:'ISOLATED_V2_OPEN',serviceOpenedAt:captured,confirmed:true,requestKey:crypto.randomUUID()});assert.equal(r.http,200,JSON.stringify(r));assert.deepEqual(r.plan.transactions.map(x=>[x.memberId,x.amount]),[[A,1500],[A,1500]]);
});

test('a QR introduction never earns a sale: money may arrive before signed proof is verified',async t=>{
 const f=fixture(t),proof=crypto.randomUUID(),orderId='signed-sale';
 await f.enroll(A);await f.seedAdvanced(A);
 const {createTenantReceivable}=await import('../worker/partner-bonus-v2.mjs');
 const order={orderId,orderType:'tenant_annual_fee',buyerId:C,recruiterId:B,placementParentId:B,bonusPlanPreview:{beneficiaryId:B},grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5,currency:'TWD'};
 await createTenantReceivable(f.env,order,A);
 await markPartnerV2OrderPaid(f.env,{orderId,authenticatedUserId:A,recruiterId:B});
 const read=()=>f.sql.prepare('SELECT * FROM orders WHERE order_id=?').get(orderId);
 assert.equal(read().payment_status,'paid');assert.equal(read().recruiter_id,'');assert.equal(read().placement_parent_id,'');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_transactions').get().n,0);
 const review={orderId,target_uid:C,memberNumber:'20261026001',applicationId:proof,note:'signed document cross-checked',confirmed:true,requestKey:crypto.randomUUID()};
 f.sql.exec('CREATE TABLE full_applications(id TEXT PRIMARY KEY,owner_uid TEXT,snapshot_json TEXT,content_sha256 TEXT,signed_at TEXT);CREATE TABLE full_application_reviews(application_id TEXT PRIMARY KEY,decision TEXT);');
 assert.equal((await f.call('/order-referral',review)).http,409);
 f.sql.prepare('INSERT INTO full_applications VALUES(?,?,?,?,?)').run(proof,C,JSON.stringify({form_kind:'full',signer_uid:C,fields:{assisted_partner:'合成業務',performance_owner_member_number:'20261026001'}}),'a'.repeat(64),now());
 f.sql.prepare('INSERT INTO full_application_reviews VALUES(?,?)').run(proof,'accepted');
 assert.equal((await f.call('/order-referral',{...review,memberNumber:'20261026002'})).http,409);
 assert.equal((await f.call('/order-referral',review,'user')).http,403);
 const verified=await f.call('/order-referral',review);assert.equal(verified.http,200,JSON.stringify(verified));assert.equal(read().recruiter_id,A);
 assert.equal(f.sql.prepare('SELECT referrer_id FROM users WHERE line_id=?').get(C).referrer_id,B);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_transactions').get().n,0);
 const result=await f.confirm(orderId);
 assert.equal(result.http,200,JSON.stringify(result));assert.equal(f.sql.prepare('SELECT beneficiary_id FROM bonus_transactions WHERE order_id=?').get(orderId)?.beneficiary_id,A);
});

test('115.11 upgrade records written consent, mixed signers, earned rights and breach review separately',async t=>{
 const f=fixture(t);
 f.sql.exec(readFileSync(new URL('../migrations/0075_partner_settlement_11510.sql',import.meta.url),'utf8'));
 await f.ready();
 await f.order('origin');assert.equal((await f.confirm('origin')).http,200);
 const signed=new Date(Date.now()-1000).toISOString();
 const modern=await f.enroll(B,{templateVersion:'115.11',signedAt:signed,documentSha256:'e'.repeat(64)});
 assert.equal(modern.policy_version,'cocreator-115.11-v4');
 assert.equal(modern.terms.templateVersion,'115.11');assert.equal(modern.quota.percent,20);
 const attr=await f.call('/attribution',{target_uid:C,manager_uid:A,effectiveAt:past(),consentSha256:'b'.repeat(64),evidenceRef:'signed',confirmed:true,requestKey:crypto.randomUUID()});assert.equal(attr.http,200,JSON.stringify(attr));
 const next=()=>f.sql.prepare('SELECT MAX(service_year_end) e FROM partner_service_year_claims WHERE buyer_uid=?').get(C).e;
 async function renew(id){await f.order(id,C,'tenant_renewal_fee');const start=next();const r=await f.confirm(id,{serviceAdmission:'renewal',serviceYearStart:start,serviceYearEnd:anniversary(start)});assert.equal(r.http,200,JSON.stringify(r));return r.plan;}
 let plan=await renew('mixed');
 assert.deepEqual(plan.transactions.map(v=>[v.memberId,v.beneficiaryPolicyVersion,v.renewalMode]),[[B,'cocreator-115.11-v4','tier'],[A,V3,undefined]]);
 const end={contractId:modern.id,action:'termination',effectiveAt:now(),terminationGround:'annual_quota',evidenceSha256:'b'.repeat(64),evidenceRef:'signed evidence',reason:'isolated',confirmed:true,requestKey:crypto.randomUUID()};
 assert.equal((await f.call('/lifecycle',end)).http,409);assert.equal((await f.call('/lifecycle',{...end,terminationGround:'breach',requestKey:crypto.randomUUID()})).http,200);
 assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE order_id='mixed' AND beneficiary_id=?").get(B).status,'review_required');
 plan=await renew('breach');assert.deepEqual(plan.transactions.map(v=>v.memberId),[A]);assert.deepEqual(plan.holds.map(h=>h.portion),['renewal_referral']);
 const review={orderId:'breach',portion:'renewal_referral',beneficiaryUid:B,consentSha256:'b'.repeat(64),evidenceRef:'written resolution',reason:'verified',confirmed:true,requestKey:crypto.randomUUID()};
 assert.equal((await f.call('/renewals/resolve',review)).http,409);
 assert.equal((await f.call('/renewals/resolve',{...review,writtenPercent:20})).http,200);
});

test('revised contract checks each recipient independently and a later service restoration cannot revive missed renewals',async t=>{
 const f=fixture(t);
 for(const file of ['0075_partner_settlement_11510','0079_partner_full_service_evidence'])f.sql.exec(readFileSync(new URL('../migrations/'+file+'.sql',import.meta.url),'utf8'));
 await f.ready();await f.order('origin');assert.equal((await f.confirm('origin')).http,200);
 const signed=new Date(Date.now()-100).toISOString();
 const r2=await f.enroll(B,{templateVersion:'115.11-R2',signedAt:signed,documentSha256:'e'.repeat(64)});
 assert.equal(r2.terms.templateVersion,'115.11-R2');
 await f.call('/attribution',{target_uid:C,manager_uid:A,effectiveAt:past(),consentSha256:'b'.repeat(64),evidenceRef:'consent',confirmed:true,requestKey:crypto.randomUUID()});
 const renew=async id=>{
  await f.order(id,C,'tenant_renewal_fee');
  const next=f.sql.prepare('SELECT MAX(service_year_end) e FROM partner_service_year_claims WHERE buyer_uid=?').get(C).e;
  const result=await f.confirm(id,{serviceAdmission:'renewal',serviceYearStart:next,serviceYearEnd:anniversary(next)});
  assert.equal(result.http,200,JSON.stringify(result));return result.plan.transactions;
 };
 const unpaid=await renew('blocked');assert.deepEqual(unpaid.map(x=>[x.memberId,x.amount]),[[B,0],[A,1500]]);
 assert.equal(f.sql.prepare("SELECT status FROM bonus_transactions WHERE order_id='blocked' AND beneficiary_id=?").get(B).status,'service_ineligible');
 const start=now(),end=anniversary(start);
 f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type,payment_status,paid_at) VALUES(?,?,'tenant_annual_fee','paid',?)").run('my-full',B,start);
 const record=(action,extra={})=>f.call('/full-service',{target_uid:B,action,effectiveAt:now(),evidenceRef:'receipt and opening proof',confirmed:true,requestKey:crypto.randomUUID(),...extra});
 assert.equal((await record('open',{orderId:'my-full',effectiveAt:start,expiresAt:end})).http,200);
 assert.deepEqual((await renew('allowed')).map(x=>x.amount),[1500,1500]);
 assert.equal((await record('suspend')).http,200);assert.equal((await renew('paused'))[0].amount,0);
 assert.equal((await record('resume')).http,200);assert.equal((await renew('restored'))[0].amount,1500);
 assert.equal(f.sql.prepare("SELECT amount FROM bonus_transactions WHERE order_id='paused' AND beneficiary_id=?").get(B).amount,0);
});

test('service years are exclusive at expiry, allow adjacent renewal years and require a paid personal order',async t=>{
 const {fullServiceCheck}=await import('../worker/partner-full-service.mjs');
 const f=fixture(t);
 f.sql.exec(readFileSync(new URL('../migrations/0079_partner_full_service_evidence.sql',import.meta.url),'utf8'));
 function year(id,buyer,start,end){
  f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type,payment_status,paid_at) VALUES(?,?,'tenant_annual_fee','paid',?)").run(id,buyer,start);
  f.sql.prepare("INSERT INTO partner_full_service_evidence VALUES(?,?, 'open',?,?,?,?,?,?,?,?)").run(id,buyer,id,start,end,'proof',start,A,crypto.randomUUID(),'{}');
 }
 const start='2025-11-01T00:00:00.000Z',boundary='2026-11-01T00:00:00.000Z',end='2027-11-01T00:00:00.000Z';
 year('owned',B,start,boundary);year('other',C,boundary,end);
 assert.equal((await fullServiceCheck(f.db,B,start,boundary)).valid,false);
 year('continued',B,boundary,end);assert.equal((await fullServiceCheck(f.db,B,start,boundary)).valid,true);
 f.sql.prepare("UPDATE orders SET payment_status='refunded' WHERE order_id='continued'").run();
 assert.equal((await fullServiceCheck(f.db,B,boundary,boundary)).valid,false);
});

test('pending annual receivable accepts a migrated current admin and keeps attribution pending', async t => {
 const f = fixture(t);
 const {createTenantReceivable} = await import('../worker/partner-bonus-v2.mjs');
 const link = (from, to) => f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(from, to);
 link('U' + '7'.repeat(32), A);
 const order = {orderId:'admin-pending', orderType:'tenant_annual_fee', buyerId:C, recruiterId:B,
  grossAmount:6300, netAmount:6000, taxAmount:300, taxRate:5, bv:3000};
 const create = (actor, orderId = order.orderId) => createTenantReceivable(f.env, {...order, orderId}, actor);
 assert.equal((await create(A)).replayed, false);
 assert.equal((await create(A)).replayed, true);
 await assert.rejects(() => create(D, 'unauthorized'), /不可建立其他會員/);
 await assert.rejects(() => updatePartnerV2OrderStatus(f.env, {orderId:order.orderId, authenticatedUserId:A}, 'cancelled'), /移轉/);
 f.onBatch(() => link(A, E));
 await assert.rejects(() => create(A, 'former-identity'), /更新/);
 f.sql.prepare('DELETE FROM user_identity_links WHERE old_line_id=?').run(A);
 f.onBatch(() => f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(A));
 await assert.rejects(() => create(A, 'revoked'), /更新/);
 const rows = f.sql.prepare('SELECT payment_status,bonus_status,recruiter_id,sponsor_id,placement_parent_id FROM orders').all();
 assert.deepEqual(rows.map(row => Object.values(row)), [['pending_payment','review_required','','','']]);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_transactions').get().n, 0);
});

test('current migrated admin can confirm receipt once while attribution remains pending', async t => {
 const f = fixture(t);
 const {createTenantReceivable} = await import('../worker/partner-bonus-v2.mjs');
 const order = {orderId:'receipt', orderType:'tenant_annual_fee', buyerId:C, grossAmount:6300,
  netAmount:6000, taxAmount:300, taxRate:5};
 const link = f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')");
 link.run(D, A);
 await createTenantReceivable(f.env, order, A);
 await createTenantReceivable(f.env, {...order,orderId:'race'}, A);
 const pay = (actor, orderId=order.orderId, extra={}) => markPartnerV2OrderPaid(f.env,
  {orderId, paymentProvider:'bank_transfer', authenticatedUserId:actor, ...extra});
 await assert.rejects(() => pay(C), /管理員/);
 await assert.rejects(() => pay(A, order.orderId, {grossAmount:6000}), /金額/);
 const result = await pay(A);
 assert.equal(result.data.paymentStatus,'paid');
 assert.equal(result.data.bonusStatus,'review_required');
 const read = () => f.sql.prepare('SELECT * FROM orders WHERE order_id=?').get(order.orderId);
 const receipt = read();
 assert.ok(receipt.paid_at);
 assert.equal((await pay(A)).replayed,true);
 assert.deepEqual(read(),receipt);
 assert.equal(receipt.recruiter_id,'');
 assert.equal(receipt.sponsor_id,'');
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_transactions').get().n,0);
 f.onBatch(() => f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(A));
 await assert.rejects(() => pay(A,'race'));
 f.sql.prepare("UPDATE users SET role='admin' WHERE line_id=?").run(A);
 f.onBatch(() => {f.onBatch(null); link.run(A,E);});
 await assert.rejects(() => pay(A,'race'));
 await assert.rejects(() => pay(A));
 assert.equal(f.sql.prepare("SELECT payment_status FROM orders WHERE order_id='race'").get().payment_status,'pending_payment');
});

test('paid order review authenticates the exact current admin despite a shared historical alias',async t=>{
 const f=fixture(t),proof=crypto.randomUUID(),old='U'+'7'.repeat(32),orderId='review-paid';
 await f.enroll(B);
 const {createTenantReceivable}=await import('../worker/partner-bonus-v2.mjs');
 await createTenantReceivable(f.env,{orderId,orderType:'tenant_annual_fee',buyerId:C,grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5},A);
 await markPartnerV2OrderPaid(f.env,{orderId,authenticatedUserId:A});
 f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(old,A);
 f.sql.prepare('UPDATE users SET legacy_line_id=? WHERE line_id IN (?,?)').run(old,A,D);
 f.sql.exec('CREATE TABLE full_applications(id TEXT PRIMARY KEY,owner_uid TEXT,snapshot_json TEXT,content_sha256 TEXT,signed_at TEXT); CREATE TABLE full_application_reviews(application_id TEXT PRIMARY KEY,decision TEXT); CREATE TABLE member_number_registry(member_number TEXT,user_row_id TEXT,line_id TEXT);');
 f.sql.prepare('INSERT INTO member_number_registry VALUES(?,?,?)').run('20261026002',B,B);
 const read=()=>f.call('?target='+C);
 const empty=await read();assert.equal(empty.http,200,JSON.stringify(empty));
 assert.deepEqual(empty.heldOrders,[{orderId,status:'paid'}]);assert.deepEqual(empty.referralProofs,[]);
 assert.equal((await f.call('?target='+C,null,'user')).http,403);
 assert.equal((await f.call('/lookup?memberNumber=20261026002')).member.userId,B);
 const review={orderId,target_uid:C,memberNumber:'20261026002',applicationId:proof,note:'核對已簽資料',confirmed:true,requestKey:crypto.randomUUID()};
 assert.equal((await f.call('/order-referral',review)).http,409);
 f.sql.prepare('INSERT INTO full_applications VALUES(?,?,?,?,?)').run(proof,C,JSON.stringify({form_kind:'full',signer_uid:C,fields:{performance_owner_member_number:'20261026002'}}),'a'.repeat(64),now());
 f.sql.prepare("INSERT INTO full_application_reviews VALUES(?,'accepted')").run(proof);
 assert.equal((await read()).referralProofs[0].id,proof);
 f.onBatch(()=>f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(A));
 assert.equal((await f.call('/order-referral',review)).http,409);
 f.onBatch(null);f.sql.prepare("UPDATE users SET role='admin' WHERE line_id=?").run(A);
 assert.equal((await f.call('/order-referral',review)).http,200);
 assert.equal((await f.call('/order-referral',review)).replayed,true);
 assert.equal(f.sql.prepare('SELECT recruiter_id FROM orders WHERE order_id=?').get(orderId).recruiter_id,B);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_transactions').get().n,0);
 f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(A,E);
 assert.equal((await read()).http,409);
});
