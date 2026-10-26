// Evidence-based manual settlement only. No bank, points or LINE side effects.
import {addTaiwanWorkingDays,TAIWAN_WORKING_CALENDAR as calendarProvenance} from './taiwan-working-days.mjs';
const VERSION='cocreator-115.10-v3',UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
// Per-row contract/evidence checks plus writes remain below the free-plan D1
// query budget. More items use another immutable supplemental statement.
const MAX_ITEMS=10;
const localDay=iso=>new Date(Date.parse(iso)+8*3600000).toISOString().slice(0,10);
const endOfDay=day=>new Date(Date.parse(day+'T00:00:00+08:00')+86400000-1).toISOString();
function plusCalendarDays(iso,days){const d=new Date(localDay(iso)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return endOfDay(d.toISOString().slice(0,10));}
export function statementDeadline11510(month){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,5,16)-1).toISOString();}
// Matches policy11510.awardEligibility's historical termination fence. Filtering
// before LIMIT prevents cancelled old awards from starving valid re-signed work.
const endedRightsSql=`EXISTS(SELECT 1 FROM partner_contract_lifecycle_events l
 JOIN partner_contract_enrollments e ON e.id=l.contract_id
 WHERE e.member_uid=b.beneficiary_id AND e.policy_version='${VERSION}'
 AND l.verified_at<=? AND l.effective_at<=? AND c.confirmed_at<=l.effective_at)`;
const candidateSql=`SELECT b.tx_id,b.order_id,b.bonus_type,b.amount,b.status,b.created_at AS award_created_at,c.confirmed_at
 FROM bonus_transactions b JOIN orders o ON o.order_id=b.order_id
 JOIN partner_bonus_order_snapshots s ON s.order_id=b.order_id
 JOIN partner_bonus_deal_confirmations c ON c.order_id=b.order_id
 WHERE b.beneficiary_id=? AND s.policy_version=? AND o.payment_status='paid'
 AND b.status IN ('review_required','frozen','payable')
 AND NOT ${endedRightsSql}
 AND NOT EXISTS(SELECT 1 FROM partner_11510_statement_items i WHERE i.tx_id=b.tx_id)`;
const cents=rows=>rows.reduce((n,r)=>n+Math.round(Number(r.amount)*100),0);
async function eligibility(c,uid,at){await c.member(c.db,uid);if(!await c.activeContract(c.db,uid,at))c.fail('受領人目前無有效契約，未將獎金改為可支付或已支付',409);}
async function statement(c,id){const s=await c.first(c.db,'SELECT * FROM partner_11510_statements WHERE id=?',c.text(id,100));if(!s)c.fail('找不到本版對帳單',404);await c.member(c.db,s.target_uid);return s;}
async function items(c,id,at=c.stamp()){return c.all(c.db,`SELECT i.*,b.status,o.payment_status,
 ${endedRightsSql} AS rights_terminated,
 EXISTS(SELECT 1 FROM partner_11510_disputes d WHERE d.tx_id=i.tx_id AND d.resolution='') AS disputed
 FROM partner_11510_statement_items i JOIN bonus_transactions b ON b.tx_id=i.tx_id
 JOIN orders o ON o.order_id=i.order_id JOIN partner_bonus_deal_confirmations c ON c.order_id=i.order_id
 WHERE i.statement_id=? ORDER BY i.tx_id LIMIT 11`,at,at,id);}
