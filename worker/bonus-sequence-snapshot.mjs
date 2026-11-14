// One D1 read transaction for every source used by historical qualification.
// Bounded results never become evidence of completeness when any bound is hit.
import {prepareSequenceEvidence} from './bonus-sequence-evidence.mjs';

const sources=[
 ['users',2000,`SELECT row_id,line_id,legacy_line_id,point_line_id,role,member_number,crm_project_independent_at FROM users ORDER BY line_id`],
 ['identityLinks',2000,`SELECT old_line_id,new_line_id,status FROM user_identity_links ORDER BY old_line_id,new_line_id`],
 ['orders',5000,`SELECT order_id,order_type,buyer_id,recruiter_id,payment_status,paid_at,bonus_status,bonus_policy_type,net_amount,gross_amount,tax_amount,tax_rate,currency,created_at,updated_at FROM orders ORDER BY order_id`],
 ['contracts',2000,`SELECT id,member_uid,policy_version,signed_at,effective_at,expires_at,document_sha256,evidence_ref,sponsor_uid,purchase_status,purchase_order_id,verified_by,verified_at FROM partner_contract_enrollments ORDER BY id`],
 ['terms',2000,`SELECT contract_id,template_version FROM partner_contract_11510_terms ORDER BY contract_id`],
 ['lifecycle',2000,`SELECT id,contract_id,action,effective_at,verified_at FROM partner_contract_lifecycle_events ORDER BY id`],
 ['attributions',2000,`SELECT id,target_uid,manager_uid,effective_at,verified_at FROM partner_attribution_events ORDER BY id`],
 ['confirmations',5000,`SELECT order_id,recruiter_uid,buyer_uid,deal_type,confirmed_at,CASE WHEN json_valid(facts_json) THEN json_extract(facts_json,'$.performanceReportingDate.month') END AS reporting_month FROM partner_bonus_deal_confirmations ORDER BY order_id`],
 ['awards',5000,`SELECT tx_id,order_id,beneficiary_id,bonus_type,amount,status FROM bonus_transactions ORDER BY tx_id`],
 ['statements',5000,`SELECT tx_id,order_id,statement_id FROM partner_11510_statement_items ORDER BY tx_id`],
 ['dateEvents',5000,`SELECT e.order_id,e.version,e.precision,e.value,e.recorded_at FROM partner_bonus_performance_date_events e WHERE e.version=(SELECT MAX(x.version) FROM partner_bonus_performance_date_events x WHERE x.order_id=e.order_id) ORDER BY e.order_id`],
 ['projectEvents',2000,`SELECT id,order_id,status,created_at,event_json FROM partner_bonus_v2_status_events WHERE status='project_approved' ORDER BY id`],
 ['snapshots',5000,`SELECT order_id,contract_id,policy_version,recruiter_uid,buyer_uid,captured_at FROM partner_bonus_order_snapshots ORDER BY order_id`],
 ['serviceEvents',5000,`SELECT id,member_uid,action,order_id,effective_at,expires_at,evidence_ref,recorded_at FROM partner_full_service_evidence ORDER BY id`]
];
export async function readSequenceSnapshot(db,orderIds,selectedSourceStatement){
 if(!db||!Array.isArray(orderIds)||!orderIds.length||orderIds.length>100||!selectedSourceStatement)throw Error('Invalid snapshot request');
 const statements=[selectedSourceStatement,prepareSequenceEvidence(db,orderIds),...sources.map(([,limit,query])=>db.prepare(query+' LIMIT '+(limit+1))),db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now') AS asOf")];
 const result=await db.batch(statements);
 if(result.length!==statements.length||result.some(r=>r.success===false||!Array.isArray(r.results)))throw Error('Snapshot unavailable');
 if(result[0].results.length>100||result[1].results.length>100)return {status:'review_required',reasons:['SNAPSHOT_BOUNDS_EXCEEDED']};
 const asOf=result.at(-1).results[0]?.asOf;
 if(typeof asOf!=='string'||!Number.isFinite(Date.parse(asOf)))throw Error('Snapshot time unavailable');
 const data={asOf,selectedSources:result[0].results,selectedEvidence:result[1].results};
 for(let i=0;i<sources.length;i++){
  const [name,limit]=sources[i],rows=result[i+2].results;
  if(rows.length>limit)return {status:'review_required',reasons:['SNAPSHOT_BOUNDS_EXCEEDED'],source:name};
  data[name]=rows;
 }
 return {status:'ok',data};
}
