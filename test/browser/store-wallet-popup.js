// Run only against the local synthetic commerce fixture, never production.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local test only');
 const check=(v,m)=>{if(!v)throw Error(m);};
 const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Popup test timed out');};
 const {openStoreWalletPopup:open}=await import('/js/modules/store-wallet-popup.js?v=2');
 window.pointWalletData=null;
 const owner='U'+'b'.repeat(32),uid='U'+'a'.repeat(32);
 window.currentUserProfile={userId:owner};window.currentPage='store-shop';
 const options={isCurrent:()=>window.currentPage==='store-shop'};
 const data={balance:13217,walletDisplayOwner:owner,queriedLineUserId:uid};
 const modal=()=>document.querySelector('.store-wallet-popup');
 const close=()=>modal().querySelector('[data-close]').click();
 let reads=0;
 window.fetchPointWalletData_=async force=>{check(force===true,'must refresh');reads++;return data;};
 open(options);open(options);
 await until(()=>modal()?.querySelector('svg'));
 check(reads===1&&document.querySelectorAll('.store-wallet-popup').length===1,'double tap duplicates request/dialog');
 check(modal().querySelector('[data-balance]').textContent==='13,217 點','balance');
 const {default:qrcode}=await import('/js/vendor/qrcode-generator-2.0.4.mjs');
 const qr=qrcode(0,'M');qr.addData(uid,'Byte');qr.make();
 const expected=document.createElement('div');expected.innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});
 check(modal().querySelector('svg').outerHTML===expected.firstElementChild.outerHTML,'must encode canonical queried UID');
 check(window.currentPage==='store-shop','must stay on storefront');
 const bounds=modal().getBoundingClientRect();check(bounds.left>=0&&bounds.right<=innerWidth,'dialog overflow');
 close();check(!modal(),'close removes popup');
 let finish;
 window.fetchPointWalletData_=()=>new Promise(r=>finish=r);
 open(options);close();finish(data);
 await new Promise(r=>setTimeout(r,50));check(!modal(),'late query reopened popup');
 for(const bad of [null,{...data,walletDisplayOwner:uid},{...data,queriedLineUserId:'invalid'},{...data,balance:null}]){
  window.fetchPointWalletData_=async()=>bad;open(options);
  await until(()=>modal()?.querySelector('[data-retry]').hidden===false);
  check(!modal().querySelector('svg')&&!modal().querySelector('[data-balance]').textContent.includes('0 點'),'unsafe QR or fake zero');
  close();
 }
 window.fetchPointWalletData_=async()=>({...data,balance:0});open(options);
 await until(()=>modal()?.querySelector('svg'));check(modal().querySelector('[data-balance]').textContent==='0 點','confirmed zero should work');
 window.currentUserProfile={userId:uid};await until(()=>!modal());
 window.currentUserProfile={userId:owner};open(options);await until(()=>modal()?.querySelector('svg'));
 window.currentPage='home';await until(()=>!modal());window.currentPage='store-shop';
 window.fetchPointWalletData_=()=>{throw Error('public must not query');};
 open({...options,standalone:true});check(modal().textContent.includes('請先登入')&&!modal().querySelector('svg'),'public privacy');close();
 return {width:innerWidth,canonicalQr:true,freshBalance:true,noNavigation:true,doubleTap:true,lateReplyIgnored:true,identityIsolation:true,confirmedZero:true,publicLoginPrompt:true};
}
