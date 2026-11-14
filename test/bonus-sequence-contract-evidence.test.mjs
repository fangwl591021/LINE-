import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSequenceEvidence} from '../worker/bonus-sequence-evidence.mjs';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),P='cocreator-115.10-v3';
const row=()=>({buyer_id:A,recruiter_id:B,buyer_matches:1,recruiter_matches:1,identity_link:0,snapshot_buyer:A,snapshot_recruiter:B,policy_version:P,contract_policy:P,contract_template:'115.10',contract_member:B,contract_hash:'a'.repeat(64),contract_evidence:'synthetic signed proof',contract_verified_by:A,contract_signed:'2026-09-01T00:00:00.000Z',effective_at:'2026-09-01T00:00:00.000Z',verified_at:'2026-09-01T00:00:00.000Z',expires_at:'2027-09-01T00:00:00.000Z',has_lifecycle:0});
const date={precision:'month',value:'2026-10'};
test('contract status is true only with the enrollment evidence and full-period coverage',()=>{
 assert.equal(assessSequenceEvidence(row(),date).contract,true);
 for(const [key,value] of [['contract_hash',''],['contract_hash','z'.repeat(64)],['contract_evidence','  '],['contract_evidence','bad\nproof'],['contract_verified_by','unknown']]){
  const r=row();r[key]=value;assert.equal(assessSequenceEvidence(r,date).contract,false,key);
 }
});
