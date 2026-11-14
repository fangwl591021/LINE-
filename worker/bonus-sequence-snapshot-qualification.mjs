// Pure reconstruction from one bounded D1 batch snapshot. No writes or I/O.
import {contract11510State} from './partner-policy-11510.mjs';
const UID=/^U[0-9a-f]{32}$/i,POLICY='cocreator-115.10-v3',V4='cocreator-115.11-v4';
const RESET='2026-09-30T16:00:00.000Z';
const hold=reason=>({status:'review_required',reasons:[reason]});
const validTime=x=>{if(typeof x!=='string')return false;const n=Date.parse(x);return Number.isFinite(n)&&new Date(n).toISOString()===x;};
const sorted=(xs,a,b)=>xs.sort((x,y)=>String(y[a]||'').localeCompare(String(x[a]||''))||String(y[b]||'').localeCompare(String(x[b]||''))||String(y.id||'').localeCompare(String(x.id||'')));

export function readSnapshotQualification(data,snapshot,order,interval){
 const names=['users','identityLinks','contracts','terms','lifecycle','attributions','confirmations','orders','snapshots','projectEvents'];
 if(!data||names.some(k=>!Array.isArray(data[k])))return hold('SNAPSHOT_INCOMPLETE');
 if(!snapshot||!order||snapshot.order_id!==order.order_id||snapshot.buyer_uid!==order.buyer_id||snapshot.recruiter_uid!==order.recruiter_id||snapshot.policy_version!==POLICY||order.bonus_policy_type!==POLICY||order.order_type!=='tenant_annual_fee'||!UID.test(snapshot.recruiter_uid||'')||!UID.test(snapshot.buyer_uid||'')||snapshot.recruiter_uid===snapshot.buyer_uid)return hold('ORDER_OR_IDENTITY_UNVERIFIED');
 if(!validTime(snapshot.captured_at))return hold('SNAPSHOT_TIME_UNVERIFIED');
 const start=interval?.start,end=interval?.end,st=Date.parse(start),en=Date.parse(end);
 if(!Number.isFinite(st)||!Number.isFinite(en)||st>=en||new Date(st).toISOString()!==start||new Date(en).toISOString()!==end||start<RESET||en>Date.now())return hold('QUALIFICATION_TIME_UNVERIFIED');
 const user=uid=>{const u=data.users.filter(x=>[x.row_id,x.line_id,x.legacy_line_id,x.point_line_id].includes(uid));return u.length===1&&u[0].line_id===uid&&!data.identityLinks.some(x=>x.status==='active'&&(x.old_line_id===uid||x.new_line_id===uid))?u[0]:null;};
 const recruiter=user(snapshot.recruiter_uid);if(!recruiter||!user(snapshot.buyer_uid))return hold('ORDER_OR_IDENTITY_UNVERIFIED');
 const events=id=>data.lifecycle.filter(e=>e.contract_id===id);
 function active(uid,at){
  const relevant=data.contracts.filter(c=>c.member_uid===uid&&((c.policy_version===POLICY&&data.terms.some(t=>t.contract_id===c.id))||c.policy_version===V4));
  if(relevant.some(c=>![c.signed_at,c.effective_at,c.verified_at].every(validTime)))return null;
  const latest=sorted(relevant.filter(c=>c.signed_at<=at&&c.effective_at<=at&&c.verified_at<=at),'effective_at','verified_at')[0];
  if(!latest||latest.policy_version!==POLICY)return null;
  // Match the verified enrollment requirements: a terms row or a plausible
  // time range alone is not proof that this member signed a contract.
  if(!/^[a-f0-9]{64}$/i.test(latest.document_sha256||'')||typeof latest.evidence_ref!=='string'||!latest.evidence_ref.trim()||latest.evidence_ref.length>500||/[\x00-\x1f]/.test(latest.evidence_ref)||!UID.test(latest.verified_by||''))return null;
  const ev=events(latest.id);if(ev.some(e=>![e.effective_at,e.verified_at].every(validTime)))return null;
  return contract11510State(latest,ev,at).active?latest:null;
 }
 function relation(uid,at){const all=data.attributions.filter(e=>e.target_uid===uid);if(all.some(e=>![e.effective_at,e.verified_at].every(validTime)))return {bad:true};return sorted(all.filter(e=>e.effective_at<=at&&e.verified_at<=at),'effective_at','verified_at')[0]||null;}
 const invalid=uid=>data.confirmations.some(c=>c.recruiter_uid===uid&&c.deal_type==='tenant_annual_fee'&&data.orders.some(o=>o.order_id===c.order_id&&o.payment_status!=='paid'));
 const historicalUnknown=uid=>data.orders.some(o=>o.order_type==='tenant_annual_fee'&&o.payment_status==='paid'&&o.recruiter_id===uid&&!data.snapshots.some(s=>s.order_id===o.order_id));
 function purchase(contract,at){
  const paid=data.orders.filter(o=>o.buyer_id===contract.member_uid&&o.payment_status==='paid'&&['tenant_annual_fee','tenant_renewal_fee'].includes(o.order_type));
  if(paid.some(o=>!validTime(o.paid_at)))return undefined;
  if(contract.purchase_status==='purchased')return paid.some(o=>o.order_id===contract.purchase_order_id&&o.paid_at<=at)?true:undefined;
  if(paid.some(o=>o.paid_at<=at))return true;
  return contract.purchase_status==='not_purchased'?false:undefined;
 }
 const independent=recruiter.crm_project_independent_at||'';
 if(independent&&(!validTime(independent)||(independent>start&&independent<end)))return hold('QUALIFICATION_CHANGES_IN_INTERVAL');
 if(independent&&independent<=start){
  const grants=data.projectEvents.filter(e=>e.status==='project_approved'&&e.created_at===independent&&String(e.id||'').startsWith('project:')).filter(e=>{try{const j=JSON.parse(e.event_json);return j.target===snapshot.recruiter_uid&&j.independent===true&&UID.test(j.actor||'')&&typeof j.reason==='string'&&!!j.reason.trim();}catch{return false;}});
  if(grants.length!==1)return hold('PROJECT_AUTHORIZATION_UNVERIFIED');
 }
 function atTime(at){
  const contract=active(snapshot.recruiter_uid,at);if(!contract||contract.id!==snapshot.contract_id)return hold('RECRUITER_CONTRACT_UNVERIFIED');
  if(invalid(snapshot.recruiter_uid)||historicalUnknown(snapshot.recruiter_uid))return hold('RECRUITER_QUALIFICATION_UNVERIFIED');
  const project=!!(independent&&independent<=snapshot.captured_at);
  if(project&&independent>start||!project&&independent&&independent<=start)return hold('QUALIFICATION_CHANGES_IN_INTERVAL');
  const facts={orderType:order.order_type,netAmount:order.net_amount,recruiterUid:snapshot.recruiter_uid,priorValidDeals:0,invalidatedQualification:false,chainComplete:true,upline:[],historicalQualificationUnknown:false};
  if(project)facts.projectIndependentAt=independent;
  else {
   facts.selfPurchased=purchase(contract,at);if(typeof facts.selfPurchased!=='boolean')return hold('PURCHASE_AT_DEAL_UNVERIFIED');
   const r=relation(snapshot.recruiter_uid,at);if(r?.bad)return hold('UPLINE_HISTORY_UNVERIFIED');
   let id=r?.manager_uid||contract.sponsor_uid;facts.directSponsor=id;const seen=new Set([snapshot.recruiter_uid]);
   if(!UID.test(id||''))return hold('UPLINE_HISTORY_UNVERIFIED');
   while(id){
    if(!UID.test(id)||seen.has(id)||seen.size>40||!user(id))return hold('UPLINE_HISTORY_UNVERIFIED');
    seen.add(id);const c=active(id,at);if(!c)return hold('UPLINE_CONTRACT_UNVERIFIED');if(invalid(id))return hold('UPLINE_QUALIFICATION_UNVERIFIED');
    facts.upline.push({uid:id,eligible:true,invalidatedQualification:false,validDeals:0,contractId:c.id});
    const parent=relation(id,at);if(parent?.bad)return hold('UPLINE_HISTORY_UNVERIFIED');id=parent?.manager_uid||c.sponsor_uid||'';
   }
   facts.directSponsorEligible=true;
  }
  return {status:'ok',participants:[snapshot.recruiter_uid,...facts.upline.map(x=>x.uid)],facts};
 }
 const a=atTime(start);if(a.status!=='ok')return a;const b=atTime(new Date(en-1).toISOString());if(b.status!=='ok')return b;
 const stable=x=>JSON.stringify({participants:x.participants,selfPurchased:x.facts.selfPurchased??null,projectIndependentAt:x.facts.projectIndependentAt||'',directSponsor:x.facts.directSponsor||'',contracts:x.facts.upline.map(y=>y.contractId)});
 if(stable(a)!==stable(b))return hold('QUALIFICATION_CHANGES_IN_INTERVAL');
 const inRange=v=>validTime(v)&&v>start&&v<end;
 for(const id of a.participants){
  if(data.confirmations.some(c=>c.recruiter_uid===id&&!data.orders.some(o=>o.order_id===c.order_id)))return hold('SNAPSHOT_INCOMPLETE');
  if(data.confirmations.some(c=>c.recruiter_uid===id&&c.deal_type==='tenant_annual_fee'&&(!validTime(c.confirmed_at)||c.confirmed_at>=RESET)))return hold('EXISTING_CONFIRMATION_IMPACT');
  if(data.contracts.some(c=>c.member_uid===id&&[c.signed_at,c.effective_at,c.verified_at].some(inRange))||data.lifecycle.some(e=>data.contracts.some(c=>c.id===e.contract_id&&c.member_uid===id)&&[e.effective_at,e.verified_at].some(inRange))||data.attributions.some(e=>e.target_uid===id&&[e.effective_at,e.verified_at].some(inRange))||data.orders.some(o=>o.buyer_id===id&&o.payment_status==='paid'&&['tenant_annual_fee','tenant_renewal_fee'].includes(o.order_type)&&inRange(o.paid_at)))return hold('QUALIFICATION_CHANGES_IN_INTERVAL');
 }
 return {status:'locally_verified_qualification',qualificationInterval:{start,end},participants:a.participants,facts:a.facts,requiresBatchAndServiceVerification:true};
}
