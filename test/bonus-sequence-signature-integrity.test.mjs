import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifySignedApplicationIntegrity,assessSequenceEvidence} from '../worker/bonus-sequence-evidence.mjs';
const BUYER='U'+'a'.repeat(32),RECRUITER='U'+'b'.repeat(32);
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
function evidence(json,digest){
 return {buyer_id:BUYER,recruiter_id:RECRUITER,buyer_matches:1,recruiter_matches:1,identity_link:0,snapshot_buyer:BUYER,snapshot_recruiter:RECRUITER,
  snapshot_json:JSON.stringify({classificationSource:'signed_order_review',applicationId:'app',verifiedBy:RECRUITER,verifiedAt:'2026-09-04T00:00:00Z',verifiedMemberNumber:'12345678901',documentSha256:digest}),
  app_owner:BUYER,app_json:json,app_hash:digest,app_signed:'2026-09-02T00:00:00Z',reviewed_at:'2026-09-03T00:00:00Z',decision:'accepted',member_number:'12345678901'};
}
test('hash matches exact stored signing JSON for old and current template versions',async()=>{
 for(const version of ['full-115.10-v1','full-115.11-v2']){
  const json=JSON.stringify({form_kind:'full',signer_uid:BUYER,fields:{performance_owner_member_number:'12345678901'},template:{version}}),r=evidence(json,hash(json));
  const valid=await verifySignedApplicationIntegrity(r);assert.equal(valid,true);assert.equal(assessSequenceEvidence(r,{precision:'month',value:'2026-10'},valid).application,true);
  const changed=JSON.stringify({...JSON.parse(json),template:{version:version+'-altered'}});assert.equal(await verifySignedApplicationIntegrity({...r,app_json:changed}),false);
 }
});
test('changed fields, spacing or key order cannot inherit an old signed digest',async()=>{
 const json=JSON.stringify({form_kind:'full',signer_uid:BUYER,fields:{performance_owner_member_number:'12345678901'}}),digest=hash(json),r=evidence(json,digest);
 for(const altered of [json.replace('12345678901','99999999999'),JSON.stringify(JSON.parse(json),null,2),JSON.stringify({signer_uid:BUYER,form_kind:'full',fields:{performance_owner_member_number:'12345678901'}})])assert.equal(await verifySignedApplicationIntegrity({...r,app_json:altered}),false);
 const changed=JSON.stringify({...JSON.parse(json),fields:{performance_owner_member_number:'99999999999'}}),changedHash=hash(changed),forged={...r,app_json:changed,app_hash:changedHash};
 assert.equal(await verifySignedApplicationIntegrity(forged),true);assert.equal(assessSequenceEvidence(forged,{precision:'month',value:'2026-10'},true).application,false);
 assert.equal(assessSequenceEvidence(r,{precision:'month',value:'2026-10'}).application,false);
});
