export const REVISED_TEMPLATE='115.11-R2';
export const REVISED_SOURCE='4126be459a0ea6a48c7b755e814d700e7fa1f98941b7a013a3bfc40678cacaf2';
export function revisedAgreement(contract){
 return contract && JSON.parse(contract.request_json || '{}').templateVersion===REVISED_TEMPLATE;
}

// Service years and exceptional openings must both belong to the beneficiary's paid order.
export async function fullServiceCheck(db,uid,from,to){
 const rows=(await db.prepare(`SELECT o.order_id,
   max(y.service_year_start,c.service_opened_at,o.paid_at) AS start,y.service_year_end AS end
   FROM partner_service_year_claims y JOIN orders o ON o.order_id=y.order_id JOIN partner_bonus_deal_confirmations c ON c.order_id=o.order_id
   WHERE y.buyer_uid=? AND o.buyer_id=? AND o.payment_status='paid' AND o.paid_at!='' AND o.order_type IN ('tenant_annual_fee','tenant_renewal_fee') AND y.service_year_end>? AND y.service_year_start<=? AND c.confirmed_at<=?
   UNION ALL SELECT o.order_id,max(e.effective_at,o.paid_at),e.expires_at FROM partner_full_service_evidence e JOIN orders o ON o.order_id=e.order_id
   WHERE e.member_uid=? AND o.buyer_id=? AND o.payment_status='paid' AND o.paid_at!='' AND o.order_type IN ('tenant_annual_fee','tenant_renewal_fee') AND e.action='open' AND e.expires_at>? AND e.effective_at<=? AND e.recorded_at<=?
   ORDER BY start,end`).bind(uid,uid,from,to,to,uid,uid,from,to,to).all()).results;
 const evidence={valid:false,from,to,orders:[]};
 let end=from;
 for(const period of rows){
  if(period.start>end)break;
  if(period.end<=end)continue;
  end=period.end;evidence.orders.push(period.order_id);
 }
 if(end<=to)return {...evidence,reason:'no_continuous_paid_service'};
 const stop=await db.prepare(`SELECT id FROM partner_full_service_evidence WHERE member_uid=? AND action='suspend' AND effective_at<=? AND
 (effective_at>? OR NOT EXISTS(SELECT 1 FROM partner_full_service_evidence r WHERE r.member_uid=? AND r.action='resume' AND r.effective_at>partner_full_service_evidence.effective_at AND r.effective_at<=?)) LIMIT 1`).bind(uid,to,from,uid,from).first();
 return stop?{...evidence,reason:'service_suspended',eventId:stop.id}:{...evidence,valid:true,reason:'active'};
}

export async function recordFullService(c,data){
 c.keys(data,['target_uid','action','orderId','effectiveAt','expiresAt','evidenceRef','confirmed','requestKey']);
 const at=c.stamp(),rev=(await c.clock(c.db)).revision;
 if(data.confirmed!==true||!['open','suspend','resume'].includes(data.action)||!/^[0-9a-f-]{36}$/i.test(data.requestKey||''))c.fail('請確認服務證據及操作',400);
 const uid=(await c.member(c.db,data.target_uid)).line_id, start=c.date(data.effectiveAt);
 if(start>at)c.fail('服務異動時間不可在未來',409);
 const orderId=data.action==='open'?c.text(data.orderId,120):'',end=data.action==='open'?c.date(data.expiresAt):'';
 const evidence=c.text(data.evidenceRef,500),json=JSON.stringify([uid,data.action,orderId,start,end,evidence]);
 const prior=await c.first(c.db,'SELECT request_json FROM partner_full_service_evidence WHERE request_key=?',data.requestKey);
 if(prior){if(prior.request_json!==json)c.fail('同一筆已送出不同內容',409);return {success:true,replayed:true};}
 if(orderId){
  if(end<=start || Date.parse(end)-Date.parse(start)>366*86400000)c.fail('請核對年度服務期間');
  const order=await c.first(c.db,"SELECT order_id FROM orders WHERE order_id=? AND buyer_id=? AND payment_status='paid' AND order_type IN ('tenant_annual_fee','tenant_renewal_fee') AND paid_at!='' AND paid_at<=?",orderId,uid,start);
  if(await c.first(c.db,"SELECT 1 FROM partner_service_year_claims WHERE order_id=? UNION ALL SELECT 1 FROM partner_full_service_evidence WHERE order_id=? AND action='open' LIMIT 1",orderId,orderId))c.fail('該筆訂單已有服務期間，請核對原紀錄',409);
  if(!order)c.fail('須為本人已付款的完整版年費或續約訂單',409);
 }else{
  const previous=await c.first(c.db,"SELECT action,effective_at FROM partner_full_service_evidence WHERE member_uid=? AND action IN ('suspend','resume') ORDER BY effective_at DESC LIMIT 1",uid);
  if((previous && start<=previous.effective_at)||(data.action==='resume' && previous?.action!=='suspend')||data.action===previous?.action)c.fail('請核對前次停用／恢復紀錄與生效時間',409);
 }
 const nonce=crypto.randomUUID(),next=rev+1;
 const result=await c.db.batch([c.clockClaim(c.db,rev,nonce,c.actor),c.db.prepare(`INSERT INTO partner_full_service_evidence(id,member_uid,action,order_id,effective_at,expires_at,evidence_ref,recorded_at,recorded_by,request_key,request_json) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${c.gate}`).bind(crypto.randomUUID(),uid,data.action,orderId,start,end,evidence,at,c.uid,data.requestKey,json,next,nonce)]);
 if(result[1].meta?.changes!==1)c.fail('資料或權限已變更，請重新核對',409);
 return {success:true};
}
