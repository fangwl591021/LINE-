// Local synthetic timing test. 4-second query delay is injected, not production latency.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local test only');
 const {openStoreWalletPopup:open,prepareStoreWalletQr:prepare}=await import('/js/modules/store-wallet-popup.js?v=3');
 const owner='U'+'b'.repeat(32),uid='U'+'a'.repeat(32);
 const data={balance:13217,walletDisplayOwner:owner,queriedLineUserId:uid,loadedAt:Date.now()};
 window.currentUserProfile={userId:owner};window.currentPage='store-shop';window.pointWalletStatus='ready';
 const check=(v,m)=>{if(!v)throw Error(m);};
 const until=async(fn)=>{for(let i=0;i<650;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timing test timeout');};
 const modal=()=>document.querySelector('.store-wallet-popup');
 const close=()=>modal().querySelector('[data-close]').click();
 window.pointWalletData={...data,loadedAt:Date.now()};
 let reads=0;
 window.fetchPointWalletData_=async force=>{check(force===true,'authority query changed');reads++;await new Promise(r=>setTimeout(r,4000));return {...data,balance:13117};};
 await prepare();check(reads===0,'preparing QR must not query points');
 const start=performance.now();performance.mark('popup-open-after');open();open();
 check(!!modal().querySelector('svg'),'prepared QR must be inserted synchronously');
 check(modal().querySelector('[data-balance]').textContent==='更新點數中…','points appeared before QR');
 await until(()=>modal()?.querySelector('svg'));
 const firstQrMs=Math.round(performance.now()-start);performance.mark('popup-qr-after');
 performance.measure('popup-wait-after','popup-open-after','popup-qr-after');
 check(firstQrMs<1000,'fresh cache still waits for network');
 check(modal().querySelector('[data-balance]').textContent==='更新點數中…','must wait for confirmed latest points');
 check(modal().textContent.includes('QR 已就緒'),'QR readiness label missing');
 await until(()=>modal()?.querySelector('[data-balance]').textContent==='13,117 點');
 check(reads===1,'duplicate query');const freshMs=Math.round(performance.now()-start);close();
 // A failed points refresh retains the verified QR but never a stale numeric balance.
 window.pointWalletData={...data,loadedAt:Date.now()};
 window.fetchPointWalletData_=async()=>{await new Promise(r=>setTimeout(r,80));throw Error('offline');};
 open();await until(()=>modal()?.textContent.includes('更新失敗'));
 check(!!modal().querySelector('svg')&&modal().textContent.includes('暫時無法讀取點數')&&!modal().textContent.includes('13,217'),'offline QR or balance misleading');
 close();
 const invalid=[
  {...data,loadedAt:Date.now()-61000},
  {...data,loadedAt:Date.now()+100000},
  {...data,loadedAt:Date.now(),walletDisplayOwner:uid},
  {...data,loadedAt:Date.now(),queriedLineUserId:'invalid'},
  {...data,loadedAt:Date.now(),balance:null}
 ];
 for(const bad of invalid){
  window.pointWalletData=bad;let resolve;
  window.fetchPointWalletData_=()=>new Promise(r=>resolve=r);open();
  await new Promise(r=>setTimeout(r,40));
  check(!modal().querySelector('svg'),'unsafe cache displayed');
  resolve(data);await until(()=>modal()?.querySelector('svg'));close();
 }
 window.pointWalletData={...data,loadedAt:Date.now()};window.pointWalletStatus='error';
 window.fetchPointWalletData_=async()=>null;open();
 await until(()=>modal()?.querySelector('[data-retry]').hidden===false);
 check(!modal().querySelector('svg'),'error state cache displayed');close();
 window.pointWalletData=null;
 // Even a resolved query must paint QR before filling the balance.
 window.pointWalletStatus='ready';window.pointWalletData={...data,loadedAt:Date.now()};
 await prepare();window.fetchPointWalletData_=async()=>({...data,balance:42});
 open();check(!!modal().querySelector('svg')&&!modal().textContent.includes('42 點'),'QR not first');
 await Promise.resolve();check(!modal().textContent.includes('42 點'),'points updated in same microtask');
 await until(()=>modal()?.textContent.includes('42 點'));close();window.pointWalletData=null;
 return {simulatedQueryDelay:4000,firstQrMs,freshMs,qrBeforeBalance:true,preparedSynchronously:true,authoritativeQueryUnchanged:true,staleAndForeignCacheRejected:true,offlineLabel:true,oneRequest:true};
}
