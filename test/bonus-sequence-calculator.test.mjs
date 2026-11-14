import test from 'node:test';
import assert from 'node:assert/strict';
import {previewVerifiedSequence} from '../worker/bonus-sequence-calculator.mjs';

const K='U'+'a'.repeat(32),Z='U'+'b'.repeat(32),S='U'+'c'.repeat(32);
const buyer=n=>'U'+String(n).repeat(32);
const base=(recruiter,extra={})=>({orderType:'tenant_annual_fee',netAmount:6000,recruiterUid:recruiter,priorValidDeals:0,invalidatedQualification:false,chainComplete:true,upline:[],...extra});
const input=()=>({scopeVerified:true,existingImpact:false,baseline:{[K]:0,[Z]:0},records:[1,2,3,4].map(n=>({orderId:'direct-'+n,buyerUid:buyer(n),evidenceVerified:true,facts:base(K,{projectIndependentAt:'verified'})})).concat([{orderId:'jojo',buyerUid:buyer(5),evidenceVerified:true,facts:base(Z,{selfPurchased:true,historicalQualificationUnknown:false,directSponsor:K,directSponsorEligible:true,upline:[{uid:K,validDeals:0,eligible:true,invalidatedQualification:false}]})}])});

test('verified sequence reproduces the four direct deals and one split in the sketch',()=>{
 const result=previewVerifiedSequence(input());assert.equal(result.status,'preview');assert.equal(result.canConfirm,false);
 assert.deepEqual(result.items.slice(0,4).map(x=>x.transactions),Array.from({length:4},()=>[{memberId:K,bonusType:'direct_full',amount:3000}]));
 assert.deepEqual(result.items[4].transactions,[{memberId:Z,bonusType:'direct_split',amount:1500},{memberId:K,bonusType:'advanced_differential',amount:1500}]);
});
test('a prior order can advance an upline before a later split without changing direct recipient',()=>{
 const data=input();data.records=data.records.slice(0,2).concat(data.records[4]);
 const result=previewVerifiedSequence(data);assert.equal(result.status,'preview');
 assert.deepEqual(result.items[2].transactions.map(x=>[x.memberId,x.amount]),[[Z,1500],[K,1500]]);
});
test('unverified scope, existing awards or any missing fact suppress the whole preview',()=>{
 for(const change of [x=>x.scopeVerified=false,x=>x.existingImpact=true,x=>x.records[2].evidenceVerified=false,x=>x.records[4].facts.upline[0].invalidatedQualification=true,x=>delete x.records[4].facts.upline[0].invalidatedQualification,x=>x.baseline[K]=1,x=>x.records[1].buyerUid=x.records[0].buyerUid]){
  const data=input();change(data);const result=previewVerifiedSequence(data);assert.equal(result.status,'review_required');assert.deepEqual(result.items,[]);assert.equal(result.canConfirm,false);
 }
});
test('unverified first-two beneficiary never yields a partial amount',()=>{
 const data=input();data.records=[{orderId:'first',buyerUid:buyer(1),evidenceVerified:true,facts:base(Z,{selfPurchased:false,directSponsor:S,directSponsorEligible:false})}];
 const result=previewVerifiedSequence(data);assert.equal(result.status,'review_required');assert.deepEqual(result.items,[]);assert.ok(result.reasons.includes('first_two_recipient_requires_review'));
});
