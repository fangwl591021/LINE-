import {grantPartnerProject} from './partner-project.mjs';
import {REVISED_TEMPLATE,REVISED_SOURCE,recordFullService,revisedAgreement,fullServiceCheck} from './partner-full-service.mjs';
import {POLICY_11511,TEMPLATE_11511,SOURCE_11511} from './partner-renewal-11511.mjs';
import {authenticatedUid,authorizeStoreAdmin,DirectoryError} from './store-admin.mjs';
import {readJson,ShopError} from './store-shop.mjs';
import {findMemberReferrer} from './member-number.mjs';
import {PARTNER_POLICY_11510,PARTNER_TEMPLATE_11510,PARTNER_POLICY_CUTOVER,createPartnerPolicy11510} from './partner-policy-11510.mjs';
import {handlePartnerSettlement11510,readPartnerSettlement11510} from './partner-settlement-11510.mjs';

export const PARTNER_POLICY_VERSION='cocreator-2026-10-25-v2';
const BASE='/v1/partner-contracts',UID=/^U[0-9a-f]{32}$/i,UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_MONEY=Math.floor(Number.MAX_SAFE_INTEGER/100);
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const fail=(message,status=400)=>{throw new ShopError(message,status);};
const reply=(value,status=200)=>Response.json(value,{status,headers:HEADERS});
const stamp=()=>new Date().toISOString();
const dbFor=env=>env.ACTMASTER_DB.withSession?env.ACTMASTER_DB.withSession('first-primary'):env.ACTMASTER_DB;
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const keys=(v,allowed)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail('資料欄位不正確');};
function text(v,max=500,required=true){if(typeof v!=='string'||v.length>max||/[\x00-\x1f]/.test(v)||required&&!v.trim())fail('請填寫正確且完整的資料');return v.trim();}
function date(v){const s=text(v,40);const n=Date.parse(s);if(!Number.isFinite(n)||!/^\d{4}-\d{2}-\d{2}T/.test(s))fail('日期時間不正確');return new Date(n).toISOString();}
function evidence(v){const s=text(v,64);if(!/^[a-f0-9]{64}$/i.test(s))fail('請提供已簽文件的 SHA-256');return s.toLowerCase();}
const addYear=v=>{const d=new Date(v);d.setUTCFullYear(d.getUTCFullYear()+1);return d.toISOString();};
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
async function policyIdentity(db,uid){
 // Historical contracts and ledgers must keep their original UID. Until their
 // migration is explicitly reconciled, never silently fall back to old policy.
 if(await first(db,"SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id=? OR new_line_id=?) LIMIT 1",uid,uid))fail('會員曾移轉 LINE 身分，請先核對契約與歸屬；未建立或改寫訂單獎金',409);
}
async function memberRecord(db,uid,actor=false){if(!UID.test(uid||''))fail('請選擇有效會員');const rows=await all(db,'SELECT * FROM users WHERE line_id=?'+(actor?' OR row_id=?':'')+' LIMIT 2',...actor?[uid,uid]:[uid]);if(rows.length!==1)fail('會員身分不唯一或不存在',409);return rows[0];}
async function member(db,uid){await policyIdentity(db,uid);return memberRecord(db,uid);}
const CONTRACT_ACTIVE='policy_version=? AND signed_at<=? AND effective_at<=? AND expires_at>? AND verified_at<=?';
async function activeContract(db,uid,at){
 await policyIdentity(db,uid);const policy=partnerContractContext11510(db).policy11510,latest=await policy.latest(uid,at);
 if(latest)return (await policy.state(latest,at)).active?latest:null;
 return first(db,'SELECT * FROM partner_contract_enrollments WHERE member_uid=? AND '+CONTRACT_ACTIVE+' ORDER BY effective_at DESC,verified_at DESC,id DESC LIMIT 1',uid,PARTNER_POLICY_VERSION,at,at,at,at);
}
async function creationContract(db,uid,at,allowStopped=false){
 const ids=new Set(UID.test(uid||'')?[uid]:[]);let links=[];
 for(let pass=0;ids.size&&pass<4;pass++){
  const before=ids.size,values=[...ids],markers=values.map(()=>'?').join(',');
  links=await all(db,`SELECT old_line_id,new_line_id FROM user_identity_links WHERE status='active' AND (old_line_id IN (${markers}) OR new_line_id IN (${markers})) ORDER BY old_line_id,new_line_id LIMIT 17`,...values,...values);
  if(links.length>16)fail('制度身分關聯需先核對',409);
  for(const link of links){if(!UID.test(link.old_line_id)||!UID.test(link.new_line_id))fail('制度身分關聯需先核對',409);ids.add(link.old_line_id);ids.add(link.new_line_id);}
  if(ids.size>8||pass===3&&ids.size!==before)fail('制度身分關聯需先核對',409);
  if(ids.size===before)break;
 }
 const values=[...ids],markers=values.map(()=>'?').join(',');
 const latest=ids.size?await first(db,`SELECT e.* FROM partner_contract_enrollments e LEFT JOIN partner_contract_11510_terms t ON t.contract_id=e.id WHERE e.member_uid IN (${markers}) AND ((e.policy_version=? AND t.contract_id IS NOT NULL) OR e.policy_version=?) AND e.signed_at<=? AND e.effective_at<=? AND e.verified_at<=? ORDER BY e.effective_at DESC,e.verified_at DESC,e.id DESC LIMIT 1`,...values,PARTNER_POLICY_11510,POLICY_11511,at,at,at):null;
 if(latest&&links.length)fail('會員曾移轉 LINE 身分，請先核對契約與歸屬；未建立或改寫訂單獎金',409);
 if(latest&&!(await partnerContractContext11510(db).policy11510.state(latest,at)).active){if(allowStopped && latest.policy_version===POLICY_11511)return {contract:latest,ids:values,linkStamp:''};if(allowStopped)return {contract:null,stoppedContract:latest,ids:values,linkStamp:''};fail('115.10契約已停止，不能自動改用舊制建立訂單',409);}
 const contract=latest||(ids.size?await first(db,`SELECT * FROM partner_contract_enrollments WHERE member_uid IN (${markers}) AND ${CONTRACT_ACTIVE} ORDER BY effective_at DESC,verified_at DESC,id DESC LIMIT 1`,...values,PARTNER_POLICY_VERSION,at,at,at,at):null);
 if(contract&&links.length)fail('會員曾移轉 LINE 身分，請先核對契約與歸屬；未建立或改寫訂單獎金',409);
 return {contract,ids:values,linkStamp:links.map(l=>l.old_line_id+'>'+l.new_line_id).join('|')};
}
const clock=db=>first(db,'SELECT revision FROM partner_bonus_v2_clock WHERE id=1');
async function financeActor(db,payload,{confirmReceipt=false}={}){
 const uid=payload.authenticatedUserId;
 if(!uid)return null; // Verified server payment callbacks have no browser actor.
 if(confirmReceipt){
  // Receipt records the operator's current authority, independently of contract attribution.
  if(await first(db,"SELECT 1 FROM user_identity_links WHERE status='active' AND old_line_id=? LIMIT 1",uid)){
   fail('請使用移轉後的管理員 LINE 帳號確認收款',409);
  }
 }else{
  await policyIdentity(db,uid);
 }
 const actor=await memberRecord(db,uid);
 if(!['admin','總管'].includes(String(actor.role||'').toLowerCase()))fail('付款與撤銷登錄僅限管理員',403);
 return actor;
}
const gate='EXISTS(SELECT 1 FROM partner_bonus_v2_clock WHERE id=1 AND revision=? AND last_key=?)';
const BOTH_LINK_IDS = ['old_line_id', 'new_line_id'];
function clockClaim(db,revision,key,actor,blockedLinkIds=BOTH_LINK_IDS,profileFields=[]){
 const fields=['row_id','line_id','legacy_line_id','point_line_id','role',...profileFields];
 let sql='UPDATE partner_bonus_v2_clock SET revision=revision+1,last_key=? WHERE id=1 AND revision=?';
 const args=[key,revision];
 if(actor){
  sql+=' AND EXISTS(SELECT 1 FROM users WHERE '+fields.map(k=>k+' IS ?').join(' AND ')+')';
  args.push(...fields.map(k=>actor[k]??null));
  if(blockedLinkIds.length){
   sql+=" AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND ("+blockedLinkIds.map(k=>k+'=?').join(' OR ')+'))';
   args.push(...blockedLinkIds.map(()=>actor.line_id));
  }
 }
 return db.prepare(sql).bind(...args);
}
async function currentAttribution(db,uid,at){return first(db,'SELECT * FROM partner_attribution_events WHERE target_uid=? AND effective_at<=? AND verified_at<=? ORDER BY effective_at DESC,verified_at DESC,id DESC LIMIT 1',uid,at,at);}
async function countDeals(db,uid,at){const row=await first(db,`SELECT COUNT(*) n FROM partner_bonus_deal_confirmations c JOIN orders o ON o.order_id=c.order_id
 WHERE c.recruiter_uid=? AND c.deal_type='tenant_annual_fee' AND c.confirmed_at<=? AND o.payment_status='paid'`,uid,at);return Number(row?.n||0);}

