import test from 'node:test';
import assert from 'node:assert/strict';
import {readSnapshotQualification} from '../worker/bonus-sequence-snapshot-qualification.mjs';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32),P='cocreator-115.10-v3';
const start='2026-10-01T16:00:00.000Z',end='2026-10-02T16:00:00.000Z';
function fixture(){
 const contract=(id,uid,sponsor)=>({id,member_uid:uid,policy_version:P,signed_at:'2026-01-01T00:00:00.000Z',effective_at:'2026-01-01T00:00:00.000Z',verified_at:'2026-01-01T00:00:00.000Z',expires_at:'2027-01-01T00:00:00.000Z',purchase_status:'not_purchased',sponsor_uid:sponsor,document_sha256:'a'.repeat(64),evidence_ref:'synthetic signed proof',verified_by:A});
 const snap={order_id:'order-1',buyer_uid:C,recruiter_uid:A,policy_version:P,contract_id:'ca',captured_at:'2026-11-01T00:00:00.000Z'};
 const order={order_id:'order-1',buyer_id:C,recruiter_id:A,order_type:'tenant_annual_fee',bonus_policy_type:P,payment_status:'paid',paid_at:'2026-09-01T00:00:00.000Z',net_amount:6000};
 return {snapshot:snap,order,interval:{start,end},data:{users:[{line_id:A},{line_id:B},{line_id:C}],identityLinks:[],contracts:[contract('ca',A,B),contract('cb',B,'')],terms:[{contract_id:'ca'},{contract_id:'cb'}],lifecycle:[],attributions:[],confirmations:[],orders:[order],snapshots:[snap],projectEvents:[]}};
}
test('snapshot reconstructs complete qualified chain with zero historical baseline',()=>{
 const f=fixture(),r=readSnapshotQualification(f.data,f.snapshot,f.order,f.interval);
 assert.equal(r.status,'locally_verified_qualification');assert.deepEqual(r.participants,[A,B]);assert.equal(r.facts.selfPurchased,false);assert.equal(r.facts.priorValidDeals,0);assert.equal(r.facts.upline[0].validDeals,0);
});
test('identity conflicts, existing confirmations and interval transitions fail closed',()=>{
 for(const change of [f=>f.data.identityLinks.push({status:'active',old_line_id:A,new_line_id:C}),f=>f.data.confirmations.push({order_id:'old',recruiter_uid:B,deal_type:'tenant_annual_fee',confirmed_at:'2026-10-02T00:00:00.000Z'}),f=>f.data.attributions.push({id:'x',target_uid:A,manager_uid:B,effective_at:'2026-10-02T00:00:00.000Z',verified_at:'2026-10-02T00:00:00.000Z'})]){
  const f=fixture();change(f);assert.equal(readSnapshotQualification(f.data,f.snapshot,f.order,f.interval).status,'review_required');
 }
});
test('independent projection is not proof without its matching authorization event',()=>{
 const f=fixture();f.data.users[0].crm_project_independent_at='2026-09-01T00:00:00.000Z';
 assert.ok(readSnapshotQualification(f.data,f.snapshot,f.order,f.interval).reasons.includes('PROJECT_AUTHORIZATION_UNVERIFIED'));
 f.data.projectEvents.push({id:'project:fixture',status:'project_approved',created_at:'2026-09-01T00:00:00.000Z',event_json:JSON.stringify({target:A,independent:true,reason:'fixture',actor:B})});
 const r=readSnapshotQualification(f.data,f.snapshot,f.order,f.interval);assert.equal(r.status,'locally_verified_qualification');assert.equal(r.facts.projectIndependentAt,'2026-09-01T00:00:00.000Z');
});
test('aliases colliding with an upline or noncanonical qualification times stay pending',()=>{
 const f=fixture();f.data.users.push({line_id:'U'+'d'.repeat(32),point_line_id:B});
 assert.equal(readSnapshotQualification(f.data,f.snapshot,f.order,f.interval).status,'review_required');
 const g=fixture();g.data.contracts[1].effective_at='2026-01-01 00:00:00';
 assert.equal(readSnapshotQualification(g.data,g.snapshot,g.order,g.interval).status,'review_required');
});
test('every recruiter and upline contract must retain verified enrollment evidence',()=>{
 for(const index of [0,1])for(const [field,value] of [['document_sha256',''],['document_sha256','z'.repeat(64)],['evidence_ref','  '],['evidence_ref','bad\nproof'],['verified_by','unknown']]){
  const f=fixture();f.data.contracts[index][field]=value;
  const r=readSnapshotQualification(f.data,f.snapshot,f.order,f.interval);
  assert.equal(r.status,'review_required',`${index}/${field}`);
 }
 const f=fixture();assert.equal(readSnapshotQualification(f.data,f.snapshot,f.order,f.interval).status,'locally_verified_qualification');
});
