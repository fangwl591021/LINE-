(function() {
  let pending;
  function load() {
    if (window.StoreShop) return Promise.resolve();
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      if (!document.getElementById('store-shop-css')) {
        const css = document.createElement('link');
        css.id = 'store-shop-css'; css.rel = 'stylesheet'; css.href = 'css/store-shop.css?v=27';
        document.head.appendChild(css);
      }
      const script = document.createElement('script');
      script.src = 'js/modules/store-shop.js?v=45';
      const timer = setTimeout(() => finish(new Error('商城載入逾時，請重試')), 15000);
      function finish(error) {
        clearTimeout(timer); script.onload = script.onerror = null;
        if (error) { script.remove(); pending = null; reject(error); } else resolve();
      }
      script.onload = () => finish(window.StoreShop ? null : new Error('商城載入失敗'));
      script.onerror = () => finish(new Error('商城載入失敗，請確認網路後重試'));
      document.head.appendChild(script);
    });
    return pending;
  }
  window.openStoreShop = async function(productId = '', qrToken = '', memberProduct = '', section = '', shopId = '') {
    if (typeof productId !== 'string') productId = '';
    window.goPage('store-shop');
    const root = document.getElementById('page-store-shop');
    root.innerHTML = '<p role="status">商城載入中…</p><button type="button" onclick="window.goPage(\'home\')">返回首頁</button>';
    try {
      if (section === 'store' && !(window.StoreInviteRoute?.isShopId?.(shopId) ?? (typeof shopId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId)))) throw new Error('商城連結格式不正確，請向店家取得新的邀請網址');
      await load();
      if (window.currentPage === 'store-shop') window.StoreShop.mount(root, false, productId, qrToken, memberProduct, section, shopId);
    } catch(error) {
      if (window.currentPage !== 'store-shop') return;
      root.querySelector('p').textContent = error.message;
      const retry = document.createElement('button');
      retry.textContent = '重新載入'; retry.onclick = () => window.openStoreShop(productId, qrToken, memberProduct, section, shopId); root.appendChild(retry);
    }
  };
})();
