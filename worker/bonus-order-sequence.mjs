// Audited ordering drafts only. Historical qualifications are not established here.
import {authorizeStoreAdmin,DirectoryError} from './store-admin.mjs';
import {readJson,ShopError} from './store-shop.mjs';
import {partnerContractContext11510} from './partner-bonus-v2.mjs';
import {assessSequenceEvidence,dateBounds,verifySignedApplicationIntegrity} from './bonus-sequence-evidence.mjs';
import {previewVerifiedSequence} from './bonus-sequence-calculator.mjs';
import {readSequenceSnapshot} from './bonus-sequence-snapshot.mjs';
import {readSnapshotQualification} from './bonus-sequence-snapshot-qualification.mjs';
import {assessSequenceScope} from './bonus-sequence-scope.mjs';
import {statementDeadline11510} from './partner-settlement-11510.mjs';
import {requireReleaseEnabled,enabledSql} from './bonus-release-control.mjs';
const PATH='/v1/admin/bonus-order-sequence';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const fail=(code,error,status=400)=>{throw new DirectoryError(code,error,status);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const orderId=id=>typeof id==='string'&&/^[\w:.-]{1,100}$/.test(id);
const month=v=>typeof v==='string'&&/^20\d\d-(0[1-9]|1[0-2])$/.test(v);
const nowMonth=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,7);
async function first(db,sql,...args){return (await db.prepare(sql).bind(...args).first())??null;}
async function all(db,sql,...args){const r=await db.prepare(sql).bind(...args).all();if(r.success===false||!Array.isArray(r.results))throw Error('Read failed');return r.results;}
const source=`SELECT o.order_id AS orderId,o.buyer_name AS buyerName,o.buyer_id AS buyerUid,o.recruiter_id AS recruiterUid,o.payment_status AS paymentStatus,o.paid_at AS paidAt,
 EXISTS(SELECT 1 FROM partner_bonus_order_snapshots s WHERE s.order_id=o.order_id) AS hasSnapshot,
 EXISTS(SELECT 1 FROM partner_bonus_deal_confirmations c WHERE c.order_id=o.order_id) AS confirmed,
 EXISTS(SELECT 1 FROM partner_11510_statement_items i WHERE i.order_id=o.order_id) AS hasStatement,
 (SELECT e.precision FROM partner_bonus_performance_date_events e WHERE e.order_id=o.order_id ORDER BY e.version DESC LIMIT 1) AS precision,
 (SELECT e.value FROM partner_bonus_performance_date_events e WHERE e.order_id=o.order_id ORDER BY e.version DESC LIMIT 1) AS value
 FROM orders o WHERE o.order_type='tenant_annual_fee'`;
