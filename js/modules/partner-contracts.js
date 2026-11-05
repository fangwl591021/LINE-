const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const POLICY='cocreator-115.10-v3',NEW_POLICY='cocreator-115.11-v4',TEMPLATE='115.11-R2';
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

export async function openPartnerContracts({base,target,orderId='',isCurrent=()=>true,fetcher=fetch}={}){
 if(!/^U[0-9a-f]{32}$/i.test(target||''))throw Error('請從 CRM 選擇會員');
 if(active?.busy)throw Error('資料正在送出，請稍候');
 active?.close();
 const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
 if(!token)throw Error('請先登入 LINE');
 const actor=()=>window.liff?.getContext?.()?.userId||'';
 const originalActor=actor();
 if(!document.querySelector('[data-reward-application-style]')){
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../css/reward-applications.css?v=2',import.meta.url).href;
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
 const lookupControls=(prefix,label)=>input(prefix+'Number',label)+`<button type="button" data-lookup="${prefix}">核對${(prefix==='referrer'||prefix==='business')?'推薦人':prefix==='manager'?'管理人':'受領人'}</button><p data-member="${prefix}" aria-live="polite"></p>`;
 function recordMarkup(record){
  const terms=record.terms||{},contractStatus=record.contractStatus||{},version=value(record,'policy_version','policyVersion');
  const lifecycle=record.lifecycle||[];
  return `<article class="ra-record"><strong>${esc(version===NEW_POLICY?(terms.templateVersion===TEMPLATE?'115.11 完整版資格修正版':'115.11 版'):version===POLICY?'115.10 版':version||'歷史契約')}</strong>
   <p class="ra-copy">登錄編號：${esc(record.id)}<br>簽署：${esc(value(record,'signed_at','signedAt'))}<br>生效：${esc(value(record,'effective_at','effectiveAt'))}<br>原契約到期：${esc(value(record,'expires_at','expiresAt'))}</p>
   ${[POLICY,NEW_POLICY].includes(version)?`<p>目前有效性：${esc(contractStatus.active?'有效':statusText(contractStatus.reason))}<br>本期：${esc(contractStatus.periodStart||'待核')} ～ ${esc(contractStatus.periodEnd||'待核')}</p>
   <p>簽約方：${esc(terms.partyType==='company'?'公司／商號／法人':'自然人')} · ${esc(terms.partyName)}${terms.representativeName?`<br>代表人：${esc(terms.representativeName)}`:''}<br>推薦人：${esc(terms.referrerName)} · ${esc(terms.referrerMemberNumber)}<br>收款帳戶：${esc(terms.bankName)} ${esc(terms.bankCode)} · ${esc(mask(terms.bankAccount))}</p>`:'<p>歷史版本保留，既有契約與訂單不覆寫。</p>'}
   <small class="ra-copy">實際已簽文件 SHA-256：${esc(value(record,'document_sha256','documentSha256'))}</small>
   ${[POLICY,NEW_POLICY].includes(version)?`<small class="ra-copy">${version===NEW_POLICY?(terms.templateVersion||'115.11'):'115.10'} 空白範本 SHA-256：${esc(record.templateSha256||terms.templateSha256||'未記錄')}</small>`:''}
   ${lifecycle.length?`<p>契約事件（保留沿革）：</p><ul>${lifecycle.map(event=>`<li class="ra-copy">${esc(event.action==='nonrenewal'?'不續約通知':'終止')} · ${esc(value(event,'effective_at','effectiveAt'))} · ${esc(event.reason)}</li>`).join('')}</ul>`:''}</article>`;
 }
 function quotaMarkup(quota){
  if(!quota)return '<p>尚無最近12個月業績檢核資料，未自動停權。</p>';
  if(Number.isInteger(quota.percent))return `<p>本月累計有效新約 ${esc(quota.validNewDeals)} 件，目前續約級距 ${esc(quota.percent)}%。月底按完整月份核定。</p>`;
  return `<p>最近連續12個月有效新約：${esc(quota.validNewDeals)}／${esc(quota.threshold||6)} 件<br>檢查期間：${esc(quota.windowStart)} ～ ${esc(quota.windowEnd)}<br>檢核時間：${esc(quota.checkedAt||quota.windowEnd||'待核')}</p><p class="ra-note">${quota.eligibleForReview?quota.minimumMet?'已達6件門檻。':'未達6件，僅提示管理員核對並決定是否處理，不自動停權。':'尚未滿完整12個月，僅顯示目前件數，不認定未達標。'}續約及停止後重新加入均不計入6件。</p>`;
 }
 function render(result){
  latest=result;chosenManager='';chosenReferrer='';chosenBeneficiary='';
  const records=result.contracts||[],pending=result.pendingDeals||[];
  const currentContracts=records.filter(record=>[POLICY,NEW_POLICY].includes(value(record,'policy_version','policyVersion')));
  shell(`<p class="ra-note">本頁供管理員核對已簽契約後登錄；線上手簽請至商城「我的 → 合作申請／我的合約」。線上簽署紀錄仍須審核及契約登錄，不會自動開通資格。新簽請核對115.11持續收益與完整版資格修正版；新簽後的新訂單才適用，舊訂單維持原規則。</p>
   <button type="button" data-refresh>重新整理</button><h3>115.11 制度</h3>
   <p>甲方：智點通股份有限公司（54852701）／代表人：楊滄棋。共創夥伴免費加入，無須先購買完整版；一般夥伴累計兩筆有效直接新成交後晉升，第三筆起直接成交50%。續約各以未稅實收的25%為基準，兩位受領人各依已簽版本結算。115.11 版依有效新約件數實領：0～1 件 20%、2～3 件 40%、4～5 件 60%、6 件以上 100%。</p>
   <p>簽署日生效、每期一年；未於期滿30日前通知不續約，依契約自動延長一年。績效自 2026 年 11 月起含業績當月計算，最多回看十二個月。一般終止／不續約後，既有原推薦案件保留基準的 20%；當下歸屬人新生份額依書面約定處理。重大違約爭議部分先待核。修正版另須在認列、結算時具備本人有效完整版，資格中斷期間不補發。</p>
   <h3>最近12個月新約檢核</h3>${quotaMarkup(currentContracts[0]?.quota||result.quota)}
   ${result.heldOrders?.length?action('orderReferral','待核業績・核對簽署資料',select('orderId','待核訂單',result.heldOrders.map(o=>[o.orderId,o.orderId+' · '+(o.status==='paid'?'已收款':'待收款')]))+select('applicationId','該筆已受理完整版申請書',[['','請選擇已簽署且審核通過的申請書'],...(result.referralProofs||[]).map(p=>[p.id,[p.signed_at,p.namedPartner||'未列協助夥伴',p.id].join(' · ')])])+lookupControls('business','業務推薦人會員編號')+input('note','核對依據（同名或只填姓名時，請記錄如何確認本人）')+agreement('已核對此訂單的簽署資料及業務推薦人身分')+submit('確認業務歸屬')):''}
   ${records.some(record=>record.terms?.templateVersion===TEMPLATE)?action('fullService','本人完整版服務紀錄',
     select('serviceAction','操作',[['open','登錄已付款完整版開通'],['suspend','登錄合法停用'],['resume','登錄恢復服務']])+input('orderId','本人完整版訂單編號（開通必填）','text',false)+input('effectiveAt','生效時間','datetime-local')+input('expiresAt','服務期滿時間（開通必填）','datetime-local',false)+input('evidenceRef','付款／開通／停復用憑證參照')+agreement('已核對本人服務身分、有效期間及書面憑證')+submit('登錄服務紀錄')):''}
   ${result.serviceNow?`<p>本人完整版 · ${result.serviceNow.valid?'目前有效':result.serviceNow.reason==='service_suspended'?'目前停用':'查無有效服務期間'} · 核對時間 ${esc(result.serviceNow.to)}</p>`:''}
   ${result.serviceEvents?.length?`<ul>${result.serviceEvents.map(e=>`<li>服務${esc(({open:'開通',resume:'恢復',suspend:'停用'})[e.action])} · ${esc(e.effective_at)} · ${esc(e.order_id||e.evidence_ref)}</li>`).join('')}</ul>`:''}
   ${result.excluded?.length?`<h3>本人資格未符合的續約份額</h3><ul>${result.excluded.map(e=>`<li>${esc(e.order_id)} · ${esc(e.bonus_type==='renewal_referral'?'原推薦人':'當下歸屬人')} · ${esc(e.checkedAt)} · ${e.reason==='service_suspended'?'服務停用':'未取得連續有效的本人完整版服務紀錄'} · 實領 NT$ 0</li>`).join('')}</ul>`:''}
   <h3>已登錄契約</h3>${records.length?records.map(recordMarkup).join(''):'<p>尚未登錄已簽契約。</p>'}
   ${action('contract','登錄已核對的已簽契約',`
    ${select('templateVersion','已簽文件制度版本',[[TEMPLATE,'115.11（持續收益與完整版資格修正版）'],['115.11','115.11（原版）'],['115.10','115.10（仍以該版簽署的文件）']])}
    ${input('signedAt','實際簽署時間（亦為契約生效時間）','datetime-local')}
    ${select('partyType','乙方簽約身分',[['natural_person','自然人'],['company','公司／商號／法人']])}
    ${input('partyName','姓名／公司或法人名稱')}${input('representativeName','公司／法人代表人（法人必填）','text',false)}
    ${lookupControls('referrer','契約推薦人的會員編號')}${input('referrerName','契約推薦人姓名')}
    <small>依手簽契約核對業務推薦人姓名與會員編號，未列可留白。</small>
    <fieldset><legend>收款銀行資料</legend>${input('bankName','銀行名稱')}${input('bankCode','銀行代碼','text',true,'inputmode="numeric"')}${input('bankBranch','分行')}${input('bankAccountHolder','帳戶戶名')}${input('bankAccount','帳號','text',true,'inputmode="numeric" autocomplete="off"')}</fieldset>
    <label>選取實際已簽文件，計算校驗碼<input type="file" data-file accept=".pdf,.docx"></label>
    <small>僅在本機計算已簽檔案SHA-256，不會上傳文件。簽署後檔案與空白範本校驗碼應分開保留，請保管原始已簽文件。</small>
    ${input('documentSha256','實際已簽文件 SHA-256 校驗碼')}${input('evidenceRef','已簽文件保管編號／憑證參照')}
    ${select('purchaseStatus','本人完整版購買狀態',[['unknown','待確認'],['not_purchased','未購買'],['purchased','已購買']])}
    ${input('purchaseOrderId','本人完整版購買訂單編號（已購買時必填）','text',false)}
    ${agreement('我已核對所選版本與雙方實際簽署文件、簽署時間、簽約身分、原推薦人、銀行資料及購買狀態，並保管簽署證據。')}${submit('確認登錄已簽契約')}`)}
   ${action('attribution','登錄經同意的目前管理歸屬',`<p>只更新有證據的管理沿革；原始推薦人紀錄保留。</p>${lookupControls('manager','目前管理人的會員編號')}${input('effectiveAt','同意轉移生效時間','datetime-local')}${input('consentSha256','有效同意文件 SHA-256 校驗碼')}${input('evidenceRef','同意證據保管編號／參照')}${agreement('我已核對當事人有效同意、管理歸屬證據與生效時間。')}${submit('確認登錄管理歸屬')}`)}
   ${action('deal','確認已收款並開通的新制成交',`
    ${pending.length?`<p>此會員的新制待核訂單：</p><ul>${pending.map(order=>`<li class="ra-copy">${esc(order.orderId||order.order_id)} · ${esc(order.policyVersion||order.policy_version||'版本待核')} · ${esc(order.status||'待核')}</li>`).join('')}</ul>`:''}
    <p>先核對已收款、審核與服務開通，且沒有撤銷或退費。115.10／115.11 另須登錄此次服務年度及加入類型；不由前端指定獎金金額。</p>
    ${input('orderId','新制訂單編號')}${input('receiptRef','收款及審核開通憑證參照')}${input('serviceOpenedAt','實際服務開通時間','datetime-local')}
    ${select('serviceAdmission','服務加入類型',[['new','新加入首年'],['renewal','正常續約'],['reactivation','停止後重新加入（不計6件）']])}
    ${input('serviceYearStart','此次服務年度起日','datetime-local',false)}${input('serviceYearEnd','此次服務年度迄日','datetime-local',false)}
    ${input('reviewReason','如有待核份額：具體待核原因（必填）','text',false)}${input('reviewHandlingDueAt','如有待核份額：預定處理期限（必填）','datetime-local',false)}
    ${agreement('我已核對本筆收款、審核與開通證據、服務年度及加入類型，且沒有撤銷、退費或異常。')}${submit('確認有效成交並核算新制獎金')}`)}
   ${action('lifecycle','登錄不續約通知／契約終止',`
    <p class="ra-note">一般終止須提前30日通知。115.11 不得僅以年度新約不足終止，已成立且符合結算條件的獎金保留。歷史契約依各自版本核對。</p>
    ${select('contractId','契約',currentContracts.length?currentContracts.map(record=>[record.id,`${record.id} · ${value(record,'signed_at','signedAt')}`]):[['','尚無已登錄契約']])}
    ${select('action','事件類型',[['nonrenewal','不續約通知'],['termination','終止契約']])}
    ${select('terminationGround','終止依據（終止時必選）',[['notice','書面通知（提前30日）'],['breach','重大違約（核對證據）'],['annual_quota','年度新約不足（僅限115.10）']])}
    ${input('effectiveAt','預定不續約／終止生效時間','datetime-local')}${input('evidenceSha256','通知／決定證據 SHA-256 校驗碼')}${input('evidenceRef','證據保管編號／參照')}${input('reason','具體通知／終止原因')}
    ${agreement('我已核對通知時點、契約條件與證據，確認這是實際決定，並了解未支付獎勵與已付款流水的處理。')}${submit('確認登錄契約事件')}`)}
   ${action('renewal','核對續約單一待核份額',`<p>原推薦人及當下管理歸屬各25%分別核對；只能補足真實關係與同意證據，不能任意更換受領人。另一份已核對結果保留。</p>${(result.renewalHolds||[]).length?`<ul>${result.renewalHolds.map(held=>`<li class="ra-copy">${esc(held.order_id)} · ${esc(held.portion==='renewal_referral'?'原推薦人25%':'當下歸屬人25%')} · NT$ ${money(held.amount)} · ${esc(held.reason)} · 處理期限：${esc(held.handling_due_at||'待核')}</li>`).join('')}</ul>`:'<p>目前沒有待核續約份額。</p>'}${input('orderId','續約訂單編號')}${input('writtenPercent','115.11 爭議或另有書面約定時，核准之基準獎金比例（0～100%，其餘留白）','number',false,'min="0" max="100" step="1"')}${select('portion','本次核對份額',[['renewal_referral','原推薦人25%'],['renewal_placement','當下歸屬人25%']])}${lookupControls('beneficiary','真實受領人的會員編號')}${input('consentSha256','關係／同意證據 SHA-256 校驗碼')}${input('evidenceRef','證據保管編號／參照')}${input('reason','補足核對資料的原因')}${agreement('我已核對此份額的真實受領人、原始關係及有效同意證據，未任意改寫原推薦人或另一份額。')}${submit('確認核對此續約份額')}`)}
   <details data-settlement><summary>月結、請款與已付款登錄</summary><p>上月帳單應於次月5日前提供，帳單送達後5日內可異議；合法請款文件齊備後10個工作日付款。日期與工作日由伺服器核對；本頁只登錄實際證據，不執行轉帳。</p><button type="button" data-settlement-load>讀取月結紀錄</button><div data-settlement-body></div></details>`);
  dialog.querySelector('[data-refresh]').onclick=()=>run(load);
  dialog.querySelector('[data-file]').onchange=()=>run(async()=>{
   const file=dialog.querySelector('[data-file]').files[0];if(!file)return;
   if(file.size>20*1024*1024)throw Error('文件請小於20MB');
   const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
   if(valid())dialog.querySelector('[name=documentSha256]').value=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
   status('已簽文件校驗碼已計算，尚未登錄。');
  });
  const reviewForm=dialog.querySelector('[data-form=orderReferral]');
  if(reviewForm && orderId && [...reviewForm.elements.orderId.options].some(option=>option.value===orderId)){
   reviewForm.elements.orderId.value=orderId;
   reviewForm.closest('details').open=true;
  }
  const partyType=dialog.querySelector('[name=partyType]'),representative=dialog.querySelector('[name=representativeName]');
  partyType.onchange=()=>{representative.required=partyType.value==='company';};
  for(const name of ['referrerNumber','referrerName']) dialog.querySelector('[name='+name+']').required=false;
  for(const prefix of ['referrer','manager','beneficiary','business']){
   const field=dialog.querySelector(`[name=${prefix}Number]`),output=dialog.querySelector(`[data-member=${prefix}]`);
   if(!field)continue;
   field.oninput=()=>{if(prefix==='referrer')chosenReferrer='';else if(prefix==='manager')chosenManager='';else if(prefix==='business')field.dataset.verified='';else chosenBeneficiary='';output.textContent='';};
   dialog.querySelector(`[data-lookup=${prefix}]`).onclick=()=>run(async()=>{
    const number=field.value.trim(),result=await api('/lookup?'+new URLSearchParams({memberNumber:number})),member=result.member||result.data;
    if(!member?.userId)throw Error('查無可核對的會員');
    if(prefix==='referrer'){chosenReferrer=number;dialog.querySelector('[name=referrerName]').value=member.name||'';}
    else if(prefix==='manager')chosenManager=member.userId;else if(prefix==='business')field.dataset.verified=number;else chosenBeneficiary=member.userId;
    output.textContent=[member.name,member.memberNumber].filter(Boolean).join(' · ');status('會員編號已核對，尚未登錄。');
   });
  }
  const lifecycleForm=dialog.querySelector('[data-form=lifecycle]'),ground=lifecycleForm.querySelector('[name=terminationGround]');
  lifecycleForm.querySelector('[name=action]').onchange=()=>{ground.disabled=lifecycleForm.elements.action.value!=='termination';};ground.disabled=true;
  const syncGround=()=>{
   const selected=records.find(r=>r.id===lifecycleForm.elements.contractId.value);
   const option=ground.querySelector('[value=annual_quota]');option.disabled=selected?.policy_version===NEW_POLICY;
   if(option.disabled&&ground.value==='annual_quota')ground.value='notice';
  };
  lifecycleForm.elements.contractId.onchange=syncGround;syncGround();
  dialog.querySelector('[data-settlement-load]').onclick=()=>run(loadSettlement);
 }
 function renderSettlement(result){
  const statements=result.statements||[],disputes=result.disputes||[],outstanding=result.outstanding||[];
  dialog.querySelector('[data-settlement-body]').innerHTML=`${result.calendarReview?'<p class="ra-note">工作日行事曆尚待核對，付款期限與給付資格保留待核；不自行推算或付款。</p>':''}
   ${result.hasMoreOutstanding?'<p class="ra-note">目前顯示前10筆；可依月份分批建立追加帳單，每筆流水只列一次。</p>':''}
   <h4>月結帳單</h4>${statements.length?statements.map(statement=>`<article class="ra-record"><strong>${esc(statement.month)} · NT$ ${money(statement.total_amount)}</strong><p class="ra-copy">帳單編號：${esc(statement.id)}<br>送達：${esc(statement.delivered_at)}<br>應提供期限：${esc(statement.statement_due_at)}${statement.late?'（遲送，需核對）':''}<br>異議期限：${esc(statement.objection_due_at)}</p>${statement.claim?`<p>請款文件齊備：${esc(statement.claim.completed_at)}<br>付款期限：${esc(statement.claim.payment_due_at||'工作日行事曆待核')}<br>行事曆狀態：${esc(statement.claim.calendar_status)}</p>`:'<p>尚未登錄合法請款文件齊備。</p>'}<ul>${(statement.items||[]).map(item=>`<li class="ra-copy">${esc(item.tx_id)} · NT$ ${money(item.amount)} · ${esc(statusText(item.effectiveStatus||item.status))}${item.percent!=null?'（基準 NT$ '+money(item.baseAmount)+' × '+esc(item.percent)+'%，當月有效新約 '+esc(item.deals)+' 件）':''}${item.disputed?'（此份額異議待核）':''}</li>`).join('')}</ul></article>`).join(''):'<p>尚無月結帳單。</p>'}
   <h4>待結算流水</h4><p>115.11 續約在月結前顯示基準金額，對帳單顯示該月級距與實領金額。</p>${outstanding.length?`<ul>${outstanding.map(item=>`<li class="ra-copy">${esc(item.tx_id)} · ${esc(item.order_id)} · NT$ ${money(item.amount)} · ${esc(statusText(item.effectiveStatus||item.status))}</li>`).join('')}</ul>`:'<p>尚無待結算流水。</p>'}
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
    if(![TEMPLATE,'115.11','115.10'].includes(get('templateVersion')))throw Error('請選擇實際簽署的契約版本');
    if((get('referrerNumber')||get('referrerName'))&&(!chosenReferrer||chosenReferrer!==get('referrerNumber')))throw Error('請先核對契約推薦人的會員編號');
    if(get('partyType')==='company'&&!get('representativeName'))throw Error('公司／法人請填寫代表人');
    if(get('purchaseStatus')==='purchased'&&!get('purchaseOrderId'))throw Error('已購買者請填寫本人購買訂單編號');
    const signedAt=iso(get('signedAt'));
    await write(name,'',{target_uid:target,templateVersion:get('templateVersion'),signedAt,effectiveAt:signedAt,partyType:get('partyType'),partyName:get('partyName'),representativeName:get('representativeName'),referrerName:get('referrerName'),referrerMemberNumber:get('referrerNumber'),bankName:get('bankName'),bankCode:get('bankCode'),bankBranch:get('bankBranch'),bankAccountHolder:get('bankAccountHolder'),bankAccount:get('bankAccount'),documentSha256:hash(get('documentSha256')),evidenceRef:get('evidenceRef'),purchaseStatus:get('purchaseStatus'),...(get('purchaseOrderId')?{purchaseOrderId:get('purchaseOrderId')} : {}),confirmed});
    await load();status(get('templateVersion')+'已簽契約已登錄；歷史契約與舊訂單維持原規則。');
   }else if(name==='fullService'){
    const action=get('serviceAction');
    await write(name,'/full-service',{target_uid:target,action,effectiveAt:iso(get('effectiveAt')),evidenceRef:get('evidenceRef'),...(action==='open'?{orderId:get('orderId'),expiresAt:iso(get('expiresAt'))}:{}),confirmed});
    await load();status('本人服務紀錄已登錄。');
   }else if(name==='orderReferral'){
    if(!get('applicationId')||form.elements.businessNumber.dataset.verified!==get('businessNumber'))throw Error('請選擇該筆簽署資料，並查核業務推薦人的會員編號');
    await write(name,'/order-referral',{target_uid:target,orderId:get('orderId'),applicationId:get('applicationId'),memberNumber:get('businessNumber'),note:get('note'),confirmed});
    await load();status('業務推薦人已核對，可至該夥伴的共創制度確認有效成交。');
   }else if(name==='attribution'){
    if(!chosenManager)throw Error('請先核對管理人的會員編號');
    await write(name,'/attribution',{target_uid:target,manager_uid:chosenManager,effectiveAt:iso(get('effectiveAt')),consentSha256:hash(get('consentSha256')),evidenceRef:get('evidenceRef'),confirmed});
    await load();status('管理歸屬已登錄，原推薦歷史保留。');
   }else if(name==='deal'){
    const pending=(latest.pendingDeals||[]).find(order=>(order.orderId||order.order_id)===get('orderId'));
    if(!pending)throw Error('請先重新整理並核對此會員的待核訂單編號');
    const policy=pending.policyVersion||pending.policy_version;
    if(![POLICY,NEW_POLICY,'cocreator-2026-10-25-v2'].includes(policy))throw Error('訂單制度版本尚待核對，請重新整理');
    const newPolicy=[POLICY,NEW_POLICY].includes(policy);
    const data={orderId:get('orderId'),receiptRef:get('receiptRef'),serviceOpenedAt:iso(get('serviceOpenedAt')),confirmed};
    if(newPolicy){data.serviceYearStart=iso(get('serviceYearStart'));data.serviceYearEnd=iso(get('serviceYearEnd'));data.serviceAdmission=get('serviceAdmission');if(get('reviewReason'))data.reviewReason=get('reviewReason');if(get('reviewHandlingDueAt'))data.reviewHandlingDueAt=iso(get('reviewHandlingDueAt'));}
    const result=await write(name,'/deals/confirm',data);await load();
    status(result.settlementStatus==='review_required'?'已核算，對帳與請款給付仍待核對，尚未付款。':result.reviewRequired||result.status==='review_required'?'資料或部分份額尚待核對；其餘已核對份額保留。':'有效成交核對完成，請查看獎金紀錄與核算結果。');
   }else if(name==='lifecycle'){
    if(!get('contractId'))throw Error('請先選擇已登錄的契約');
    const contract=(latest.contracts||[]).find(record=>record.id===get('contractId'));
    if(get('terminationGround')==='annual_quota' && get('action')==='termination' && contract?.policy_version===NEW_POLICY)throw Error('115.11 不得僅因未達六件終止合作');
    if(get('action')==='termination'&&get('terminationGround')==='annual_quota'&&!(contract?.quota||latest.quota)?.eligibleForReview)throw Error('尚未滿完整12個月，不能以年度新約不足終止');
    await write(name,'/lifecycle',{contractId:get('contractId'),action:get('action'),...(get('action')==='termination'?{terminationGround:get('terminationGround')} : {}),effectiveAt:iso(get('effectiveAt')),evidenceSha256:hash(get('evidenceSha256')),evidenceRef:get('evidenceRef'),reason:get('reason'),confirmed});
    await load();status('契約事件已登錄；已付款流水保留，未執行銀行追回。');
   }else if(name==='renewal'){
    if(!chosenBeneficiary)throw Error('請先核對真實受領人的會員編號');
    const result=await write(name,'/renewals/resolve',{orderId:get('orderId'),portion:get('portion'),...(get('writtenPercent')!==''?{writtenPercent:Number(get('writtenPercent'))}:{}),beneficiaryUid:chosenBeneficiary,consentSha256:hash(get('consentSha256')),evidenceRef:get('evidenceRef'),reason:get('reason'),confirmed});
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
