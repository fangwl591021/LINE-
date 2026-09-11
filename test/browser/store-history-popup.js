// Local synthetic fixture only. No production point reads or writes.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local only');
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};
 const until=async(fn)=>{for(let i=0;i<180;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('History test timeout');};
 const owner='U'+'b'.repeat(32),uid='U'+'a'.repeat(32);
 window.currentUserProfile={userId:owner};window.liff.isLoggedIn=()=>true;
 const cache={balance:123,list:['unchanged'],loadedAt:123};window.pointWalletData=cache;
 let calls=0,finish;
 window.fetchAPI=(action)=>{check(action==='queryUserPoints','extra query');calls++;return new Promise(r=>finish=r);};
 window.loadPointsWallet=window.fetchPointWalletData_=()=>{throw Error('full wallet must not load');};
 await window.openStoreShop();await until(()=>document.querySelector('[data-do="mine"]'));
 document.querySelector('[data-do="mine"]').click();
 const entry=document.querySelector('[data-do="spending-history"]');entry.focus();
 check(calls===0,'eager history query');entry.click();entry.click();
 const dialog=()=>document.querySelector('.store-history-popup');
 await until(()=>calls===1);check(document.querySelectorAll('.store-history-popup').length===1,'double dialog');
 check(window.currentPage==='store-shop'&&document.querySelector('#page-store-shop').dataset.shopView==='mine','navigated away');
 const rows=Array.from({length:30},(_,i)=>({event_name:i?'簽到贈點':'<img src=x onerror=alert(1)> 消費折抵',get_point:i?10:-800,event_content:'來源：測試店；消費 8800，折抵 800 點；'+('long-text-'.repeat(15)),created_at:'2026-09-10 16:43'}));
 const data={queriedLineUserId:uid,list:rows};finish(data);
 await until(()=>dialog()?.querySelectorAll('article').length===30);
 check(!dialog().querySelector('img')&&dialog().textContent.includes('<img'),'unsafe HTML');
 check(dialog().textContent.includes('-800')&&dialog().textContent.includes('+10'),'missing point signs');
 check(window.pointWalletData===cache&&!document.querySelector('.store-wallet-popup'),'wallet side effects');
 const scroll=dialog().querySelector('.store-history-scroll');scroll.scrollTop=scroll.scrollHeight;
 const r=dialog().getBoundingClientRect(),close=dialog().querySelector('[data-close]').getBoundingClientRect();
 check(r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight+1,'dialog overflow');
 check(scroll.scrollWidth<=scroll.clientWidth,'row overflow');
 check(close.top>=r.top&&close.bottom<=r.bottom,'close not visible after scrolling');
 dialog().querySelector('[data-close]').click();check(!dialog()&&document.activeElement===entry,'close/focus');
 // Error vs. empty state and retry; never show old rows as a fresh result.
 window.fetchAPI=async()=>({error:'offline'});entry.click();await until(()=>dialog()?.textContent.includes('暫時無法'));
 check(!dialog().textContent.includes('目前沒有'),'error masquerades as empty');
 window.fetchAPI=async()=>({...data,list:[]});dialog().querySelector('[data-refresh]').click();await until(()=>dialog()?.textContent.includes('目前沒有'));
 dialog().dispatchEvent(new Event('cancel',{cancelable:true}));check(!dialog(),'escape close');
 // Late response after closing and account changes must not paint records.
 window.fetchAPI=()=>new Promise(r=>finish=r);finish=null;entry.click();await until(()=>finish);
 dialog().querySelector('[data-close]').click();finish(data);await new Promise(r=>setTimeout(r,30));check(!dialog(),'late result reopened');
 window.fetchAPI=()=>new Promise(r=>finish=r);finish=null;entry.click();await until(()=>finish);window.currentUserProfile={userId:uid};finish(data);await until(()=>!dialog());
 window.currentUserProfile={userId:owner};
 return {width:innerWidth,oneQuery:true,noNavigation:true,walletUnchanged:true,rows:30,escapedText:true,scrollAndClose:true,retryAndEmpty:true,lateAndForeignIgnored:true};
}
