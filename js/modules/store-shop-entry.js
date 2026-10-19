(function() {
  let pending, opening = 0;
  function load() {
    if (window.StoreShop) return Promise.resolve();
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      if (!document.getElementById('store-shop-css')) {
        const css = document.createElement('link');
        css.id = 'store-shop-css'; css.rel = 'stylesheet'; css.href = 'css/store-shop.css?v=30';
        document.head.appendChild(css);
      }
      const script = document.createElement('script');
      script.src = 'js/modules/store-shop.js?v=62&game=2';
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
    const allowed = new Set(['shopSection','checkinCard','checkinAction','liff.state','code','state','liffClientId','liffRedirectUri','friendship_status_changed']);
    const id = params.get('checkinCard'), action = params.get('checkinAction');
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id || '') || !['mall','details'].includes(action) ||
        ['checkinCard','checkinAction','shopSection'].some(key => params.getAll(key).length !== 1) || [...params.keys()].some(key => !allowed.has(key))) return '';
    const token = window.liff?.isLoggedIn?.() ? window.liff.getAccessToken() : '';
    if (!token) return '';
    try {
      const base = String(window.WORKER_URL || '').replace(/\/+$/, '');
      if (new URL(base).protocol !== 'https:') return '';
      await fetch(base + '/v1/checkin-mall/entry', { method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({cardId:id,action}),cache:'no-store',signal:AbortSignal.timeout(6000) });
    } catch { /* Analytics failure must never block shopping or points history. */ }
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
    try {
      if (section === 'store' && !(window.StoreInviteRoute?.isShopId?.(shopId) ?? (typeof shopId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId)))) throw new Error('商城連結格式不正確，請向店家取得新的邀請網址');
      const owner = window.currentUserProfile?.userId, token = window.liff?.getAccessToken?.();
      const [, entry] = await Promise.all([load(), checkinEntry(section)]);
      if (ticket !== opening || owner !== window.currentUserProfile?.userId || token !== window.liff?.getAccessToken?.()) return;
      if (!returned && window.currentPage === 'store-shop') {
        window.StoreShop.mount(root, false, productId, qrToken, memberProduct, entry === 'mall' ? 'discovery' : entry === 'details' ? 'point-history' : section, shopId);
        addReturn();
      }
    } catch(error) {
      if (returned || window.currentPage !== 'store-shop') return;
      root.querySelector('p').textContent = error.message;
      const retry = document.createElement('button');
      retry.textContent = '重新載入'; retry.onclick = () => window.openStoreShop(productId, qrToken, memberProduct, section, shopId, options); root.appendChild(retry);
    }
  };
})();
