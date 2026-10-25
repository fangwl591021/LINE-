import {authorizeStoreAdmin,DirectoryError} from './store-admin.mjs';
import {readJson,ShopError} from './store-shop.mjs';
import {findMemberReferrer} from './member-number.mjs';

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
async function activeContract(db,uid,at){await policyIdentity(db,uid);return first(db,'SELECT * FROM partner_contract_enrollments WHERE member_uid=? AND '+CONTRACT_ACTIVE+' ORDER BY effective_at DESC,verified_at DESC,id DESC LIMIT 1',uid,PARTNER_POLICY_VERSION,at,at,at,at);}
async function creationContract(db,uid,at){
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
 const contract=ids.size?await first(db,`SELECT * FROM partner_contract_enrollments WHERE member_uid IN (${markers}) AND ${CONTRACT_ACTIVE} ORDER BY effective_at DESC,verified_at DESC,id DESC LIMIT 1`,...values,PARTNER_POLICY_VERSION,at,at,at,at):null;
 if(contract&&links.length)fail('會員曾移轉 LINE 身分，請先核對契約與歸屬；未建立或改寫訂單獎金',409);
 return {contract,ids:values,linkStamp:links.map(l=>l.old_line_id+'>'+l.new_line_id).join('|')};
}
const clock=db=>first(db,'SELECT revision FROM partner_bonus_v2_clock WHERE id=1');
async function financeActor(db,payload){
 if(!payload.authenticatedUserId)return null; // Verified server payment callbacks have no browser actor.
 const actor=await member(db,payload.authenticatedUserId);
 if(!['admin','總管'].includes(String(actor.role||'').toLowerCase()))fail('付款與撤銷登錄僅限管理員',403);
 return actor;
}
const gate='EXISTS(SELECT 1 FROM partner_bonus_v2_clock WHERE id=1 AND revision=? AND last_key=?)';
function clockClaim(db,revision,key,actor,strictIdentity=true){
 const fields=['row_id','line_id','legacy_line_id','point_line_id','role'];
 return db.prepare('UPDATE partner_bonus_v2_clock SET revision=revision+1,last_key=? WHERE id=1 AND revision=?'+(actor?' AND EXISTS(SELECT 1 FROM users WHERE '+fields.map(k=>k+' IS ?').join(' AND ')+')'+(strictIdentity?' AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status=\'active\' AND (old_line_id=? OR new_line_id=?))':''):''))
  .bind(key,revision,...(actor?[...fields.map(k=>actor[k]??null),...(strictIdentity?[actor.line_id,actor.line_id]:[])]:[]));
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
  if(facts.priorValidDeals<2&&facts.historicalQualificationUnknown)return hold('historical_qualification_requires_review');
  if(facts.priorValidDeals>=2)add(facts.recruiterUid,'direct_full',half);
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
export async function createPartnerV2Order(env,order,legacyPreview=value=>value,authenticatedUserId=''){
 const db=dbFor(env),actor=authenticatedUserId?await memberRecord(db,authenticatedUserId,true):null;
 if(actor&&actor.line_id!==order.buyerId&&!['admin','總管','store','店長'].includes(String(actor.role||'').toLowerCase()))fail('不可建立其他會員的制度訂單',403);
 for(let attempt=0;attempt<8;attempt++){
  const c=await clock(db),existing=await first(db,'SELECT * FROM orders WHERE order_id=?',order.orderId);
  // Creation is immutable for both policies: never feed an old ID into upsert.
  if(existing){if(!sameOrder(existing,order))fail('訂單編號已存在，請勿覆寫原內容',409);return {success:true,data:savedOrder(existing),replayed:true};}
  if(!['tenant_annual_fee','tenant_renewal_fee'].includes(order.orderType))return null;
  const buyer=await memberRecord(db,order.buyerId),recruiter=buyer.referrer_id,at=stamp(),classification=await creationContract(db,recruiter,at),contract=classification.contract;
  if(contract){await policyIdentity(db,order.buyerId);if(actor){if(authenticatedUserId!==actor.line_id)fail('請使用正式 LINE 身分重新登入',409);await policyIdentity(db,actor.line_id);}}
  if(!contract&&order.bonusPolicyType===PARTNER_POLICY_VERSION)fail('尚無有效新版簽約，不能由前端指定新制',409);
  if(contract&&recruiter===order.buyerId)fail('推薦來源不可為本人，請先核對 CRM 歸屬',409);
  if(contract&&(order.recruiterId&&order.recruiterId!==recruiter))fail('推薦來源與 CRM 不一致，請核對後重建訂單',409);
  if(contract&&((order.currency||'TWD')!=='TWD'||!Number.isSafeInteger(order.grossAmount)||order.grossAmount<=0||order.grossAmount>MAX_MONEY||order.taxRate!==5||order.netAmount!==Math.round(order.grossAmount/1.05)||order.taxAmount!==order.grossAmount-order.netAmount))fail('新制僅接受新臺幣、正確稅額與安全金額範圍');
  const value=contract?{...order,recruiterId:recruiter,sponsorId:recruiter,bv:order.netAmount/2,currency:'TWD',bonusPolicyType:PARTNER_POLICY_VERSION,paymentStatus:'pending_payment',paidAt:'',bonusStatus:'not_generated'}:legacyPreview({...order});
  const nonce=crypto.randomUUID(),next=c.revision+1,raw=JSON.stringify({...value,partnerPolicyCapture:nonce,partnerPolicyClassifiedAt:at,partnerPolicyRevision:next});
  const snapshot=contract?{policyVersion:PARTNER_POLICY_VERSION,contractId:contract.id,recruiterUid:recruiter,buyerUid:order.buyerId,capturedAt:at,policyRevision:next,originalReferrerUid:order.orderType==='tenant_annual_fee'?recruiter:'',grossAmount:order.grossAmount,netAmount:order.netAmount}:null;
  // Enrollment and creation share this CAS. If enrollment commits between the
  // read and insert, creation retries classification against its verified time.
  let identityGuard='',identityArgs=[];
  if(contract){identityGuard=" AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id IN (?,?) OR new_line_id IN (?,?)))";identityArgs=[order.buyerId,recruiter,order.buyerId,recruiter];}
  else if(classification.ids.length){const markers=classification.ids.map(()=>'?').join(',');identityGuard=` AND (SELECT COALESCE(group_concat(pair,'|'),'') FROM (SELECT old_line_id||'>'||new_line_id AS pair FROM user_identity_links WHERE status='active' AND (old_line_id IN (${markers}) OR new_line_id IN (${markers})) ORDER BY old_line_id,new_line_id))=?`;identityArgs=[...classification.ids,...classification.ids,classification.linkStamp];}
  const statements=[clockClaim(db,c.revision,nonce,actor,!!contract),db.prepare(`INSERT INTO orders(${ORDER_COLUMNS}) SELECT ${Array(26).fill('?').join(',')} WHERE ${gate} AND EXISTS(SELECT 1 FROM users WHERE line_id=? AND referrer_id IS ?)${identityGuard} ON CONFLICT(order_id) DO NOTHING`).bind(...orderValues(value,raw,at),next,nonce,order.buyerId,recruiter,...identityArgs)];
  if(contract)statements.push(db.prepare(`INSERT INTO partner_bonus_order_snapshots(order_id,contract_id,policy_version,recruiter_uid,buyer_uid,captured_at,snapshot_json)
   SELECT ?,?,?,?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND json_extract(raw_json,'$.partnerPolicyCapture')=?) ON CONFLICT(order_id) DO NOTHING`).bind(order.orderId,contract.id,PARTNER_POLICY_VERSION,recruiter,order.buyerId,at,JSON.stringify(snapshot),next,nonce,order.orderId,nonce));
  const result=await db.batch(statements);if(result[0].meta?.changes!==1)continue;
  const saved=await first(db,'SELECT * FROM orders WHERE order_id=?',order.orderId);
  if(!sameOrder(saved,order))fail('訂單或推薦來源已變更，請重新載入',409);
  return {success:true,data:savedOrder(saved)};
 }
 fail('制度與訂單資料正在更新，請重新載入',409);
}

export async function markPartnerV2OrderPaid(env,payload){
 const db=dbFor(env),snapshot=await first(db,'SELECT * FROM partner_bonus_order_snapshots WHERE order_id=?',payload.orderId||'');if(!snapshot)return null;
 const actor=await financeActor(db,payload);
 for(let attempt=0;attempt<5;attempt++){
  const c=await clock(db),row=await first(db,'SELECT * FROM orders WHERE order_id=?',payload.orderId),paymentNo=String(payload.paymentNo||payload.tradeNo||'').trim();
  if(!row||row.bonus_policy_type!==PARTNER_POLICY_VERSION)fail('新制訂單證據不完整',409);
  if(['cancelled','refunded'].includes(row.payment_status))fail('訂單已取消或退費，不可重設付款',409);
  for(const [field,column]of [['grossAmount','gross_amount'],['amount','gross_amount'],['netAmount','net_amount']])if(payload[field]!==undefined&&Number(payload[field])!==row[column])fail('付款金額與原訂單不一致',409);
  if(row.payment_status==='paid'){if(row.payment_no&&paymentNo&&row.payment_no!==paymentNo)fail('付款憑證與原紀錄不一致',409);return {success:true,data:{orderId:row.order_id,paymentStatus:'paid',bonusStatus:row.bonus_status},replayed:true};}
  if(row.payment_status!=='pending_payment')fail('訂單付款狀態需人工核對',409);
  const at=stamp(),key=crypto.randomUUID();
  const results=await db.batch([clockClaim(db,c.revision,key,actor),db.prepare(`UPDATE orders SET payment_status='paid',paid_at=?,payment_no=?,bonus_status='review_required',updated_at=? WHERE order_id=? AND payment_status='pending_payment' AND ${gate}`).bind(at,paymentNo,at,row.order_id,c.revision+1,key)]);
  if(results[0].meta?.changes===1&&results[1].meta?.changes===1)return {success:true,data:{orderId:row.order_id,paymentStatus:'paid',bonusStatus:'review_required',reviewReason:'請管理員核對收款及已開通服務，再確認新制有效成交'}};
 }
 fail('訂單正在更新，請重新載入確認',409);
}

export async function updatePartnerV2OrderStatus(env,payload,status){
 const db=dbFor(env),snapshot=await first(db,'SELECT * FROM partner_bonus_order_snapshots WHERE order_id=?',payload.orderId||'');if(!snapshot)return null;
 if(!['cancelled','refunded'].includes(status))fail('新制訂單狀態不正確');
 const actor=await financeActor(db,payload);
 for(let attempt=0;attempt<5;attempt++){
  const at=stamp(),key=crypto.randomUUID(),c=await clock(db),next=c.revision+1;
  const current=await first(db,'SELECT * FROM orders WHERE order_id=?',payload.orderId);
  if(!current||current.bonus_policy_type!==PARTNER_POLICY_VERSION)fail('新制訂單證據不完整',409);
  if(current.payment_status===status)return {success:true,data:{orderId:payload.orderId,status,bonusStatus:current.bonus_status},replayed:true};
  if(current.payment_status==='refunded')fail('已退費訂單不可降回取消狀態',409);
  const result=await db.batch([clockClaim(db,c.revision,key,actor),
   db.prepare(`UPDATE orders SET payment_status=?,bonus_status='review_required',updated_at=? WHERE order_id=? AND ${gate}`).bind(status,at,payload.orderId,next,key),
   db.prepare(`UPDATE bonus_transactions SET status='reversed',updated_at=? WHERE order_id=? AND status IN ('frozen','review_required') AND ${gate}`).bind(at,payload.orderId,next,key),
   db.prepare(`INSERT INTO partner_bonus_v2_status_events(id,order_id,status,created_at,event_json) SELECT ?,?,?,?,? WHERE ${gate}`).bind(key,payload.orderId,status,at,JSON.stringify({reason:'新制訂單撤銷；已結算流水保留並需人工回沖',actor:payload.authenticatedUserId||''}),next,key)]);
  if(result[0].meta?.changes===1)return {success:true,data:{orderId:payload.orderId,status,bonusStatus:'review_required'}};
 }
 fail('管理員權限或訂單狀態已變更，請重新核對',409);
}

async function purchaseFact(db,contract,at){
 if(contract.purchase_status==='purchased'){
  const row=await first(db,"SELECT * FROM orders WHERE order_id=? AND buyer_id=? AND payment_status='paid' AND order_type IN ('tenant_annual_fee','tenant_renewal_fee')",contract.purchase_order_id,contract.member_uid);
  if(row&&row.paid_at&&row.paid_at<=at&&addYear(row.paid_at)>at)return {value:true,orderId:row.order_id,paidAt:row.paid_at};
  return {value:undefined};
 }
 const verified=await first(db,`SELECT o.order_id,o.paid_at FROM orders o WHERE o.buyer_id=? AND o.payment_status='paid' AND o.order_type IN ('tenant_annual_fee','tenant_renewal_fee') AND o.paid_at<=? AND datetime(o.paid_at,'+1 year')>datetime(?) ORDER BY o.paid_at DESC LIMIT 1`,contract.member_uid,at,at);
 if(verified)return {value:true,orderId:verified.order_id,paidAt:verified.paid_at};
 return {value:contract.purchase_status==='not_purchased'?false:undefined};
}
async function buildFacts(db,snapshot,row,at){
 const contract=await first(db,'SELECT * FROM partner_contract_enrollments WHERE id=?',snapshot.contract_id);
 const priorValidDeals=await countDeals(db,snapshot.recruiter_uid,at);
 const invalid=await first(db,`SELECT c.order_id FROM partner_bonus_deal_confirmations c JOIN orders o ON o.order_id=c.order_id WHERE c.recruiter_uid=? AND c.deal_type='tenant_annual_fee' AND o.payment_status!='paid' LIMIT 1`,snapshot.recruiter_uid);
 const facts={orderType:row.order_type,netAmount:row.net_amount,recruiterUid:snapshot.recruiter_uid,priorValidDeals,contractId:contract?.id,invalidatedQualification:!!invalid,chainComplete:true,upline:[]};
 if(!contract||contract.signed_at>snapshot.captured_at||contract.effective_at>snapshot.captured_at){facts.priorValidDeals=NaN;return facts;}
 if(row.order_type==='tenant_renewal_fee'){
  const origin=await first(db,`SELECT s.recruiter_uid,s.order_id FROM partner_bonus_order_snapshots s JOIN partner_bonus_deal_confirmations c ON c.order_id=s.order_id JOIN orders o ON o.order_id=s.order_id WHERE s.buyer_uid=? AND o.order_type='tenant_annual_fee' AND o.payment_status='paid' ORDER BY c.confirmed_at LIMIT 1`,row.buyer_id);
  const owner=await currentAttribution(db,row.buyer_id,at);
  facts.originalReferrer=origin?.recruiter_uid||'';facts.originalOrderId=origin?.order_id||'';facts.currentOwner=owner?.manager_uid||'';facts.attributionId=owner?.id||'';
  facts.originalEligible=!!(facts.originalReferrer&&await activeContract(db,facts.originalReferrer,at));facts.ownerEligible=!!(facts.currentOwner&&await activeContract(db,facts.currentOwner,at));return facts;
 }
 const historical=await first(db,`SELECT o.order_id FROM orders o WHERE o.order_type='tenant_annual_fee' AND o.payment_status='paid' AND o.recruiter_id=? AND NOT EXISTS(SELECT 1 FROM partner_bonus_order_snapshots s WHERE s.order_id=o.order_id) LIMIT 1`,snapshot.recruiter_uid);
 facts.historicalQualificationUnknown=!!historical;
 facts.purchaseEvidence=await purchaseFact(db,contract,at);facts.selfPurchased=facts.purchaseEvidence.value;
 const parentEvent=await currentAttribution(db,contract.member_uid,at);
 const sponsor=parentEvent?.manager_uid||contract.sponsor_uid;facts.directSponsor=sponsor;facts.directSponsorEligible=!!(sponsor&&await activeContract(db,sponsor,at));
 let next=sponsor;const seen=new Set([snapshot.recruiter_uid]);
 for(let depth=0;next;depth++){
  if(depth>=40||seen.has(next)){facts.chainComplete=false;break;}seen.add(next);
  const ancestor=await activeContract(db,next,at);if(!ancestor){facts.chainComplete=false;break;}
  const count=await countDeals(db,next,at),invalidAncestor=await first(db,`SELECT c.order_id FROM partner_bonus_deal_confirmations c JOIN orders o ON o.order_id=c.order_id WHERE c.recruiter_uid=? AND c.deal_type='tenant_annual_fee' AND o.payment_status!='paid' LIMIT 1`,next);
  facts.upline.push({uid:next,eligible:true,advanced:count>=2&&!invalidAncestor,contractId:ancestor.id,validDeals:count});
  if(count>=2&&!invalidAncestor)break;
  const relation=await currentAttribution(db,next,at);next=relation?.manager_uid||ancestor.sponsor_uid;
 }
 return facts;
}

async function enroll(db,uid,actor,data){
 keys(data,['target_uid','signedAt','effectiveAt','documentSha256','evidenceRef','confirmed','requestKey','purchaseStatus','purchaseOrderId']);
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
   if(facts.priorValidDeals<2&&facts.selfPurchased){factsGate+=" AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND buyer_id=? AND payment_status='paid' AND paid_at=?)";factsArgs.push(facts.purchaseEvidence.orderId,snapshot.recruiter_uid,facts.purchaseEvidence.paidAt);}
   else if(facts.priorValidDeals<2){factsGate+=" AND NOT EXISTS(SELECT 1 FROM orders WHERE buyer_id=? AND payment_status='paid' AND order_type IN ('tenant_annual_fee','tenant_renewal_fee') AND paid_at<=? AND datetime(paid_at,'+1 year')>datetime(?))";factsArgs.push(snapshot.recruiter_uid,at,at);}
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
export async function handlePartnerContracts(request,env,profileMapper,fetcher=fetch){
 const url=new URL(request.url);if(url.pathname!==BASE&&!url.pathname.startsWith(BASE+'/'))return null;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 try{
  const {uid,db,actor}=await authorizeStoreAdmin(request,env,profileMapper,fetcher),route=url.pathname.slice(BASE.length);
  if(request.method==='GET'&&route==='/lookup'){
   if([...url.searchParams.keys()].some(k=>k!=='memberNumber')||url.searchParams.getAll('memberNumber').length!==1)fail('請輸入一組會員編號');
   const number=url.searchParams.get('memberNumber');if(!/^\d{11,20}$/.test(number||''))fail('會員編號格式不正確');
   let found;try{found=await findMemberReferrer(db,number);}catch(e){fail(e.message,409);}
   return reply({success:true,member:{userId:found.userId,name:found.name,memberNumber:found.memberNumber}});
  }
  if(request.method==='GET'&&!route){
   if([...url.searchParams.keys()].some(k=>k!=='target')||url.searchParams.getAll('target').length!==1)fail('請選擇一位 CRM 會員');
   const target=url.searchParams.get('target');await member(db,target);
   const contracts=await all(db,'SELECT * FROM partner_contract_enrollments WHERE member_uid=? ORDER BY verified_at DESC,id DESC LIMIT 20',target);
   const pendingDeals=await all(db,`SELECT o.order_id AS orderId,o.payment_status AS status,o.gross_amount AS amount,o.bonus_status AS bonusStatus FROM orders o JOIN partner_bonus_order_snapshots s ON s.order_id=o.order_id WHERE s.recruiter_uid=? ORDER BY s.captured_at DESC LIMIT 20`,target);
   return reply({success:true,policyVersion:PARTNER_POLICY_VERSION,contracts,attribution:await currentAttribution(db,target,stamp()),validDealCount:await countDeals(db,target,stamp()),pendingDeals});
  }
  if(request.method!=='POST'||url.search||!['','/attribution','/deals/confirm'].includes(route))fail('不支援此操作',405);
  if(uid!==actor.line_id)fail('請使用 CRM 正式管理員 LINE 身分重新登入',409);
  await policyIdentity(db,uid);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail('請使用 JSON 資料',415);
  const data=await readJson(request,10000),result=await(route==='/attribution'?attribute(db,uid,actor,data):route==='/deals/confirm'?confirmDeal(db,uid,actor,data):enroll(db,uid,actor,data));
  return reply(result,result.success?200:409);
 }catch(e){if(e instanceof ShopError||e instanceof DirectoryError)return reply({success:false,error:e.message},e.status||400);console.error('partner_contract_operation_unavailable');return reply({success:false,error:'共創制度資料暫時無法完成，請重新載入確認'},503);}
}
