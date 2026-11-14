import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN,OTHER,mapper} from './fixtures/reward-unit-directory.mjs';
import {handleBonusOrderSequence} from '../worker/bonus-order-sequence.mjs';
import {sha256Text} from '../worker/hand-sign-application-definition.mjs';
function fixture(t){
 const f=rewardFixture();t.after(()=>f.sql.close());
 f.sql.exec("ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT ''");
 const schema=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');
 for(const name of ['orders','bonus_transactions'])f.sql.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 for(const name of ['0070_partner_bonus_v2','0074_partner_policy_11510','0075_partner_settlement_11510','0077_hand_sign_contracts','0079_partner_full_service_evidence','0082_partner_project_qualification','0087_partner_performance_date_candidates','0088_bonus_order_sequence_drafts','0089_bonus_release_control'])f.sql.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
 f.sql.prepare("INSERT INTO bonus_release_control_events VALUES(1,1,0,?,'fixture','2026-11-14',?,'{}')").run(ADMIN,crypto.randomUUID());
 f.sql.prepare("INSERT INTO orders(order_id,buyer_id,buyer_name,order_type,payment_status,paid_at) VALUES(?,?,?,'tenant_annual_fee','paid','2026-11-01')").run('order-a',OTHER,'合成甲');
 f.sql.prepare("INSERT INTO orders(order_id,buyer_id,buyer_name,order_type,payment_status) VALUES(?,?,?,'tenant_annual_fee','pending_payment')").run('order-b',OTHER,'合成乙');
 f.call=async({method='GET',query='',data,token='admin'}={})=>{
  const r=await handleBonusOrderSequence(new Request('https://test/v1/admin/bonus-order-sequence'+query,{method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),f.env,mapper,async(url,opts)=>{const v=opts.headers.Authorization.slice(7);return ['admin','user'].includes(v)?Response.json({userId:v==='admin'?ADMIN:OTHER}):new Response('',{status:401});});return {http:r.status,...await r.json()};
 };
 f.data=(changes={})=>({batchId:crypto.randomUUID(),expectedVersion:0,requestKey:crypto.randomUUID(),confirmedComplete:true,evidenceRef:'管理員提供的整理依據',periodFrom:'2026-10',periodTo:'2026-10',orderIds:['order-b','order-a'],...changes});
 return f;
}
test('sequence draft never invents historical facts, amounts or changes financial records',async t=>{
 const f=fixture(t),before=f.sql.prepare('SELECT * FROM orders').all(),data=f.data();
 const candidates=await f.call({query:'?candidates=1'});assert.equal(candidates.http,200);assert.equal(candidates.completenessProven,false);assert.equal(candidates.hasMore,false);assert.equal(candidates.nextCursor,'');assert.equal(candidates.items[0].performanceDate,null);
 const saved=await f.call({method:'POST',data});assert.equal(saved.http,200,JSON.stringify(saved));assert.equal(saved.status,'review_required');assert.equal(saved.canConfirm,false);assert.equal(saved.completenessProven,false);
 assert.deepEqual(saved.items.map(x=>x.orderId),['order-b','order-a']);assert.ok(saved.items.every(x=>x.proposedAwards===null&&x.reviewReasons.length>0));
 assert.ok(saved.items[0].reviewReasons.includes('ORDER_NOT_PAID'));assert.ok(saved.items[1].reviewReasons.includes('SIGNED_APPLICATION_UNVERIFIED'));
 assert.deepEqual(f.sql.prepare('SELECT * FROM orders').all(),before);assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_transactions').get().n,0);
 const event=f.sql.prepare('SELECT * FROM bonus_order_sequence_draft_events').get();assert.equal(event.recorded_by,ADMIN);assert.ok(event.recorded_at);assert.equal(JSON.parse(event.request_json).confirmedComplete,true);
 assert.equal((await f.call({method:'POST',data})).replayed,true);assert.equal((await f.call({method:'POST',data:{...data,evidenceRef:'更改'}})).http,409);
 assert.equal((await f.call({query:'?batch_id='+data.batchId})).version,1);assert.equal((await f.call({query:'?batches=1'})).batches[0].batchId,data.batchId);
 const update={...data,expectedVersion:1,requestKey:crypto.randomUUID(),orderIds:['order-a','order-b']};assert.equal((await f.call({method:'POST',data:update})).version,2);
 assert.equal((await f.call({method:'POST',data:{...update,requestKey:crypto.randomUUID()}})).http,409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_order_sequence_draft_events').get().n,2);
});
test('ordinary users, missing attestation, duplicate orders and revoked authority cannot write',async t=>{
 const f=fixture(t),data=f.data();assert.equal((await f.call({method:'POST',data,token:'user'})).http,403);
 for(const change of [{confirmedComplete:false},{orderIds:['order-a','order-a']},{periodFrom:'2026-09'},{orderIds:['nonexistent']},{scopeVerified:true,baseline:{},records:[]}])assert.notEqual((await f.call({method:'POST',data:{...data,...change}})).http,200);
 f.onBatch(()=>f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN));
 assert.equal((await f.call({method:'POST',data})).http,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_order_sequence_draft_events').get().n,0);
});
test('existing financial evidence is shown only as an existing record and marked for conflict review',async t=>{
 const f=fixture(t);f.sql.prepare("INSERT INTO bonus_transactions(tx_id,order_id,beneficiary_id,amount,status) VALUES('t','order-a',?,1500,'paid')").run(OTHER);
 const result=await f.call({method:'POST',data:f.data()});const item=result.items.find(x=>x.orderId==='order-a');
 assert.ok(item.reviewReasons.includes('EXISTING_CONFIRMATION_IMPACT'));assert.equal(item.existingAwards[0].amount,1500);assert.equal(item.existingAwards[0].status,'paid');assert.equal(item.proposedAwards,null);assert.equal(result.canConfirm,false);
});
test('candidate pagination is bounded and concurrent draft writes retain one version',async t=>{
 const f=fixture(t),insert=f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type) VALUES(?,?,'tenant_annual_fee')");
 for(let i=0;i<103;i++)insert.run('synthetic-'+String(i).padStart(3,'0'),OTHER);
 const first=await f.call({query:'?candidates=1'});assert.equal(first.items.length,100);assert.equal(first.hasMore,true);assert.ok(first.nextCursor);
 const next=await f.call({query:'?candidates=1&after='+first.nextCursor});assert.equal(next.items.length,5);assert.equal(next.hasMore,false);assert.equal(next.nextCursor,'');
 assert.equal(new Set([...first.items,...next.items].map(x=>x.orderId)).size,105);
 const d=f.data(),results=await Promise.all([f.call({method:'POST',data:d}),f.call({method:'POST',data:{...d,requestKey:crypto.randomUUID(),orderIds:['order-a']}})]);
 assert.deepEqual(results.map(r=>r.http).sort(),[200,409]);assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_order_sequence_draft_events').get().n,1);
});
test('an order changed out of scope before save cannot produce a draft event',async t=>{
 const f=fixture(t);f.onBatch(()=>f.sql.exec("UPDATE orders SET order_type='other' WHERE order_id='order-a'"));
 assert.equal((await f.call({method:'POST',data:f.data()})).http,409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_order_sequence_draft_events').get().n,0);
});
test('automatically created snapshots never imply an accepted or verified application',async t=>{
 const f=fixture(t);
 f.sql.exec("INSERT INTO partner_bonus_order_snapshots VALUES('order-a','auto-contract','policy','recruiter','buyer','2026-11-01','{}')");
 const candidates=await f.call({query:'?candidates=1'}),item=candidates.items.find(x=>x.orderId==='order-a');
 assert.equal(item.hasSnapshot,true);assert.equal(item.reviewed,false);assert.equal(item.signedApplicationVerified,false);
 const draft=await f.call({method:'POST',data:f.data()}),checked=draft.items.find(x=>x.orderId==='order-a');
 assert.equal(checked.hasSnapshot,true);assert.equal(checked.reviewed,false);assert.equal(checked.signedApplicationVerified,false);
 assert.ok(checked.reviewReasons.includes('SIGNED_APPLICATION_UNVERIFIED'));assert.equal(checked.proposedAwards,null);
});
test('draft listing uses immutable batch IDs for stable paging when timestamps tie and versions change',async t=>{
 const f=fixture(t),insert=f.sql.prepare('INSERT INTO bonus_order_sequence_draft_events VALUES(?,?,?,?,?,?,?)');
 const ids=Array.from({length:105},()=>crypto.randomUUID()).sort(),payload=JSON.stringify(f.data());
 for(const id of ids)insert.run(crypto.randomUUID(),id,1,crypto.randomUUID(),payload,ADMIN,'2026-11-14T00:00:00.000Z');
 const first=await f.call({query:'?batches=1'});assert.equal(first.batches.length,100);assert.equal(first.hasMore,true);assert.equal(first.nextCursor,ids[99]);
 insert.run(crypto.randomUUID(),ids[102],2,crypto.randomUUID(),payload,ADMIN,'2026-11-14T00:00:00.000Z');
 const next=await f.call({query:'?batches=1&after='+first.nextCursor});assert.equal(next.batches.length,5);assert.equal(next.hasMore,false);assert.equal(next.nextCursor,'');
 assert.deepEqual([...first.batches,...next.batches].map(b=>b.batchId),ids);assert.equal(next.batches.find(b=>b.batchId===ids[102]).version,2);
 assert.equal((await f.call({query:'?batches=1&after=invalid'})).http,400);
});
test('server verifies individual evidence and still refuses figures without a verified baseline',async t=>{
 const f=fixture(t),appId=crypto.randomUUID(),hash='a'.repeat(64),number='20261026002';
 f.sql.prepare('UPDATE users SET member_number=? WHERE line_id=?').run(number,ADMIN);
 f.sql.prepare("UPDATE orders SET recruiter_id=? WHERE order_id='order-a'").run(ADMIN);
 f.sql.prepare(`INSERT INTO partner_contract_enrollments(id,member_uid,policy_version,signed_at,effective_at,expires_at,document_sha256,evidence_ref,sponsor_uid,purchase_status,verified_by,verified_at,request_key,request_json)
  VALUES('contract',?,'cocreator-115.10-v3','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2027-11-01T00:00:00Z',?,'proof','','unknown',?,'2026-09-01T00:00:00Z',?,'{}')`).run(ADMIN,hash,ADMIN,crypto.randomUUID());
 f.sql.exec("INSERT INTO partner_contract_11510_terms VALUES('contract','115.10','{}')");
 const signedJson=JSON.stringify({form_kind:'full',signer_uid:OTHER,fields:{performance_owner_member_number:number}}),signedHash=await sha256Text(signedJson);
 f.sql.prepare('INSERT INTO full_applications VALUES(?,?,?,?,?,?,?,?)').run(appId,OTHER,'fixture','fixture',signedJson,'{}',signedHash,'2026-09-02T00:00:00Z');
 f.sql.prepare('INSERT INTO full_application_reviews VALUES(?,?,?,?,?)').run(appId,ADMIN,'accepted','fixture','2026-09-03T00:00:00Z');
 const snap={classificationSource:'signed_order_review',applicationId:appId,verifiedBy:ADMIN,verifiedAt:'2026-09-04T00:00:00Z',verifiedMemberNumber:number,documentSha256:signedHash};
 f.sql.prepare('INSERT INTO partner_bonus_order_snapshots VALUES(?,?,?,?,?,?,?)').run('order-a','contract','cocreator-115.10-v3',ADMIN,OTHER,'2026-11-01T00:00:00Z',JSON.stringify(snap));
 f.sql.prepare("INSERT INTO partner_bonus_performance_date_events VALUES(?,?,1,'','','month','2026-10','fixture','2026-11-01T00:00:00Z',?,?, '{}')").run(crypto.randomUUID(),'order-a',ADMIN,crypto.randomUUID());
 f.sql.prepare("INSERT INTO partner_full_service_evidence VALUES(?,?,'open','order-a','2026-11-02T00:00:00Z','2027-11-02T00:00:00Z','proof','2026-11-02T00:00:00Z',?,?, '{}')").run(crypto.randomUUID(),OTHER,ADMIN,crypto.randomUUID());
 const data=f.data({orderIds:['order-a']}),result=await f.call({method:'POST',data}),item=result.items[0];
 assert.deepEqual(item.evidence,{paymentRecorded:true,applicationVerified:true,contractCoversReportingPeriod:true,serviceOpeningRecorded:true,identityVerified:true});
 assert.equal(item.reviewed,true);assert.ok(!item.reviewReasons.includes('SIGNED_APPLICATION_UNVERIFIED'));assert.ok(!item.reviewReasons.includes('CONTRACT_VERSION_OR_EFFECTIVE_TIME_UNVERIFIED'));
 assert.equal(result.qualificationResetFrom,'2026-10');assert.ok(item.reviewReasons.includes('SERVICE_ACTIVATION_AT_DEAL_UNVERIFIED'));assert.equal(item.proposedAwards,null);assert.equal(result.calculation.status,'review_required');
 f.sql.prepare('UPDATE full_applications SET owner_uid=? WHERE id=?').run(ADMIN,appId);
 const later=await f.call({query:'?batch_id='+data.batchId});assert.equal(later.items[0].signedApplicationVerified,false);assert.ok(later.items[0].reviewReasons.includes('SIGNED_APPLICATION_UNVERIFIED'));
});
test('fully verified independent qualification yields a read-only actual amount preview',async t=>{
 const f=fixture(t),appId=crypto.randomUUID(),hash='b'.repeat(64),number='20261026002';
 f.sql.exec("ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT ''");
 f.sql.prepare('UPDATE users SET member_number=?,crm_project_independent_at=? WHERE line_id=?').run(number,'2026-09-01T00:00:00.000Z',ADMIN);
 f.sql.prepare("INSERT INTO partner_bonus_v2_status_events VALUES(?,?,'project_approved',?,?)").run('project:'+crypto.randomUUID(),'','2026-09-01T00:00:00.000Z',JSON.stringify({target:ADMIN,waiveFee:false,independent:true,reason:'fixture',actor:ADMIN}));
 f.sql.prepare("UPDATE orders SET recruiter_id=?,bonus_policy_type='cocreator-115.10-v3',bonus_status='review_required',gross_amount=6300,net_amount=6000,tax_amount=300,tax_rate=5,paid_at='2026-09-05T00:00:00.000Z' WHERE order_id='order-a'").run(ADMIN);
 f.sql.prepare(`INSERT INTO partner_contract_enrollments(id,member_uid,policy_version,signed_at,effective_at,expires_at,document_sha256,evidence_ref,sponsor_uid,purchase_status,verified_by,verified_at,request_key,request_json)
  VALUES('contract',?,'cocreator-115.10-v3','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','2027-11-01T00:00:00.000Z',?,'proof','','not_purchased',?,'2026-09-01T00:00:00.000Z',?,'{}')`).run(ADMIN,hash,ADMIN,crypto.randomUUID());
 f.sql.exec("INSERT INTO partner_contract_11510_terms VALUES('contract','115.10','{}')");
 const signedJson=JSON.stringify({form_kind:'full',signer_uid:OTHER,fields:{performance_owner_member_number:number}}),signedHash=await sha256Text(signedJson);
 f.sql.prepare('INSERT INTO full_applications VALUES(?,?,?,?,?,?,?,?)').run(appId,OTHER,'fixture','fixture',signedJson,'{}',signedHash,'2026-09-02T00:00:00.000Z');
 f.sql.prepare('INSERT INTO full_application_reviews VALUES(?,?,?,?,?)').run(appId,ADMIN,'accepted','fixture','2026-09-03T00:00:00.000Z');
 const snap={classificationSource:'signed_order_review',applicationId:appId,verifiedBy:ADMIN,verifiedAt:'2026-09-04T00:00:00.000Z',verifiedMemberNumber:number,documentSha256:signedHash};
 f.sql.prepare('INSERT INTO partner_bonus_order_snapshots VALUES(?,?,?,?,?,?,?)').run('order-a','contract','cocreator-115.10-v3',ADMIN,OTHER,'2026-09-15T00:00:00.000Z',JSON.stringify(snap));
 f.sql.prepare("INSERT INTO partner_bonus_performance_date_events VALUES(?,?,1,'','','month','2026-10','fixture','2026-11-01T00:00:00Z',?,?, '{}')").run(crypto.randomUUID(),'order-a',ADMIN,crypto.randomUUID());
 f.sql.prepare("INSERT INTO partner_full_service_evidence VALUES(?,?,'open','order-a','2026-09-10T00:00:00.000Z','2027-11-02T00:00:00.000Z','proof','2026-09-10T00:00:00.000Z',?,?, '{}')").run(crypto.randomUUID(),OTHER,ADMIN,crypto.randomUUID());
 const orderBefore=f.sql.prepare('SELECT * FROM orders').all(),data=f.data({orderIds:['order-a']}),result=await f.call({method:'POST',data});
 assert.equal(result.http,200,JSON.stringify(result));assert.equal(result.status,'preview',JSON.stringify(result.items));assert.equal(result.canConfirm,false);
 assert.deepEqual(result.items[0].proposedAwards,[{beneficiaryUid:ADMIN,bonusType:'direct_full',amount:3000}]);assert.equal(result.items[0].ordinal,1);assert.equal(result.items[0].proposedStatementDueAt,'2026-11-05T15:59:59.999Z');
 assert.deepEqual(f.sql.prepare('SELECT * FROM orders').all(),orderBefore);assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_transactions').get().n,0);
 for(const altered of [signedJson.replace(number,'99999999999'),JSON.stringify(JSON.parse(signedJson),null,2)]){
  f.sql.prepare('UPDATE full_applications SET snapshot_json=? WHERE id=?').run(altered,appId);
  const held=await f.call({query:'?batch_id='+data.batchId});assert.equal(held.status,'review_required');assert.equal(held.items[0].proposedAwards,null);assert.ok(held.items[0].reviewReasons.includes('SIGNED_APPLICATION_UNVERIFIED'));
 }
 f.sql.prepare('UPDATE full_applications SET snapshot_json=? WHERE id=?').run(signedJson,appId);
 const grant=f.sql.prepare("SELECT * FROM partner_bonus_v2_status_events WHERE status='project_approved'").get();
 for(const altered of [
  {event_json:JSON.stringify({target:OTHER,independent:true,actor:ADMIN,reason:'fixture'})},
  {event_json:JSON.stringify({target:ADMIN,independent:false,actor:ADMIN,reason:'fixture'})},
  {event_json:JSON.stringify({target:ADMIN,independent:true,actor:'forged',reason:'fixture'})},
  {event_json:JSON.stringify({target:ADMIN,independent:true,actor:ADMIN,reason:''})},
  {event_json:'not-json'},
  {created_at:'2026-09-02T00:00:00.000Z'}
 ]){
  f.sql.prepare('UPDATE partner_bonus_v2_status_events SET event_json=?,created_at=? WHERE id=?').run(altered.event_json??grant.event_json,altered.created_at??grant.created_at,grant.id);
  const held=await f.call({query:'?batch_id='+data.batchId});assert.equal(held.status,'review_required');assert.equal(held.items[0].proposedAwards,null);assert.ok(held.items[0].reviewReasons.includes('PROJECT_AUTHORIZATION_UNVERIFIED'));
 }
 f.sql.prepare('UPDATE partner_bonus_v2_status_events SET event_json=?,created_at=? WHERE id=?').run(grant.event_json,grant.created_at,grant.id);
 f.sql.prepare("INSERT INTO bonus_transactions(tx_id,order_id,beneficiary_id,amount,status) VALUES('paid','order-a',?,1500,'paid')").run(ADMIN);
 const blocked=await f.call({query:'?batch_id='+data.batchId});assert.equal(blocked.status,'review_required');assert.equal(blocked.items[0].proposedAwards,null);assert.ok(blocked.items[0].reviewReasons.includes('EXISTING_CONFIRMATION_IMPACT'));
});
test('seven verified ordered deals for one recruiter preview without bypassing the read budget',async t=>{
 const f=fixture(t),hash='c'.repeat(64),number='20261026002';
 f.sql.exec("UPDATE orders SET payment_status='cancelled' WHERE order_id='order-a'");
 f.sql.exec("ALTER TABLE users ADD COLUMN referrer_id TEXT DEFAULT ''");
 f.sql.prepare('UPDATE users SET member_number=?,crm_project_independent_at=? WHERE line_id=?').run(number,'2026-09-01T00:00:00.000Z',ADMIN);
 f.sql.prepare("INSERT INTO partner_bonus_v2_status_events VALUES(?,?,'project_approved',?,?)").run('project:'+crypto.randomUUID(),'','2026-09-01T00:00:00.000Z',JSON.stringify({target:ADMIN,waiveFee:false,independent:true,reason:'fixture',actor:ADMIN}));
 f.sql.prepare(`INSERT INTO partner_contract_enrollments(id,member_uid,policy_version,signed_at,effective_at,expires_at,document_sha256,evidence_ref,sponsor_uid,purchase_status,verified_by,verified_at,request_key,request_json)
  VALUES('contract',?,'cocreator-115.10-v3','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','2027-11-01T00:00:00.000Z',?,'proof','','not_purchased',?,'2026-09-01T00:00:00.000Z',?,'{}')`).run(ADMIN,hash,ADMIN,crypto.randomUUID());
 f.sql.exec("INSERT INTO partner_contract_11510_terms VALUES('contract','115.10','{}')");
 const ids=[];
 for(let n=1;n<=7;n++){
  const id='many-'+n,buyer='U'+String(n).repeat(32),appId=crypto.randomUUID();ids.push(id);
  f.sql.prepare("INSERT INTO users(row_id,line_id,role) VALUES(?,?,'user')").run(buyer,buyer);
  f.sql.prepare("INSERT INTO orders(order_id,buyer_id,recruiter_id,order_type,payment_status,bonus_status,bonus_policy_type,gross_amount,net_amount,tax_amount,tax_rate,paid_at) VALUES(?,?,?,'tenant_annual_fee','paid','review_required','cocreator-115.10-v3',6300,6000,300,5,'2026-09-05T00:00:00.000Z')").run(id,buyer,ADMIN);
  const signedJson=JSON.stringify({form_kind:'full',signer_uid:buyer,fields:{performance_owner_member_number:number}}),signedHash=await sha256Text(signedJson);
  f.sql.prepare('INSERT INTO full_applications VALUES(?,?,?,?,?,?,?,?)').run(appId,buyer,'fixture','fixture',signedJson,'{}',signedHash,'2026-09-02T00:00:00.000Z');
  f.sql.prepare('INSERT INTO full_application_reviews VALUES(?,?,?,?,?)').run(appId,ADMIN,'accepted','fixture','2026-09-03T00:00:00.000Z');
  const snap={classificationSource:'signed_order_review',applicationId:appId,verifiedBy:ADMIN,verifiedAt:'2026-09-04T00:00:00.000Z',verifiedMemberNumber:number,documentSha256:signedHash};
  f.sql.prepare('INSERT INTO partner_bonus_order_snapshots VALUES(?,?,?,?,?,?,?)').run(id,'contract','cocreator-115.10-v3',ADMIN,buyer,'2026-09-15T00:00:00.000Z',JSON.stringify(snap));
  f.sql.prepare("INSERT INTO partner_bonus_performance_date_events VALUES(?,?,1,'','','month','2026-10','fixture','2026-11-01T00:00:00Z',?,?, '{}')").run(crypto.randomUUID(),id,ADMIN,crypto.randomUUID());
  f.sql.prepare("INSERT INTO partner_full_service_evidence VALUES(?,?,'open',?,'2026-09-10T00:00:00.000Z','2027-11-02T00:00:00.000Z','proof','2026-09-10T00:00:00.000Z',?,?, '{}')").run(crypto.randomUUID(),buyer,id,ADMIN,crypto.randomUUID());
 }
 const start=f.queries.length,result=await f.call({method:'POST',data:f.data({orderIds:ids})});
 assert.equal(result.status,'preview',JSON.stringify(result.items.map(x=>x.reviewReasons)));assert.deepEqual(result.items.map(x=>x.ordinal),[1,2,3,4,5,6,7]);
 assert.ok(result.items.every(x=>x.proposedAwards[0].amount===3000));assert.ok(f.queries.length-start<=50,'request exceeded the 50-query budget');
});