function project(r){return {orderId:r.orderId,buyerName:r.buyerName,buyerUid:r.buyerUid,recruiterUid:r.recruiterUid,performanceDate:r.precision&&r.precision!=='none'?{precision:r.precision,value:r.value}:null,hasSnapshot:!!r.hasSnapshot,reviewed:false,signedApplicationVerified:false,confirmed:!!r.confirmed};}
async function preview(db,d,version,replayed){
 const ctx=partnerContractContext11510(db),clockBefore=await ctx.clock(db);
 if(!clockBefore||!Number.isSafeInteger(clockBefore.revision))throw Error('Clock unavailable');
 const items=[],ids=JSON.stringify(d.orderIds);
 const read=await readSequenceSnapshot(db,d.orderIds,db.prepare(source+' AND o.order_id IN (SELECT value FROM json_each(?))').bind(ids));
 if(read.status!=='ok')return {success:true,batchId:d.batchId,version,periodFrom:d.periodFrom,periodTo:d.periodTo,qualificationResetFrom:'2026-10',evidenceRef:d.evidenceRef,confirmedComplete:true,completenessProven:false,status:'review_required',canConfirm:false,items:[],calculation:{status:'review_required',canConfirm:false,reasons:read.reasons,items:[]},replayed};
 const data=read.data,orderRows=data.selectedSources,evidenceRows=data.selectedEvidence,evidence=new Map(evidenceRows.map(r=>[r.order_id,r]));
 const awardRows=data.awards.map(r=>({orderId:r.order_id,beneficiaryUid:r.beneficiary_id,amount:r.amount,status:r.status}));
 const byOrder=new Map(orderRows.map(row=>[row.orderId,row]));
 for(const [position,id] of d.orderIds.entries()){
  const row=byOrder.get(id);if(!row)fail('ORDER_CHANGED','訂單已不存在或類型已改變，請重新查詢',409);
  const current=project(row),awards=awardRows.filter(a=>a.orderId===id).map(({beneficiaryUid,amount,status})=>({beneficiaryUid,amount,status}));
  const evidenceRow=evidence.get(id),integrityVerified=await verifySignedApplicationIntegrity(evidenceRow);
  const verified=assessSequenceEvidence(evidenceRow,current.performanceDate,integrityVerified);
  const reasons=[];
  if(!verified.identities)reasons.push('ORDER_IDENTITY_UNVERIFIED');
  if(!verified.application)reasons.push('SIGNED_APPLICATION_UNVERIFIED');
  if(!verified.applicationAtDeal)reasons.push('SIGNED_AT_DEAL_UNVERIFIED');
  if(!verified.contract)reasons.push('CONTRACT_VERSION_OR_EFFECTIVE_TIME_UNVERIFIED');
  if(!verified.service)reasons.push('SERVICE_ACTIVATION_UNVERIFIED');
  if(!verified.serviceAtDeal)reasons.push('SERVICE_ACTIVATION_AT_DEAL_UNVERIFIED');
  if(!verified.amount)reasons.push('ORDER_AMOUNT_UNVERIFIED');
  if(!verified.payment)reasons.push('ORDER_NOT_PAID');
  if(!current.performanceDate)reasons.push('PERFORMANCE_DATE_MISSING');
  else if(current.performanceDate.value.slice(0,7)<d.periodFrom||current.performanceDate.value.slice(0,7)>d.periodTo)reasons.push('DATE_OUTSIDE_SCOPE');
  if(row.confirmed||row.hasStatement||awards.length)reasons.push('EXISTING_CONFIRMATION_IMPACT');
  if(awards.length>20)reasons.push('AWARDS_TRUNCATED');
  items.push({...current,reviewed:verified.application,signedApplicationVerified:verified.application,position:position+1,evidence:{paymentRecorded:verified.payment,applicationVerified:verified.application,contractCoversReportingPeriod:verified.contract,serviceOpeningRecorded:verified.service,identityVerified:verified.identities},existingAwards:awards.slice(0,20),reviewReasons:reasons,proposedAwards:null,ordinal:null,proposedStatementDueAt:null});
 }
 if(d.periodFrom!=='2026-10')for(const item of items)item.reviewReasons.push('ORDERING_SCOPE_UNVERIFIED');
 for(let i=1;i<items.length;i++){
  const a=items[i-1].performanceDate,b=items[i].performanceDate,ab=a&&dateBounds(a.precision,a.value),bb=b&&dateBounds(b.precision,b.value);
  if(ab&&bb&&ab.start>=bb.end){items[i-1].reviewReasons.push('SEQUENCE_DATE_CONFLICT');items[i].reviewReasons.push('SEQUENCE_DATE_CONFLICT');}
 }
 let calculation=previewVerifiedSequence({scopeVerified:false,existingImpact:true,baseline:{},records:[]});
 if(items.every(item=>item.reviewReasons.length===0)){
  const records=[],participants=new Set();
  for(const item of items){
   const r=evidence.get(item.orderId),b=dateBounds(item.performanceDate.precision,item.performanceDate.value);
   const snapshot={order_id:r.order_id,buyer_uid:r.snapshot_buyer,recruiter_uid:r.snapshot_recruiter,contract_id:r.snapshot_contract_id,captured_at:r.snapshot_captured_at,policy_version:r.policy_version};
   let q;
   try{q=readSnapshotQualification(data,snapshot,r,{start:new Date(b.start).toISOString(),end:new Date(b.end).toISOString()});}
   catch(error){if(error instanceof ShopError||error instanceof DirectoryError)q={status:'review_required',reasons:['QUALIFICATION_EVIDENCE_UNVERIFIED']};else throw error;}
   if(q.status!=='locally_verified_qualification'){item.reviewReasons.push(...q.reasons);continue;}
   for(const uid of q.participants)participants.add(uid);
   records.push({orderId:item.orderId,buyerUid:r.buyer_id,evidenceVerified:true,facts:q.facts});
  }
  if(items.every(item=>item.reviewReasons.length===0)){
   const memberIds=[...participants],members=new Set(memberIds),snapshotByOrder=new Map(data.snapshots.map(s=>[s.order_id,s])),confirmByOrder=new Map(data.confirmations.map(c=>[c.order_id,c])),dateByOrder=new Map(data.dateEvents.map(e=>[e.order_id,e]));
   const scopeOrders=data.orders.filter(o=>o.order_type==='tenant_annual_fee'&&(members.has(o.recruiter_id)||members.has(snapshotByOrder.get(o.order_id)?.recruiter_uid)||(!o.recruiter_id&&!snapshotByOrder.get(o.order_id)?.recruiter_uid))&&(o.payment_status==='paid'||confirmByOrder.has(o.order_id)||data.awards.some(a=>a.order_id===o.order_id)||data.statements.some(s=>s.order_id===o.order_id))).map(o=>({order_id:o.order_id,recruiter_id:o.recruiter_id,payment_status:o.payment_status,paid_at:o.paid_at,confirmed_at:confirmByOrder.get(o.order_id)?.confirmed_at,has_awards:data.awards.some(a=>a.order_id===o.order_id),has_statement:data.statements.some(s=>s.order_id===o.order_id),precision:dateByOrder.get(o.order_id)?.precision,value:dateByOrder.get(o.order_id)?.value}));
   const scopeAwards=data.awards.filter(a=>members.has(a.beneficiary_id)).map(a=>({...a,confirmed_at:confirmByOrder.get(a.order_id)?.confirmed_at,reporting_month:confirmByOrder.get(a.order_id)?.reporting_month}));
   const reasons=assessSequenceScope(d,scopeOrders,scopeAwards);
   if(reasons.length)for(const item of items)item.reviewReasons.push(...reasons);
   else {
    const baseline=Object.fromEntries(memberIds.map(uid=>[uid,0]));
    calculation=previewVerifiedSequence({scopeVerified:true,existingImpact:false,baseline,records});
    if(calculation.status==='preview')for(const [i,p] of calculation.items.entries()){
     items[i].ordinal=p.ordinal;items[i].proposedAwards=p.transactions.map(t=>({beneficiaryUid:t.memberId,bonusType:t.bonusType,amount:t.amount}));
     items[i].proposedStatementDueAt=statementDeadline11510(items[i].performanceDate.value.slice(0,7));
    }
    else for(const item of items)item.reviewReasons.push(...calculation.reasons);
   }
  }
 }
 if(calculation.status!=='preview')for(const item of items)if(!item.reviewReasons.length)item.reviewReasons.push('BATCH_DEPENDENCIES_UNVERIFIED');
 const clockAfter=await ctx.clock(db);if(!clockAfter||clockAfter.revision!==clockBefore.revision)fail('STATE_CHANGED','財務或資格資料已變更，請重新查詢',409);
 return {success:true,batchId:d.batchId,version,periodFrom:d.periodFrom,periodTo:d.periodTo,qualificationResetFrom:'2026-10',evidenceRef:d.evidenceRef,confirmedComplete:true,completenessProven:false,snapshotAt:data.asOf,status:calculation.status,canConfirm:false,items,calculation,replayed};
}
async function receipt(db,d,uid,payload){
 const event=await first(db,'SELECT request_json,recorded_by,version FROM bonus_order_sequence_draft_events WHERE request_key=?',d.requestKey);
 if(!event)return null;
 if(event.recorded_by!==uid||event.request_json!==payload)fail('REQUEST_CONFLICT','送出編號已用於其他內容',409);
 return event;
}
export async function handleBonusOrderSequence(request,env,profileMapper,fetcher=fetch){
 const url=new URL(request.url);if(url.pathname!==PATH)return null;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','POST'].includes(request.method))return reply({success:false,code:'METHOD_NOT_ALLOWED',error:'不支援此操作'},405);
 try{
  const {uid,db,actor}=await authorizeStoreAdmin(request,env,profileMapper,fetcher);
  if(uid!==actor.line_id)fail('IDENTITY_CONFLICT','請以總管目前 LINE 身分登入',403);
  const ctx=partnerContractContext11510(db,uid,actor);await ctx.policyIdentity(db,uid);
  // GET preview involves multiple reads; revoke access if the operator lost
  // authority or its exact identity while those reads were in progress.
  const secureReply=async value=>{
   const current=await authorizeStoreAdmin(request,env,profileMapper,fetcher);
   if(current.uid!==uid||current.actor.line_id!==uid)fail('IDENTITY_CONFLICT','管理員身分已變更，請重新登入',403);
   await ctx.policyIdentity(current.db,uid);
   return reply(value);
  };
  if(request.method==='GET'){
   const q=url.searchParams;
   if(q.get('batches')==='1'&&[...q.keys()].every(k=>['batches','after'].includes(k))&&q.getAll('batches').length===1&&q.getAll('after').length<=1){
    const after=q.get('after')||'';if(after&&!uuid.test(after))fail('INVALID_REQUEST','查詢游標不正確');
    // Batch ID is immutable across later draft updates, unlike recorded_at.
    const rows=await all(db,`SELECT e.batch_id,e.version,e.request_json,e.recorded_at FROM bonus_order_sequence_draft_events e WHERE e.batch_id>? AND e.version=(SELECT MAX(x.version) FROM bonus_order_sequence_draft_events x WHERE x.batch_id=e.batch_id) ORDER BY e.batch_id LIMIT 101`,after.toLowerCase());
    const hasMore=rows.length>100,batches=rows.slice(0,100).map(r=>{const d=JSON.parse(r.request_json);return {batchId:r.batch_id,version:r.version,periodFrom:d.periodFrom,periodTo:d.periodTo,recordedAt:r.recorded_at};});
    return await secureReply({success:true,batches,hasMore,nextCursor:hasMore?batches.at(-1).batchId:''});
   }
   if(q.get('candidates')==='1'&&[...q.keys()].every(k=>['candidates','after'].includes(k))&&q.getAll('candidates').length===1&&q.getAll('after').length<=1){
    const after=q.get('after')||'';if(after&&!orderId(after))fail('INVALID_REQUEST','查詢游標不正確');
    const rows=await all(db,source+' AND o.order_id>? ORDER BY o.order_id LIMIT 101',after),hasMore=rows.length>100,items=rows.slice(0,100).map(project);
    return await secureReply({success:true,items,hasMore,nextCursor:hasMore?items.at(-1).orderId:'',completenessProven:false});
   }
   if([...q.keys()].length!==1||!uuid.test(q.get('batch_id')||''))fail('INVALID_REQUEST','請指定有效批次');
   const event=await first(db,'SELECT request_json,version FROM bonus_order_sequence_draft_events WHERE batch_id=? ORDER BY version DESC LIMIT 1',q.get('batch_id').toLowerCase());
   if(!event)fail('NOT_FOUND','查無排序草稿',404);
   return await secureReply(await preview(db,JSON.parse(event.request_json),event.version,false));
  }
  await requireReleaseEnabled(db);
  if(url.search)fail('INVALID_REQUEST','儲存不可附加查詢條件');
  const data=await readJson(request,16000),fields=['batchId','expectedVersion','requestKey','confirmedComplete','evidenceRef','periodFrom','periodTo','orderIds'];
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==fields.length||Object.keys(data).some(k=>!fields.includes(k))||!uuid.test(data.batchId||'')||!uuid.test(data.requestKey||'')||!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<0||data.expectedVersion>1e9||data.confirmedComplete!==true||typeof data.evidenceRef!=='string'||!data.evidenceRef.trim()||data.evidenceRef.length>500||/[\x00-\x1f]/.test(data.evidenceRef)||!month(data.periodFrom)||!month(data.periodTo)||data.periodFrom<'2026-10'||data.periodFrom>data.periodTo||data.periodTo>nowMonth()||!Array.isArray(data.orderIds)||!data.orderIds.length||data.orderIds.length>100||data.orderIds.some(id=>!orderId(id))||new Set(data.orderIds).size!==data.orderIds.length)fail('INVALID_REQUEST','請核對排序清單、月份、依據與完整性聲明');
  const d={batchId:data.batchId.toLowerCase(),expectedVersion:data.expectedVersion,requestKey:data.requestKey.toLowerCase(),confirmedComplete:true,evidenceRef:data.evidenceRef.trim(),periodFrom:data.periodFrom,periodTo:data.periodTo,orderIds:data.orderIds};
  const payload=JSON.stringify(d),prior=await receipt(db,d,uid,payload);if(prior)return await secureReply(await preview(db,d,prior.version,true));
  const latest=await first(db,'SELECT version FROM bonus_order_sequence_draft_events WHERE batch_id=? ORDER BY version DESC LIMIT 1',d.batchId);
  if((latest?.version??0)!==d.expectedVersion)fail('VERSION_CONFLICT','排序草稿已變更，請重新查詢後再儲存',409);
  // Validate references before saving; no finance or qualification facts are accepted from the client.
  const count=await first(db,"SELECT COUNT(*) AS n FROM orders WHERE order_type='tenant_annual_fee' AND order_id IN (SELECT value FROM json_each(?))",JSON.stringify(d.orderIds));
  if(count?.n!==d.orderIds.length)fail('ORDER_CHANGED','訂單已不存在或類型已改變，請重新查詢',409);
  const c=await ctx.clock(db);if(!c||!Number.isSafeInteger(c.revision))throw Error('Clock unavailable');
  const nonce=crypto.randomUUID(),result=await db.batch([ctx.clockClaim(db,c.revision,nonce,actor),db.prepare(`INSERT INTO bonus_order_sequence_draft_events(event_id,batch_id,version,request_key,request_json,recorded_by,recorded_at)
   SELECT ?,?,?,?,?,?,? WHERE ${ctx.gate} AND ${enabledSql} AND COALESCE((SELECT MAX(version) FROM bonus_order_sequence_draft_events WHERE batch_id=?),0)=? AND NOT EXISTS(SELECT 1 FROM bonus_order_sequence_draft_events WHERE request_key=?)
   AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN orders o ON o.order_id=j.value AND o.order_type='tenant_annual_fee' WHERE o.order_id IS NULL)`)
   .bind(crypto.randomUUID(),d.batchId,d.expectedVersion+1,d.requestKey,payload,uid,new Date().toISOString(),c.revision+1,nonce,d.batchId,d.expectedVersion,d.requestKey,JSON.stringify(d.orderIds))]);
  if(result.length!==2||result.some(r=>r.success===false))throw Error('Write unavailable');
  const saved=await receipt(db,d,uid,payload);if(!saved)fail('STATE_CHANGED','權限或草稿已變更，請重新查詢',409);
  return await secureReply(await preview(db,d,saved.version,result[1].meta?.changes===0));
 }catch(error){
  if(error instanceof DirectoryError)return reply({success:false,code:error.code,error:error.message},error.status);
  if(error instanceof ShopError)return reply({success:false,code:'INVALID_REQUEST',error:error.message},error.status);
  return reply({success:false,code:'SEQUENCE_UNAVAILABLE',error:'目前無法確認排序草稿，請重新查詢或使用相同送出編號重試'},503);
 }
}
