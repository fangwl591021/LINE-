// Persist before sending. A retry keeps its original ID; status checks never write points.
(() => {
 let running=false;
 window.callSafeCashier=async(action,payload)=>{
  if(!['storeAdjustCustomerPoints','getStoreCashierRequest','getStoreShopRedemptionProduct','getStorePointCustomer'].includes(action))throw Error('不支援的收銀操作');
  const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
  if(!token)throw Error('請先透過 LINE 登入');
  const base=window.Config?.WORKER_URL||(typeof Config!=='undefined'?Config.WORKER_URL:'');
  if(!base)throw Error('收銀服務尚未就緒');
  const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:{...payload,lineAccessToken:token}}),signal:AbortSignal.timeout(25000)});
  const data=await response.json();
  if(!response.ok)throw Error(data?.error||'收銀服務無法連線，請查詢原交易');
  return data;
 };
 const key=()=>{
  const id=window.currentUserProfile?.userId;
  if(!id) throw Error('請先登入');
  return 'ACTMASTER_CASHIER_PENDING_V1:'+id;
 };
 const read=k=>JSON.parse(localStorage.getItem(k)||'null');
 const message=r=>r?.error||'未能確認交易結果，請查詢原交易';
 window.lookupPendingCashier=async()=>{
  const saved=read(key());if(!saved) return {success:false,error:'沒有待查交易',transactionStatus:'none'};
  return window.callSafeCashier('getStoreCashierRequest',{requestId:saved.requestId});
 };
 window.submitSafeCashier=async payload=>{
  if(running) throw Error('交易正在處理，請勿重複送出');
  running=true;
  try {
   const ownerKey=key();
   // A fresh cashier session does not change the business meaning of a retry.
   const {cashierSessionId,...business}=payload;
   const signature=JSON.stringify(business);
   let saved=read(ownerKey),result;
   if(saved) {
    result=await window.callSafeCashier('getStoreCashierRequest',{requestId:saved.requestId});
    if(key()!==ownerKey)throw Error('登入帳號已變更，請重新查詢');
    if(['succeeded','failed'].includes(result?.transactionStatus)) {
     localStorage.removeItem(ownerKey);
     if(saved.signature!==signature) throw Error('上一筆交易已確認，請檢查紀錄後再次確認本筆內容');
     if(result.success) return result;
     throw Error(message(result));
    }
    if(result?.transactionStatus!=='not_found') throw Error(message(result)+'（交易 '+saved.requestId+'）');
    if(saved.signature!==signature) throw Error('尚有待查交易，請先以原內容完成查單');
   } else {
    saved={requestId:crypto.randomUUID(),signature,payload:business};
    localStorage.setItem(ownerKey,JSON.stringify(saved));
   }
   if(key()!==ownerKey) throw Error('登入帳號已變更，請重新開啟收銀');
   result=await window.callSafeCashier('storeAdjustCustomerPoints',{...saved.payload,requestId:saved.requestId});
   if(['succeeded','failed','rejected'].includes(result?.transactionStatus)) localStorage.removeItem(ownerKey);
   if(key()!==ownerKey)throw Error('登入帳號已變更，請重新查詢');
   if(result?.success!==true) throw Error(message(result));
   return result;
  } finally {running=false;}
 };
 window.checkPendingCashier=async()=>{
  try {
   const ownerKey=key(),saved=read(ownerKey),result=await window.lookupPendingCashier();
   if(key()!==ownerKey)throw Error('登入帳號已變更，請重新查詢');
   if(['succeeded','failed'].includes(result?.transactionStatus)) localStorage.removeItem(ownerKey);
   if(result?.success)window.resetStorePointCashier?.();
   const text=(result?.success?'交易已完成；請查看收銀紀錄。':message(result))+(saved?'\n交易編號：'+saved.requestId:'');
   window.showToast?.(text,!result?.success);
   const el=document.getElementById('store-point-preview');if(el) el.textContent=text;
   return {...result,displayMessage:text};
  }catch(error){window.showToast?.(error.message,true);return {success:false,error:error.message};}
 };
})();