// Pure policy computation. Facts must be assembled by the verified D1 path below.
export function calculatePartnerBonusV2(facts){
 const plan={policyType:PARTNER_POLICY_VERSION,status:'pending',transactions:[],warnings:[],ordinal:Number(facts.priorValidDeals)+1};
 const hold=message=>{plan.status='review_required';plan.transactions=[];plan.warnings.push(message);return plan;};
 if(!['tenant_annual_fee','tenant_renewal_fee'].includes(facts.orderType))return hold('unsupported_order_type');
 if(!Number.isSafeInteger(facts.netAmount)||facts.netAmount<=0||facts.netAmount>MAX_MONEY)return hold('invalid_untaxed_amount');
 const quarter=Math.floor(facts.netAmount*100/4)/100,half=Math.floor(facts.netAmount*100/2)/100;
 const add=(memberId,bonusType,amount)=>{if(memberId&&amount>0)plan.transactions.push({memberId,bonusType,amount});};
 if(facts.orderType==='tenant_renewal_fee'){
  if(!UID.test(facts.originalReferrer||'')||!UID.test(facts.currentOwner||'')||!facts.originalEligible||!facts.ownerEligible)return hold('renewal_attribution_requires_review');
  add(facts.originalReferrer,'renewal_referral',quarter);add(facts.currentOwner,'renewal_placement',quarter);
 }else{
  if(facts.invalidatedQualification)return hold('qualification_requires_review');
  if(!UID.test(facts.recruiterUid||'')||!Number.isSafeInteger(facts.priorValidDeals)||facts.priorValidDeals<0)return hold('qualification_requires_review');
  if(!facts.projectIndependentAt&&facts.priorValidDeals<2&&facts.historicalQualificationUnknown)return hold('historical_qualification_requires_review');
  if(facts.projectIndependentAt||facts.priorValidDeals>=2)add(facts.recruiterUid,'direct_full',half);
  else{
   if(typeof facts.selfPurchased!=='boolean')return hold('purchase_status_requires_review');
   if(facts.selfPurchased)add(facts.recruiterUid,'direct_split',quarter);
   else {if(!facts.directSponsorEligible||!UID.test(facts.directSponsor||''))return hold('first_two_recipient_requires_review');add(facts.directSponsor,'first_two_passup',quarter);}
   if(!facts.chainComplete)return hold('upline_requires_review');
   const advanced=(facts.upline||[]).find(p=>p.eligible&&p.advanced);
   if(advanced)add(advanced.uid,'advanced_differential',quarter);
  }
 }
 if(plan.transactions.reduce((n,t)=>n+Math.round(t.amount*100),0)>Math.floor(facts.netAmount*100/2))return hold('bonus_cap_exceeded');
 return plan;
}

function orderValues(order,raw,at){return [order.orderId,order.orderType,order.buyerId,order.buyerName||'',order.networkId||'admin',order.productCode||'TENANT_ANNUAL',order.productName||'雙向完整版',order.grossAmount,order.netAmount,order.taxAmount,order.taxRate,order.bv??3000,order.currency||'TWD',order.paymentStatus||'pending_payment',order.paymentProvider||'',order.paymentNo||'',order.paidAt||'',order.bonusStatus||'not_generated',order.sponsorId||'',order.recruiterId||'',order.placementParentId||'',order.placementSide||'',order.bonusPolicyType||'left_right_independent_split',raw,at,at];}
const ORDER_COLUMNS='order_id,order_type,buyer_id,buyer_name,network_id,product_code,product_name,gross_amount,net_amount,tax_amount,tax_rate,bv,currency,payment_status,payment_provider,payment_no,paid_at,bonus_status,sponsor_id,recruiter_id,placement_parent_id,placement_side,bonus_policy_type,raw_json,created_at,updated_at';
function sameOrder(row,order){return row&&row.buyer_id===order.buyerId&&row.order_type===order.orderType&&row.gross_amount===order.grossAmount&&row.net_amount===order.netAmount&&(row.currency||'TWD')===(order.currency||'TWD');}
function savedOrder(row){let raw={};try{raw=JSON.parse(row.raw_json||'{}');}catch{}return {...raw,orderId:row.order_id,orderType:row.order_type,buyerId:row.buyer_id,grossAmount:row.gross_amount,netAmount:row.net_amount,taxAmount:row.tax_amount,taxRate:row.tax_rate,bv:row.bv,currency:row.currency,bonusPolicyType:row.bonus_policy_type,paymentStatus:row.payment_status,bonusStatus:row.bonus_status,paidAt:row.paid_at};}
const REFERRAL_PENDING = 'signed_referral_pending';
const trackedOrder = async (db, orderId) => first(db,
 'SELECT o.bonus_policy_type,s.order_id AS captured FROM orders o LEFT JOIN partner_bonus_order_snapshots s ON s.order_id=o.order_id WHERE o.order_id=?',orderId);

