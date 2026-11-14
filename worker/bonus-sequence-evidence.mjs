// Read-only partial evidence checks. No historical-scope or qualification claims.
import {sha256Text} from './hand-sign-application-definition.mjs';
const UID=/^U[0-9a-f]{32}$/i;
const parsed=v=>{try{return JSON.parse(v);}catch{return null;}};
const time=v=>typeof v==='string'?Date.parse(v):NaN;
export function dateBounds(precision,value){
 const rx={month:/^\d{4}-(0[1-9]|1[0-2])$/,day:/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/,minute:/^\d{4}-(0[1-9]|1[0-2])-\d{2}T\d{2}:\d{2}$/}[precision];
 if(!rx||typeof value!=='string'||!rx.test(value))return null;
 const day=precision==='month'?value+'-01':value.slice(0,10),minute=precision==='minute'?value.slice(11):'00:00';
 const start=Date.parse(day+'T'+minute+':00+08:00');if(!Number.isFinite(start))return null;
 const local=new Date(start+8*3600000).toISOString();if(local.slice(0,16)!==day+'T'+minute)return null;
 const end=precision==='month'?Date.UTC(+value.slice(0,4),+value.slice(5,7),1)-8*3600000: start+(precision==='day'?86400000:60000);
 return {start,end};
}
const before=(v,n)=>Number.isFinite(time(v))&&time(v)<=n;
export function prepareSequenceEvidence(db,orderIds){
 const ids=JSON.stringify(orderIds);
 return db.prepare(`SELECT o.order_id,o.buyer_id,o.recruiter_id,o.order_type,o.bonus_policy_type,o.payment_status,o.paid_at,o.gross_amount,o.net_amount,o.tax_amount,o.tax_rate,o.currency,
  s.buyer_uid AS snapshot_buyer,s.recruiter_uid AS snapshot_recruiter,s.contract_id AS snapshot_contract_id,s.captured_at AS snapshot_captured_at,s.policy_version,s.snapshot_json,
  a.owner_uid AS app_owner,a.snapshot_json AS app_json,a.content_sha256 AS app_hash,a.signed_at AS app_signed,
  r.decision,r.reviewed_at,u.member_number,
  c.member_uid AS contract_member,c.policy_version AS contract_policy,c.signed_at AS contract_signed,c.effective_at,c.verified_at,c.expires_at,c.document_sha256 AS contract_hash,c.evidence_ref AS contract_evidence,c.verified_by AS contract_verified_by,
  terms.template_version AS contract_template,
  (SELECT COUNT(*) FROM users x WHERE o.buyer_id IN (x.row_id,x.line_id,x.legacy_line_id,x.point_line_id)) AS buyer_matches,
  (SELECT COUNT(*) FROM users x WHERE o.recruiter_id IN (x.row_id,x.line_id,x.legacy_line_id,x.point_line_id)) AS recruiter_matches,
  EXISTS(SELECT 1 FROM user_identity_links l WHERE l.status='active' AND (l.old_line_id IN (o.buyer_id,o.recruiter_id) OR l.new_line_id IN (o.buyer_id,o.recruiter_id))) AS identity_link,
  EXISTS(SELECT 1 FROM partner_full_service_evidence f WHERE f.order_id=o.order_id AND f.member_uid=o.buyer_id AND f.action='open' AND f.evidence_ref!='' AND f.effective_at!='' AND f.expires_at>f.effective_at AND f.recorded_at!='') AS service_open,
  (SELECT f.effective_at FROM partner_full_service_evidence f WHERE f.order_id=o.order_id AND f.member_uid=o.buyer_id AND f.action='open' AND f.evidence_ref!='' AND f.effective_at!='' AND f.expires_at>f.effective_at AND f.recorded_at!='' ORDER BY f.effective_at LIMIT 1) AS service_start,
  (SELECT f.expires_at FROM partner_full_service_evidence f WHERE f.order_id=o.order_id AND f.member_uid=o.buyer_id AND f.action='open' AND f.evidence_ref!='' AND f.effective_at!='' AND f.expires_at>f.effective_at AND f.recorded_at!='' ORDER BY f.effective_at LIMIT 1) AS service_end,
  (SELECT f.recorded_at FROM partner_full_service_evidence f WHERE f.order_id=o.order_id AND f.member_uid=o.buyer_id AND f.action='open' AND f.evidence_ref!='' AND f.effective_at!='' AND f.expires_at>f.effective_at AND f.recorded_at!='' ORDER BY f.effective_at LIMIT 1) AS service_recorded,
  (SELECT json_group_array(json_object('action',action,'effectiveAt',effective_at)) FROM (SELECT f.action,f.effective_at FROM partner_full_service_evidence f WHERE f.member_uid=o.buyer_id AND f.action IN ('suspend','resume') ORDER BY f.effective_at,f.id LIMIT 101)) AS service_state_events,
  EXISTS(SELECT 1 FROM partner_bonus_deal_confirmations x WHERE x.order_id=o.order_id AND x.receipt_ref!='' AND x.service_opened_at!='') AS service_confirmed,
  EXISTS(SELECT 1 FROM partner_contract_lifecycle_events l WHERE l.contract_id=s.contract_id) AS has_lifecycle
  FROM orders o LEFT JOIN partner_bonus_order_snapshots s ON s.order_id=o.order_id
  LEFT JOIN full_applications a ON a.id=CASE WHEN json_valid(s.snapshot_json) THEN json_extract(s.snapshot_json,'$.applicationId') END
  LEFT JOIN full_application_reviews r ON r.application_id=a.id
  LEFT JOIN users u ON u.line_id=s.recruiter_uid
  LEFT JOIN partner_contract_enrollments c ON c.id=s.contract_id
  LEFT JOIN partner_contract_11510_terms terms ON terms.contract_id=c.id
  WHERE o.order_id IN (SELECT value FROM json_each(?))`).bind(ids);
}
export function prepareSequenceScope(db,memberIds){
 return db.prepare(`SELECT o.order_id,o.recruiter_id,o.payment_status,o.paid_at,c.confirmed_at,
  EXISTS(SELECT 1 FROM bonus_transactions b WHERE b.order_id=o.order_id) AS has_awards,
  EXISTS(SELECT 1 FROM partner_11510_statement_items i WHERE i.order_id=o.order_id) AS has_statement,
  (SELECT e.precision FROM partner_bonus_performance_date_events e WHERE e.order_id=o.order_id ORDER BY e.version DESC LIMIT 1) AS precision,
  (SELECT e.value FROM partner_bonus_performance_date_events e WHERE e.order_id=o.order_id ORDER BY e.version DESC LIMIT 1) AS value
 FROM orders o LEFT JOIN partner_bonus_order_snapshots s ON s.order_id=o.order_id
 LEFT JOIN partner_bonus_deal_confirmations c ON c.order_id=o.order_id
 WHERE o.order_type='tenant_annual_fee'
 AND (o.recruiter_id IN (SELECT value FROM json_each(?)) OR s.recruiter_uid IN (SELECT value FROM json_each(?)) OR (o.recruiter_id='' AND coalesce(s.recruiter_uid,'')=''))
 AND (o.payment_status='paid' OR c.order_id IS NOT NULL OR EXISTS(SELECT 1 FROM bonus_transactions b WHERE b.order_id=o.order_id) OR EXISTS(SELECT 1 FROM partner_11510_statement_items i WHERE i.order_id=o.order_id)) LIMIT 501`).bind(JSON.stringify(memberIds),JSON.stringify(memberIds));
}
export function prepareSequenceExistingAwards(db,memberIds){
 return db.prepare(`SELECT b.tx_id,b.beneficiary_id,b.order_id,b.status,c.confirmed_at,
  CASE WHEN json_valid(c.facts_json) THEN json_extract(c.facts_json,'$.performanceReportingDate.month') END AS reporting_month
 FROM bonus_transactions b LEFT JOIN partner_bonus_deal_confirmations c ON c.order_id=b.order_id
 WHERE b.beneficiary_id IN (SELECT value FROM json_each(?)) LIMIT 501`).bind(JSON.stringify(memberIds));
}
// The signing writer hashes the exact UTF-8 JSON string it stores, not a
// reparsed or reserialized object. No client-provided digest is trusted here.
export async function verifySignedApplicationIntegrity(r){
 if(typeof r?.app_json!=='string'||r.app_json.length>300000||!/^[0-9a-f]{64}$/.test(r?.app_hash||''))return false;
 return await sha256Text(r.app_json)===r.app_hash;
}
export function assessSequenceEvidence(r,date,integrityVerified=false){
 const snap=parsed(r?.snapshot_json),app=parsed(r?.app_json),b=date&&dateBounds(date.precision,date.value);
 const identities=!!r&&UID.test(r.buyer_id||'')&&UID.test(r.recruiter_id||'')&&r.buyer_id!==r.recruiter_id&&r.buyer_matches===1&&r.recruiter_matches===1&&!r.identity_link&&r.snapshot_buyer===r.buyer_id&&r.snapshot_recruiter===r.recruiter_id;
 const application=!!(integrityVerified===true&&identities&&snap?.classificationSource==='signed_order_review'&&snap.applicationId&&snap.verifiedBy&&Number.isFinite(time(snap.verifiedAt))&&r.app_owner===r.buyer_id&&app?.form_kind==='full'&&app.signer_uid===r.buyer_id&&r.member_number&&app.fields?.performance_owner_member_number===r.member_number&&snap.verifiedMemberNumber===r.member_number&&r.decision==='accepted'&&before(r.app_signed,time(r.reviewed_at))&&before(r.reviewed_at,time(snap.verifiedAt))&&/^[0-9a-f]{64}$/.test(r.app_hash||'')&&r.app_hash===snap.documentSha256);
 // Full requested period must fit inside a verified contract; a month never implies a day.
 const contract=!!(identities&&b&&r.policy_version==='cocreator-115.10-v3'&&r.contract_policy===r.policy_version&&r.contract_template==='115.10'&&r.contract_member===r.recruiter_id&&/^[a-f0-9]{64}$/i.test(r.contract_hash||'')&&typeof r.contract_evidence==='string'&&!!r.contract_evidence.trim()&&r.contract_evidence.length<=500&&!/[\x00-\x1f]/.test(r.contract_evidence)&&UID.test(r.contract_verified_by||'')&&before(r.contract_signed,b.start)&&before(r.effective_at,b.start)&&before(r.verified_at,b.start)&&Number.isFinite(time(r.expires_at))&&time(r.expires_at)>=b.end&&!r.has_lifecycle);
 const payment=!!(r&&r.payment_status==='paid'&&Number.isFinite(time(r.paid_at)));
 const service=!!(r&&(r.service_open||r.service_confirmed));
 const events=parsed(r?.service_state_events);
 const statesValid=Array.isArray(events)&&events.length<=100&&events.every(e=>e&&['suspend','resume'].includes(e.action)&&Number.isFinite(time(e.effectiveAt)));
 const suspended=statesValid&&b&&events.some(e=>{
  const t=time(e.effectiveAt);if(e.action!=='suspend'||t>=b.end)return false;
  return t>b.start||!events.some(x=>x.action==='resume'&&time(x.effectiveAt)>t&&time(x.effectiveAt)<=b.start);
 });
 const serviceAtDeal=!!(r&&b&&r.service_open&&before(r.service_start,b.start)&&Number.isFinite(time(r.service_end))&&time(r.service_end)>=b.end&&before(r.paid_at,time(r.service_start))&&Number.isFinite(time(r.service_recorded))&&time(r.service_recorded)<b.end&&statesValid&&!suspended);
 const amount=!!(r&&r.currency==='TWD'&&Number.isSafeInteger(r.gross_amount)&&r.gross_amount>0&&Number.isSafeInteger(r.net_amount)&&r.net_amount===Math.round(r.gross_amount/1.05)&&r.tax_amount===r.gross_amount-r.net_amount&&r.tax_rate===5);
 const applicationAtDeal=!!(application&&b&&before(r.app_signed,b.start));
 return {payment,application,applicationAtDeal,contract,service,serviceAtDeal,amount,identities};
}