function checkLimit(c,rows){if(rows.length>MAX_ITEMS)c.fail('本次明細超過10筆，請先由管理員分批核對，未修改流水',409);}
async function awardChecks(c,target,rows,at){
 for(const row of rows)if(!await c.awardEligibility(target,row.order_id,at))c.fail('此筆獎勵權利已終止或受領資格待核；未啟用或支付款項',409);
}
async function eligibleAwards(c,target,rows,at){const eligible=[];for(const row of rows)if(!row.rights_terminated&&await c.awardEligibility(target,row.order_id,at))eligible.push(row);return eligible;}
function request(c,data,allowed){c.keys(data,[...allowed,'confirmed','requestKey']);if(data.confirmed!==true||!UUID.test(data.requestKey||''))c.fail('請核對憑證並明確確認此項登錄');return {...data,requestKey:data.requestKey.toLowerCase()};}
function past(c,value,at){const valueISO=c.date(value);if(valueISO>at)c.fail('實際發生時間不可填在未來');return valueISO;}
async function commit(c,route,data,response,statements,primaryIndex=1){
 const json=JSON.stringify(data),old=await c.first(c.db,'SELECT * FROM partner_11510_settlement_commands WHERE request_key=?',data.requestKey);
 if(old){if(old.route!==route||old.request_json!==json)c.fail('同一次財務登錄已送出不同內容',409);return {...JSON.parse(old.response_json),replayed:true};}
 const clock=c.settlementClock,nonce=crypto.randomUUID(),revision=clock.revision+1;
 const built=statements({revision,nonce,guard:c.gate}),at=c.stamp();
 const result=await c.db.batch([c.clockClaim(c.db,clock.revision,nonce,c.actor),...built,
  c.db.prepare(`INSERT INTO partner_11510_settlement_commands(request_key,route,request_json,response_json,created_at,actor_uid)
   SELECT ?,?,?,?,?,? WHERE ${c.gate}`).bind(data.requestKey,route,json,JSON.stringify(response),at,c.uid,revision,nonce)]);
 if(result[0].meta?.changes!==1||result[primaryIndex]?.meta?.changes!==1)c.fail('管理員權限或財務狀態已變更，請重新讀取後核對',409);
 return response;
}
async function replay(c,route,data){const old=await c.first(c.db,'SELECT * FROM partner_11510_settlement_commands WHERE request_key=?',data.requestKey);if(!old)return null;if(old.route!==route||old.request_json!==JSON.stringify(data))c.fail('同一次財務登錄已送出不同內容',409);return {...JSON.parse(old.response_json),replayed:true};}

export async function readPartnerSettlement11510(c,target){
 await c.member(c.db,target);
 const at=c.stamp(),active=!!await c.activeContract(c.db,target,at);
 const statements=await c.all(c.db,'SELECT * FROM partner_11510_statements WHERE target_uid=? ORDER BY month DESC LIMIT 20',target);
 for(const s of statements){s.items=await items(c,s.id,at);checkLimit(c,s.items);s.items=s.items.map(i=>({...i,disputed:!!i.disputed,effectiveStatus:['review_required','frozen','payable'].includes(i.status)?i.rights_terminated?'cancelled_by_contract':active?i.status:'contract_inactive':i.status}));s.claim=await c.first(c.db,'SELECT * FROM partner_11510_claims WHERE statement_id=?',s.id);}
 const claims=statements.map(s=>s.claim).filter(Boolean),disputes=await c.all(c.db,`SELECT d.* FROM partner_11510_disputes d JOIN partner_11510_statements s ON s.id=d.statement_id WHERE s.target_uid=? ORDER BY d.created_at DESC LIMIT 100`,target);
 const outstanding=active?await c.all(c.db,candidateSql+' ORDER BY c.confirmed_at,b.tx_id LIMIT 11',target,VERSION,at,at):[];
 const payments=await c.all(c.db,`SELECT p.* FROM partner_11510_payments p JOIN partner_11510_statements s ON s.id=p.statement_id WHERE s.target_uid=? ORDER BY p.recorded_at DESC LIMIT 100`,target);
 return {success:true,policyVersion:VERSION,statements,claims,disputes,outstanding:outstanding.slice(0,MAX_ITEMS),hasMoreOutstanding:outstanding.length>MAX_ITEMS,batchLimit:MAX_ITEMS,payments,calendarReview:claims.some(x=>x.calendar_status!=='verified')};
}