// New sales start as a receivable. Only the signed-review endpoint may attach a recruiter.
export async function createTenantReceivable(env, order, actorUid) {
 if (!['tenant_annual_fee','tenant_renewal_fee'].includes(order.orderType)){
  if(await first(dbFor(env),"SELECT 1 FROM orders WHERE order_id=? AND order_type IN ('tenant_annual_fee','tenant_renewal_fee')",order.orderId))fail('不可變更既有年費訂單類型',409);
  return null;
 }
 const db=dbFor(env), actor=actorUid?await memberRecord(db,actorUid,true):null;
 if(actor && actor.line_id!==order.buyerId && !['admin','總管','store','店長'].includes(actor.role)) fail('不可建立其他會員的訂單',403);
 await memberRecord(db,order.buyerId);
 if((order.currency||'TWD')!=='TWD'||!Number.isSafeInteger(order.grossAmount)||order.grossAmount<=0||order.grossAmount>MAX_MONEY||order.taxRate!==5||order.netAmount!==Math.round(order.grossAmount/1.05)||order.taxAmount!==order.grossAmount-order.netAmount)fail('請核對年費金額、稅額與幣別');
 const value={orderId:order.orderId,orderType:order.orderType,buyerId:order.buyerId,buyerName:order.buyerName,networkId:order.networkId,productCode:order.productCode,productName:order.productName,grossAmount:order.grossAmount,netAmount:order.netAmount,taxAmount:order.taxAmount,taxRate:order.taxRate,bv:order.bv,currency:order.currency,paymentProvider:order.paymentProvider,paymentStatus:'pending_payment',bonusStatus:'review_required',bonusPolicyType:REFERRAL_PENDING};
 const at=stamp(),key=crypto.randomUUID(),revision=(await clock(db)).revision;
 // A current admin can record a receivable after migration. Former identities still fail at write time.
 const currentAdmin=actor && actor.line_id===actorUid && ['admin','總管'].includes(actor.role);
 const claim=clockClaim(db,revision,key,actor,currentAdmin?['old_line_id']:BOTH_LINK_IDS);
 const result=await db.batch([claim,db.prepare(`INSERT INTO orders(${ORDER_COLUMNS}) SELECT ${Array(26).fill('?').join(',')} WHERE ${gate} AND EXISTS(SELECT 1 FROM users WHERE line_id=?) ON CONFLICT(order_id) DO NOTHING`).bind(...orderValues(value,JSON.stringify(value),at),revision+1,key,order.buyerId)]);
 if(!result[0].meta.changes)fail('權限或資料已更新，請重試',409);
 const row=await first(db,'SELECT * FROM orders WHERE order_id=?',order.orderId);
 if(!sameOrder(row,order))fail('訂單內容不一致',409);
 return {success:true,data:savedOrder(row),replayed:!result[1].meta.changes};
}

async function verifyOrderReferral(db, actor, data) {
 keys(data,['target_uid','orderId','applicationId','memberNumber','note','confirmed','requestKey']);
 if(data.confirmed!==true||!UUID.test(data.applicationId||'')||!/^\d{11,20}$/.test(data.memberNumber||''))fail('請核對已簽申請編號與業務推薦人的會員編號');
 const note=text(data.note,500), orderId=text(data.orderId,120), at=stamp();
 const revision=(await clock(db)).revision, nonce=crypto.randomUUID(), next=revision+1;
 const row=await first(db,'SELECT * FROM orders WHERE order_id=? AND buyer_id=?',orderId,data.target_uid);
 if(row && row.bonus_policy_type!==REFERRAL_PENDING && ['pending_payment','paid'].includes(row.payment_status)){
  const prior=await first(db,'SELECT snapshot_json FROM partner_bonus_order_snapshots WHERE order_id=?',orderId);
  const saved=prior?JSON.parse(prior.snapshot_json):null;
  if(saved?.classificationSource==='signed_order_review' && saved.applicationId===data.applicationId && saved.verifiedMemberNumber===data.memberNumber && saved.note===note)return {success:true,orderId,replayed:true};
 }
 if(!row||row.bonus_policy_type!==REFERRAL_PENDING||!['pending_payment','paid'].includes(row.payment_status))fail('此訂單不在待核清單，請重新載入',409);
 await member(db,row.buyer_id);
 const proof=await first(db,`SELECT a.snapshot_json,a.content_sha256 FROM full_applications a JOIN full_application_reviews r ON r.application_id=a.id WHERE a.id=? AND a.owner_uid=? AND r.decision='accepted'`,data.applicationId,row.buyer_id);
 if(!proof)fail('請選用本購買人已簽署且審核通過的完整版申請書',409);
 const signed=JSON.parse(proof.snapshot_json);
 if(signed.form_kind!=='full'||signed.signer_uid!==row.buyer_id)fail('簽署資料與購買人或申請類型不符',409);
 const matches=await all(db,'SELECT line_id FROM users WHERE member_number=? LIMIT 2',data.memberNumber);
 if(matches.length!==1||matches[0].line_id===row.buyer_id)fail('推薦人不唯一、找不到或為本人',409);
 const recruiter=matches[0].line_id;await member(db,recruiter);
 if(signed.fields?.performance_owner_member_number && signed.fields.performance_owner_member_number!==data.memberNumber)fail('會員編號與該筆簽署文件不符',409);
 const basis=await creationContract(db,recruiter,row.created_at,row.order_type==='tenant_renewal_fee');
 let contract=basis.contract;
 if(basis.stoppedContract){
  const owner=await currentAttribution(db,row.buyer_id,row.created_at);
  contract=owner?await partnerContractContext11510(db).policy11510.active(owner.manager_uid,row.created_at):null;
 }
 if(!contract)fail('訂單建立時無可核對的有效夥伴契約，保留待核',409);
 if(row.currency!=='TWD'||!Number.isSafeInteger(row.gross_amount)||row.gross_amount<=0||row.gross_amount>MAX_MONEY||row.tax_rate!==5||row.net_amount!==Math.round(row.gross_amount/1.05)||row.tax_amount!==row.gross_amount-row.net_amount)fail('訂單幣別或稅額待核',409);
 const snapshot={policyVersion:contract.policy_version,contractId:contract.id,recruiterUid:recruiter,buyerUid:row.buyer_id,capturedAt:row.created_at,policyRevision:next,originalReferrerUid:row.order_type==='tenant_annual_fee'?recruiter:'',policyBasisMemberUid:contract.member_uid,templateVersion:contract.policy_version===POLICY_11511?(revisedAgreement(contract)?REVISED_TEMPLATE:TEMPLATE_11511):contract.policy_version===PARTNER_POLICY_11510?'115.10':'',classificationSource:'signed_order_review',verifiedMemberNumber:data.memberNumber,applicationId:data.applicationId,documentSha256:proof.content_sha256,verifiedBy:actor.line_id,verifiedAt:at,note};
 const result=await db.batch([clockClaim(db,revision,nonce,actor,['old_line_id'],['name','phone']),db.prepare(`UPDATE orders SET recruiter_id=?,sponsor_id=?,bonus_policy_type=?,bv=net_amount/2.0,raw_json=json_set(raw_json,'$.signedReviewKey',?),updated_at=? WHERE order_id=? AND buyer_id=? AND bonus_policy_type=? AND payment_status IN ('pending_payment','paid') AND ${gate} AND EXISTS(SELECT 1 FROM users WHERE line_id=? AND member_number=?) AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id IN (?,?) OR new_line_id IN (?,?)))`).bind(recruiter,recruiter,contract.policy_version,nonce,at,orderId,row.buyer_id,REFERRAL_PENDING,next,nonce,recruiter,data.memberNumber,recruiter,row.buyer_id,recruiter,row.buyer_id),
 db.prepare(`INSERT INTO partner_bonus_order_snapshots(order_id,contract_id,policy_version,recruiter_uid,buyer_uid,captured_at,snapshot_json) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE order_id=? AND json_extract(raw_json,'$.signedReviewKey')=?) AND ${gate}`).bind(orderId,contract.id,contract.policy_version,recruiter,row.buyer_id,row.created_at,JSON.stringify(snapshot),orderId,nonce,next,nonce)]);
 if(result[2].meta.changes!==1)fail('訂單或權限已變動，請重新載入核對',409);
 return {success:true,orderId};
}


