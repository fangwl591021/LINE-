(function() {
  let pending, opening = 0;
  function load(requirePublicProduct = false) {
    if (window.StoreShop && (!requirePublicProduct || window.StoreShop.supportsPublicProductTarget === true)) return Promise.resolve();
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      if (!document.getElementById('store-shop-css')) {
        const css = document.createElement('link');
        css.id = 'store-shop-css'; css.rel = 'stylesheet'; css.href = 'css/store-shop.css?v=35';
        document.head.appendChild(css);
      }
      const script = document.createElement('script');
      script.src = 'js/modules/store-shop.js?v=74&game=2';
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
  // Static preparation only: the existing auth flow remains the sole route owner.
  window.prepareStoreManageEntry = function(params) {
    const allowed = new Set(['shopSection', 'liff.state', 'code', 'state', 'liffClientId', 'liffRedirectUri', 'friendship_status_changed']);
    if (!params || params.get('shopSection') !== 'manage' || params.getAll('shopSection').length !== 1 ||
        [...params.keys()].some(key => !allowed.has(key)) || window.location.hash) return false;
    void load().catch(() => {}); // The normal open action retries a failed preload.
    return true;
  };
  window.showStoreManagePending = function(failed = false) {
    window.goPage('store-shop', true);
    const root = document.getElementById('page-store-shop');
    root.innerHTML = '<h2>我的商城管理</h2><p role="status" aria-live="polite"></p><button type="button" onclick="window.goPage(\'home\')">返回首頁</button>';
    root.querySelector('p').textContent = failed ? '暫時無法確認會員資料，請重新連線後重試。' : '正在確認會員資料，商城管理準備中…';
    if (failed) {
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = '重新載入'; retry.onclick = () => window.location.reload(); root.appendChild(retry);
    }
  };
  // Attribution is not identity. The server verifies the actual opener's LINE token.
  async function checkinEntry(section) {
    if (section !== 'list') return '';
    const params = window.readActmasterInitialParams?.() || new URLSearchParams(location.search);
    const allowed = new Set(['shopSection','checkinCard','checkinAction','checkinPage','liff.state','code','state','liffClientId','liffRedirectUri','friendship_status_changed']);
    const id = params.get('checkinCard'), action = params.get('checkinAction');
    const productEntry = action === 'product';
    const invalid = !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id || '') || !['mall','details','product'].includes(action) ||
      ['checkinCard','checkinAction','shopSection'].some(key => params.getAll(key).length !== 1) || [...params.keys()].some(key => !allowed.has(key)) ||
      (productEntry ? params.getAll('checkinPage').length !== 1 || !/^[a-z][a-z0-9_-]{0,39}$/.test(params.get('checkinPage') || '') : params.has('checkinPage'));
    if (invalid) { if (productEntry) throw new Error('商品卡片連結格式不正確，請重新開啟原卡片。'); return ''; }
    const token = window.liff?.isLoggedIn?.() ? window.liff.getAccessToken() : '';
    if (!token) { if (productEntry) throw new Error('請先使用 LINE 登入，再重新開啟商品卡片。'); return ''; }
    try {
      const base = String(window.WORKER_URL || '').replace(/\/+$/, '');
      if (new URL(base).protocol !== 'https:') { if (productEntry) throw new Error('商城連結設定不正確，請稍後再試。'); return ''; }
      const response = await fetch(base + '/v1/checkin-mall/entry', { method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({cardId:id,action,...(productEntry ? {pageId:params.get('checkinPage')} : {})}),cache:'no-store',signal:AbortSignal.timeout(6000) });
      if (productEntry) {
        const result = await response.json();
        if (!response.ok || result?.success !== true) throw new Error(result?.error || '商品連結暫時無法確認，請稍後重試。');
        const target = result.destination;
        if (!target || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(target.shopId || '') || typeof target.productId !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(target.productId)) throw new Error('商品目標不完整，未改選其他商品。');
        return {kind:'product',shopId:target.shopId,productId:target.productId};
      }
    } catch (error) {
      if (productEntry) throw new Error(error?.name === 'TimeoutError' || error?.name === 'AbortError' ? '商品連結確認逾時，請重新開啟原卡片。' : error.message || '商品連結暫時無法確認，請稍後重試。');
      // Existing mall/history navigation remains usable if analytics fails.
    }
    return action;
  }
  window.openStoreShop = async function(productId = '', qrToken = '', memberProduct = '', section = '', shopId = '', options = {}) {
    const ticket = ++opening;
    if (typeof productId !== 'string') productId = '';
    window.goPage('store-shop');
    const root = document.getElementById('page-store-shop');
    root.innerHTML = '<p role="status">商城載入中…</p><button type="button" onclick="window.goPage(\'home\')">返回首頁</button>';
    let returned = false;
    function addReturn() {
      if (typeof options.onBack !== 'function') return;
      const back = document.createElement('button');
      back.type = 'button'; back.textContent = '← 返回棋盤'; back.className = 'shop-link';
      back.style.cssText = 'position:sticky;top:0;z-index:30;min-height:44px;margin:8px;padding:10px 16px;background:#fff;color:#047857;border:1px solid #047857;border-radius:12px;font-weight:700';
      back.onclick = () => { returned = true; options.onBack(); }; root.prepend(back);
    }
    addReturn();
    const owner = window.currentUserProfile?.userId, token = window.liff?.getAccessToken?.();
    try {
      if (section === 'store' && !(window.StoreInviteRoute?.isShopId?.(shopId) ?? (typeof shopId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId)))) throw new Error('商城連結格式不正確，請向店家取得新的邀請網址');
      const params = window.readActmasterInitialParams?.() || new URLSearchParams(location.search);
      const productEntry = section === 'list' && params.get('checkinAction') === 'product';
      const [, entry] = await Promise.all([load(productEntry), checkinEntry(section)]);
      if (ticket !== opening || owner !== window.currentUserProfile?.userId || token !== window.liff?.getAccessToken?.()) return;
      if (!returned && window.currentPage === 'store-shop') {
        if (entry?.kind === 'product') {
          if (window.StoreShop.supportsPublicProductTarget !== true) throw new Error('商城正在更新，請重新開啟原商品卡片。');
          window.StoreShop.mount(root, false, '', '', '', 'store', entry.shopId, entry.productId);
        } else window.StoreShop.mount(root, false, productId, qrToken, memberProduct, entry === 'mall' ? 'discovery' : entry === 'details' ? 'point-history' : section, shopId,'',options.applicationReview||null);
        addReturn();
      }
    } catch(error) {
      if (returned || window.currentPage !== 'store-shop' || root.isConnected === false || ticket !== opening || owner !== window.currentUserProfile?.userId || token !== window.liff?.getAccessToken?.()) return;
      const status = root.querySelector('p'); if (!status) return;
      status.textContent = error.message;
      const retry = document.createElement('button');
      retry.textContent = '重新載入'; retry.onclick = () => window.openStoreShop(productId, qrToken, memberProduct, section, shopId, options); root.appendChild(retry);
    }
  };
})();