export async function handlePartnerSettlement11510(route,input,c){
 // Capture before reading any qualification or ledger state. A lifecycle,
 // refund or another finance mutation invalidates every later write together.
 c={...c,settlementClock:await c.clock(c.db)};
 const at=c.stamp();let data;
 if(route==='/settlement/statements'){
  data=request(c,input,['target_uid','month','deliveredAt','evidenceRef']);const old=await replay(c,route,data);if(old)return old;
  await eligibility(c,data.target_uid,at);
  if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(data.month||'')||data.month>=localDay(at).slice(0,7))c.fail('僅可對已結束月份建立對帳單');
  const delivered=past(c,data.deliveredAt,at),evidenceRef=c.text(data.evidenceRef),due=statementDeadline11510(data.month);
  if(localDay(delivered).slice(0,7)<=data.month)c.fail('對帳單送達日須在業績月份結束後');
  const candidates=await c.all(c.db,candidateSql+" AND strftime('%Y-%m',c.confirmed_at,'+8 hours')=? ORDER BY b.tx_id LIMIT 11",data.target_uid,VERSION,at,at,data.month),rows=candidates.slice(0,MAX_ITEMS);
  if(!rows.length)c.fail('該月沒有尚未列帳的有效115.10獎金',409);
  if(rows.some(x=>!Number.isFinite(x.amount)||x.amount<=0))c.fail('獎金金額需先核對',409);
  if(rows.some(x=>{const created=Date.parse(x.award_created_at.includes('T')?x.award_created_at:x.award_created_at.replace(' ','T')+'Z');return !Number.isFinite(created)||created>Date.parse(delivered);}))c.fail('送達時間不可早於本次獎金成立時間；補充對帳單須以實際補送時間登錄',409);
  await awardChecks(c,data.target_uid,rows,at);
  const s={id:crypto.randomUUID(),target_uid:data.target_uid,month:data.month,created_at:at,delivered_at:delivered,evidence_ref:evidenceRef,statement_due_at:due,objection_due_at:plusCalendarDays(delivered,5),late:at>due?1:0,total_amount:cents(rows)/100};
  return commit(c,route,data,{success:true,statement:s,hasMore:candidates.length>MAX_ITEMS},({revision,nonce,guard})=>[
   c.db.prepare(`INSERT INTO partner_11510_statements(id,target_uid,month,created_at,delivered_at,evidence_ref,statement_due_at,objection_due_at,late,total_amount,created_by) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(s.id,s.target_uid,s.month,at,delivered,evidenceRef,due,s.objection_due_at,s.late,s.total_amount,c.uid,revision,nonce),
   ...rows.map(r=>c.db.prepare(`INSERT INTO partner_11510_statement_items(tx_id,statement_id,amount,order_id,bonus_type) SELECT ?,?,?,?,? WHERE ${guard}`).bind(r.tx_id,s.id,r.amount,r.order_id,r.bonus_type,revision,nonce))]);
 }
 if(route==='/settlement/claims'){
  data=request(c,input,['statementId','completedAt','evidenceRef']);const old=await replay(c,route,data);if(old)return old;
  const s=await statement(c,data.statementId);await eligibility(c,s.target_uid,at);
  const complete=past(c,data.completedAt,at),evidenceRef=c.text(data.evidenceRef);if(complete<s.delivered_at)c.fail('請款完成時間不可早於實際送達對帳單');
  const existing=await c.first(c.db,'SELECT * FROM partner_11510_claims WHERE statement_id=?',s.id);
  if(existing&&(existing.completed_at!==complete||existing.evidence_ref!==evidenceRef))c.fail('合法請款已登錄，原始完成時間與憑證不得覆寫',409);
  const due=addTaiwanWorkingDays(complete,10),claim={id:existing?.id||crypto.randomUUID(),statement_id:s.id,completed_at:complete,evidence_ref:evidenceRef,payment_due_at:due,calendar_status:due?'verified':'calendar_review',calendar_json:JSON.stringify(calendarProvenance),created_at:existing?.created_at||at,created_by:existing?.created_by||c.uid,updated_at:at};
  if(existing?.payment_due_at)return {success:true,claim:existing,replayed:true};
  const rows=await items(c,s.id);checkLimit(c,rows);
  const eligible=await eligibleAwards(c,s.target_uid,rows.filter(r=>!r.disputed&&r.payment_status==='paid'&&['review_required','frozen'].includes(r.status)),at);
  return commit(c,route,data,{success:true,claim,reviewRequired:!due},({revision,nonce,guard})=>[
   existing?c.db.prepare(`UPDATE partner_11510_claims SET payment_due_at=?,calendar_status=?,calendar_json=?,updated_at=? WHERE statement_id=? AND payment_due_at IS NULL AND ${guard}`).bind(due,claim.calendar_status,claim.calendar_json,at,s.id,revision,nonce):c.db.prepare(`INSERT INTO partner_11510_claims(id,statement_id,completed_at,evidence_ref,payment_due_at,calendar_status,calendar_json,created_at,created_by,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(claim.id,s.id,complete,evidenceRef,due,claim.calendar_status,claim.calendar_json,at,c.uid,at,revision,nonce),
   ...(due?eligible.map(r=>c.db.prepare(`UPDATE bonus_transactions SET status='payable',updated_at=? WHERE tx_id=? AND status IN ('review_required','frozen') AND ${guard} AND NOT EXISTS(SELECT 1 FROM partner_11510_disputes WHERE tx_id=? AND resolution='') AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND payment_status='paid')`).bind(at,r.tx_id,revision,nonce,r.tx_id,r.order_id)):[])]);
 }
 if(route==='/settlement/disputes'){
  data=request(c,input,['statementId','txId','reason','handlingDueAt','evidenceRef']);const old=await replay(c,route,data);if(old)return old;
  const s=await statement(c,data.statementId),rows=await items(c,s.id),row=rows.find(x=>x.tx_id===data.txId);checkLimit(c,rows);
  if(!row||!['review_required','frozen','payable'].includes(row.status)||row.disputed)c.fail('這筆款項無法新增待核：請讀取目前狀態',409);
  const reason=c.text(data.reason),evidenceRef=c.text(data.evidenceRef),due=c.date(data.handlingDueAt);if(due<=at)c.fail('請提供尚未到期的具體處理期限');
  const d={id:crypto.randomUUID(),statement_id:s.id,tx_id:row.tx_id,reason,handling_due_at:due,evidence_ref:evidenceRef,created_at:at,created_by:c.uid,resolution:''};
  return commit(c,route,data,{success:true,dispute:d},({revision,nonce,guard})=>[
   c.db.prepare(`INSERT INTO partner_11510_disputes(id,statement_id,tx_id,reason,handling_due_at,evidence_ref,created_at,created_by) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`).bind(d.id,s.id,row.tx_id,reason,due,evidenceRef,at,c.uid,revision,nonce),
   c.db.prepare(`UPDATE bonus_transactions SET status='review_required',updated_at=? WHERE tx_id=? AND status IN ('review_required','frozen','payable') AND ${guard}`).bind(at,row.tx_id,revision,nonce)]);
 }
 if(route==='/settlement/resolve'){
  data=request(c,input,['disputeId','resolution','reason','evidenceRef']);const old=await replay(c,route,data);if(old)return old;
  const d=await c.first(c.db,'SELECT * FROM partner_11510_disputes WHERE id=?',c.text(data.disputeId,100));if(!d||d.resolution)c.fail('待核紀錄不存在或已結案',409);
  const s=await statement(c,d.statement_id),rows=await items(c,s.id),row=rows.find(x=>x.tx_id===d.tx_id);if(!row||!['review_required','frozen','payable'].includes(row.status)||row.payment_status!=='paid')c.fail('流水已取消、退費或已付款；禁止重新啟用',409);
  if(!['release','cancel'].includes(data.resolution))c.fail('請選擇確認給付或取消此筆');
  const reason=c.text(data.reason),evidenceRef=c.text(data.evidenceRef);let status='reversed';
  if(data.resolution==='release'){await eligibility(c,s.target_uid,at);await awardChecks(c,s.target_uid,[row],at);const claim=await c.first(c.db,'SELECT * FROM partner_11510_claims WHERE statement_id=?',s.id);status=claim?.payment_due_at?'payable':'review_required';}
  return commit(c,route,data,{success:true,dispute:{...d,resolution:data.resolution,resolved_at:at},status},({revision,nonce,guard})=>[
   c.db.prepare(`UPDATE partner_11510_disputes SET resolution=?,resolved_at=?,resolution_reason=?,resolution_evidence_ref=?,resolved_by=? WHERE id=? AND resolution='' AND ${guard}`).bind(data.resolution,at,reason,evidenceRef,c.uid,d.id,revision,nonce),
   c.db.prepare(`UPDATE bonus_transactions SET status=?,updated_at=? WHERE tx_id=? AND status IN ('review_required','frozen','payable') AND ${guard}`).bind(status,at,d.tx_id,revision,nonce)]);
 }
 if(route==='/settlement/payments'){
  data=request(c,input,['statementId','paidAt','paymentRef']);const old=await replay(c,route,data);if(old)return old;
  const s=await statement(c,data.statementId);await eligibility(c,s.target_uid,at);
  const claim=await c.first(c.db,'SELECT * FROM partner_11510_claims WHERE statement_id=?',s.id);if(!claim?.payment_due_at||claim.calendar_status!=='verified')c.fail('須先核對合法請款完成日與官方工作日日曆',409);
  const paidAt=past(c,data.paidAt,at),paymentRef=c.text(data.paymentRef);
  if(at<=s.objection_due_at||paidAt<=s.objection_due_at||paidAt<claim.completed_at)c.fail('五日異議期尚未結束，或付款時間早於合法請款完成；未更改流水',409);
  const rows=(await items(c,s.id));checkLimit(c,rows);const eligible=await eligibleAwards(c,s.target_uid,rows.filter(r=>r.status==='payable'&&!r.disputed&&r.payment_status==='paid'),at);
  if(!eligible.length)c.fail('目前沒有已完成條件且未爭議的可支付款項',409);
  if(await c.first(c.db,'SELECT id FROM partner_11510_payments WHERE statement_id=? AND payment_ref=?',s.id,paymentRef))c.fail('此付款憑證已登錄，請查看付款紀錄，勿重複使用',409);
  const payment={id:crypto.randomUUID(),statement_id:s.id,paid_at:paidAt,payment_ref:paymentRef,amount:cents(eligible)/100,items_json:JSON.stringify(eligible.map(r=>({txId:r.tx_id,amount:r.amount}))),recorded_at:at,recorded_by:c.uid};
  return commit(c,route,data,{success:true,payment,recordedOnly:true},({revision,nonce,guard})=>[
   c.db.prepare(`INSERT INTO partner_11510_payments(id,statement_id,paid_at,payment_ref,amount,items_json,recorded_at,recorded_by) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`).bind(payment.id,s.id,paidAt,paymentRef,payment.amount,payment.items_json,at,c.uid,revision,nonce),
   ...eligible.map(r=>c.db.prepare(`UPDATE bonus_transactions SET status='paid',settled_at=?,updated_at=? WHERE tx_id=? AND status='payable' AND ${guard} AND NOT EXISTS(SELECT 1 FROM partner_11510_disputes WHERE tx_id=? AND resolution='') AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND payment_status='paid')`).bind(paidAt,at,r.tx_id,revision,nonce,r.tx_id,r.order_id))]);
 }
 c.fail('不支援的115.10財務操作',405);
}