// Legacy order fixture construction. Production tenant creation uses createTenantReceivable.
export async function createPartnerV2Order(env,order,legacyPreview=value=>value,authenticatedUserId=''){
 const db=dbFor(env),actor=authenticatedUserId?await memberRecord(db,authenticatedUserId,true):null;
 if(actor&&actor.line_id!==order.buyerId&&!['admin','總管','store','店長'].includes(String(actor.role||'').toLowerCase()))fail('不可建立其他會員的制度訂單',403);
 for(let attempt=0;attempt<8;attempt++){
  const c=await clock(db),existing=await first(db,'SELECT * FROM orders WHERE order_id=?',order.orderId);
  // Creation is immutable for both policies: never feed an old ID into upsert.
  if(existing){if(!sameOrder(existing,order))fail('訂單編號已存在，請勿覆寫原內容',409);return {success:true,data:savedOrder(existing),replayed:true};}
  if(!['tenant_annual_fee','tenant_renewal_fee'].includes(order.orderType))return null;
  const buyer=await memberRecord(db,order.buyerId),recruiter=buyer.referrer_id,at=stamp(),classification=await creationContract(db,recruiter,at,order.orderType==='tenant_renewal_fee');let contract=classification.contract;
  if(classification.stoppedContract){
   const attribution=await currentAttribution(db,order.buyerId,at),owner=attribution?.manager_uid;
   contract=owner?await partnerContractContext11510(db).policy11510.active(owner,at):null;
   if(!contract)fail('115.10契約已停止，且無有效當下歸屬人，不能改用舊制建立訂單',409);
   classification.ownerAttributionId=attribution.id;classification.basisOwner=owner;
  }
  if(contract){await policyIdentity(db,order.buyerId);if(actor){if(authenticatedUserId!==actor.line_id)fail('請使用正式 LINE 身分重新登入',409);await policyIdentity(db,actor.line_id);}}
  if(!contract&&[PARTNER_POLICY_VERSION,PARTNER_POLICY_11510].includes(order.bonusPolicyType))fail('尚無有效新版簽約，不能由前端指定新制',409);
  if(contract&&recruiter===order.buyerId)fail('推薦來源不可為本人，請先核對 CRM 歸屬',409);
  if(contract&&(order.recruiterId&&order.recruiterId!==recruiter))fail('推薦來源與 CRM 不一致，請核對後重建訂單',409);
  if(contract&&((order.currency||'TWD')!=='TWD'||!Number.isSafeInteger(order.grossAmount)||order.grossAmount<=0||order.grossAmount>MAX_MONEY||order.taxRate!==5||order.netAmount!==Math.round(order.grossAmount/1.05)||order.taxAmount!==order.grossAmount-order.netAmount))fail('新制僅接受新臺幣、正確稅額與安全金額範圍');
  const version=contract?.policy_version;
  const value=contract?{...order,recruiterId:recruiter,sponsorId:recruiter,bv:order.netAmount/2,currency:'TWD',bonusPolicyType:version,paymentStatus:'pending_payment',paidAt:'',bonusStatus:'not_generated'}:legacyPreview({...order});
  const nonce=crypto.randomUUID(),next=c.revision+1,raw=JSON.stringify({...value,partnerPolicyCapture:nonce,partnerPolicyClassifiedAt:at,partnerPolicyRevision:next});
  const snapshot=contract?{policyVersion:version,...(version===PARTNER_POLICY_11510?{templateVersion:PARTNER_TEMPLATE_11510,policyBasisMemberUid:contract.member_uid,...(classification.basisOwner?{classificationSource:'current_owner_after_original_termination',ownerAttributionId:classification.ownerAttributionId,originalRecruiterUid:recruiter}:{})}:{}),contractId:contract.id,recruiterUid:recruiter,buyerUid:order.buyerId,capturedAt:at,policyRevision:next,originalReferrerUid:order.orderType==='tenant_annual_fee'?recruiter:'',grossAmount:order.grossAmount,netAmount:order.netAmount}:null;
  // Enrollment and creation share this CAS. If enrollment commits between the
  // read and insert, creation retries classification against its verified time.
  let identityGuard='',identityArgs=[];
  if(contract){identityGuard=" AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id IN (?,?,?) OR new_line_id IN (?,?,?)))";identityArgs=[order.buyerId,recruiter,contract.member_uid,order.buyerId,recruiter,contract.member_uid];}
  else if(classification.ids.length){const markers=classification.ids.map(()=>'?').join(',');identityGuard=` AND (SELECT COALESCE(group_concat(pair,'|'),'') FROM (SELECT old_line_id||'>'||new_line_id AS pair FROM user_identity_links WHERE status='active' AND (old_line_id IN (${markers}) OR new_line_id IN (${markers})) ORDER BY old_line_id,new_line_id))=?`;identityArgs=[...classification.ids,...classification.ids,classification.linkStamp];}
  const statements=[clockClaim(db,c.revision,nonce,actor,contract?BOTH_LINK_IDS:[]),db.prepare(`INSERT INTO orders(${ORDER_COLUMNS}) SELECT ${Array(26).fill('?').join(',')} WHERE ${gate} AND EXISTS(SELECT 1 FROM users WHERE line_id=? AND referrer_id IS ?)${identityGuard} ON CONFLICT(order_id) DO NOTHING`).bind(...orderValues(value,raw,at),next,nonce,order.buyerId,recruiter,...identityArgs)];
  if(contract)statements.push(db.prepare(`INSERT INTO partner_bonus_order_snapshots(order_id,contract_id,policy_version,recruiter_uid,buyer_uid,captured_at,snapshot_json)
   SELECT ?,?,?,?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND json_extract(raw_json,'$.partnerPolicyCapture')=?) ON CONFLICT(order_id) DO NOTHING`).bind(order.orderId,contract.id,version,recruiter,order.buyerId,at,JSON.stringify(snapshot),next,nonce,order.orderId,nonce));
  const result=await db.batch(statements);if(result[0].meta?.changes!==1)continue;
  const saved=await first(db,'SELECT * FROM orders WHERE order_id=?',order.orderId);
  if(!sameOrder(saved,order))fail('訂單或推薦來源已變更，請重新載入',409);
  return {success:true,data:savedOrder(saved)};
 }
 fail('制度與訂單資料正在更新，請重新載入',409);
}

export async function markPartnerV2OrderPaid(env,payload){
 const db=dbFor(env),tracked=await trackedOrder(db,payload.orderId||'');if(tracked?.bonus_policy_type==='project_exception')fail('專案免收或已更正的重複單不能收款或退款',409);
 if(!tracked?.captured && tracked?.bonus_policy_type!==REFERRAL_PENDING)return null;
 const actor=await financeActor(db,payload,{confirmReceipt:true});
 for(let attempt=0;attempt<5;attempt++){
  const c=await clock(db),row=await first(db,'SELECT * FROM orders WHERE order_id=?',payload.orderId),paymentNo=String(payload.paymentNo||payload.tradeNo||'').trim();
  if(!row||![PARTNER_POLICY_VERSION,PARTNER_POLICY_11510,POLICY_11511,REFERRAL_PENDING].includes(row.bonus_policy_type))fail('新制訂單證據不完整',409);
  if(['cancelled','refunded'].includes(row.payment_status))fail('訂單已取消或退費，不可重設付款',409);
  for(const [field,column]of [['grossAmount','gross_amount'],['amount','gross_amount'],['netAmount','net_amount']])if(payload[field]!==undefined&&Number(payload[field])!==row[column])fail('付款金額與原訂單不一致',409);
  if(row.payment_status==='paid'){if(row.payment_no&&paymentNo&&row.payment_no!==paymentNo)fail('付款憑證與原紀錄不一致',409);return {success:true,data:{orderId:row.order_id,paymentStatus:'paid',bonusStatus:row.bonus_status},replayed:true};}
  if(row.payment_status!=='pending_payment')fail('訂單付款狀態需人工核對',409);
  const at=stamp(),key=crypto.randomUUID();
  const results=await db.batch([clockClaim(db,c.revision,key,actor,['old_line_id']),db.prepare(`UPDATE orders SET payment_status='paid',paid_at=?,payment_no=?,bonus_status='review_required',updated_at=? WHERE order_id=? AND payment_status='pending_payment' AND ${gate}`).bind(at,paymentNo,at,row.order_id,c.revision+1,key)]);
  if(results[0].meta?.changes===1&&results[1].meta?.changes===1)return {success:true,data:{orderId:row.order_id,paymentStatus:'paid',bonusStatus:'review_required',reviewReason:'請管理員核對收款及已開通服務，再確認新制有效成交'}};
 }
 fail('訂單正在更新，請重新載入確認',409);
}

