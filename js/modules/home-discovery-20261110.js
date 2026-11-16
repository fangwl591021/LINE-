(function(){
  'use strict';
  const supported=['食','服務','購','宿','遊','行','製造'];
  function initHomePromos(){
    const carousel=document.getElementById('home-promo-carousel');
    if(!carousel||carousel.dataset.ready==='1')return;
    const slides=[...carousel.querySelectorAll('.home-promo-slide')];
    const controls=carousel.querySelector('.home-promo-controls');
    const dots=[...carousel.querySelectorAll('[data-promo-index]')];
    const toggle=carousel.querySelector('[data-promo-toggle]');
    if(slides.length!==7||dots.length!==slides.length||!controls||!toggle)return;
    carousel.dataset.ready='1';
    let index=0,timer=null,playing=!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const render=()=>{
      slides.forEach((slide,i)=>{slide.hidden=i!==index;});
      dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===index)));
      toggle.textContent=playing?'暫停':'播放';
      toggle.setAttribute('aria-label',playing?'暫停輪播':'播放輪播');
    };
    const restart=()=>{
      clearInterval(timer);timer=null;
      if(playing)timer=setInterval(()=>{
        if(document.hidden||document.getElementById('page-home')?.classList.contains('hidden'))return;
        index=(index+1)%slides.length;render();
      },3000);
    };
    dots.forEach((dot,i)=>dot.addEventListener('click',()=>{index=i;render();restart();}));
    toggle.addEventListener('click',()=>{playing=!playing;render();restart();});
    controls.hidden=false;render();restart();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initHomePromos,{once:true});
  else initHomePromos();
  window.openHomeShopCategory=function(category){
    const selected=supported.includes(category)?category:'';
    if(typeof window.openStoreShop!=='function'){window.showToast?.('商城尚未載入，請稍後再試',true);return;}
    return window.openStoreShop('','','','partners','',{initialCategory:selected});
  };
  window.openHomePointAction=function(){
    const role=String(window.userRole||'').trim().toLowerCase();
    if(['admin','store','reward','redeem','扣點用戶','總管','店長','贈點用戶'].includes(role))
      return window.openStoreShop?.('','','','cashier');
    return window.openPointsWallet?.();
  };

  // Reuse the storefront's owner-verified wallet QR for every role. The
  // separate point action above remains the shop cashier entry for merchants.
  let walletStylePending;
  function ensureWalletStyle(){
    if(walletStylePending)return walletStylePending;
    let link=document.getElementById('store-shop-css');
    if(link?.sheet)return Promise.resolve();
    walletStylePending=new Promise((resolve,reject)=>{
      let created=false;
      if(!link){link=document.createElement('link');link.id='store-shop-css';link.rel='stylesheet';link.href='css/store-shop.css?v=35';created=true;}
      let timer;
      const finish=error=>{
        clearTimeout(timer);link.removeEventListener('load',onload);link.removeEventListener('error',onerror);
        if(error){if(created)link.remove();walletStylePending=null;reject(error);}else resolve();
      };
      const onload=()=>finish();
      const onerror=()=>finish(new Error('wallet style unavailable'));
      link.addEventListener('load',onload,{once:true});link.addEventListener('error',onerror,{once:true});
      timer=setTimeout(()=>finish(new Error('wallet style timeout')),15000);
      if(created)document.head.appendChild(link);else if(link.sheet)finish();
    });
    return walletStylePending;
  }
  let walletOpenSequence=0;
  window.openHomeMemberQr=async function(){
    const owner=window.currentUserProfile?.userId;
    const loggedIn=()=>!!window.liff?.isLoggedIn?.();
    const token=loggedIn()?window.liff.getAccessToken?.():'';
    if(!owner||!token){window.showToast?.('請先登入 LINE，再出示我的 QR',true);return;}
    const sequence=++walletOpenSequence;
    const isCurrent=()=>sequence===walletOpenSequence&&window.currentPage==='home'&&
      window.currentUserProfile?.userId===owner&&loggedIn()&&window.liff.getAccessToken?.()===token;
    try{
      const [wallet]=await Promise.all([import('./store-wallet-popup.js?v=5'),ensureWalletStyle()]);
      if(isCurrent())wallet.openStoreWalletPopup({isCurrent});
    }catch(error){
      if(isCurrent())window.showToast?.('QR 載入失敗，請重新點選',true);
    }
  };
})();
