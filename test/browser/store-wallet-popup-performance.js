// Local synthetic timing test. 4-second summary delay is injected, not production latency.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local test only');
 const {openStoreWalletPopup:open,prepareStoreWalletQr:prepare}=await import('/js/modules/store-wallet-popup.js?v=4&timing='+Date.now());
 const owner='U'+'b'.repeat(32),uid='U'+'a'.repeat(32);
 const data={source:'mother',balance:13217,walletDisplayOwner:owner,queriedLineUserId:uid,loadedAt:Date.now()};
 window.currentUserProfile={userId:owner};window.currentPage='store-shop';window.pointWalletStatus='ready';window.liff.isLoggedIn=()=>true;
 const check=(v,m)=>{if(!v)throw Error(m);};
 const until=async(fn)=>{for(let i=0;i<650;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timing test timeout');};
 const modal=()=>document.querySelector('.store-wallet-popup');const close=()=>modal().querySelector('[data-close]').click();
 window.pointWalletData={...data,loadedAt:Date.now()};let reads=0;
 window.fetchPointWalletData_=()=>{throw Error('ledger must not load');};
 window.fetchAPI=async action=>{check(action==='queryPointBalanceFast','wrong query');reads++;await new Promise(r=>setTimeout(r,4000));return {...data,balance:13117};};
 await prepare();check(reads===0,'preparing QR must not query points');
 const start=performance.now();open();open();
 check(!!modal().querySelector('svg'),'prepared QR must be synchronous');
 check(modal().querySelector('[data-balance]').textContent==='更新點數中…','QR must be first');
 const firstQrMs=Math.round(performance.now()-start);
 await until(()=>modal()?.querySelector('[data-balance]').textContent==='13,217 點');
 const previewMs=Math.round(performance.now()-start);
 check(previewMs<1000&&modal().textContent.includes('上次確認點數'),'preview must not await network or imply fresh');
 await until(()=>modal()?.querySelector('[data-balance]').textContent==='13,117 點');
 check(reads===1,'duplicate query');const freshMs=Math.round(performance.now()-start);close();
 window.fetchAPI=async()=>{await new Promise(r=>setTimeout(r,80));throw Error('offline');};open();
 await until(()=>modal()?.textContent.includes('更新失敗'));
 check(!!modal().querySelector('svg')&&!/13,\d{3}/.test(modal().textContent),'offline must not claim fresh numeric points');close();
 // Invalid cached identities never generate a QR before the response.
 for(const bad of [{...data,loadedAt:Date.now()-61000},{...data,loadedAt:Date.now()+100000},{...data,walletDisplayOwner:uid},{...data,queriedLineUserId:'invalid'},{...data,balance:null}]){
  const isolated=await import('/js/modules/store-wallet-popup.js?v=4&invalid='+Math.random());
  window.pointWalletData=bad;let resolve;window.fetchAPI=()=>new Promise(r=>resolve=r);isolated.openStoreWalletPopup();
  await new Promise(r=>setTimeout(r,40));check(!modal().querySelector('svg'),'unsafe cache displayed');
  resolve(data);await until(()=>modal()?.querySelector('svg'));close();
 }
 window.pointWalletData=null;
 return {simulatedSummaryDelay:4000,firstQrMs,previewMs,freshMs,qrBeforeBalance:true,summaryOnly:true,staleAndForeignCacheRejected:true,offlineLabel:true,oneRequest:true};
}