export async function updatePartnerV2OrderStatus(env,payload,status){
 const db=dbFor(env),tracked=await trackedOrder(db,payload.orderId||'');if(tracked?.bonus_policy_type==='project_exception')fail('專案免收或已更正的重複單不能收款或退款',409);
 if(!tracked?.captured && tracked?.bonus_policy_type!==REFERRAL_PENDING)return null;
 if(!['cancelled','refunded'].includes(status))fail('新制訂單狀態不正確');
 const actor=await financeActor(db,payload);
 for(let attempt=0;attempt<5;attempt++){
  const at=stamp(),key=crypto.randomUUID(),c=await clock(db),next=c.revision+1;
  const current=await first(db,'SELECT * FROM orders WHERE order_id=?',payload.orderId);
  if(!current||![PARTNER_POLICY_VERSION,PARTNER_POLICY_11510,POLICY_11511,REFERRAL_PENDING].includes(current.bonus_policy_type))fail('新制訂單證據不完整',409);
  if(current.payment_status===status)return {success:true,data:{orderId:payload.orderId,status,bonusStatus:current.bonus_status},replayed:true};
  if(current.payment_status==='refunded')fail('已退費訂單不可降回取消狀態',409);
  const result=await db.batch([clockClaim(db,c.revision,key,actor),
   db.prepare(`UPDATE orders SET payment_status=?,bonus_status='review_required',updated_at=? WHERE order_id=? AND ${gate}`).bind(status,at,payload.orderId,next,key),
   db.prepare(`UPDATE bonus_transactions SET status='reversed',updated_at=? WHERE order_id=? AND status IN ('frozen','review_required'${[PARTNER_POLICY_11510,POLICY_11511].includes(current.bonus_policy_type)?",'payable'":''}) AND ${gate}`).bind(at,payload.orderId,next,key),
   ...([PARTNER_POLICY_11510,POLICY_11511].includes(current.bonus_policy_type)?[db.prepare(`UPDATE partner_bonus_11510_holds SET status='cancelled',resolved_at=? WHERE order_id=? AND status='pending' AND ${gate}`).bind(at,payload.orderId,next,key)]:[]),
   db.prepare(`INSERT INTO partner_bonus_v2_status_events(id,order_id,status,created_at,event_json) SELECT ?,?,?,?,? WHERE ${gate}`).bind(key,payload.orderId,status,at,JSON.stringify({reason:'新制訂單撤銷；已結算流水保留並需人工回沖',actor:payload.authenticatedUserId||''}),next,key)]);
  if(result[0].meta?.changes===1)return {success:true,data:{orderId:payload.orderId,status,bonusStatus:'review_required'}};
 }
 fail('管理員權限或訂單狀態已變更，請重新核對',409);
}

async function purchaseFact(db,contract,at){
 if(contract.purchase_status==='purchased'){
  const row=await first(db,"SELECT * FROM orders WHERE order_id=? AND buyer_id=? AND payment_status='paid' AND order_type IN ('tenant_annual_fee','tenant_renewal_fee')",contract.purchase_order_id,contract.member_uid);
  if(row&&row.paid_at&&row.paid_at<=at&&([PARTNER_POLICY_11510,POLICY_11511].includes(contract.policy_version)||addYear(row.paid_at)>at))return {value:true,orderId:row.order_id,paidAt:row.paid_at};
  return {value:undefined};
 }
 const verified=await first(db,`SELECT o.order_id,o.paid_at FROM orders o WHERE o.buyer_id=? AND o.payment_status='paid' AND o.order_type IN ('tenant_annual_fee','tenant_renewal_fee') AND o.paid_at<=?${[PARTNER_POLICY_11510,POLICY_11511].includes(contract.policy_version)?'':" AND datetime(o.paid_at,'+1 year')>datetime(?)"} ORDER BY o.paid_at DESC LIMIT 1`,contract.member_uid,at,...([PARTNER_POLICY_11510,POLICY_11511].includes(contract.policy_version)?[]:[at]));
 if(verified)return {value:true,orderId:verified.order_id,paidAt:verified.paid_at};
 return {value:contract.purchase_status==='not_purchased'?false:undefined};
}
async function buildFacts(db,snapshot,row,at){
 const recipientContract=snapshot.policy_version===PARTNER_POLICY_VERSION
  ?async(db,uid,at)=>{await policyIdentity(db,uid);return first(db,'SELECT * FROM partner_contract_enrollments WHERE member_uid=? AND '+CONTRACT_ACTIVE+' ORDER BY effective_at DESC,verified_at DESC,id DESC LIMIT 1',uid,PARTNER_POLICY_VERSION,at,at,at,at);}
  :activeContract;
 const contract=await first(db,'SELECT * FROM partner_contract_enrollments WHERE id=?',snapshot.contract_id);
 const priorValidDeals=await countDeals(db,snapshot.recruiter_uid,at);
 const invalid=await first(db,`SELECT c.order_id FROM partner_bonus_deal_confirmations c JOIN orders o ON o.order_id=c.order_id WHERE c.recruiter_uid=? AND c.deal_type='tenant_annual_fee' AND o.payment_status!='paid' LIMIT 1`,snapshot.recruiter_uid);
 const facts={orderType:row.order_type,netAmount:row.net_amount,recruiterUid:snapshot.recruiter_uid,priorValidDeals,contractId:contract?.id,invalidatedQualification:!!invalid,chainComplete:true,upline:[]};
 if(!contract||contract.signed_at>snapshot.captured_at||contract.effective_at>snapshot.captured_at){facts.priorValidDeals=NaN;return facts;}
 if(row.order_type==='tenant_renewal_fee'){
  const origin=await first(db,`SELECT s.recruiter_uid,s.order_id FROM partner_bonus_order_snapshots s JOIN partner_bonus_deal_confirmations c ON c.order_id=s.order_id JOIN orders o ON o.order_id=s.order_id WHERE s.buyer_uid=? AND o.order_type='tenant_annual_fee' AND o.payment_status='paid' ORDER BY c.confirmed_at LIMIT 1`,row.buyer_id);
  const owner=await currentAttribution(db,row.buyer_id,at);
  facts.originalReferrer=origin?.recruiter_uid||'';facts.originalOrderId=origin?.order_id||'';facts.currentOwner=owner?.manager_uid||'';facts.attributionId=owner?.id||'';
  facts.originalEligible=!!(facts.originalReferrer&&await recipientContract(db,facts.originalReferrer,at));facts.ownerEligible=!!(facts.currentOwner&&await recipientContract(db,facts.currentOwner,at));return facts;
 }
 const recruiter=await memberRecord(db,snapshot.recruiter_uid);
 if(recruiter.crm_project_independent_at && recruiter.crm_project_independent_at<=snapshot.captured_at){
  facts.projectIndependentAt=recruiter.crm_project_independent_at;
  return facts;
 }
 const historical=await first(db,`SELECT o.order_id FROM orders o WHERE o.order_type='tenant_annual_fee' AND o.payment_status='paid' AND o.recruiter_id=? AND NOT EXISTS(SELECT 1 FROM partner_bonus_order_snapshots s WHERE s.order_id=o.order_id) LIMIT 1`,snapshot.recruiter_uid);
 facts.historicalQualificationUnknown=!!historical;
 facts.purchaseEvidence=await purchaseFact(db,contract,at);facts.selfPurchased=facts.purchaseEvidence.value;
 const parentEvent=await currentAttribution(db,contract.member_uid,at);
 const sponsor=parentEvent?.manager_uid||contract.sponsor_uid;facts.directSponsor=sponsor;facts.directSponsorEligible=!!(sponsor&&await recipientContract(db,sponsor,at));
 let next=sponsor;const seen=new Set([snapshot.recruiter_uid]);
 for(let depth=0;next;depth++){
  if(depth>=40||seen.has(next)){facts.chainComplete=false;break;}seen.add(next);
  const ancestor=await recipientContract(db,next,at);if(!ancestor){facts.chainComplete=false;break;}
  const count=await countDeals(db,next,at),invalidAncestor=await first(db,`SELECT c.order_id FROM partner_bonus_deal_confirmations c JOIN orders o ON o.order_id=c.order_id WHERE c.recruiter_uid=? AND c.deal_type='tenant_annual_fee' AND o.payment_status!='paid' LIMIT 1`,next);
  facts.upline.push({uid:next,eligible:true,advanced:count>=2&&!invalidAncestor,contractId:ancestor.id,validDeals:count});
  if(count>=2&&!invalidAncestor)break;
  const relation=await currentAttribution(db,next,at);next=relation?.manager_uid||ancestor.sponsor_uid;
 }
 return facts;
}

