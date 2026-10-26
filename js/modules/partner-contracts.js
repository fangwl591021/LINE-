const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const POLICY='cocreator-115.10-v3',TEMPLATE='115.10';
const input=(name,label,type='text',required=true,attributes='')=>`<label>${esc(label)}<input name="${esc(name)}" type="${type}" ${required?'required':''} ${type==='datetime-local'?'step="0.001"':''} maxlength="${name.includes('Ref')?500:120}" ${attributes}></label>`;
const select=(name,label,options)=>`<label>${esc(label)}<select name="${name}" style="display:block;width:100%;max-width:100%;padding:12px;font:inherit">${options.map(([value,text])=>`<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select></label>`;
const agreement=label=>`<label><input type="checkbox" name="confirmed" required>${esc(label)}</label>`;
const action=(name,label,body)=>`<details><summary>${label}</summary><form data-form="${name}">${body}</form></details>`;
const submit=label=>`<button class="primary" type="submit">${label}</button>`;
const iso=value=>{const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('請填寫有效時間');return date.toISOString();};
const hash=value=>{if(!/^[0-9a-f]{64}$/i.test(value))throw Error('請計算或填寫64碼文件校驗碼');return value.toLowerCase();};
const value=(record,snake,camel)=>record?.[snake]??record?.[camel]??'';
const money=amount=>Number.isFinite(Number(amount))?Number(amount).toLocaleString('zh-TW'):'待核';
const mask=account=>account?`末 ${String(account).slice(-4)} 碼`:'未登錄';
const statusText=status=>({review_required:'待核對',frozen:'待請款',payable:'可給付',paid:'已付款',reversed:'已取消',cancelled_by_contract:'依契約取消未付款獎勵',contract_inactive:'契約目前無效，待核對',active:'有效',not_effective:'尚未生效',termination:'已終止',nonrenewal:'已到期不續約'}[status]||status||'待核對');
let active;

export async function openPartnerContracts({base,target,isCurrent=()=>true,fetcher=fetch}={}){
 if(!/^U[0-9a-f]{32}$/i.test(target||''))throw Error('請從 CRM 選擇會員');
 if(active?.busy)throw Error('資料正在送出，請稍候');
 active?.close();
 const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
 if(!token)throw Error('請先登入 LINE');
 const actor=()=>window.liff?.getContext?.()?.userId||'';
 const originalActor=actor();
 if(!document.querySelector('[data-reward-application-style]')){
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../css/reward-applications.css?v=1',import.meta.url).href;
  link.dataset.rewardApplicationStyle='';document.head.append(link);
 }
 const dialog=document.createElement('dialog');dialog.className='reward-application-dialog';dialog.setAttribute('aria-label','共創夥伴契約與獎金核對');
 const opener=document.activeElement,keys=new Map();
 let busy=false,closed=false,timer,chosenManager='',chosenReferrer='',chosenBeneficiary='',latest={};
 const valid=()=>!closed&&dialog.isConnected&&isCurrent()&&window.liff?.isLoggedIn?.()&&window.liff.getAccessToken()===token&&actor()===originalActor;
 const close=(force=false)=>{if(busy&&!force)return;closed=true;clearInterval(timer);dialog.close();dialog.remove();if(active?.dialog===dialog)active=null;opener?.focus();};
 active={dialog,close,get busy(){return busy;}};document.body.append(dialog);dialog.showModal();timer=setInterval(()=>{if(!valid())close(true);},500);
 const shell=body=>{
  dialog.innerHTML='<button type="button" class="ra-close" data-close>關閉 ×</button><h2>共創夥伴契約與獎金核對</h2>'+body+'<p data-status role="alert" aria-live="polite"></p>';
  dialog.querySelector('[data-close]').onclick=()=>close();
 };
 const status=message=>{const el=dialog.querySelector('[data-status]');if(el)el.textContent=message;};
 const api=async(path='',data)=>{
  if(!valid())throw Error('登入或頁面已變更，請重新開啟');
  const response=await fetcher(String(base).replace(/\/+$/,'')+'/v1/partner-contracts'+path,{
   method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},
   body:data?JSON.stringify(data):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)
  });
  const result=await response.json();
  if(!valid())throw Error('登入或頁面已變更，請重新開啟');
  if(!response.ok||!result.success)throw Error(result.error||'資料暫時無法完成');
  return result;
 };
 async function run(fn){
  if(busy||!valid())return;busy=true;
  const controls=[...dialog.querySelectorAll('button,input,select,textarea')],disabled=controls.map(c=>c.disabled);
  controls.forEach(c=>c.disabled=true);status('處理中…');
  try{await fn();}catch(error){if(valid())status(error.name==='TimeoutError'?'連線逾時，請先重新整理核對結果，再用原內容重試。':error.message);}
  finally{busy=false;controls.forEach((c,i)=>c.disabled=disabled[i]);}
 }
 // A failed request keeps its original key. Changed facts require a new key.
 const requestKey=(name,data)=>{
  const facts=JSON.stringify(data),previous=keys.get(name);
  if(previous?.facts===facts)return previous.key;
  const key=crypto.randomUUID();keys.set(name,{facts,key});return key;
 };
 async function write(name,path,data){const result=await api(path,{...data,requestKey:requestKey(name,data)});keys.delete(name);return result;}
 const lookupControls=(prefix,label)=>input(prefix+'Number',label)+`<button type="button" data-lookup="${prefix}">核對${prefix==='referrer'?'推薦人':prefix==='manager'?'管理人':'受領人'}</button><p data-member="${prefix}" aria-live="polite"></p>`;
 function recordMarkup(record){
  const terms=record.terms||{},contractStatus=record.contractStatus||{},version=value(record,'policy_version','policyVersion');
  const lifecycle=record.lifecycle||[];
  return `<article class="ra-record"><strong>${esc(version===POLICY?'115.10 版':version||'歷史契約')}</strong>
   <p class="ra-copy">登錄編號：${esc(record.id)}<br>簽署：${esc(value(record,'signed_at','signedAt'))}<br>生效：${esc(value(record,'effective_at','effectiveAt'))}<br>原契約到期：${esc(value(record,'expires_at','expiresAt'))}</p>
   ${version===POLICY?`<p>目前有效性：${esc(contractStatus.active?'有效':statusText(contractStatus.reason))}<br>本期：${esc(contractStatus.periodStart||'待核')} ～ ${esc(contractStatus.periodEnd||'待核')}</p>
   <p>簽約方：${esc(terms.partyType==='company'?'公司／商號／法人':'自然人')} · ${esc(terms.partyName)}${terms.representativeName?`<br>代表人：${esc(terms.representativeName)}`:''}<br>推薦人：${esc(terms.referrerName)} · ${esc(terms.referrerMemberNumber)}<br>收款帳戶：${esc(terms.bankName)} ${esc(terms.bankCode)} · ${esc(mask(terms.bankAccount))}</p>`:'<p>歷史版本保留，既有契約與訂單不覆寫。</p>'}
   <small class="ra-copy">實際已簽文件 SHA-256：${esc(value(record,'document_sha256','documentSha256'))}</small>
   ${version===POLICY?`<small class="ra-copy">115.10 空白範本 SHA-256：${esc(record.templateSha256||terms.templateSha256||latest.templateSha256||'待核')}</small>`:''}
   ${lifecycle.length?`<p>契約事件（保留沿革）：</p><ul>${lifecycle.map(event=>`<li class="ra-copy">${esc(event.action==='nonrenewal'?'不續約通知':'終止')} · ${esc(value(event,'effective_at','effectiveAt'))} · ${esc(event.reason)}</li>`).join('')}</ul>`:''}</article>`;
 }
 function quotaMarkup(quota){
  if(!quota)return '<p>尚無最近12個月業績檢核資料，未自動停權。</p>';
  return `<p>最近連續12個月有效新約：${esc(quota.validNewDeals)}／${esc(quota.threshold||6)} 件<br>檢查期間：${esc(quota.windowStart)} ～ ${esc(quota.windowEnd)}<br>檢核時間：${esc(quota.checkedAt||quota.windowEnd||'待核')}</p><p class="ra-note">${quota.eligibleForReview?quota.minimumMet?'已達6件門檻。':'未達6件，僅提示管理員核對並決定是否處理，不自動停權。':'尚未滿完整12個月，僅顯示目前件數，不認定未達標。'}續約及停止後重新加入均不計入6件。</p>`;
 }
 function render(result){
  latest=result;chosenManager='';chosenReferrer='';chosenBeneficiary='';
  const records=result.contracts||[],pending=result.pendingDeals||[];
  const currentContracts=records.filter(record=>value(record,'policy_version','policyVersion')===POLICY);
  shell(`<p class="ra-note">本頁由管理員核對外部已簽文件後登錄，並非線上手簽。新登錄使用115.10版；新簽後的新訂單才適用，舊訂單維持原規則。</p>
   <button type="button" data-refresh>重新整理</button><h3>115.10 制度</h3>
   <p>甲方：智點通股份有限公司（54852701）／代表人：楊滄棋。共創夥伴免費加入，無須先購買完整版；一般夥伴累計兩筆有效直接新成交後晉升，第三筆起直接成交50%。續約由原推薦人25%＋當下歸屬人25%，各份可分別待核。</p>
   <p>簽署日生效、每期一年；未於期滿30日前通知不續約，依契約自動延長一年。終止依第12條取消已成立但未支付的獎勵，已支付流水保留，不自動追回銀行款。</p>
   <h3>最近12個月新約檢核</h3>${quotaMarkup(currentContracts[0]?.quota||result.quota)}
   <h3>已登錄契約</h3>${records.length?records.map(recordMarkup).join(''):'<p>尚未登錄已簽契約。</p>'}
   ${action('contract','登錄已核對的115.10新簽契約',`
    ${select('templateVersion','已簽文件制度版本',[[TEMPLATE,'115.10（本次指定版）']])}
    <small class="ra-copy">空白範本 SHA-256：${esc(result.templateSha256||'待伺服器核對')}</small>
    ${input('signedAt','實際簽署時間（亦為契約生效時間）','datetime-local')}
    ${select('partyType','乙方簽約身分',[['natural_person','自然人'],['company','公司／商號／法人']])}
    ${input('partyName','姓名／公司或法人名稱')}${input('representativeName','公司／法人代表人（法人必填）','text',false)}
    ${lookupControls('referrer','契約推薦人的會員編號')}${input('referrerName','契約推薦人姓名')}
    <small>${result.referrer?.required===false?'CRM核對結果為無推薦人／admin歸入；將保留原始紀錄，不新增推薦人。':result.referrer?.required&&!result.referrer.memberNumber?'CRM原推薦人尚無會員編號，請先補齊該會員編號，再重新開啟並核對；不任意填入其他人。':'須與CRM既有原始推薦人一致；核對不會改寫推薦關係。'}</small>
    <fieldset><legend>收款銀行資料</legend>${input('bankName','銀行名稱')}${input('bankCode','銀行代碼','text',true,'inputmode="numeric"')}${input('bankBranch','分行')}${input('bankAccountHolder','帳戶戶名')}${input('bankAccount','帳號','text',true,'inputmode="numeric" autocomplete="off"')}</fieldset>
    <label>選取實際已簽文件，計算校驗碼<input type="file" data-file accept=".pdf,.docx"></label>
    <small>僅在本機計算已簽檔案SHA-256，不會上傳文件。簽署後檔案與空白範本校驗碼應分開保留，請保管原始已簽文件。</small>
    ${input('documentSha256','實際已簽文件 SHA-256 校驗碼')}${input('evidenceRef','已簽文件保管編號／憑證參照')}
    ${select('purchaseStatus','本人完整版購買狀態',[['unknown','待確認'],['not_purchased','未購買'],['purchased','已購買']])}
    ${input('purchaseOrderId','本人完整版購買訂單編號（已購買時必填）','text',false)}
    ${agreement('我已核對雙方實際簽署115.10版、簽署時間、簽約身分、原推薦人、銀行資料及購買狀態，並保管簽署證據。')}${submit('確認登錄115.10已簽契約')}`)}
   ${action('attribution','登錄經同意的目前管理歸屬',`<p>只更新有證據的管理沿革；原始推薦人紀錄保留。</p>${lookupControls('manager','目前管理人的會員編號')}${input('effectiveAt','同意轉移生效時間','datetime-local')}${input('consentSha256','有效同意文件 SHA-256 校驗碼')}${input('evidenceRef','同意證據保管編號／參照')}${agreement('我已核對當事人有效同意、管理歸屬證據與生效時間。')}${submit('確認登錄管理歸屬')}`)}
   ${action('deal','確認已收款並開通的新制成交',`
    ${pending.length?`<p>此會員的新制待核訂單：</p><ul>${pending.map(order=>`<li class="ra-copy">${esc(order.orderId||order.order_id)} · ${esc(order.policyVersion||order.policy_version||'版本待核')} · ${esc(order.status||'待核')}</li>`).join('')}</ul>`:''}
    <p>先核對已收款、審核與服務開通，且沒有撤銷或退費。115.10另須登錄此次服務年度及加入類型；不由前端指定獎金金額。</p>
    ${input('orderId','新制訂單編號')}${input('receiptRef','收款及審核開通憑證參照')}${input('serviceOpenedAt','實際服務開通時間','datetime-local')}
    ${select('serviceAdmission','115.10服務加入類型',[['new','新加入首年'],['renewal','正常續約'],['reactivation','停止後重新加入（不計6件）']])}
    ${input('serviceYearStart','115.10此次服務年度起日','datetime-local',false)}${input('serviceYearEnd','115.10此次服務年度迄日','datetime-local',false)}
    ${input('reviewReason','如有待核份額：具體待核原因（必填）','text',false)}${input('reviewHandlingDueAt','如有待核份額：預定處理期限（必填）','datetime-local',false)}
    ${agreement('我已核對本筆收款、審核與開通證據、服務年度及加入類型，且沒有撤銷、退費或異常。')}${submit('確認有效成交並核算新制獎金')}`)}
   ${action('lifecycle','登錄不續約通知／契約終止',`
    <p class="ra-note">不自動停權。一般通知須提前30日；違約或最近12個月新約不足須核對實際事實與證據。終止取消已成立未支付的獎勵，保留已支付流水，不執行銀行追回。</p>
    ${select('contractId','115.10契約',currentContracts.length?currentContracts.map(record=>[record.id,`${record.id} · ${value(record,'signed_at','signedAt')}`]):[['','尚無115.10契約']])}
    ${select('action','事件類型',[['nonrenewal','不續約通知'],['termination','終止契約']])}
    ${select('terminationGround','終止依據（終止時必選）',[['notice','書面通知（提前30日）'],['breach','重大違約（核對證據）'],['annual_quota','最近連續12個月新約不足（管理員決定）']])}
    ${input('effectiveAt','預定不續約／終止生效時間','datetime-local')}${input('evidenceSha256','通知／決定證據 SHA-256 校驗碼')}${input('evidenceRef','證據保管編號／參照')}${input('reason','具體通知／終止原因')}
    ${agreement('我已核對通知時點、契約條件與證據，確認這是實際決定，並了解未支付獎勵與已付款流水的處理。')}${submit('確認登錄契約事件')}`)}
   ${action('renewal','核對續約單一待核份額',`<p>原推薦人及當下管理歸屬各25%分別核對；只能補足真實關係與同意證據，不能任意更換受領人。另一份已核對結果保留。</p>${(result.renewalHolds||[]).length?`<ul>${result.renewalHolds.map(held=>`<li class="ra-copy">${esc(held.order_id)} · ${esc(held.portion==='renewal_referral'?'原推薦人25%':'當下歸屬人25%')} · NT$ ${money(held.amount)} · ${esc(held.reason)} · 處理期限：${esc(held.handling_due_at||'待核')}</li>`).join('')}</ul>`:'<p>目前沒有待核續約份額。</p>'}${input('orderId','續約訂單編號')}${select('portion','本次核對份額',[['renewal_referral','原推薦人25%'],['renewal_placement','當下歸屬人25%']])}${lookupControls('beneficiary','真實受領人的會員編號')}${input('consentSha256','關係／同意證據 SHA-256 校驗碼')}${input('evidenceRef','證據保管編號／參照')}${input('reason','補足核對資料的原因')}${agreement('我已核對此份額的真實受領人、原始關係及有效同意證據，未任意改寫原推薦人或另一份額。')}${submit('確認核對此續約份額')}`)}
   <details data-settlement><summary>月結、請款與已付款登錄</summary><p>上月帳單應於次月5日前提供，帳單送達後5日內可異議；合法請款文件齊備後10個工作日付款。日期與工作日由伺服器核對；本頁只登錄實際證據，不執行轉帳。</p><button type="button" data-settlement-load>讀取月結紀錄</button><div data-settlement-body></div></details>`);
  dialog.querySelector('[data-refresh]').onclick=()=>run(load);
  dialog.querySelector('[data-file]').onchange=()=>run(async()=>{
   const file=dialog.querySelector('[data-file]').files[0];if(!file)return;
   if(file.size>20*1024*1024)throw Error('文件請小於20MB');
   const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
   if(valid())dialog.querySelector('[name=documentSha256]').value=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
   status('已簽文件校驗碼已計算，尚未登錄。');
  });
  const partyType=dialog.querySelector('[name=partyType]'),representative=dialog.querySelector('[name=representativeName]');
  partyType.onchange=()=>{representative.required=partyType.value==='company';};
  const noReferrer=result.referrer?.required===false;
  for(const [field,text] of [['referrerNumber',result.referrer?.memberNumber],['referrerName',result.referrer?.name]]){
   const control=dialog.querySelector(`[name=${field}]`);control.value=noReferrer?'':text||'';control.required=!noReferrer;control.disabled=noReferrer;
  }
  dialog.querySelector('[data-lookup=referrer]').disabled=noReferrer;
  for(const prefix of ['referrer','manager','beneficiary']){
   const field=dialog.querySelector(`[name=${prefix}Number]`),output=dialog.querySelector(`[data-member=${prefix}]`);
   field.oninput=()=>{if(prefix==='referrer')chosenReferrer='';else if(prefix==='manager')chosenManager='';else chosenBeneficiary='';output.textContent='';};
   dialog.querySelector(`[data-lookup=${prefix}]`).onclick=()=>run(async()=>{
    const number=field.value.trim(),result=await api('/lookup?'+new URLSearchParams({memberNumber:number})),member=result.member||result.data;
    if(!member?.userId)throw Error('查無可核對的會員');
    if(prefix==='referrer'){chosenReferrer=number;dialog.querySelector('[name=referrerName]').value=member.name||'';}
    else if(prefix==='manager')chosenManager=member.userId;else chosenBeneficiary=member.userId;
    output.textContent=[member.name,member.memberNumber].filter(Boolean).join(' · ');status('會員編號已核對，尚未登錄。');
   });
  }
  const lifecycleForm=dialog.querySelector('[data-form=lifecycle]'),ground=lifecycleForm.querySelector('[name=terminationGround]');
  lifecycleForm.querySelector('[name=action]').onchange=()=>{ground.disabled=lifecycleForm.elements.action.value!=='termination';};ground.disabled=true;
  dialog.querySelector('[data-settlement-load]').onclick=()=>run(loadSettlement);
 }
 function renderSettlement(result){
  const statements=result.statements||[],disputes=result.disputes||[],outstanding=result.outstanding||[];
  dialog.querySelector('[data-settlement-body]').innerHTML=`${result.calendarReview?'<p class="ra-note">工作日行事曆尚待核對，付款期限與給付資格保留待核；不自行推算或付款。</p>':''}
   ${result.hasMoreOutstanding?'<p class="ra-note">目前顯示前10筆；可依月份分批建立追加帳單，每筆流水只列一次。</p>':''}
   <h4>月結帳單</h4>${statements.length?statements.map(statement=>`<article class="ra-record"><strong>${esc(statement.month)} · NT$ ${money(statement.total_amount)}</strong><p class="ra-copy">帳單編號：${esc(statement.id)}<br>送達：${esc(statement.delivered_at)}<br>應提供期限：${esc(statement.statement_due_at)}${statement.late?'（遲送，需核對）':''}<br>異議期限：${esc(statement.objection_due_at)}</p>${statement.claim?`<p>請款文件齊備：${esc(statement.claim.completed_at)}<br>付款期限：${esc(statement.claim.payment_due_at||'工作日行事曆待核')}<br>行事曆狀態：${esc(statement.claim.calendar_status)}</p>`:'<p>尚未登錄合法請款文件齊備。</p>'}<ul>${(statement.items||[]).map(item=>`<li class="ra-copy">${esc(item.tx_id)} · NT$ ${money(item.amount)} · ${esc(statusText(item.effectiveStatus||item.status))}${item.disputed?'（此份額異議待核）':''}</li>`).join('')}</ul></article>`).join(''):'<p>尚無月結帳單。</p>'}
   <h4>待結算流水</h4>${outstanding.length?`<ul>${outstanding.map(item=>`<li class="ra-copy">${esc(item.tx_id)} · ${esc(item.order_id)} · NT$ ${money(item.amount)} · ${esc(statusText(item.effectiveStatus||item.status))}</li>`).join('')}</ul>`:'<p>尚無待結算流水。</p>'}
   <h4>異議紀錄</h4>${disputes.length?`<ul>${disputes.map(dispute=>`<li class="ra-copy">${esc(dispute.id)} · ${esc(dispute.tx_id)} · ${esc(dispute.reason)}<br>處理期限：${esc(dispute.handling_due_at)} · ${esc(dispute.resolution||'待處理')}</li>`).join('')}</ul>`:'<p>尚無異議紀錄。</p>'}
   ${action('statement','登錄月結帳單送達',`${input('month','已結束的結算月份','month')}${input('deliveredAt','帳單實際送達時間','datetime-local')}${input('evidenceRef','送達證據參照')}${agreement('我已核對此月份帳單及實際送達證據；登錄不會發送通知。')}${submit('確認登錄月結帳單')}`)}
   ${action('claim','登錄合法請款文件齊備',`${input('statementId','帳單編號')}${input('completedAt','合法請款文件齊備時間','datetime-local')}${input('evidenceRef','合法請款文件參照')}${agreement('我已核對合法請款文件齊備與時間；工作日付款期限以伺服器核對結果為準。')}${submit('確認登錄請款齊備')}`)}
   ${action('dispute','登錄單一獎勵流水異議',`${input('statementId','帳單編號')}${input('txId','有異議的獎勵流水編號')}${input('reason','異議原因')}${input('handlingDueAt','預定處理期限','datetime-local')}${input('evidenceRef','異議證據參照')}${agreement('我已核對異議內容與送達期限，只暫緩爭議流水，不任意扣住其他份額。')}${submit('確認登錄此流水異議')}`)}
   ${action('resolution','處理已登錄異議',`${input('disputeId','異議編號')}${select('resolution','核對結果',[['release','解除此份額暫緩'],['cancel','依據證據取消此份額']])}${input('reason','處理結論與原因')}${input('evidenceRef','處理證據參照')}${agreement('我已核對此異議的處理證據與結果，只處理所選流水。')}${submit('確認登錄異議處理')}`)}
   ${action('payment','登錄已完成銀行付款',`<p class="ra-note">僅在銀行已實際支付後登錄，不會從此處匯款。待核、異議及已取消份額不會因登錄而變為已付。</p>${input('statementId','帳單編號')}${input('paidAt','銀行實際付款時間','datetime-local')}${input('paymentRef','銀行付款憑證參照')}${agreement('我已核對銀行確已付款與憑證，了解這只登錄已付款事實，不會執行轉帳。')}${submit('確認登錄已完成付款')}`)}`;
 }
 async function load(){render(await api('?'+new URLSearchParams({target})));status('');}
 async function loadSettlement(){renderSettlement(await api('/settlement?'+new URLSearchParams({target})));status('已讀取月結紀錄，未執行付款。');}
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target;if(!form.matches('form[data-form]')||!form.reportValidity())return;
  const fields=new FormData(form),get=name=>String(fields.get(name)||'').trim(),confirmed=fields.get('confirmed')==='on',name=form.dataset.form;
  void run(async()=>{
   if(!confirmed)throw Error('請先核對並勾選確認事項');
   if(name==='contract'){
    if(get('templateVersion')!==TEMPLATE)throw Error('請使用115.10版已簽契約');
    if(latest.referrer?.required!==false&&(!chosenReferrer||chosenReferrer!==get('referrerNumber')))throw Error('請先核對契約推薦人的會員編號');
    if(get('partyType')==='company'&&!get('representativeName'))throw Error('公司／法人請填寫代表人');
    if(get('purchaseStatus')==='purchased'&&!get('purchaseOrderId'))throw Error('已購買者請填寫本人購買訂單編號');
    const signedAt=iso(get('signedAt'));
    await write(name,'',{target_uid:target,templateVersion:TEMPLATE,signedAt,effectiveAt:signedAt,partyType:get('partyType'),partyName:get('partyName'),representativeName:get('representativeName'),referrerName:get('referrerName'),referrerMemberNumber:get('referrerNumber'),bankName:get('bankName'),bankCode:get('bankCode'),bankBranch:get('bankBranch'),bankAccountHolder:get('bankAccountHolder'),bankAccount:get('bankAccount'),documentSha256:hash(get('documentSha256')),evidenceRef:get('evidenceRef'),purchaseStatus:get('purchaseStatus'),...(get('purchaseOrderId')?{purchaseOrderId:get('purchaseOrderId')} : {}),confirmed});
    await load();status('115.10已簽契約已登錄；歷史契約與舊訂單維持原規則。');
   }else if(name==='attribution'){
    if(!chosenManager)throw Error('請先核對管理人的會員編號');
    await write(name,'/attribution',{target_uid:target,manager_uid:chosenManager,effectiveAt:iso(get('effectiveAt')),consentSha256:hash(get('consentSha256')),evidenceRef:get('evidenceRef'),confirmed});
    await load();status('管理歸屬已登錄，原推薦歷史保留。');
   }else if(name==='deal'){
    const pending=(latest.pendingDeals||[]).find(order=>(order.orderId||order.order_id)===get('orderId'));
    if(!pending)throw Error('請先重新整理並核對此會員的待核訂單編號');
    const policy=pending.policyVersion||pending.policy_version;
    if(![POLICY,'cocreator-2026-10-25-v2'].includes(policy))throw Error('訂單制度版本尚待核對，請重新整理');
    const newPolicy=policy===POLICY;
    const data={orderId:get('orderId'),receiptRef:get('receiptRef'),serviceOpenedAt:iso(get('serviceOpenedAt')),confirmed};
    if(newPolicy){data.serviceYearStart=iso(get('serviceYearStart'));data.serviceYearEnd=iso(get('serviceYearEnd'));data.serviceAdmission=get('serviceAdmission');if(get('reviewReason'))data.reviewReason=get('reviewReason');if(get('reviewHandlingDueAt'))data.reviewHandlingDueAt=iso(get('reviewHandlingDueAt'));}
    const result=await write(name,'/deals/confirm',data);await load();
    status(result.settlementStatus==='review_required'?'已核算，對帳與請款給付仍待核對，尚未付款。':result.reviewRequired||result.status==='review_required'?'資料或部分份額尚待核對；其餘已核對份額保留。':'有效成交核對完成，請查看獎金紀錄與核算結果。');
   }else if(name==='lifecycle'){
    if(!get('contractId'))throw Error('請先選擇已登錄的115.10契約');
    const contract=(latest.contracts||[]).find(record=>record.id===get('contractId'));
    if(get('action')==='termination'&&get('terminationGround')==='annual_quota'&&!(contract?.quota||latest.quota)?.eligibleForReview)throw Error('尚未滿完整12個月，不能以年度新約不足終止');
    await write(name,'/lifecycle',{contractId:get('contractId'),action:get('action'),...(get('action')==='termination'?{terminationGround:get('terminationGround')} : {}),effectiveAt:iso(get('effectiveAt')),evidenceSha256:hash(get('evidenceSha256')),evidenceRef:get('evidenceRef'),reason:get('reason'),confirmed});
    await load();status('契約事件已登錄；已付款流水保留，未執行銀行追回。');
   }else if(name==='renewal'){
    if(!chosenBeneficiary)throw Error('請先核對真實受領人的會員編號');
    const result=await write(name,'/renewals/resolve',{orderId:get('orderId'),portion:get('portion'),beneficiaryUid:chosenBeneficiary,consentSha256:hash(get('consentSha256')),evidenceRef:get('evidenceRef'),reason:get('reason'),confirmed});
    await load();status(result.reviewRequired?'此份額仍待核對，另一份額結果保留。':'此續約份額核對已登錄；付款仍依月結與請款核對。');
   }else{
    // Parse only the selected form, never timestamps from unrelated forms.
    const selected={statement:()=>['statements',{target_uid:target,month:get('month'),deliveredAt:iso(get('deliveredAt')),evidenceRef:get('evidenceRef'),confirmed}],claim:()=>['claims',{statementId:get('statementId'),completedAt:iso(get('completedAt')),evidenceRef:get('evidenceRef'),confirmed}],dispute:()=>['disputes',{statementId:get('statementId'),txId:get('txId'),reason:get('reason'),handlingDueAt:iso(get('handlingDueAt')),evidenceRef:get('evidenceRef'),confirmed}],resolution:()=>['resolve',{disputeId:get('disputeId'),resolution:get('resolution'),reason:get('reason'),evidenceRef:get('evidenceRef'),confirmed}],payment:()=>['payments',{statementId:get('statementId'),paidAt:iso(get('paidAt')),paymentRef:get('paymentRef'),confirmed}]}[name];
    if(!selected)throw Error('不支援的核對操作');
    const [path,data]=selected(),result=await write(name,'/settlement/'+path,data);await loadSettlement();
    status(name==='payment'?'已登錄實際銀行付款；本頁未執行匯款。':name==='claim'&&!result.claim?.payment_due_at?'請款齊備已登錄；工作日行事曆或付款期限仍待核對。':'月結核對資料已登錄；尚未執行付款。');
   }
  });
 });
 shell('<p>讀取中…</p>');await run(load);return {close};
}
