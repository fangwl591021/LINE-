// Versioned contract rules; no online signature or external payment is implied.
export const PARTNER_POLICY_11510='cocreator-115.10-v3';
export const PARTNER_TEMPLATE_11510='115.10';
export const PARTNER_POLICY_CUTOVER='2026-10-25T16:00:00.000Z';
export const PARTNER_TEMPLATE_SHA256='224dac420aba1f0990f5de713e7125c4d9699a6a11f84ee6aed6f8ddee7da4aa';
const UID=/^U[0-9a-f]{32}$/i,UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const DAY=86400000;
export function anniversary(value,years=1){
 const d=new Date(Date.parse(value)+8*3600000),month=d.getUTCMonth(),day=d.getUTCDate();
 d.setUTCDate(1);d.setUTCFullYear(d.getUTCFullYear()+years);d.setUTCMonth(month);
 d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),month+1,0)).getUTCDate()));return new Date(d.getTime()-8*3600000).toISOString();
}
export function contract11510State(contract,events=[],at=new Date().toISOString()){
 if(!contract||contract.policy_version!==PARTNER_POLICY_11510)return {active:false,reason:'wrong_version'};
 if(contract.signed_at>at||contract.effective_at>at||contract.verified_at>at)return {active:false,reason:'not_effective'};
 let periodStart=contract.signed_at,periodEnd=anniversary(periodStart),years=1;
 while(periodEnd<=at&&years<150){periodStart=periodEnd;periodEnd=anniversary(contract.signed_at,++years);}
 const end=events.filter(e=>e.verified_at<=at&&e.effective_at<=at).sort((a,b)=>a.effective_at.localeCompare(b.effective_at))[0];
 return {active:!end,reason:end?end.action:'active',periodStart,periodEnd,automaticRenewal:true,endedAt:end?.effective_at||''};
}
export function calculatePartnerBonus11510(facts,legacyCalculator){
 if(facts.orderType!=='tenant_renewal_fee')return {...legacyCalculator(facts),policyType:PARTNER_POLICY_11510,holds:[]};
 const plan={policyType:PARTNER_POLICY_11510,status:'pending',transactions:[],holds:[],cancellations:[],warnings:[],ordinal:Number(facts.priorValidDeals)+1};
 if(!Number.isSafeInteger(facts.netAmount)||facts.netAmount<=0||facts.netAmount>Math.floor(Number.MAX_SAFE_INTEGER/100))return {...plan,status:'review_required',warnings:['invalid_untaxed_amount']};
 const amount=Math.floor(facts.netAmount*100/4)/100;
 for(const [portion,memberId,eligible,terminated]of [['renewal_referral',facts.originalReferrer,facts.originalEligible,facts.originalTerminated],['renewal_placement',facts.currentOwner,facts.ownerEligible,facts.ownerTerminated]]){
  if(UID.test(memberId||'')&&eligible)plan.transactions.push({memberId,bonusType:portion,amount});
  else if(terminated)plan.cancellations.push({portion,amount,reason:'recipient_contract_terminated'});
  else plan.holds.push({portion,amount,reason:portion+'_requires_review'});
 }
 if(plan.holds.length){plan.status='partially_held';plan.warnings=plan.holds.map(h=>h.reason);}
 return plan;
}