async function enroll(db,uid,actor,data){
 if([PARTNER_TEMPLATE_11510,TEMPLATE_11511,REVISED_TEMPLATE].includes(data?.templateVersion))return partnerContractContext11510(db,uid,actor).policy11510.enroll(data);
 if(data?.templateVersion!==PARTNER_POLICY_VERSION||!data.signedAt||date(data.signedAt)>=PARTNER_POLICY_CUTOVER)fail('請使用115.10版登錄新簽契約；舊版僅可核對切換前已簽文件',409);
 keys(data,['target_uid','signedAt','effectiveAt','documentSha256','evidenceRef','confirmed','requestKey','purchaseStatus','purchaseOrderId','templateVersion']);
 if(data.confirmed!==true||!UUID.test(data.requestKey||''))fail('請確認已核對簽約文件並重新送出');
 const target=await member(db,data.target_uid),signed=date(data.signedAt),effective=date(data.effectiveAt),at=stamp(),purchaseStatus=data.purchaseStatus||'unknown';
 if(signed>at||effective<signed||!['unknown','purchased','not_purchased'].includes(purchaseStatus))fail('簽署日期、制度生效日或購買狀態不正確');
 let purchaseId=text(data.purchaseOrderId||'',100,false);
 if(purchaseStatus==='purchased'){
  const purchase=await first(db,"SELECT * FROM orders WHERE order_id=? AND buyer_id=? AND payment_status='paid' AND order_type IN ('tenant_annual_fee','tenant_renewal_fee')",purchaseId,target.line_id);
  if(!purchase||!purchase.paid_at||purchase.paid_at>at)fail('無法核對本人已付款完整版訂單',409);
 }else if(purchaseId)fail('未購買或待確認時，不可填入購買訂單');
 const sponsor=target.referrer_id||'';if(sponsor&&sponsor!=='admin'&&!UID.test(sponsor))fail('CRM 推薦來源需先核對',409);
 const request={target_uid:target.line_id,signedAt:signed,effectiveAt:effective,documentSha256:evidence(data.documentSha256),evidenceRef:text(data.evidenceRef),confirmed:true,requestKey:data.requestKey,purchaseStatus,purchaseOrderId:purchaseId},json=JSON.stringify(request);
 const old=await first(db,'SELECT * FROM partner_contract_enrollments WHERE request_key=?',data.requestKey);if(old){if(old.request_json!==json)fail('同一次登錄已送出不同內容',409);return {success:true,contract:old,replayed:true};}
 const duplicate=await first(db,'SELECT id FROM partner_contract_enrollments WHERE member_uid=? AND document_sha256=? AND effective_at=?',target.line_id,request.documentSha256,effective);if(duplicate)fail('這份契約與生效日已登錄，請重新整理',409);
 const id=crypto.randomUUID(),c=await clock(db),key=data.requestKey,nonce=crypto.randomUUID();
 const result=await db.batch([clockClaim(db,c.revision,nonce,actor),db.prepare(`INSERT INTO partner_contract_enrollments(id,member_uid,policy_version,signed_at,effective_at,expires_at,document_sha256,evidence_ref,sponsor_uid,purchase_status,purchase_order_id,verified_by,verified_at,verified_revision,request_key,request_json)
  SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM users WHERE line_id=? AND referrer_id IS ?) AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id=? OR new_line_id=?))`).bind(id,target.line_id,PARTNER_POLICY_VERSION,signed,effective,addYear(effective),request.documentSha256,request.evidenceRef,sponsor==='admin'?'':sponsor,purchaseStatus,purchaseId,uid,at,c.revision+1,key,json,c.revision+1,nonce,target.line_id,target.referrer_id,target.line_id,target.line_id)]);
 if(result[0].meta?.changes!==1||result[1].meta?.changes!==1)fail('管理員權限或制度資料已變更，請重新載入',409);
 return {success:true,contract:await first(db,'SELECT * FROM partner_contract_enrollments WHERE id=?',id)};
}
async function attribute(db,uid,actor,data){
 keys(data,['target_uid','manager_uid','effectiveAt','consentSha256','evidenceRef','confirmed','requestKey']);if(data.confirmed!==true||!UUID.test(data.requestKey||''))fail('請核對當事人同意證據');
 await member(db,data.target_uid);await member(db,data.manager_uid);if(data.target_uid===data.manager_uid)fail('管理歸屬不可指向本人');
 const at=stamp(),effective=date(data.effectiveAt);if(effective>at)fail('請於管理關係正式生效後登錄');
 if(!await activeContract(db,data.manager_uid,at))fail('歸屬對象尚無有效新版簽約',409);
 const request={target_uid:data.target_uid,manager_uid:data.manager_uid,effectiveAt:effective,consentSha256:evidence(data.consentSha256),evidenceRef:text(data.evidenceRef),confirmed:true,requestKey:data.requestKey},json=JSON.stringify(request);
 const old=await first(db,'SELECT * FROM partner_attribution_events WHERE request_key=?',data.requestKey);if(old){if(old.request_json!==json)fail('同一次歸屬登錄已送出不同內容',409);return {success:true,attribution:old,replayed:true};}
 const id=crypto.randomUUID(),c=await clock(db),key=data.requestKey,nonce=crypto.randomUUID();
 const result=await db.batch([clockClaim(db,c.revision,nonce,actor),db.prepare(`INSERT INTO partner_attribution_events(id,target_uid,manager_uid,effective_at,consent_sha256,evidence_ref,verified_by,verified_at,request_key,request_json) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${gate} AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id IN (?,?) OR new_line_id IN (?,?)))`).bind(id,data.target_uid,data.manager_uid,effective,request.consentSha256,request.evidenceRef,uid,at,key,json,c.revision+1,nonce,data.target_uid,data.manager_uid,data.target_uid,data.manager_uid)]);
 if(result[0].meta?.changes!==1||result[1].meta?.changes!==1)fail('管理員權限或歸屬資料已變更，請重新載入',409);
 return {success:true,attribution:await first(db,'SELECT * FROM partner_attribution_events WHERE id=?',id)};
}
async function confirmDeal(db,uid,actor,data){
 const snapshotVersion=await first(db,'SELECT policy_version FROM partner_bonus_order_snapshots WHERE order_id=?',data?.orderId||'');
 if([PARTNER_POLICY_11510,POLICY_11511].includes(snapshotVersion?.policy_version))return partnerContractContext11510(db,uid,actor).policy11510.confirm(data);
 keys(data,['orderId','receiptRef','serviceOpenedAt','confirmed','requestKey']);
 if(data.confirmed!==true||!UUID.test(data.requestKey||''))fail('請明確確認收款及服務開通');
 const request={orderId:text(data.orderId,100),receiptRef:text(data.receiptRef),serviceOpenedAt:date(data.serviceOpenedAt),confirmed:true,requestKey:data.requestKey},json=JSON.stringify(request);
 if(request.serviceOpenedAt>stamp())fail('服務開通時間不可在未來');
 for(let attempt=0;attempt<8;attempt++){
  const c=await clock(db),old=await first(db,'SELECT * FROM partner_bonus_deal_confirmations WHERE order_id=? OR request_key=?',request.orderId,request.requestKey);
  if(old){
   if(old.order_id!==request.orderId||old.request_json!==json)fail('此訂單已完成另一筆有效成交確認，請勿重複',409);
   const current=await first(db,'SELECT payment_status,bonus_status FROM orders WHERE order_id=?',request.orderId);
   if(current?.payment_status!=='paid')return {success:false,error:'原成交已取消或退費，流水保留待人工核對',reviewRequired:true,currentStatus:current?.payment_status||'unknown',settlementStatus:'review_required',confirmation:old,replayed:true};
   return {success:true,confirmation:old,plan:JSON.parse(old.plan_json),settlementStatus:'review_required',currentStatus:current.payment_status,replayed:true};
  }
  const row=await first(db,'SELECT * FROM orders WHERE order_id=?',request.orderId),snapshot=await first(db,'SELECT * FROM partner_bonus_order_snapshots WHERE order_id=?',request.orderId);
  if(!row||!snapshot||row.bonus_policy_type!==PARTNER_POLICY_VERSION)fail('僅可確認新版簽約後新建的制度訂單',409);
  if(row.payment_status!=='paid'||!row.paid_at||request.serviceOpenedAt<snapshot.captured_at)fail('請先核對已付款且已開通的訂單',409);
  if((await first(db,'SELECT COUNT(*) n FROM bonus_transactions WHERE order_id=?',row.order_id)).n>0)fail('此訂單已有獎金流水，禁止重新計算覆寫',409);
  if(row.order_type==='tenant_annual_fee'){
   const prior=await first(db,"SELECT order_id FROM orders WHERE buyer_id=? AND order_type='tenant_annual_fee' AND payment_status='paid' AND order_id!=? LIMIT 1",row.buyer_id,row.order_id);
   if(prior)fail('此商家已有有效首年度成交，請核對續約／重複訂單',409);
  }
  const at=stamp(),facts=await buildFacts(db,snapshot,row,at),plan=calculatePartnerBonusV2(facts);
  if(plan.status==='review_required')return {success:false,error:'必要事實尚待核對，未產生獎金',code:'PARTNER_FACTS_REQUIRED',reviewReasons:plan.warnings,plan};
  const key=request.requestKey,nonce=crypto.randomUUID(),next=c.revision+1,confirmedId=row.order_id;
  const parties=[...new Set([row.buyer_id,snapshot.recruiter_uid,...plan.transactions.map(t=>t.memberId)])],markers=parties.map(()=>'?').join(',');
  let factsGate=` AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id IN (${markers}) OR new_line_id IN (${markers})))`,factsArgs=[...parties,...parties];
  if(row.order_type==='tenant_annual_fee'){
   factsGate+=" AND NOT EXISTS(SELECT 1 FROM orders WHERE buyer_id=? AND order_type='tenant_annual_fee' AND payment_status='paid' AND order_id!=?)";factsArgs.push(row.buyer_id,row.order_id);
   if(!facts.projectIndependentAt&&facts.priorValidDeals<2&&facts.selfPurchased){factsGate+=" AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND buyer_id=? AND payment_status='paid' AND paid_at=?)";factsArgs.push(facts.purchaseEvidence.orderId,snapshot.recruiter_uid,facts.purchaseEvidence.paidAt);}
   else if(!facts.projectIndependentAt&&facts.priorValidDeals<2){factsGate+=" AND NOT EXISTS(SELECT 1 FROM orders WHERE buyer_id=? AND payment_status='paid' AND order_type IN ('tenant_annual_fee','tenant_renewal_fee') AND paid_at<=? AND datetime(paid_at,'+1 year')>datetime(?))";factsArgs.push(snapshot.recruiter_uid,at,at);}
  }
  const statements=[clockClaim(db,c.revision,nonce,actor),db.prepare(`INSERT INTO partner_bonus_deal_confirmations(order_id,recruiter_uid,buyer_uid,deal_type,receipt_ref,service_opened_at,confirmed_at,confirmed_by,ordinal,facts_json,plan_json,request_key,request_json)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND payment_status='paid' AND bonus_status='review_required')${factsGate}`).bind(confirmedId,snapshot.recruiter_uid,row.buyer_id,row.order_type,request.receiptRef,request.serviceOpenedAt,at,uid,plan.ordinal,JSON.stringify(facts),JSON.stringify(plan),key,json,next,nonce,confirmedId,...factsArgs)];
  // Payment/claim deadlines remain unfilled in the source contract. Do not invent
  // the legacy 14-day release rule: new awards await separate settlement review.
  const freezeUntil='';
  for(const [i,tx]of plan.transactions.entries())statements.push(db.prepare(`INSERT INTO bonus_transactions(tx_id,order_id,beneficiary_id,source_user_id,network_id,bonus_type,amount,bv,status,freeze_until,note,raw_json,updated_at)
   SELECT ?,?,?,?,?,?,?,?,'review_required',?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM partner_bonus_deal_confirmations WHERE order_id=? AND request_key=?)`).bind(confirmedId+'-P2-'+i,confirmedId,tx.memberId,row.buyer_id,row.network_id,tx.bonusType,tx.amount,row.net_amount/2,freezeUntil,'新版共創契約：'+tx.bonusType,JSON.stringify({...tx,policyVersion:PARTNER_POLICY_VERSION,contractId:snapshot.contract_id}),at,next,nonce,confirmedId,key));
  statements.push(db.prepare(`UPDATE orders SET bonus_status='generated',updated_at=? WHERE order_id=? AND ${gate} AND EXISTS(SELECT 1 FROM partner_bonus_deal_confirmations WHERE order_id=? AND request_key=?)`).bind(at,confirmedId,next,nonce,confirmedId,key));
  const result=await db.batch(statements);if(result[0].meta?.changes!==1)continue;
  const saved=await first(db,'SELECT * FROM partner_bonus_deal_confirmations WHERE order_id=?',confirmedId);if(!saved)fail('訂單狀態已變更，未建立獎金，請重新核對',409);
  return {success:true,confirmation:saved,plan,settlementStatus:'review_required',settlementNote:'獎金已計算；對帳、合法請款與給付條件須另行確認，尚未付款'};
 }
 fail('成交正在由其他管理員確認，請重新載入',409);
}
export function partnerContractContext11510(db,uid='',actor=null){
 const ctx={db,uid,actor,all,first,fail,keys,text,date,evidence,stamp,clock,clockClaim,gate,member,policyIdentity,buildFacts,calculateV2:calculatePartnerBonusV2,currentAttribution,activeAny:activeContract,activeContract};
 ctx.policy11510=createPartnerPolicy11510(ctx);ctx.awardEligibility=ctx.policy11510.awardEligibility;return ctx;
}
async function authorizeOrderReviewAdmin(request,env,profileMapper,fetcher){
 const uid=await authenticatedUid(request,fetcher), db=dbFor(env);
 // A signed-in operator is identified by the current LINE ID on their own CRM record.
 const actor=await memberRecord(db,uid);
 if(!['admin','總管'].includes(actor.role)||profileMapper(actor)?.role!=='admin')fail('核對訂單推薦人僅限管理員',403);
 if(await first(db,"SELECT 1 FROM user_identity_links WHERE status='active' AND old_line_id=? LIMIT 1",uid))fail('請使用移轉後的管理員 LINE 帳號登入',409);
 return {uid,db,actor};
}
export async function handlePartnerContracts(request,env,profileMapper,fetcher=fetch){
 const url=new URL(request.url);if(url.pathname!==BASE&&!url.pathname.startsWith(BASE+'/'))return null;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 try{
  const route=url.pathname.slice(BASE.length);
  const orderReview=(request.method==='GET' && (route==='' || route==='/lookup')) || (request.method==='POST' && route==='/order-referral');
  const authorize=orderReview?authorizeOrderReviewAdmin:authorizeStoreAdmin;
  const {uid,db,actor}=await authorize(request,env,profileMapper,fetcher);
  if(request.method==='GET'&&route==='/lookup'){
   if([...url.searchParams.keys()].some(k=>k!=='memberNumber')||url.searchParams.getAll('memberNumber').length!==1)fail('請輸入一組會員編號');
   const number=url.searchParams.get('memberNumber');if(!/^\d{11,20}$/.test(number||''))fail('會員編號格式不正確');
   let found;try{found=await findMemberReferrer(db,number);}catch(e){fail(e.message,409);}
   return reply({success:true,member:{userId:found.userId,name:found.name,memberNumber:found.memberNumber}});
  }
  if(request.method==='GET'&&route==='/settlement'){
   if([...url.searchParams.keys()].some(k=>k!=='target')||url.searchParams.getAll('target').length!==1)fail('請選擇一位 CRM 會員');
   return reply(await readPartnerSettlement11510(partnerContractContext11510(db,uid,actor),url.searchParams.get('target')));
  }
  if(request.method==='GET'&&!route){
   if([...url.searchParams.keys()].some(k=>k!=='target')||url.searchParams.getAll('target').length!==1)fail('請選擇一位 CRM 會員');
   const target=url.searchParams.get('target'),targetMember=await member(db,target);
   const heldOrders=await all(db,"SELECT order_id AS orderId,payment_status AS status FROM orders WHERE buyer_id=? AND bonus_policy_type=? AND payment_status IN ('pending_payment','paid') ORDER BY created_at DESC LIMIT 100",target,REFERRAL_PENDING);
   const referralProofs=heldOrders.length ? await all(db,`SELECT a.id,a.signed_at,json_extract(a.snapshot_json,'$.fields.assisted_partner') AS namedPartner FROM full_applications a JOIN full_application_reviews r ON r.application_id=a.id WHERE a.owner_uid=? AND r.decision='accepted' AND json_extract(a.snapshot_json,'$.form_kind')='full' ORDER BY a.signed_at DESC LIMIT 100`,target):[];
   const referrer={required:false,memberNumber:'',name:'',source:'signed_only'};
   const policy=partnerContractContext11510(db,uid,actor).policy11510;
   const contracts=await Promise.all((await all(db,'SELECT * FROM partner_contract_enrollments WHERE member_uid=? ORDER BY verified_at DESC,id DESC LIMIT 20',target)).map(c=>policy.decorate(c)));
   const pendingDeals=await all(db,`SELECT o.order_id AS orderId,o.payment_status AS status,o.gross_amount AS amount,o.bonus_status AS bonusStatus,s.policy_version AS policyVersion FROM orders o JOIN partner_bonus_order_snapshots s ON s.order_id=o.order_id WHERE s.recruiter_uid=? AND NOT EXISTS(SELECT 1 FROM partner_bonus_deal_confirmations c WHERE c.order_id=o.order_id) ORDER BY s.captured_at DESC LIMIT 20`,target);
   const renewalHolds=await all(db,`SELECT h.*,s.buyer_uid AS buyerUid FROM partner_bonus_11510_holds h JOIN partner_bonus_order_snapshots s ON s.order_id=h.order_id WHERE s.recruiter_uid=? AND h.status='pending' ORDER BY h.created_at DESC LIMIT 40`,target);
   const revised=contracts.some(revisedAgreement);
   const checkedAt=stamp(),serviceNow=revised?await fullServiceCheck(db,target,checkedAt,checkedAt):null;
   const serviceEvents=revised?await all(db,'SELECT action,order_id,effective_at,expires_at,evidence_ref FROM partner_full_service_evidence WHERE member_uid=? ORDER BY effective_at DESC LIMIT 20',target):[];
   const excluded=revised?await all(db,"SELECT order_id,bonus_type,json_extract(raw_json,'$.baseAmount') AS baseAmount,json_extract(raw_json,'$.fullService.reason') AS reason,json_extract(raw_json,'$.fullService.to') AS checkedAt FROM bonus_transactions WHERE beneficiary_id=? AND status='service_ineligible' ORDER BY updated_at DESC LIMIT 50",target):[];
   return reply({success:true,projectIndependentAt:targetMember.crm_project_independent_at||'',projectFeeWaivedAt:targetMember.crm_project_fee_waived_at||'',serviceNow,serviceEvents,excluded,policyVersion:POLICY_11511,templateVersion:REVISED_TEMPLATE,templateSha256:REVISED_SOURCE,contracts,referrer,heldOrders,referralProofs,attribution:await currentAttribution(db,target,stamp()),validDealCount:await countDeals(db,target,stamp()),pendingDeals,renewalHolds});
  }
  const financeRoutes=['/settlement/statements','/settlement/claims','/settlement/disputes','/settlement/resolve','/settlement/payments'];
  if(request.method!=='POST'||url.search||!['','/project','/full-service','/order-referral','/attribution','/deals/confirm','/lifecycle','/renewals/resolve',...financeRoutes].includes(route))fail('不支援此操作',405);
  if(uid!==actor.line_id)fail('請使用 CRM 正式管理員 LINE 身分重新登入',409);
  if(!orderReview)await policyIdentity(db,uid);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail('請使用 JSON 資料',415);
  const data=await readJson(request,10000),context=partnerContractContext11510(db,uid,actor),policy=context.policy11510,result=await(route==='/project'?grantPartnerProject(context,data):route==='/full-service'?recordFullService(context,data):route==='/order-referral'?verifyOrderReferral(db,actor,data):financeRoutes.includes(route)?handlePartnerSettlement11510(route,data,context):route==='/attribution'?attribute(db,uid,actor,data):route==='/deals/confirm'?confirmDeal(db,uid,actor,data):route==='/lifecycle'?policy.lifecycle(data):route==='/renewals/resolve'?policy.resolve(data):enroll(db,uid,actor,data));
  return reply(result,result.success?200:409);
 }catch(e){if(e instanceof ShopError||e instanceof DirectoryError)return reply({success:false,error:e.message},e.status||400);console.error('partner_contract_operation_unavailable');return reply({success:false,error:'共創制度資料暫時無法完成，請重新載入確認'},503);}
}
