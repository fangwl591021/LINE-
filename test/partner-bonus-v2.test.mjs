import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN as A,REWARD as B,OTHER as C,mapper} from './fixtures/reward-unit-directory.mjs';
import {PARTNER_POLICY_VERSION as VERSION,calculatePartnerBonusV2,handlePartnerContracts,createPartnerV2Order,markPartnerV2OrderPaid,updatePartnerV2OrderStatus} from '../worker/partner-bonus-v2.mjs';
const D='U'+'d'.repeat(32),E='U'+'e'.repeat(32),G='U'+'f'.repeat(32);
const then=()=>new Date(Date.now()-86400000).toISOString();
function fixture(t){
 const f=rewardFixture();t.after(()=>f.sql.close());
 f.sql.exec("ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT '';ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT '';ALTER TABLE users ADD COLUMN member_joined_at TEXT DEFAULT '';ALTER TABLE users ADD COLUMN member_date_source TEXT DEFAULT '';");
 const schema=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');
 for(const name of ['orders','bonus_transactions'])f.sql.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 f.sql.exec(readFileSync(new URL('../migrations/0070_partner_bonus_v2.sql',import.meta.url),'utf8'));
 for(const id of [D,E,G])f.sql.prepare("INSERT INTO users(row_id,line_id,role) VALUES(?,?,'user')").run(id,id);
 f.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(A,B);for(const id of [C,D,E])f.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(B,id);
 f.call=async(path='',data,token='admin')=>{const r=await handlePartnerContracts(new Request('https://test/v1/partner-contracts'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),f.env,mapper,async(url,opts)=>{assert.equal(url,'https://api.line.me/v2/profile');const id={admin:A,user:C,reward:B}[opts.headers.Authorization.slice(7)];return id?Response.json({userId:id}):new Response('',{status:401});});return {http:r.status,...await r.json()};};
 f.enroll=async(uid,status='not_purchased',extra={})=>{const r=await f.call('',{target_uid:uid,signedAt:then(),effectiveAt:then(),documentSha256:'a'.repeat(64),evidenceRef:'合成已簽文件保管編號',confirmed:true,requestKey:crypto.randomUUID(),purchaseStatus:status,...extra});assert.equal(r.http,200,JSON.stringify(r));return r.contract;};
 f.legacyOrder=(id,buyer=B)=>f.sql.prepare("INSERT INTO orders(order_id,buyer_id,recruiter_id,order_type,gross_amount,net_amount,tax_amount,tax_rate,payment_status,paid_at,bonus_policy_type) VALUES(?,?,?,'tenant_annual_fee',6300,6000,300,5,'paid',?,'left_right_independent_split')").run(id,buyer,A,then());
 f.newOrder=async(id,buyer=C,type='tenant_annual_fee')=>{const order={orderId:id,orderType:type,buyerId:buyer,buyerName:'合成會員',recruiterId:B,sponsorId:B,grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5,bv:3000};const result=await createPartnerV2Order(f.env,order);assert.equal(result?.success,true,JSON.stringify(result));return order;};
 f.pay=async id=>{const r=await markPartnerV2OrderPaid(f.env,{orderId:id,paymentNo:'SYNTHETIC-'+id});assert.equal(r?.success,true,JSON.stringify(r));return r;};
 f.confirmData=id=>({orderId:id,receiptRef:'合成收款與開通憑證',serviceOpenedAt:f.sql.prepare('SELECT captured_at FROM partner_bonus_order_snapshots WHERE order_id=?').get(id).captured_at,confirmed:true,requestKey:crypto.randomUUID()});
 f.seedAdvanced=async uid=>{for(let n=0;n<2;n++){const buyer='U'+String(n+1).repeat(32),id='seed-'+uid+n;f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type,payment_status,net_amount) VALUES(?,?,'tenant_annual_fee','paid',6000)").run(id,buyer);f.sql.prepare("INSERT INTO partner_bonus_deal_confirmations VALUES(?,?,?,'tenant_annual_fee','fixture',?,?,?,?,?,?,?,?)").run(id,uid,buyer,then(),then(),A,n+1,'{}','{}',crypto.randomUUID(),'{}');}};
 return f;
}
const facts=(extra={})=>({orderType:'tenant_annual_fee',netAmount:6000,recruiterUid:B,priorValidDeals:0,selfPurchased:true,directSponsor:A,directSponsorEligible:true,chainComplete:true,upline:[{uid:A,eligible:true,advanced:true}],...extra});
test('new paid policy first two, pass-up, differential and third full share are bounded by actual 50%',()=>{
 for(const priorValidDeals of [0,1])assert.deepEqual(calculatePartnerBonusV2(facts({priorValidDeals})).transactions.map(t=>[t.memberId,t.amount]),[[B,1500],[A,1500]]);
 assert.deepEqual(calculatePartnerBonusV2(facts({selfPurchased:false})).transactions.map(t=>[t.memberId,t.bonusType,t.amount]),[[A,'first_two_passup',1500],[A,'advanced_differential',1500]]);
 assert.deepEqual(calculatePartnerBonusV2(facts({selfPurchased:false,upline:[{uid:A,eligible:true,advanced:false},{uid:G,eligible:true,advanced:true}]})).transactions.map(t=>[t.memberId,t.amount]),[[A,1500],[G,1500]]);
 assert.deepEqual(calculatePartnerBonusV2(facts({priorValidDeals:2,selfPurchased:undefined,chainComplete:false})).transactions.map(t=>[t.memberId,t.amount]),[[B,3000]]);
 assert.equal(calculatePartnerBonusV2(facts({netAmount:4000})).transactions.reduce((n,t)=>n+t.amount,0),2000);
 assert.equal(calculatePartnerBonusV2(facts({upline:[]})).transactions.reduce((n,t)=>n+t.amount,0),1500);
 for(const extra of [{selfPurchased:undefined},{selfPurchased:false,directSponsorEligible:false},{chainComplete:false},{invalidatedQualification:true}]){const p=calculatePartnerBonusV2(facts(extra));assert.equal(p.status,'review_required');assert.deepEqual(p.transactions,[]);}
});
test('renewals split original/current 25+25 even same member or changed purchase/qualification',()=>{
 for(const currentOwner of [A,B]){const p=calculatePartnerBonusV2(facts({orderType:'tenant_renewal_fee',originalReferrer:B,currentOwner,originalEligible:true,ownerEligible:true,selfPurchased:false,invalidatedQualification:true}));assert.equal(p.status,'pending');assert.deepEqual(p.transactions.map(t=>t.amount),[1500,1500]);}
 assert.equal(calculatePartnerBonusV2(facts({orderType:'tenant_renewal_fee',originalReferrer:B,currentOwner:A,originalEligible:true,ownerEligible:false})).status,'review_required');
});
test('only authenticated admin enrolls real member with immutable signed proof; role/points/referral unchanged',async t=>{
 const f=fixture(t),before=f.sql.prepare('SELECT * FROM users').all();
 assert.equal((await f.call('?target='+B,undefined,'user')).http,403);assert.equal((await f.call('?target='+B,undefined,'bad')).http,401);
 const data={target_uid:B,signedAt:then(),effectiveAt:then(),documentSha256:'a'.repeat(64),evidenceRef:'合成',confirmed:true,requestKey:crypto.randomUUID(),purchaseStatus:'not_purchased'};
 const r=await f.call('',data);assert.equal(r.http,200,JSON.stringify(r));assert.equal(r.contract.policy_version,VERSION);assert.equal((await f.call('',data)).contract.id,r.contract.id);assert.equal((await f.call('',{...data,evidenceRef:'改寫'})).http,409);assert.deepEqual(f.sql.prepare('SELECT * FROM users').all(),before);
 assert.equal((await f.call('',{...data,requestKey:crypto.randomUUID(),documentSha256:'invalid'})).http,400);
 assert.equal((await f.call('',{...data,requestKey:crypto.randomUUID(),purchaseStatus:'purchased',purchaseOrderId:'missing'})).http,409);
});
test('only new orders after a verified effective enrollment activate v2; old order stays old',async t=>{
 const f=fixture(t);f.legacyOrder('old-customer',C);const old=f.sql.prepare("SELECT * FROM orders WHERE order_id='old-customer'").get();
 const oldInput={orderId:'old-customer',buyerId:C,orderType:'tenant_annual_fee',grossAmount:6300,netAmount:6000};assert.equal((await createPartnerV2Order(f.env,oldInput)).replayed,true);await assert.rejects(()=>createPartnerV2Order(f.env,{...oldInput,grossAmount:1}),/覆寫/);assert.deepEqual(f.sql.prepare("SELECT * FROM orders WHERE order_id='old-customer'").get(),old);
 const order={orderId:'before-sign',orderType:'tenant_annual_fee',buyerId:C,grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5};assert.equal((await createPartnerV2Order(f.env,order)).data.bonusPolicyType,'left_right_independent_split');
 await assert.rejects(()=>createPartnerV2Order(f.env,{...order,orderId:'forged-v2',bonusPolicyType:VERSION}),/前端/);assert.equal(f.sql.prepare("SELECT count(*) n FROM orders WHERE order_id='forged-v2'").get().n,0);
 await f.enroll(B);const saved=await f.newOrder('new-after-sign',D);assert.equal(f.sql.prepare('SELECT bonus_policy_type FROM orders WHERE order_id=?').get(saved.orderId).bonus_policy_type,VERSION);
 assert.equal(f.sql.prepare("SELECT bonus_policy_type FROM orders WHERE order_id='old-customer'").get().bonus_policy_type,'left_right_independent_split');
 assert.equal((await createPartnerV2Order(f.env,saved)).replayed,true);await assert.rejects(()=>createPartnerV2Order(f.env,{...saved,grossAmount:1}));
});
test('paid is held until explicit opened-service confirmation; two valid new deals promote only third',async t=>{
 const f=fixture(t);await f.enroll(A);await f.seedAdvanced(A);await f.enroll(B);
 for(const [index,buyer]of [C,D,E].entries()){
  const id='new-'+index;await f.newOrder(id,buyer);await f.pay(id);assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_transactions WHERE order_id=?').get(id).n,0);
  const r=await f.call('/deals/confirm',f.confirmData(id));assert.equal(r.http,200,JSON.stringify(r));assert.equal(r.settlementStatus,'review_required');
  const tx=f.sql.prepare('SELECT beneficiary_id,amount,status FROM bonus_transactions WHERE order_id=? ORDER BY tx_id').all(id);
  assert.deepEqual(tx.map(x=>[x.beneficiary_id,x.amount]),index<2?[[A,1500],[A,1500]]:[[B,3000]]);assert.ok(tx.every(x=>x.status==='review_required'));
 }
 assert.equal((await f.call('?target='+B)).validDealCount,3);
});
test('payment and deal confirmation replay cannot rewrite ledger, paid/settled rows or old records',async t=>{
 const f=fixture(t);await f.enroll(A);await f.seedAdvanced(A);await f.enroll(B);await f.newOrder('once');await f.pay('once');const data=f.confirmData('once');assert.equal((await f.call('/deals/confirm',data)).http,200);
 f.sql.exec("UPDATE bonus_transactions SET status='paid' WHERE order_id='once'");const ledger=f.sql.prepare('SELECT * FROM bonus_transactions').all();
 assert.equal((await f.call('/deals/confirm',data)).replayed,true);assert.equal((await f.call('/deals/confirm',{...data,requestKey:crypto.randomUUID()})).http,409);assert.equal((await f.pay('once')).replayed,true);assert.deepEqual(f.sql.prepare('SELECT * FROM bonus_transactions').all(),ledger);
 await assert.rejects(()=>markPartnerV2OrderPaid(f.env,{orderId:'once',paymentNo:'another'}));
});
test('unknown purchase, missing parent and revoked admin hold without bonus writes',async t=>{
 const f=fixture(t);await f.enroll(B,'unknown');await f.newOrder('hold');await f.pay('hold');const r=await f.call('/deals/confirm',f.confirmData('hold'));assert.equal(r.http,409);assert.match(r.reviewReasons.join(','),/purchase_status/);assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_transactions').get().n,0);
 const original=f.db.prepare.bind(f.db);f.db.prepare=query=>{const st=original(query);if(!query.startsWith('UPDATE partner_bonus_v2_clock'))return st;const bind=st.bind.bind(st);st.bind=(...args)=>{const bound=bind(...args);f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(A);return bound;};return st;};
 const r2=await f.call('',{target_uid:D,signedAt:then(),effectiveAt:then(),documentSha256:'b'.repeat(64),evidenceRef:'合成',confirmed:true,requestKey:crypto.randomUUID(),purchaseStatus:'not_purchased'});assert.equal(r2.http,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_contract_enrollments WHERE member_uid=?').get(D).n,0);
});
test('consented current manager is separate; renewal freezes original and current identities',async t=>{
 const f=fixture(t);await f.enroll(A);await f.seedAdvanced(A);await f.enroll(B);await f.newOrder('first');await f.pay('first');assert.equal((await f.call('/deals/confirm',f.confirmData('first'))).http,200);
 const before=f.sql.prepare('SELECT referrer_id FROM users WHERE line_id=?').get(C).referrer_id;
 const transfer={target_uid:C,manager_uid:A,effectiveAt:then(),consentSha256:'b'.repeat(64),evidenceRef:'合成同意證據',confirmed:true,requestKey:crypto.randomUUID()};assert.equal((await f.call('/attribution',transfer)).http,200);
 assert.equal(f.sql.prepare('SELECT referrer_id FROM users WHERE line_id=?').get(C).referrer_id,before);
 await f.newOrder('renewal',C,'tenant_renewal_fee');await f.pay('renewal');const r=await f.call('/deals/confirm',f.confirmData('renewal'));assert.equal(r.http,200,JSON.stringify(r));assert.deepEqual(r.plan.transactions.map(x=>[x.memberId,x.amount]),[[B,1500],[A,1500]]);
});
test('refund excludes qualification, holds future first-year awards and preserves settled rows',async t=>{
 const f=fixture(t);await f.enroll(A);await f.seedAdvanced(A);await f.enroll(B);await f.newOrder('refundable');await f.pay('refundable');assert.equal((await f.call('/deals/confirm',f.confirmData('refundable'))).http,200);
 f.sql.exec("UPDATE bonus_transactions SET status='paid' WHERE order_id='refundable'");const old=f.sql.prepare("SELECT * FROM bonus_transactions WHERE order_id='refundable'").all();
 const confirmation=f.sql.prepare("SELECT request_json FROM partner_bonus_deal_confirmations WHERE order_id='refundable'").get();
 await updatePartnerV2OrderStatus(f.env,{orderId:'refundable',authenticatedUserId:A},'refunded');assert.equal((await f.call('?target='+B)).validDealCount,0);assert.deepEqual(f.sql.prepare("SELECT * FROM bonus_transactions WHERE order_id='refundable'").all(),old);
 assert.equal((await updatePartnerV2OrderStatus(f.env,{orderId:'refundable',authenticatedUserId:A},'refunded')).replayed,true);assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_bonus_v2_status_events').get().n,1);
 await assert.rejects(()=>updatePartnerV2OrderStatus(f.env,{orderId:'refundable',authenticatedUserId:A},'cancelled'),/退費/);
 const replay=await f.call('/deals/confirm',JSON.parse(confirmation.request_json));assert.equal(replay.http,409);assert.equal(replay.currentStatus,'refunded');assert.equal(replay.reviewRequired,true);
 await f.newOrder('after-refund',D);await f.pay('after-refund');const r=await f.call('/deals/confirm',f.confirmData('after-refund'));assert.equal(r.http,409);assert.match(r.reviewReasons.join(','),/qualification/);
});
test('v2 money is TWD and cents-safe; derived BV ignores caller value and purchase evidence wins over stale manual label',async t=>{
 const f=fixture(t);await f.enroll(A);await f.seedAdvanced(A);f.legacyOrder('own-purchase',B);await f.enroll(B,'not_purchased');
 const order={orderId:'money',orderType:'tenant_annual_fee',buyerId:C,recruiterId:B,grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5,bv:1};
 for(const change of [{currency:'USD'},{taxAmount:301},{grossAmount:Number.MAX_SAFE_INTEGER,netAmount:Math.round(Number.MAX_SAFE_INTEGER/1.05)}])await assert.rejects(()=>createPartnerV2Order(f.env,{...order,...change}),/新臺幣/);
 assert.equal(calculatePartnerBonusV2(facts({netAmount:Number.MAX_SAFE_INTEGER})).status,'review_required');
 assert.equal((await createPartnerV2Order(f.env,order)).data.bv,3000);await f.pay('money');const r=await f.call('/deals/confirm',f.confirmData('money'));assert.equal(r.http,200,JSON.stringify(r));assert.equal(r.plan.transactions[0].memberId,B);assert.equal(r.plan.transactions[0].bonusType,'direct_split');
});
test('independent clock nonce prevents same request-key cross-endpoint phantom write',async t=>{
 const f=fixture(t),key=crypto.randomUUID();
 f.onBatch(()=>{f.sql.prepare('UPDATE partner_bonus_v2_clock SET revision=revision+1,last_key=? WHERE id=1').run(key);});
 const r=await f.call('',{target_uid:B,signedAt:then(),effectiveAt:then(),documentSha256:'a'.repeat(64),evidenceRef:'合成',confirmed:true,requestKey:key,purchaseStatus:'not_purchased'});
 assert.equal(r.http,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_contract_enrollments').get().n,0);
});
test('concurrent enrollment forces order creation to retry policy classification, never legacy upsert',async t=>{
 const f=fixture(t),template=await f.enroll(A);let once=false;
 f.onBatch(()=>{if(once)return;once=true;const at=new Date().toISOString();f.sql.prepare('INSERT INTO partner_contract_enrollments SELECT ?,?,policy_version,signed_at,effective_at,expires_at,document_sha256,evidence_ref,?,purchase_status,purchase_order_id,verified_by,?,verified_revision,?,request_json FROM partner_contract_enrollments WHERE id=?').run(crypto.randomUUID(),B,A,at,crypto.randomUUID(),template.id);f.sql.exec("UPDATE partner_bonus_v2_clock SET revision=revision+1,last_key='external-enrollment' WHERE id=1");});
 const result=await f.newOrder('enrollment-race');assert.equal(f.sql.prepare('SELECT bonus_policy_type FROM orders WHERE order_id=?').get(result.orderId).bonus_policy_type,VERSION);assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_bonus_order_snapshots').get().n,1);
});
test('migrated member, self-referral, and revoked alias authority cannot create signed policy writes',async t=>{
 const f=fixture(t);await f.enroll(B);const order={orderId:'alias-hold',orderType:'tenant_annual_fee',buyerId:C,grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5};
 f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(G,B);await assert.rejects(()=>createPartnerV2Order(f.env,order),/移轉/);assert.equal(f.sql.prepare('SELECT count(*) n FROM orders').get().n,0);f.sql.exec('DELETE FROM user_identity_links');
 f.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(B,B);await assert.rejects(()=>createPartnerV2Order(f.env,{...order,buyerId:B}),/本人/);
 f.onBatch(()=>{f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(G,A);});
 const r=await f.call('',{target_uid:D,signedAt:then(),effectiveAt:then(),documentSha256:'b'.repeat(64),evidenceRef:'合成',confirmed:true,requestKey:crypto.randomUUID(),purchaseStatus:'not_purchased'});assert.equal(r.http,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_contract_enrollments WHERE member_uid=?').get(D).n,0);
});
test('target referral changed during enrollment and legacy qualification unknown hold without guessed awards',async t=>{
 const f=fixture(t);await f.enroll(A);await f.seedAdvanced(A);f.onBatch(()=>f.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(G,B));
 const r=await f.call('',{target_uid:B,signedAt:then(),effectiveAt:then(),documentSha256:'b'.repeat(64),evidenceRef:'合成',confirmed:true,requestKey:crypto.randomUUID(),purchaseStatus:'not_purchased'});assert.equal(r.http,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_contract_enrollments WHERE member_uid=?').get(B).n,0);f.onBatch(()=>{});f.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(A,B);await f.enroll(B);
 f.legacyOrder('legacy-seniority',G);f.sql.prepare("UPDATE orders SET recruiter_id=? WHERE order_id='legacy-seniority'").run(B);await f.newOrder('qualification-hold');await f.pay('qualification-hold');const hold=await f.call('/deals/confirm',f.confirmData('qualification-hold'));assert.equal(hold.http,409);assert.match(hold.reviewReasons.join(','),/historical_qualification/);assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_transactions').get().n,0);
});
test('creation keeps existing store manager scope but rechecks its role during the atomic write',async t=>{
 const f=fixture(t);await f.enroll(B);f.sql.prepare("UPDATE users SET role='store' WHERE line_id=?").run(G);
 const order={orderId:'manager-create',orderType:'tenant_annual_fee',buyerId:C,grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5};assert.equal((await createPartnerV2Order(f.env,order,undefined,G)).success,true);
 let once=false;f.onBatch(()=>{if(!once){once=true;f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(G);}});
 await assert.rejects(()=>createPartnerV2Order(f.env,{...order,orderId:'revoked-manager'},undefined,G),/更新/);assert.equal(f.sql.prepare("SELECT count(*) n FROM orders WHERE order_id='revoked-manager'").get().n,0);
});
test('unsigned canonical members keep legacy creation despite active identity links; signed alias never falls back',async t=>{
 const f=fixture(t),oldRecruiter='U'+'9'.repeat(32),oldBuyer='U'+'8'.repeat(32),oldActor='U'+'7'.repeat(32),order={orderId:'unsigned-linked',orderType:'tenant_annual_fee',buyerId:C,grossAmount:6300,netAmount:6000,taxAmount:300,taxRate:5};
 for(const [old,current]of [[oldRecruiter,B],[oldBuyer,C],[oldActor,A]])f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(old,current);
 const saved=await createPartnerV2Order(f.env,order,undefined,A);assert.equal(saved.data.bonusPolicyType,'left_right_independent_split');assert.equal((await createPartnerV2Order(f.env,order,undefined,A)).replayed,true);assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_bonus_order_snapshots').get().n,0);
 f.sql.exec('DELETE FROM user_identity_links');await f.enroll(B);f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(B,oldRecruiter);f.sql.prepare('UPDATE users SET referrer_id=? WHERE line_id=?').run(oldRecruiter,D);
 await assert.rejects(()=>createPartnerV2Order(f.env,{...order,orderId:'signed-old-alias',buyerId:D}),/移轉/);assert.equal(f.sql.prepare("SELECT count(*) n FROM orders WHERE order_id='signed-old-alias'").get().n,0);
});
