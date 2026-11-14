import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSequenceScope} from '../worker/bonus-sequence-scope.mjs';
const batch={confirmedComplete:true,periodFrom:'2026-10',periodTo:'2026-11',orderIds:['a','b']};
const row=(order_id,value='2026-10',extra={})=>({order_id,precision:'month',value,confirmed_at:null,has_awards:0,has_statement:0,...extra});
test('October reset accepts the attested batch only when related records are fully represented',()=>{
 assert.deepEqual(assessSequenceScope(batch,[row('a'),row('b','2026-11')],[]),[]);
 assert.ok(assessSequenceScope(batch,[row('a'),row('outside')],[]).includes('SCOPE_ORDER_MISSING'));
 assert.ok(assessSequenceScope(batch,[row('a','')],[]).includes('SCOPE_ORDER_DATE_UNVERIFIED'));
 assert.ok(assessSequenceScope({...batch,periodFrom:'2026-11'},[],[]).includes('ORDERING_SCOPE_UNVERIFIED'));
});
test('existing post-reset confirmation or award blocks any hypothetical rewrite',()=>{
 assert.ok(assessSequenceScope(batch,[row('a','2026-11',{confirmed_at:'2026-11-01T00:00:00Z'})],[]).includes('EXISTING_CONFIRMATION_IMPACT'));
 assert.ok(assessSequenceScope(batch,[],[{reporting_month:'2026-11',confirmed_at:'2026-11-01T00:00:00Z'}]).includes('EXISTING_CONFIRMATION_IMPACT'));
 assert.ok(assessSequenceScope(batch,[],[{reporting_month:'invalid',confirmed_at:'2026-09-01T00:00:00Z'}]).includes('EXISTING_CONFIRMATION_IMPACT'));
 assert.deepEqual(assessSequenceScope(batch,[row('old','2026-09',{confirmed_at:'2026-09-01T00:00:00Z'})],[{reporting_month:'2026-09'}]),[]);
});
