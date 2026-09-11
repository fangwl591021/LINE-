// Read-only storefront popup. The canonical points UID comes from the wallet query.
let activeDialog;
let qrLibrary,preparedQr;
const CACHE_MAX_AGE=60000;
function verifiedWallet(data,owner){
  return !!owner&&data?.walletDisplayOwner===owner&&data.balance!==null&&data.balance!==undefined&&
    Number.isFinite(Number(data.balance))&&/^U[0-9a-fA-F]{20,64}$/.test(String(data.queriedLineUserId||'').trim());
}
function loadQrLibrary(){
  if(!qrLibrary)qrLibrary=import('../vendor/qrcode-generator-2.0.4.mjs').catch(error=>{qrLibrary=null;throw error;});
  return qrLibrary;
}
function recentWallet(owner){
  const data=window.pointWalletData,age=Date.now()-Number(data?.loadedAt||0);
  return window.pointWalletStatus==='ready'&&age>=0&&age<CACHE_MAX_AGE&&verifiedWallet(data,owner)?data:null;
}
function makeQr(module,data,owner){
  const uid=String(data.queriedLineUserId).trim();
  if(preparedQr?.owner===owner&&preparedQr.uid===uid)return preparedQr.svg;
  const qr=module.default(0,'M');qr.addData(uid,'Byte');qr.make();
  const svg=qr.createSvgTag({cellSize:4,margin:16,scalable:true});
  preparedQr={owner,uid,svg};return svg;
}
export async function prepareStoreWalletQr(){
  const owner=window.currentUserProfile?.userId;
  if(!owner||!window.liff?.isLoggedIn?.()){preparedQr=null;return;}
  const module=await loadQrLibrary();
  if(owner!==window.currentUserProfile?.userId)return;
  const data=recentWallet(owner);
  if(data)makeQr(module,data,owner);else preparedQr=null;
}

export function openStoreWalletPopup({isCurrent=()=>true,standalone=false}={}) {
  if(activeDialog?.open){activeDialog.querySelector('[data-close]').focus();return;}
  const owner=window.currentUserProfile?.userId;
  const opener=document.activeElement;
  const modal=document.createElement('dialog');
  modal.className='store-wallet-popup';
  modal.setAttribute('aria-labelledby','store-wallet-popup-title');
  modal.innerHTML='<button type="button" data-close aria-label="關閉點數視窗">×</button><h2 id="store-wallet-popup-title">我的共用點數</h2><div data-qr role="img" aria-label="本人點數 QR 碼" hidden></div><p data-balance aria-live="polite">更新點數中…</p><p data-status role="status">正在準備本人 QR 碼</p><button type="button" data-retry hidden>重新讀取</button>';
  document.body.append(modal);
  activeDialog=modal;
  let revision=0,closed=false,timer,timeout;
  const balance=modal.querySelector('[data-balance]');
  const qrBox=modal.querySelector('[data-qr]');
  const status=modal.querySelector('[data-status]');
  const retry=modal.querySelector('[data-retry]');
  const current=()=>!closed&&modal.open&&isCurrent()&&owner===window.currentUserProfile?.userId;
  function cleanup(){
    if(closed)return;
    closed=true;++revision;clearInterval(timer);clearTimeout(timeout);
    qrBox.replaceChildren();balance.textContent='';
    modal.remove();if(activeDialog===modal)activeDialog=null;
    if(isCurrent()&&opener?.isConnected)opener.focus();
  }
  function close(){modal.close();cleanup();}
  modal.querySelector('[data-close]').onclick=close;
  modal.addEventListener('close',cleanup,{once:true});
  modal.addEventListener('cancel',event=>{event.preventDefault();close();});
  modal.addEventListener('click',event=>{
    if(event.target!==modal)return;
    const rect=modal.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();
  });
  async function refresh(){
    if(!current())return;
    const ticket=++revision;
    qrBox.replaceChildren();qrBox.hidden=true;retry.hidden=true;
    balance.textContent='更新點數中…';status.textContent='正在讀取本人點數與 QR 碼';
    let showedCache=false,freshReceived=false;
    let cachedPaint=Promise.resolve();
    try{
      if(standalone||!owner||!window.liff?.isLoggedIn?.()||typeof window.fetchPointWalletData_!=='function'){
        balance.textContent='請先登入';
        status.textContent='請從 LINE 登入原系統後，開啟商城查看本人點數與 QR 碼。';
        return;
      }
      // Load QR code in parallel, rather than starting its download after the wallet query.
      const library=loadQrLibrary().catch(()=>null);
      const paint=async(data,preview=false)=>{
        const uid=String(data.queriedLineUserId).trim();
        let svg=preparedQr?.owner===owner&&preparedQr.uid===uid?preparedQr.svg:'';
        if(!svg){
          const module=await library;
          if(!current()||ticket!==revision||(preview&&freshReceived))return;
          if(!module)throw new Error('QR unavailable');
          svg=makeQr(module,data,owner);
        }
        if(!current()||ticket!==revision||(preview&&freshReceived))return;
        if(qrBox.hidden||qrBox.dataset.uid!==uid)qrBox.innerHTML=svg;
        qrBox.dataset.uid=uid;
        qrBox.hidden=false;
        status.textContent='QR 已就緒，可供店家掃描；點數更新中…';
        if(preview){showedCache=true;return;}
        // Give the QR a painted frame before displaying even an immediately resolved balance.
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        if(!current()||ticket!==revision)return;
        balance.textContent=Number(data.balance).toLocaleString('zh-TW')+' 點';
        status.textContent='請店家掃描此 QR 碼';
      };
      const cached=recentWallet(owner);
      if(cached){
        // Copy the fields: an in-flight refresh must not mutate the preview.
        cachedPaint=paint({...cached},true).catch(()=>{});
      }
      // Preserve the authoritative query; the preview never authorizes a debit.
      const data=await Promise.race([
        window.fetchPointWalletData_(true),
        new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('timeout')),15000);})
      ]);
      clearTimeout(timeout);
      if(!current()||ticket!==revision)return;
      if(!verifiedWallet(data,owner))throw new Error('unverified wallet');
      freshReceived=true;
      await paint(data);
    }catch{
      clearTimeout(timeout);
      await cachedPaint;
      if(!current()||ticket!==revision)return;
      if(showedCache){
        balance.textContent='暫時無法讀取點數';
        status.textContent='本人 QR 可供掃描；點數更新失敗，請重試。';
      }else{
        qrBox.replaceChildren();qrBox.hidden=true;
        balance.textContent='暫時無法讀取';
        status.textContent='未取得已確認的本人點數，請重試。';
      }
      retry.hidden=false;
    }
  }
  retry.onclick=()=>void refresh();
  modal.showModal();
  // Clear immediately on navigation/account changes, including while a query is pending.
  timer=setInterval(()=>{if(!current())close();},200);
  void refresh();
}
