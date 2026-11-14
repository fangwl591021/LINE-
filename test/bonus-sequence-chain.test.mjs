import test from 'node:test';
import assert from 'node:assert/strict';
import {createSequenceReadBudget,readSequenceQualification} from '../worker/bonus-sequence-chain.mjs';

const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32),P='cocreator-115.10-v3';
const start='2026-10-01T16:00:00.000Z',end='2026-10-02T16:00:00.000Z';
function setup({transition='',existing=false}={}){
 let reads=0;
 const raw={prepare(sql){return {bind(...args){return {async first(){reads++;if(existing&&sql.includes('SELECT 1 FROM partner_bonus_deal_confirmations WHERE'))return {yes:1};if(transition&&sql.includes(transition))return {yes:1};return null;},async all(){reads++;return {results:[]};}}}}}};
 const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
 const ctx={db:raw,first,async member(){return {};},async activeContract(db,uid){return {id:uid===A?'ca':'cb',member_uid:uid,policy_version:P,sponsor_uid:''};},async currentAttribution(){return null;},async buildFacts(){return {orderType:'tenant_annual_fee',netAmount:6000,recruiterUid:A,priorValidDeals:0,invalidatedQualification:false,historicalQualificationUnknown:false,selfPurchased:true,directSponsor:B,directSponsorEligible:true,upline:[]};}};
 const snapshot={order_id:'o',buyer_uid:C,recruiter_uid:A,policy_version:P,contract_id:'ca',captured_at:'2026-11-01T00:00:00.000Z'};
 const order={order_id:'o',buyer_id:C,order_type:'tenant_annual_fee',bonus_policy_type:P};
 return {ctx,snapshot,order,budget:createSequenceReadBudget(raw),reads:()=>reads};
}
test('complete root chain is read without using previous all-time deal counts',async()=>{
 const f=setup(),r=await readSequenceQualification(f.ctx,f.snapshot,f.order,{start,end},f.budget);
 assert.equal(r.status,'locally_verified_qualification');assert.deepEqual(r.participants,[A,B]);
 assert.equal(r.facts.priorValidDeals,0);assert.deepEqual(r.facts.upline.map(x=>[x.uid,x.validDeals]),[[B,0]]);
 assert.equal(r.requiresBatchAndServiceVerification,true);assert.ok(f.budget.state.used<=30);
});
test('a mid-interval relation change, even if end state matches, stays pending',async()=>{
 const f=setup({transition:'SELECT 1 FROM partner_attribution_events'}),r=await readSequenceQualification(f.ctx,f.snapshot,f.order,{start,end},f.budget);
 assert.equal(r.status,'review_required');assert.ok(r.reasons.includes('QUALIFICATION_CHANGES_IN_INTERVAL'));
});
test('existing confirmations and exceeding a shared budget fail closed',async()=>{
 const f=setup({existing:true});assert.ok((await readSequenceQualification(f.ctx,f.snapshot,f.order,{start,end},f.budget)).reasons.includes('EXISTING_CONFIRMATION_IMPACT'));
 const g=setup(),budget=createSequenceReadBudget(g.ctx.db,1),r=await readSequenceQualification(g.ctx,g.snapshot,g.order,{start,end},budget);
 assert.ok(r.reasons.includes('QUALIFICATION_QUERY_BUDGET_EXCEEDED'));assert.equal(budget.state.used,1);
});
test('the request-local budget deduplicates identical reads',async()=>{
 const f=setup(),budget=createSequenceReadBudget(f.ctx.db,2);
 await budget.db.prepare('SELECT test').bind(A).first();await budget.db.prepare('SELECT test').bind(A).first();
 assert.equal(f.reads(),1);assert.equal(budget.state.used,1);
});