// The authenticated router supplies the same primary D1 session and CAS fence as v2.
export function createPartnerPolicy11510(ctx){
 const {db,uid,actor,all,first,fail,keys,text,date,evidence,stamp,clock,clockClaim,gate,member,policyIdentity,buildFacts,calculateV2,currentAttribution}=ctx;
 const events=id=>all(db,'SELECT * FROM partner_contract_lifecycle_events WHERE contract_id=? ORDER BY effective_at,verified_at,id',id);
 async function state(contract,at=stamp()){return contract11510State(contract,await events(contract.id),at);}
 async function latest(memberUid,at=stamp()){
  return first(db,'SELECT e.* FROM partner_contract_enrollments e JOIN partner_contract_11510_terms t ON t.contract_id=e.id WHERE e.member_uid=? AND e.policy_version=? AND e.signed_at<=? AND e.effective_at<=? AND e.verified_at<=? ORDER BY e.effective_at DESC,e.verified_at DESC,e.id DESC LIMIT 1',memberUid,PARTNER_POLICY_11510,at,at,at);
 }
 async function active(memberUid,at=stamp()){
  await policyIdentity(db,memberUid);const contract=await latest(memberUid,at);return contract&&(await state(contract,at)).active?contract:null;
 }
 async function quota(contract,at=stamp()){
  const windowStart=anniversary(at,-1),valid=await first(db,`SELECT COUNT(*) AS n FROM partner_bonus_deal_confirmations c JOIN orders o ON o.order_id=c.order_id JOIN partner_service_year_claims y ON y.order_id=c.order_id JOIN partner_bonus_order_snapshots s ON s.order_id=c.order_id WHERE c.recruiter_uid=? AND c.deal_type='tenant_annual_fee' AND s.policy_version=? AND y.admission='new' AND c.confirmed_at>? AND c.confirmed_at<=? AND o.payment_status='paid'`,contract.member_uid,PARTNER_POLICY_11510,windowStart,at);
  const validNewDeals=Number(valid?.n||0);return {checkedAt:at,windowStart,windowEnd:at,validNewDeals,threshold:6,minimumMet:validNewDeals>=6,eligibleForReview:anniversary(contract.signed_at)<=at,automaticTermination:false};
 }
 async function decorate(contract){
  if(contract.policy_version!==PARTNER_POLICY_11510)return contract;
  const terms=await first(db,'SELECT terms_json FROM partner_contract_11510_terms WHERE contract_id=?',contract.id);
  return {...contract,terms:terms?JSON.parse(terms.terms_json):null,lifecycle:await events(contract.id),contractStatus:await state(contract),quota:await quota(contract)};
 }
 async function enroll(data){
  const c=await clock(db);
  keys(data,['target_uid','signedAt','effectiveAt','documentSha256','evidenceRef','confirmed','requestKey','purchaseStatus','purchaseOrderId','templateVersion','partyType','partyName','representativeName','referrerName','referrerMemberNumber','bankName','bankCode','bankBranch','bankAccountHolder','bankAccount']);
  if(data.templateVersion!==PARTNER_TEMPLATE_11510||data.confirmed!==true||!UUID.test(data.requestKey||''))fail('請選擇115.10版，並確認已核對實際簽署文件');
  const target=await member(db,data.target_uid),signed=date(data.signedAt),effective=date(data.effectiveAt),at=stamp();
  if(signed>at||signed!==effective)fail('115.10契約自簽署日起生效，簽署與生效時間必須相同');
  const terms={templateVersion:PARTNER_TEMPLATE_11510,partyType:data.partyType,partyName:text(data.partyName,150),representativeName:text(data.representativeName||'',150,false),referrerName:text(data.referrerName||'',150,false),referrerMemberNumber:text(data.referrerMemberNumber||'',20,false),bankName:text(data.bankName,100),bankCode:text(data.bankCode,10),bankBranch:text(data.bankBranch,100),bankAccountHolder:text(data.bankAccountHolder,150),bankAccount:text(data.bankAccount,40)};
  if(!['natural_person','company'].includes(terms.partyType)||terms.partyType==='company'&&!terms.representativeName||!/^\d{3,7}$/.test(terms.bankCode)||!/^\d{5,30}$/.test(terms.bankAccount.replace(/[ -]/g,'')))fail('請完整填寫簽約身分、代表人及銀行資料');
  const sponsor=target.referrer_id||'';if(sponsor&&sponsor!=='admin'&&!UID.test(sponsor))fail('CRM推薦來源需先核對',409);
  if(UID.test(sponsor)&&(!terms.referrerMemberNumber||!terms.referrerName))fail('請核對CRM推薦人的姓名與會員編號',409);
  if(!UID.test(sponsor)&&(terms.referrerMemberNumber||terms.referrerName))fail('CRM無推薦人時不可自行新增推薦來源',409);
  if(terms.referrerMemberNumber){
   await member(db,sponsor);
   const rows=await all(db,'SELECT line_id,name,member_number FROM users WHERE member_number=? LIMIT 2',terms.referrerMemberNumber);
   if(rows.length!==1||rows[0].line_id!==sponsor)fail('簽約推薦會員編號與CRM推薦來源不符',409);
  }
  const purchaseStatus=data.purchaseStatus||'unknown',purchaseOrderId=text(data.purchaseOrderId||'',100,false);
  if(!['unknown','purchased','not_purchased'].includes(purchaseStatus))fail('購買狀態不正確');
  if(purchaseStatus==='purchased'){
   if(!await first(db,"SELECT 1 FROM orders WHERE order_id=? AND buyer_id=? AND payment_status='paid' AND order_type IN ('tenant_annual_fee','tenant_renewal_fee') AND paid_at!='' AND paid_at<=?",purchaseOrderId,target.line_id,at))fail('無法核對本人已付款完整版訂單',409);
  }else if(purchaseOrderId)fail('未購買或待確認時不可填入購買訂單');
  const request={target_uid:target.line_id,signedAt:signed,effectiveAt:effective,documentSha256:evidence(data.documentSha256),evidenceRef:text(data.evidenceRef),confirmed:true,requestKey:data.requestKey,purchaseStatus,purchaseOrderId,...terms},json=JSON.stringify(request);
  const old=await first(db,'SELECT * FROM partner_contract_enrollments WHERE request_key=?',request.requestKey);
  if(old){if(old.request_json!==json)fail('同一次登錄已送出不同內容',409);return {success:true,contract:await decorate(old),replayed:true};}
  const previous=await latest(target.line_id,at);
  if(previous){const previousState=await state(previous,at);if(previousState.active||!previousState.endedAt||signed<previousState.endedAt)fail('既有115.10契約尚未停止，或新簽日期早於原終止日；不可重疊登錄',409);}
  if(await first(db,'SELECT id FROM partner_contract_enrollments WHERE member_uid=? AND document_sha256=? AND effective_at=?',target.line_id,request.documentSha256,effective))fail('這份契約與生效日已登錄',409);
  const id=crypto.randomUUID(),nonce=crypto.randomUUID(),next=c.revision+1;
  const result=await db.batch([clockClaim(db,c.revision,nonce,actor),db.prepare(`INSERT INTO partner_contract_enrollments(id,member_uid,policy_version,signed_at,effective_at,expires_at,document_sha256,evidence_ref,sponsor_uid,purchase_status,purchase_order_id,verified_by,verified_at,verified_revision,request_key,request_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM users WHERE line_id=? AND referrer_id IS ?) AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id IN (?,?) OR new_line_id IN (?,?)))${UID.test(sponsor)?' AND EXISTS(SELECT 1 FROM users WHERE line_id=? AND member_number=?)':''}`).bind(id,target.line_id,PARTNER_POLICY_11510,signed,effective,anniversary(signed),request.documentSha256,request.evidenceRef,sponsor==='admin'?'':sponsor,purchaseStatus,purchaseOrderId,uid,at,next,request.requestKey,json,next,nonce,target.line_id,target.referrer_id,target.line_id,sponsor,target.line_id,sponsor,...(UID.test(sponsor)?[sponsor,terms.referrerMemberNumber]:[])),db.prepare(`INSERT INTO partner_contract_11510_terms(contract_id,template_version,terms_json) SELECT ?,'115.10',? WHERE ${gate} AND EXISTS(SELECT 1 FROM partner_contract_enrollments WHERE id=? AND request_key=?)`).bind(id,JSON.stringify(terms),next,nonce,id,request.requestKey)]);
  if(result[0].meta?.changes!==1||result[1].meta?.changes!==1||result[2].meta?.changes!==1)fail('管理員權限或制度資料已變更，請重新載入',409);
  return {success:true,contract:await decorate(await first(db,'SELECT * FROM partner_contract_enrollments WHERE id=?',id))};
 }
 async function awardEligibility(memberUid,orderId,at=stamp()){
  if(!await ctx.activeAny(db,memberUid,at))return false;
  // A later new agreement cannot revive rights cancelled under an earlier one.
  // Read the original establishment time, including unresolved renewal portions.
  const cancelled=await first(db,`SELECT 1 FROM partner_contract_lifecycle_events l JOIN partner_contract_enrollments e ON e.id=l.contract_id JOIN partner_bonus_deal_confirmations c ON c.order_id=? JOIN partner_bonus_order_snapshots s ON s.order_id=c.order_id WHERE e.member_uid=? AND e.policy_version=? AND s.policy_version=? AND l.verified_at<=? AND l.effective_at<=? AND c.confirmed_at<=l.effective_at LIMIT 1`,orderId,memberUid,PARTNER_POLICY_11510,PARTNER_POLICY_11510,at,at);
  return !cancelled;
 }
 async function lifecycle(data){
  const c=await clock(db);
  keys(data,['contractId','action','effectiveAt','terminationGround','evidenceSha256','evidenceRef','reason','confirmed','requestKey']);
  if(data.confirmed!==true||!UUID.test(data.requestKey||'')||!['nonrenewal','termination'].includes(data.action))fail('請核對書面通知及終止原因');
  const at=stamp(),contract=await first(db,'SELECT * FROM partner_contract_enrollments WHERE id=? AND policy_version=?',text(data.contractId,100),PARTNER_POLICY_11510);if(!contract)fail('僅可異動115.10版契約',409);await member(db,contract.member_uid);
  let effective=date(data.effectiveAt),ground=data.action==='nonrenewal'?'nonrenewal':data.terminationGround;
  if(!['nonrenewal','notice','breach','annual_quota'].includes(ground))fail('請選擇終止依據');
  const request={contractId:contract.id,action:data.action,effectiveAt:effective,terminationGround:ground,evidenceSha256:evidence(data.evidenceSha256),evidenceRef:text(data.evidenceRef),reason:text(data.reason),confirmed:true,requestKey:data.requestKey},json=JSON.stringify(request);
  const old=await first(db,'SELECT * FROM partner_contract_lifecycle_events WHERE request_key=?',request.requestKey);if(old){if(old.request_json!==json)fail('同一次終止登錄內容不同',409);return {success:true,lifecycle:old,replayed:true};}
  const current=await state(contract,at);if(!current.active)fail('契約已停止，不可重新覆寫終止',409);
  if(effective<at&&Date.parse(at)-Date.parse(effective)>60000)fail('不可回溯終止生效時間');
  if(data.action==='nonrenewal'){
   if(effective!==current.periodEnd||Date.parse(effective)-Date.parse(at)<30*DAY)fail('不續約須於當期屆滿至少30日前登錄書面通知');
  }else if(ground==='notice'&&Date.parse(effective)-Date.parse(at)<30*DAY)fail('一般終止須提前至少30日書面通知');
  if(ground==='annual_quota'){const q=await quota(contract,at);if(!q.eligibleForReview||q.minimumMet)fail('尚未符合連續12個月未達6件的檢查條件',409);}
  const nonce=crypto.randomUUID(),next=c.revision+1,id=crypto.randomUUID();
  const statements=[clockClaim(db,c.revision,nonce,actor),db.prepare(`INSERT INTO partner_contract_lifecycle_events(id,contract_id,action,effective_at,notice_at,ground,evidence_sha256,evidence_ref,reason,verified_by,verified_at,request_key,request_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate} AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id=? OR new_line_id=?))`).bind(id,contract.id,data.action,effective,at,ground,request.evidenceSha256,request.evidenceRef,request.reason,uid,at,request.requestKey,json,next,nonce,contract.member_uid,contract.member_uid)];
  // Future notices are applied by the eligibility fence at their effective time.
  if(effective<=at){
   statements.push(db.prepare(`UPDATE bonus_transactions SET status='reversed',updated_at=? WHERE beneficiary_id=? AND status IN ('review_required','frozen','payable') AND order_id IN (SELECT order_id FROM partner_bonus_order_snapshots WHERE policy_version=?) AND ${gate} AND EXISTS(SELECT 1 FROM partner_contract_lifecycle_events WHERE id=?)`).bind(at,contract.member_uid,PARTNER_POLICY_11510,next,nonce,id));
   statements.push(db.prepare(`UPDATE partner_bonus_11510_holds SET status='cancelled',resolved_at=? WHERE status='pending' AND order_id IN (SELECT c.order_id FROM partner_bonus_deal_confirmations c JOIN partner_bonus_order_snapshots s ON s.order_id=c.order_id WHERE s.policy_version=? AND ((portion='renewal_referral' AND json_extract(c.facts_json,'$.originalReferrer')=?) OR (portion='renewal_placement' AND json_extract(c.facts_json,'$.currentOwner')=?))) AND ${gate} AND EXISTS(SELECT 1 FROM partner_contract_lifecycle_events WHERE id=?)`).bind(at,PARTNER_POLICY_11510,contract.member_uid,contract.member_uid,next,nonce,id));
  }
  const result=await db.batch(statements);if(result[0].meta?.changes!==1||result[1].meta?.changes!==1)fail('權限或契約資料已變更，請重新核對',409);
  return {success:true,lifecycle:await first(db,'SELECT * FROM partner_contract_lifecycle_events WHERE id=?',id),contract:await decorate(contract),paidLedgerPreserved:true};
 }
 async function renewalFacts(snapshot,row,at){
  const origin=await first(db,`SELECT s.recruiter_uid,s.order_id FROM partner_bonus_order_snapshots s JOIN partner_bonus_deal_confirmations c ON c.order_id=s.order_id JOIN orders o ON o.order_id=s.order_id WHERE s.buyer_uid=? AND o.order_type='tenant_annual_fee' AND o.payment_status='paid' ORDER BY c.confirmed_at,s.order_id LIMIT 1`,row.buyer_id),owner=await currentAttribution(db,row.buyer_id,at);
  const facts={orderType:row.order_type,netAmount:row.net_amount,recruiterUid:snapshot.recruiter_uid,priorValidDeals:0,originalReferrer:origin?.recruiter_uid||'',originalOrderId:origin?.order_id||'',currentOwner:owner?.manager_uid||'',attributionId:owner?.id||'',originalEligible:false,ownerEligible:false};
  for(const [id,key]of [[facts.originalReferrer,'originalEligible'],[facts.currentOwner,'ownerEligible']])if(UID.test(id))try{facts[key]=!!await ctx.activeAny(db,id,at);}catch(error){if(error?.status!==409)throw error;}
  for(const [id,key]of [[facts.originalReferrer,'originalTerminated'],[facts.currentOwner,'ownerTerminated']])if(UID.test(id)){const contract=await latest(id,at);facts[key]=!!contract&&!(await state(contract,at)).active;}
  return facts;
 }
 async function confirm(data){
  keys(data,['orderId','receiptRef','serviceOpenedAt','serviceYearStart','serviceYearEnd','serviceAdmission','reviewReason','reviewHandlingDueAt','confirmed','requestKey']);
  if(data.confirmed!==true||!UUID.test(data.requestKey||''))fail('請確認收款、開通及服務年度');
  const request={orderId:text(data.orderId,100),receiptRef:text(data.receiptRef),serviceOpenedAt:date(data.serviceOpenedAt),serviceYearStart:date(data.serviceYearStart),serviceYearEnd:date(data.serviceYearEnd),serviceAdmission:data.serviceAdmission,reviewReason:text(data.reviewReason||'',500,false),reviewHandlingDueAt:data.reviewHandlingDueAt?date(data.reviewHandlingDueAt):'',confirmed:true,requestKey:data.requestKey},json=JSON.stringify(request);
  if(anniversary(request.serviceYearStart)!==request.serviceYearEnd||request.serviceOpenedAt>stamp())fail('服務年度須為完整一年，開通時間不可在未來');
  for(let attempt=0;attempt<8;attempt++){
   const c=await clock(db),old=await first(db,'SELECT * FROM partner_bonus_deal_confirmations WHERE order_id=? OR request_key=?',request.orderId,request.requestKey);
   if(old){if(old.order_id!==request.orderId||old.request_json!==json)fail('成交已確認，禁止重算或覆寫',409);const row=await first(db,'SELECT payment_status FROM orders WHERE order_id=?',request.orderId);return {success:row?.payment_status==='paid',confirmation:old,plan:JSON.parse(old.plan_json),settlementStatus:'review_required',replayed:true};}
   const row=await first(db,'SELECT * FROM orders WHERE order_id=?',request.orderId),snapshot=await first(db,'SELECT * FROM partner_bonus_order_snapshots WHERE order_id=? AND policy_version=?',request.orderId,PARTNER_POLICY_11510);
   if(!row||!snapshot||row.bonus_policy_type!==PARTNER_POLICY_11510||row.payment_status!=='paid'||!row.paid_at||request.serviceOpenedAt<snapshot.captured_at)fail('請先核對115.10版已收款及開通訂單',409);
   await member(db,row.buyer_id);await member(db,snapshot.recruiter_uid);
   if(row.order_type==='tenant_annual_fee'&&!await active(snapshot.recruiter_uid))fail('成交人契約已停止，請核對終止前權利與訂單',409);
   if(row.order_type==='tenant_renewal_fee'){
    const basis=await first(db,'SELECT * FROM partner_contract_enrollments WHERE id=? AND policy_version=?',snapshot.contract_id,PARTNER_POLICY_11510);
    if(!basis||!(await state(basis,snapshot.captured_at)).active)fail('續約訂單缺少建立當時的有效契約，請重新核對',409);
   }
   if(row.order_type==='tenant_renewal_fee'?request.serviceAdmission!=='renewal':!['new','reactivation'].includes(request.serviceAdmission))fail('請核對新約、續約或停止後重加入類別');
   if(await first(db,'SELECT 1 FROM bonus_transactions WHERE order_id=? LIMIT 1',row.order_id))fail('訂單已有流水，禁止重新計算',409);
   if(await first(db,'SELECT 1 FROM partner_service_year_claims WHERE buyer_uid=? AND (service_year_start<? AND service_year_end>?)',row.buyer_id,request.serviceYearEnd,request.serviceYearStart))fail('同一商家服務年度已認列，不可拆單重複領獎',409);
   if(request.serviceAdmission==='new'&&await first(db,"SELECT 1 FROM orders WHERE buyer_id=? AND order_type='tenant_annual_fee' AND order_id!=? AND (payment_status='paid' OR EXISTS(SELECT 1 FROM partner_bonus_deal_confirmations c WHERE c.order_id=orders.order_id)) LIMIT 1",row.buyer_id,row.order_id))fail('此商家已有付費歷史，不可列為年度新約',409);
   if(request.serviceAdmission==='reactivation'&&!await first(db,"SELECT 1 FROM orders WHERE buyer_id=? AND order_type='tenant_annual_fee' AND order_id!=? AND (payment_status='paid' OR EXISTS(SELECT 1 FROM partner_bonus_deal_confirmations c WHERE c.order_id=orders.order_id)) LIMIT 1",row.buyer_id,row.order_id))fail('未查得停止前服務紀錄，請核對重新加入類別',409);
   const at=stamp(),facts=row.order_type==='tenant_renewal_fee'?await renewalFacts(snapshot,row,at):await buildFacts(db,snapshot,row,at),plan=calculatePartnerBonus11510(facts,calculateV2);
   if(plan.status==='review_required')return {success:false,error:'必要事實尚待核對，未建立獎金',code:'PARTNER_FACTS_REQUIRED',reviewReasons:plan.warnings,plan};
   if(plan.holds.length&&(!request.reviewReason||!request.reviewHandlingDueAt||request.reviewHandlingDueAt<=at))fail('待核份額須填具體原因、憑證及未來處理期限');
   const nonce=crypto.randomUUID(),next=c.revision+1,parties=[...new Set([row.buyer_id,snapshot.recruiter_uid,...plan.transactions.map(t=>t.memberId)])],marks=parties.map(()=>'?').join(',');
   let purchaseGate='',purchaseArgs=[];
   if(row.order_type==='tenant_annual_fee'&&facts.priorValidDeals<2){
    if(facts.selfPurchased){purchaseGate=" AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND buyer_id=? AND payment_status='paid' AND paid_at=?)";purchaseArgs=[facts.purchaseEvidence.orderId,snapshot.recruiter_uid,facts.purchaseEvidence.paidAt];}
    else {purchaseGate=" AND NOT EXISTS(SELECT 1 FROM orders WHERE buyer_id=? AND payment_status='paid' AND order_type IN ('tenant_annual_fee','tenant_renewal_fee') AND paid_at!='' AND paid_at<=?)";purchaseArgs=[snapshot.recruiter_uid,at];}
   }
   const statements=[clockClaim(db,c.revision,nonce,actor),db.prepare(`INSERT INTO partner_bonus_deal_confirmations(order_id,recruiter_uid,buyer_uid,deal_type,receipt_ref,service_opened_at,confirmed_at,confirmed_by,ordinal,facts_json,plan_json,request_key,request_json) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND payment_status='paid' AND bonus_status='review_required') AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id IN (${marks}) OR new_line_id IN (${marks})))${purchaseGate}`).bind(row.order_id,snapshot.recruiter_uid,row.buyer_id,row.order_type,request.receiptRef,request.serviceOpenedAt,at,uid,plan.ordinal,JSON.stringify(facts),JSON.stringify(plan),request.requestKey,json,next,nonce,row.order_id,...parties,...parties,...purchaseArgs)];
   const confirmGate=`${gate} AND EXISTS(SELECT 1 FROM partner_bonus_deal_confirmations WHERE order_id=? AND request_key=?)`,gateArgs=[next,nonce,row.order_id,request.requestKey];
   statements.push(db.prepare(`INSERT INTO partner_service_year_claims(order_id,buyer_uid,service_year_start,service_year_end,admission,claimed_at) SELECT ?,?,?,?,?,? WHERE ${confirmGate}`).bind(row.order_id,row.buyer_id,request.serviceYearStart,request.serviceYearEnd,request.serviceAdmission,at,...gateArgs));
   for(const tx of plan.transactions)statements.push(awardStatement(row,snapshot,tx,at,confirmGate,gateArgs));
   for(const hold of plan.holds)statements.push(db.prepare(`INSERT INTO partner_bonus_11510_holds(order_id,portion,amount,status,reason,created_at,handling_due_at,evidence_ref) SELECT ?,?,?,'pending',?,?,?,? WHERE ${confirmGate}`).bind(row.order_id,hold.portion,hold.amount,request.reviewReason,at,request.reviewHandlingDueAt,request.receiptRef,...gateArgs));
   for(const hold of plan.cancellations||[])statements.push(db.prepare(`INSERT INTO partner_bonus_11510_holds(order_id,portion,amount,status,reason,created_at,resolved_at) SELECT ?,?,?,'cancelled',?,?,? WHERE ${confirmGate}`).bind(row.order_id,hold.portion,hold.amount,hold.reason,at,at,...gateArgs));
   statements.push(db.prepare(`UPDATE orders SET bonus_status='generated',updated_at=? WHERE order_id=? AND ${confirmGate}`).bind(at,row.order_id,...gateArgs));
   const result=await db.batch(statements);if(result[0].meta?.changes!==1)continue;if(result[1].meta?.changes!==1)fail('成交或會員資料已變更，未建立獎金',409);
   return {success:true,confirmation:await first(db,'SELECT * FROM partner_bonus_deal_confirmations WHERE order_id=?',row.order_id),plan,settlementStatus:'review_required'};
  }
  fail('成交正在更新，請重新核對',409);
 }
 function awardStatement(row,snapshot,tx,at,where,args){
  return db.prepare(`INSERT INTO bonus_transactions(tx_id,order_id,beneficiary_id,source_user_id,network_id,bonus_type,amount,bv,status,freeze_until,note,raw_json,updated_at) SELECT ?,?,?,?,?,?,?,?,'review_required','',?,?,? WHERE ${where}`).bind(row.order_id+'-P11510-'+tx.bonusType,row.order_id,tx.memberId,row.buyer_id,row.network_id,tx.bonusType,tx.amount,row.net_amount/2,'115.10共創契約：'+tx.bonusType,JSON.stringify({...tx,policyVersion:PARTNER_POLICY_11510,contractId:snapshot.contract_id}),at,...args);
 }
 async function resolve(data){
  keys(data,['orderId','portion','beneficiaryUid','consentSha256','evidenceRef','reason','confirmed','requestKey']);
  if(data.confirmed!==true||!UUID.test(data.requestKey||'')||!['renewal_referral','renewal_placement'].includes(data.portion))fail('請核對待核部分及同意證據');
  const request={orderId:text(data.orderId,100),portion:data.portion,beneficiaryUid:text(data.beneficiaryUid,40),consentSha256:evidence(data.consentSha256),evidenceRef:text(data.evidenceRef),reason:text(data.reason),confirmed:true,requestKey:data.requestKey},json=JSON.stringify(request);
  for(let attempt=0;attempt<5;attempt++){
   const c=await clock(db),old=await first(db,'SELECT * FROM partner_bonus_11510_resolutions WHERE request_key=?',request.requestKey);if(old){if(old.request_json!==json)fail('同一次待核確認內容不同',409);return {success:true,resolution:old,replayed:true};}
   const row=await first(db,'SELECT * FROM orders WHERE order_id=?',request.orderId),snapshot=await first(db,'SELECT * FROM partner_bonus_order_snapshots WHERE order_id=? AND policy_version=?',request.orderId,PARTNER_POLICY_11510),hold=await first(db,"SELECT * FROM partner_bonus_11510_holds WHERE order_id=? AND portion=? AND status='pending'",request.orderId,request.portion);
   if(!row||!snapshot||!hold||row.payment_status!=='paid'||row.order_type!=='tenant_renewal_fee')fail('此續約部分已處理或原訂單已停止',409);
   await member(db,row.buyer_id);await member(db,request.beneficiaryUid);const at=stamp(),facts=await renewalFacts(snapshot,row,at),expected=request.portion==='renewal_referral'?facts.originalReferrer:facts.currentOwner;
   if(request.beneficiaryUid!==expected||!(request.portion==='renewal_referral'?facts.originalEligible:facts.ownerEligible)||!await awardEligibility(request.beneficiaryUid,row.order_id,at))fail('受領人必須符合可稽核原推薦／當下歸屬，且權利未因終止消滅，禁止改付他人',409);
   const id=crypto.randomUUID(),nonce=crypto.randomUUID(),next=c.revision+1,where=`${gate} AND EXISTS(SELECT 1 FROM partner_bonus_11510_resolutions WHERE id=?)`,args=[next,nonce,id];
   const result=await db.batch([clockClaim(db,c.revision,nonce,actor),db.prepare(`INSERT INTO partner_bonus_11510_resolutions(id,order_id,portion,beneficiary_uid,consent_sha256,evidence_ref,reason,verified_by,verified_at,request_key,request_json) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND payment_status='paid') AND NOT EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND (old_line_id IN (?,?) OR new_line_id IN (?,?)))`).bind(id,row.order_id,request.portion,request.beneficiaryUid,request.consentSha256,request.evidenceRef,request.reason,uid,at,request.requestKey,json,next,nonce,row.order_id,row.buyer_id,request.beneficiaryUid,row.buyer_id,request.beneficiaryUid),awardStatement(row,snapshot,{memberId:request.beneficiaryUid,bonusType:request.portion,amount:hold.amount},at,where,args),db.prepare(`UPDATE partner_bonus_11510_holds SET status='resolved',resolved_at=? WHERE order_id=? AND portion=? AND status='pending' AND ${where}`).bind(at,row.order_id,request.portion,...args)]);
   if(result[0].meta?.changes!==1)continue;if(result[1].meta?.changes!==1)fail('身分或訂單已變更',409);return {success:true,resolution:await first(db,'SELECT * FROM partner_bonus_11510_resolutions WHERE id=?',id)};
  }
  fail('待核資料正在更新',409);
 }
 return {active,latest,state,quota,decorate,enroll,lifecycle,confirm,resolve,renewalFacts,awardEligibility};
}
