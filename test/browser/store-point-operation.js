// Synthetic localhost only. Reuses the real cashier markup and auth definitions; never sends points.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Synthetic localhost only');
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const until=async(fn,label='UI')=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error(label+' timeout');};
 const fixture=await(await fetch('/test-cashier-fixture')).json();
 check(fixture.panel&&fixture.scanner&&fixture.auth,'Cashier fixture missing');
 document.querySelector('.store-point-operation')?.close();
 document.getElementById('test-cashier-source')?.remove();
 const source=document.createElement('section');source.id='test-cashier-source';source.hidden=true;
 source.innerHTML='<style>.hidden{display:none!important}</style>'+fixture.panel+fixture.scanner+'<div id="toast-container"></div>';
 document.body.append(source);
 const owner='U'+'a'.repeat(32),customer='U'+'b'.repeat(32);
 window.testToken='a';window.currentUserProfile={userId:owner};window.currentUser={userId:owner,role:'store'};window.hasAdminRights=false;
 window.escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 window.showToast=message=>{document.getElementById('toast-container').textContent=String(message);};
 (0,eval)(fixture.auth);
 let scans=0,writes=0;const calls=[],unexpected=[],apiReads=[];
 window.fetchAPI=async(action,payload)=>{
  calls.push(action);
  if(action!=='getStorePointCustomer'){unexpected.push(action);throw Error('Unexpected cashier action: '+action);}
  check(payload.customerUserId==='0912345678'||payload.customerUserId===customer,'Unexpected customer identity');
  return {success:true,data:{customerPointUserId:customer,name:'本機測試購買者',phone:'0912345678',balance:900,canAdjust:true,balanceSource:'mother',avatarUrl:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'}};
 };
 window.submitSafeCashier=async()=>{writes++;throw Error('Point writes forbidden in this test');};
 window.openStorePointScanner=async()=>{scans++;document.getElementById('store-point-scanner-modal').classList.remove('hidden');};
 const originalFetch=window.fetch;
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin!==location.origin)throw Error('External requests forbidden');
  if(url.pathname.startsWith('/v1/')){apiReads.push(url.pathname);throw Error('No catalog or wallet query belongs on cashier entry');}
  if(String(options.method||'GET').toUpperCase()!=='GET')throw Error('HTTP writes forbidden');
  return originalFetch(input,options);
 };
 const dialog=()=>document.querySelector('.store-point-operation[open]');
 const panel=document.getElementById('store-point-cashier'),scanner=document.getElementById('store-point-scanner-modal');
 const toast=document.getElementById('toast-container'),input=document.getElementById('store-point-customer');
 const submit=document.getElementById('btn-store-point-submit');
 const originalParent=panel.parentNode,scannerParent=scanner.parentNode,toastParent=toast.parentNode;
 let passed=false;
 try{
  await openStoreShop('','','','cashier');await until(dialog,'Cashier dialog');
  let modal=dialog();
  check(currentPage==='store-shop','Cashier must remain in mall');
  check(modal.getBoundingClientRect().left>=0&&modal.getBoundingClientRect().right<=innerWidth,'Chooser must fit viewport');
  check(modal.textContent.includes('請選擇確認會員身分的方式'),'Identity chooser missing');
  check(source.contains(panel)&&source.contains(scanner),'Chooser must not move form before selection');
  check(calls.length===0&&apiReads.length===0&&writes===0,'Opening must not read or write points/catalog');
  modal.querySelector('[data-method="phone"]').click();
  check(modal.contains(panel)&&modal.contains(scanner)&&modal.contains(toast),'Original cashier/scanner/toast must share dialog top layer');
  check(document.querySelectorAll('#store-point-customer').length===1&&document.getElementById('store-point-customer')===input,'Must reuse unique original input');
  check(document.activeElement===input,'Phone choice must focus existing input');
  check(modal.getBoundingClientRect().left>=0&&modal.getBoundingClientRect().right<=innerWidth,'Cashier modal must fit viewport');
  check(modal.querySelector('.store-point-operation-scroll').scrollWidth<=modal.querySelector('.store-point-operation-scroll').clientWidth,'Cashier content must not overflow horizontally');
  check(!document.getElementById('store-point-cashier-body').classList.contains('hidden'),'Cashier body must expand');
  check(calls.length===0&&scans===0&&writes===0,'Phone selection must not automatically query/scan/submit');
  check(modal.textContent.includes('查詢待確認交易'),'Pending transaction lookup must remain available');
  input.value='0912345678';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  await until(()=>document.getElementById('store-point-customer-name').textContent==='本機測試購買者','Mock customer');
  check(window.storePointCustomer?.customerPointUserId===customer,'Lookup must bind returned member identity');
  check(document.getElementById('store-point-customer-balance').textContent.includes('900'),'Mock member balance missing');
  submit.disabled=true;
  modal.querySelector('[data-back]').click();check(modal.open&&modal.querySelector('[data-choices]').hidden,'Pending submit must block back');
  modal.querySelector('[data-close]').click();check(modal.open,'Pending submit must block close');
  check(modal.querySelector('[data-status]').textContent.includes('交易處理中'),'Busy state should explain why it cannot close');
  submit.disabled=false;modal.querySelector('[data-back]').click();
  check(!modal.querySelector('[data-choices]').hidden&&!input.value&&!window.storePointCustomer,'Back must clear previous customer');
  modal.querySelector('[data-method="scan"]').click();check(scans===1&&!scanner.classList.contains('hidden'),'Scan option must open existing scanner once');
  modal.dispatchEvent(new Event('cancel',{cancelable:true}));check(modal.open&&scanner.classList.contains('hidden'),'First Escape must dismiss scanner only');
  modal.dispatchEvent(new Event('cancel',{cancelable:true}));
  check(!modal.isConnected&&panel.parentNode===originalParent&&scanner.parentNode===scannerParent&&toast.parentNode===toastParent,'Closing must restore original node slots');
  check(!window.storePointCustomer&&!input.value,'Closing must clear customer identity');
  check(!document.querySelector('.store-point-operation'),'Closed dialog must be removed');
  await openStoreShop('','','','cashier');await until(dialog,'Reopened cashier');
  modal=dialog();modal.querySelector('[data-method="phone"]').click();
  let release;const immediateLookup=window.fetchAPI;
  window.fetchAPI=()=>new Promise(resolve=>release=resolve);
  input.value='0912345678';const staleLookup=window.lookupStorePointCustomer();
  window.currentUserProfile={userId:'U'+'c'.repeat(32)};
  await until(()=>!dialog(),'Account switch cleanup');
  release({success:true,data:{customerPointUserId:customer,name:'舊客戶不可回填',balance:900}});
  await staleLookup;window.fetchAPI=immediateLookup;
  check(!window.storePointCustomer&&!input.value,'Late customer response must not survive account change');
  check(source.contains(panel)&&source.contains(scanner)&&source.contains(toast),'Account switch must restore original nodes');
  window.currentUserProfile={userId:owner};
  await openStoreShop('','','','cashier');await until(dialog,'Remount source');
  const previousDialog=dialog();previousDialog.querySelector('[data-method="phone"]').click();
  await openStoreShop('','','','mine');await until(()=>!previousDialog.isConnected,'Mall remount cleanup');
  check(source.contains(panel)&&!dialog(),'Replacing mall on same root must close previous cashier');
  await openStoreShop('','','','cashier');await until(dialog,'Rapid remount source');
  const rapidPrevious=dialog();
  await openStoreShop('','','','cashier');
  await until(()=>dialog()&&dialog()!==rapidPrevious,'Rapid remount replacement');
  check(!rapidPrevious.isConnected&&document.querySelectorAll('.store-point-operation').length===1,'Stale popup cannot swallow a new cashier entry');
  dialog().querySelector('[data-close]').click();
  window.testToken='b';window.currentUserProfile={userId:customer};window.currentUser={userId:customer,role:'user'};
  await openStoreShop('','','','cashier');
  await until(()=>document.getElementById('page-store-shop').textContent.includes('沒有會員贈扣點操作權限'),'Role rejection');
  check(!dialog()&&source.contains(panel),'Ordinary member must not open cashier');
  check(unexpected.length===0&&apiReads.length===0&&writes===0,'Only explicit mock customer lookup is allowed');
  check(document.documentElement.scrollWidth<=innerWidth,'Page must not overflow viewport');
  passed=true;
  return {passed:true,width:innerWidth,explicitCustomerLookups:calls.length,pointWrites:writes,catalogOrWalletReads:apiReads.length,reusedOriginalNodes:true,phoneFocus:true,scanOption:true,busyGuard:true,scannerEscapeFirst:true,restoredOnClose:true,accountIsolation:true,staleLookupIgnored:true,ordinaryMemberRejected:true};
 }finally{
  submit.disabled=false;document.querySelector('.store-point-operation')?.close();window.fetch=originalFetch;
  if(passed){window.testToken='a';window.currentUserProfile={userId:owner};window.currentUser={userId:owner,role:'store'};}
 }
}
