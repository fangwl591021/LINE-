(function () {
  'use strict';
  // Public browsing only: no game session, reward, card or identity APIs.
  var shopId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function eligible(shop) {
    return shop && shop.status === 'active' && shopId.test(shop.id) && typeof shop.name === 'string' && shop.name.trim();
  }
  function imageUrl(value) {
    try { var url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch (_) { return ''; }
  }
  function random(max) {
    if (max < 2) return 0;
    if (window.crypto && window.crypto.getRandomValues) return window.crypto.getRandomValues(new Uint32Array(1))[0] % max;
    return Math.floor(Math.random() * max);
  }
  async function catalog(query) {
    if (!window.Config || !window.Config.WORKER_URL) throw new Error('商城設定尚未載入，請稍後重試。');
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch(window.Config.WORKER_URL.replace(/\/$/, '') + '/v1/store-shop?' + query, {
        method: 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal
      });
      if (response.status === 404) throw new Error('這家店已下架或暫停開放，請重新擲骰探索其他店家。');
      if (!response.ok) throw new Error('商城暫時無法讀取，請稍後重試。');
      var result = await response.json();
      if (!result || result.success !== true) throw new Error('商城資料讀取失敗，請重試。');
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('商城連線逾時，請重試。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  var provider = {
    labels: {
      title: '商城大富翁', subtitle: '擲骰逛商城，發現下一家好店', peopleMode: '商城探索', offerMode: '自由遊玩・不贈點',
      loading: '正在排列已上架店家…', privateNote: '只瀏覽公開商城，不會贈扣點或產生訂單。',
      peopleUnit: '家店', board: '商城大富翁棋盤', today: '商城探索', next: '下一站是哪家好店？',
      noContacts: '目前沒有可探索的店家', noContactsNote: '店家上架後即可探索，也可以稍後重新載入。',
      goCards: '重新載入', loadFailed: '商城載入失敗', retryNote: '請確認網路連線後重試。',
      openPerson: '查看商城：', back: '返回遊戲館'
    },
    load: async function () {
      var seed = [random(0x100000000), random(0x100000000)].map(function (n) { return n.toString(16).padStart(8, '0'); }).join('');
      var result = await catalog('seed=' + seed);
      if (!Array.isArray(result.shops)) throw new Error('商城清單格式不正確，請重試。');
      var seen = new Set();
      return result.shops.filter(function (s) {
        if (!eligible(s) || seen.has(s.id)) return false;
        seen.add(s.id); return true;
      }).slice(0, 40).map(function (s) {
        return { type: 'store', id: s.id, title: s.name.trim(), subtitle: s.category || '', image: imageUrl(s.image_url), tags: [], origin: 'store', sourceLabel: '商城' };
      });
    },
    choose: function (tiles, lastId) {
      var choices = tiles.filter(function (tile) { return tile.id !== lastId; });
      if (!choices.length) choices = tiles;
      return choices[random(choices.length)];
    },
    open: async function (tile, context) {
      if (!shopId.test(tile.id)) throw new Error('商城連結格式不正確。');
      var result = await catalog('shop=' + encodeURIComponent(tile.id));
      if (!context.isCurrent()) return;
      if (!eligible(result.shop) || result.shop.id !== tile.id) throw new Error('這家店已下架，請重新擲骰探索其他店家。');
      if (typeof window.openStoreShop !== 'function') throw new Error('商城功能尚未載入，請重新整理。');
      await window.openStoreShop('', '', '', 'store', tile.id, { onBack: context.onBack });
    }
  };
  window.registerBusinessRichmanProvider('store', provider);
  window.openStoreRichman = function (options) {
    return window.openBusinessRichman(Object.assign({onExit:function () { window.goPage('home', true); if (window.openGameCenter) window.openGameCenter(); }}, options, {mode:'store'}));
  };
})();
