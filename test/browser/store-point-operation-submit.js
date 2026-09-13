// Pass the original js/modules/safe-cashier.js source as the argument.
// Local fake responses only; actual network and real point transactions are forbidden.
async(safeSource)=>{
 if(location.origin!=='http://127.0.0.1:8794'||!safeSource.includes('window.submitSafeCashier='))throw Error('Local synthetic test only');
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const until=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Cashier submit UI timeout');};
 const fixture=await(await fetch('/test-cashier-fixture')).json();
 document.querySelector('.store-point-operation')?.close();document.getElementById('test-cashier-source')?.remove();
 const source=document.createElement('section');source.id='test-cashier-source';source.hidden=true;
 source.innerHTML='<style>.hidden{display:none!important}</style>'+fixture.panel+fixture.scanner+'<div id="toast-container"></div>';document.body.append(source);
 const owner='U'+'a'.repeat(32),customer='U'+'b'.repeat(32),key='ACTMASTER_CASHIER_PENDING_V1:'+owner;
 const previous=localStorage.getItem(key),originalFetch=window.fetch;localStorage.removeItem(key);
 window.testToken='a';window.currentUserProfile={userId:owner};window.currentUser={userId:owner,role:'store'};window.hasAdminRights=false;
 window.escapeHTML=value=>String(value??'');window.showToast=message=>document.getElementById('toast-container').textContent=String(message);
 (0,eval)(fixture.auth);(0,eval)(safeSource);
 const unexpected=[],calls=[];let release,reject,activeRequest;
 window.fetch=async()=>{unexpected.push('fetch');throw Error('Network forbidden in synthetic submit test');};
 window.fetchAPI=async()=>{unexpected.push('fetchAPI');throw Error('API forbidden in synthetic submit test');};
 window.loadStorePointCashierLogs=async()=>{};window.refreshPointBalanceBadge=async()=>{};
 window.callSafeCashier=async(action,payload)=>{
  calls.push({action,payload});
  if(action==='getStoreCashierRequest'){
   check(payload.requestId===activeRequest,'Recovery must use original request ID');
   return {success:true,transactionStatus:'succeeded',data:{customerPointSource:'mother',changedPoints:10}};
  }
  check(action==='storeAdjustCustomerPoints','Unexpected synthetic action');activeRequest=payload.requestId;
  return new Promise((yes,no)=>{release=yes;reject=no;});
 };
 const dialog=()=>document.querySelector('.store-point-operation[open]');
 const input=document.getElementById('store-point-customer'),submit=document.getElementById('btn-store-point-submit');
 async function prepare(mode){
  if(!dialog()){await openStoreShop('','','','cashier');await until(dialog);}
  const modal=dialog();modal.querySelector('[data-method="phone"]').click();
  input.value=customer;window.renderStorePointCustomer({customerPointUserId:customer,name:'合成測試會員',balance:900,canAdjust:true,avatarUrl:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'});
  document.querySelector('input[name="store-point-mode"][value="'+mode+'"]').checked=true;
  document.getElementById('store-point-amount').value='100';document.getElementById('store-point-deduct').value='10';
  window.updateStorePointPreview();return modal;
 }
 try{
  for(const mode of ['redeem','reward']){
   const modal=await prepare(mode),before=calls.length;release=null;
   submit.click();submit.click();await until(()=>!!release);
   check(calls.length===before+1&&submit.disabled,'Double click must send one simulated request');
   const sent=calls.at(-1).payload;check(sent.customerUserId===customer&&sent.mode===mode&&sent.amount===100,'Original submit must preserve customer and mode');
   modal.querySelector('[data-close]').click();check(modal.open,'Cannot dismiss an in-flight submit');
   release({success:true,transactionStatus:'succeeded',data:{mode,changedPoints:10,payableAmount:90,customerPointSource:'mother'}});
   await until(()=>!submit.disabled&&!modal.querySelector('[data-choices]').hidden);
   check(!window.storePointCustomer&&!input.value&&!localStorage.getItem(key),'Success clears customer and pending request');
   check(document.getElementById('toast-container').textContent.includes(mode==='reward'?'消費贈點':'折抵'),'Original completion message must remain visible');
  }
  let modal=await prepare('redeem');release=null;submit.click();await until(()=>!!release);
  release({success:false,transactionStatus:'failed',error:'合成測試拒絕'});await until(()=>!submit.disabled);
  check(document.getElementById('store-point-preview').textContent.includes('合成測試拒絕'),'Failure message missing');
  check(input.value===customer&&modal.querySelector('[data-choices]').hidden,'Failure keeps customer and form for review');
  check(!localStorage.getItem(key),'Confirmed failure clears pending request');
  release=null;submit.click();await until(()=>!!release);reject(Error('合成逾時'));await until(()=>!submit.disabled);
  check(!!localStorage.getItem(key),'Uncertain result must preserve pending request');
  const writeCount=calls.filter(c=>c.action==='storeAdjustCustomerPoints').length;
  const pendingButton=[...modal.querySelectorAll('button')].find(b=>b.textContent.includes('查詢待確認交易'));
  check(!!pendingButton,'Pending lookup must remain available');pendingButton.click();
  await until(()=>!localStorage.getItem(key));
  check(calls.filter(c=>c.action==='storeAdjustCustomerPoints').length===writeCount,'Recovery must not issue a second simulated transaction');
  check(document.getElementById('toast-container').textContent.includes('交易已完成'),'Recovered receipt must be visible');
  check(unexpected.length===0,'Synthetic flow must not make any network call');
  return {passed:true,redeem:true,reward:true,doubleClickGuard:true,failureRetainsForm:true,pendingRecoveryWithoutResubmit:true,simulatedSubmissions:writeCount,realNetworkCalls:0};
 }finally{
  submit.disabled=false;dialog()?.close();window.fetch=originalFetch;
  if(previous===null)localStorage.removeItem(key);else localStorage.setItem(key,previous);
 }
}
