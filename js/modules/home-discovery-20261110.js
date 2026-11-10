(function(){
  'use strict';
  const supported=['食','服務','購','宿','遊','行','製造'];
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
})();
