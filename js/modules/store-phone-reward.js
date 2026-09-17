// Direct phone gifts share the existing server authority and durable cashier request IDs.
export function mountStorePhoneReward(root,{isCurrent=()=>true,rewardOnly=false}={}) {
  const owner=window.currentUserProfile?.userId;
  const role=String(window.userRole||window.currentUser?.role||'');
  let disposed=false,revision=0,customer=null,receipt=null,busy=false,searching=false;
  let pending=null,retrySnapshot=null,retryAllowed=false;
  const current=()=>!disposed&&isCurrent()&&owner===window.currentUserProfile?.userId&&role===String(window.userRole||window.currentUser?.role||'')&&!!window.liff?.isLoggedIn?.()&&!!window.canUseStorePointCashier?.()&&rewardOnly===!!window.isRewardOnlyPointCashier?.();
  root.innerHTML='<section class="store-phone-reward"><form data-phone-search novalidate><label for="store-phone-reward-phone">會員手機號碼</label><div class="store-phone-reward-search"><input id="store-phone-reward-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="例如 0912345678" maxlength="24" required><button type="submit" data-search>搜尋會員</button></div></form><div data-member class="store-phone-reward-member" hidden><strong data-member-name></strong><span data-member-phone></span></div><form data-phone-gift novalidate><label for="store-phone-reward-points">贈送點數</label><input id="store-phone-reward-points" type="number" inputmode="numeric" min="1" max="1000000" step="1" placeholder="請輸入贈送點數" required><small>請先搜尋並核對會員，送出後才會贈點。</small><button type="submit" data-send>確認贈點</button></form><p data-phone-status role="status" aria-live="polite"></p><div data-pending hidden><button type="button" data-check>查詢原交易結果</button><button type="button" data-retry hidden>重送原贈點</button></div></section>';
  const phone=root.querySelector('#store-phone-reward-phone'),points=root.querySelector('#store-phone-reward-points');
  const member=root.querySelector('[data-member]'),status=root.querySelector('[data-phone-status]');
  const search=root.querySelector('[data-search]'),send=root.querySelector('[data-send]');
  const pendingBox=root.querySelector('[data-pending]'),check=root.querySelector('[data-check]'),retry=root.querySelector('[data-retry]');
  const normalize=value=>window.normalizeStorePointRewardPhone?.(value)||'';
  function savedRequest(){
    const raw=localStorage.getItem('ACTMASTER_CASHIER_PENDING_V1:'+owner);
    if(!raw)return null;
    const saved=JSON.parse(raw);
    if(!saved||typeof saved.requestId!=='string'||!saved.requestId||typeof saved.signature!=='string'||!saved.payload||typeof saved.payload!=='object'||Array.isArray(saved.payload)||saved.signature!==JSON.stringify(saved.payload))throw Error('原交易資料無法確認，請先返回原操作查詢交易');
    return saved;
  }
  function recoverDirectSnapshot(saved){
    const payload=saved?.payload,keys=['customerUserId','mode','amount','rewardPoints','deductPoints','rewardScanToken'];
    if(!payload||Object.keys(payload).some(key=>!keys.includes(key))||!/^U[0-9a-fA-F]{20,64}$/.test(payload.customerUserId||'')||payload.mode!=='reward'||payload.deductPoints!==0||!Number.isSafeInteger(payload.rewardPoints)||payload.rewardPoints<1||payload.rewardPoints>1000000||payload.amount!==payload.rewardPoints)return null;
    if((rewardOnly||payload.rewardScanToken!==undefined)&&!/^rwd_[0-9a-f]{64}$/.test(payload.rewardScanToken||''))return null;
    return payload;
  }
  function render(){
    const locked=busy||!!pending;
    phone.disabled=locked;search.disabled=locked||searching;
    points.disabled=locked||!customer;send.disabled=locked||!customer||searching;
    send.textContent=busy?'贈點處理中…':'確認贈點';
    search.textContent=searching?'搜尋中…':'搜尋會員';
    pendingBox.hidden=!pending;check.disabled=busy;
    retry.hidden=!pending||!retryAllowed||!retrySnapshot;retry.disabled=busy;
  }
  function invalidate(){
    revision++;customer=null;receipt=null;member.hidden=true;
    root.querySelector('[data-member-name]').textContent='';root.querySelector('[data-member-phone]').textContent='';
    points.value='';render();
  }
  function rememberPending(snapshot){
    pending=savedRequest();retryAllowed=false;
    // Restore only a validated exact direct-gift request; the server revalidates its receipt.
    retrySnapshot=pending&&snapshot&&pending.signature===JSON.stringify(snapshot)?snapshot:recoverDirectSnapshot(pending);
    render();
  }
  function completed(message){
    pending=null;retrySnapshot=null;retryAllowed=false;invalidate();status.textContent=message;
    void Promise.resolve().then(()=>window.refreshPointBalanceBadge?.()).catch(()=>{});
  }
  phone.addEventListener('input',()=>{
    if(!current()||busy||pending)return;
    invalidate();status.textContent='手機號碼已變更，請重新搜尋會員。';
  });
  root.querySelector('[data-phone-search]').addEventListener('submit',async event=>{
    event.preventDefault();if(!current()||busy||searching||pending)return;
    invalidate();const normalized=normalize(phone.value);
    if(!normalized){status.textContent='請輸入完整的台灣手機號碼，例如 0912345678。';phone.focus();return;}
    const lookupRevision=revision,raw=phone.value;searching=true;render();status.textContent='正在搜尋會員…';
    try{
      const result=await window.fetchAPI('getStorePointCustomer',{customerUserId:normalized,customerPhone:normalized},true);
      if(!current()||revision!==lookupRevision||phone.value!==raw)return;
      // core.fetchAPI unwraps successful responses; reject explicit errors before unwrapping.
      if(!result||typeof result!=='object'||Array.isArray(result)||result.success===false||result.error)throw Error(result?.error||'查無會員，請確認手機號碼。');
      const data=result.data||result;
      if(typeof data!=='object'||Array.isArray(data))throw Error('會員資料回應格式不正確，請稍後再試。');
      if(data.canAdjust===false||data.needsBinding||data.needsSelection)throw Error(data.message||'此手機尚未確認唯一會員，請確認會員綁定後再試。');
      const id=data.customerPointUserId||data.canonicalUserId||data.customerUserId;
      if(!/^U[0-9a-fA-F]{20,64}$/.test(id||''))throw Error('此手機尚未綁定可贈點的會員。');
      if(rewardOnly&&(!/^rwd_[0-9a-f]{64}$/.test(data.rewardScanToken||'')||!Number.isFinite(data.rewardScanExpiresAt)||data.rewardScanExpiresAt<=Date.now()))throw Error('會員驗證已失效，請重新搜尋。');
      customer={id,phone:normalized,name:String(data.name||'會員')};
      receipt=rewardOnly?{token:data.rewardScanToken,expiresAt:data.rewardScanExpiresAt}:null;
      root.querySelector('[data-member-name]').textContent=customer.name;
      root.querySelector('[data-member-phone]').textContent=data.phone||normalized;
      member.hidden=false;status.textContent='已找到會員，請核對後輸入贈送點數。';
    }catch(error){if(current()&&revision===lookupRevision)status.textContent=error.message||'搜尋失敗，請稍後重試。';}
    finally{searching=false;if(current()){render();if(customer)points.focus();}}
  });
  async function submit(snapshot){
    if(!current()||busy)return;
    busy=true;retryAllowed=false;render();status.textContent='正在送出贈點，請勿重複操作…';
    try{
      const result=await window.submitSafeCashier(snapshot);
      if(!current())return;
      if(result?.success!==true)throw Error(result?.error||'未能確認贈點結果，請查詢原交易。');
      completed('已成功贈送 '+snapshot.rewardPoints.toLocaleString('zh-TW')+' 點。');
    }catch(error){
      if(!current())return;
      status.textContent=error.message||'未能確認贈點結果，請查詢原交易。';
      try{rememberPending(snapshot);}catch(pendingError){pending={};retrySnapshot=null;status.textContent=pendingError.message;}
      if(pending)status.textContent+=' 請先查詢原交易結果，勿重新建立贈點。';
    }finally{busy=false;if(current())render();}
  }
  root.querySelector('[data-phone-gift]').addEventListener('submit',async event=>{
    event.preventDefault();if(!current()||busy||searching||pending)return;
    if(!customer||customer.phone!==normalize(phone.value)){invalidate();status.textContent='請先搜尋並核對會員。';phone.focus();return;}
    if(rewardOnly&&(!receipt||receipt.expiresAt<=Date.now())){invalidate();status.textContent='會員驗證已過期，請重新搜尋會員。';phone.focus();return;}
    const raw=points.value.trim(),value=Number(raw);
    if(!/^\d+$/.test(raw)||!Number.isSafeInteger(value)||value<1||value>1000000){status.textContent='贈送點數請填 1 至 1,000,000 的整數。';points.focus();return;}
    const snapshot={customerUserId:customer.id,mode:'reward',amount:value,rewardPoints:value,deductPoints:0,...(rewardOnly?{rewardScanToken:receipt.token}:{})};
    await submit(snapshot);
  });
  check.addEventListener('click',async()=>{
    if(!current()||busy||!pending)return;
    busy=true;render();status.textContent='正在查詢原交易結果…';
    try{
      const result=await window.checkPendingCashier();
      if(!current())return;
      const state=result?.transactionStatus;
      if(['succeeded','failed'].includes(state)){
        completed(result.success?'原交易已完成，請勿重複贈點。':'原交易未完成，請重新搜尋會員後再操作。');
      }else{
        retryAllowed=state==='not_found'&&!!retrySnapshot;
        status.textContent=retryAllowed?'原交易尚未建立，可重送原贈點；會員與點數不會變更。':(result?.displayMessage||result?.error||'原交易尚待確認，請稍後再查詢。');
        if(state==='not_found'&&!retrySnapshot)status.textContent='原交易尚未建立。這不是可恢復的電話贈點，請返回原收銀操作查詢；本視窗不會建立第二筆交易。';
      }
    }catch(error){if(current())status.textContent=error.message||'原交易查詢失敗，請稍後重試。';}
    finally{busy=false;if(current())render();}
  });
  retry.addEventListener('click',()=>{if(current()&&retryAllowed&&retrySnapshot&&!busy)void submit(retrySnapshot);});
  try{rememberPending(null);}catch(error){pending={};status.textContent=error.message;render();}
  if(pending&&!status.textContent)status.textContent=retrySnapshot?'原交易會員：'+retrySnapshot.customerUserId+'；贈送 '+retrySnapshot.rewardPoints.toLocaleString('zh-TW')+' 點。請先查詢原交易結果。':'尚有一筆交易等待確認，請先查詢原交易結果。';
  if(!pending)phone.focus();
  return {isBusy:()=>busy,dispose(){disposed=true;revision++;customer=null;receipt=null;retrySnapshot=null;root.replaceChildren();}};
}
