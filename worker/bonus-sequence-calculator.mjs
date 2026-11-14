// Internal calculation only. The caller MUST build and verify all facts from
// authoritative records; browser-supplied qualifications are never evidence.
// This function writes nothing and cannot confirm, settle or pay any award.
import {calculatePartnerBonusV2} from './partner-bonus-v2.mjs';

const UID=/^U[0-9a-f]{32}$/i;
const pending=reasons=>({status:'review_required',canConfirm:false,reasons:[...new Set(reasons)],items:[]});
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;

/**
 * The caller must establish scope, existing-award impact, identities, paid
 * orders, signed contracts, attribution, service and qualification facts.
 * baseline maps each relevant recruiter/ancestor to its verified deal count.
 * records are the complete, administrator-ordered new annual deals.
 */
export function previewVerifiedSequence({scopeVerified,existingImpact,baseline,records}={}){
 if(scopeVerified!==true||existingImpact!==false)return pending(['ORDERING_SCOPE_OR_EXISTING_AWARDS_UNVERIFIED']);
 if(!baseline||typeof baseline!=='object'||Array.isArray(baseline)||!Array.isArray(records)||!records.length||records.length>100)return pending(['BATCH_INPUT_UNVERIFIED']);
 const increments=new Map(),orderIds=new Set(),buyers=new Set(),items=[];
 for(const [position,record] of records.entries()){
  if(!record||record.evidenceVerified!==true||!record.facts||typeof record.orderId!=='string'||!record.orderId||orderIds.has(record.orderId)||!UID.test(record.buyerUid||'')||buyers.has(record.buyerUid))return pending(['ORDER_OR_EVIDENCE_UNVERIFIED']);
  orderIds.add(record.orderId);buyers.add(record.buyerUid);
  const f=record.facts,recruiter=f.recruiterUid;
  if(f.orderType!=='tenant_annual_fee'||!UID.test(recruiter||'')||record.buyerUid===recruiter||!nonnegative(baseline[recruiter])||f.priorValidDeals!==baseline[recruiter]||f.invalidatedQualification!==false||!Array.isArray(f.upline))return pending(['RECRUITER_QUALIFICATION_UNVERIFIED']);
  const chain=[],seen=new Set([recruiter]);
  for(const ancestor of f.upline){
   if(!ancestor||!UID.test(ancestor.uid||'')||seen.has(ancestor.uid)||!nonnegative(baseline[ancestor.uid])||ancestor.validDeals!==baseline[ancestor.uid]||ancestor.eligible!==true||ancestor.invalidatedQualification!==false)return pending(['UPLINE_QUALIFICATION_UNVERIFIED']);
   seen.add(ancestor.uid);
   chain.push({...ancestor,advanced:baseline[ancestor.uid]+(increments.get(ancestor.uid)||0)>=2});
  }
  if(chain.length&&chain[0].uid!==f.directSponsor)return pending(['UPLINE_QUALIFICATION_UNVERIFIED']);
  const facts={...f,priorValidDeals:baseline[recruiter]+(increments.get(recruiter)||0),upline:chain};
  const plan=calculatePartnerBonusV2(facts);
  if(plan.status==='review_required')return pending(plan.warnings.length?plan.warnings:['POLICY_FACTS_UNVERIFIED']);
  items.push({orderId:record.orderId,position:position+1,ordinal:plan.ordinal,transactions:plan.transactions});
  increments.set(recruiter,(increments.get(recruiter)||0)+1);
 }
 return {status:'preview',canConfirm:false,items};
}
