(function() {
  'use strict';
  const attributionKeys = ['ref', 'net', 'via'];
  const conflicts = ['shareCardId','likeCardId','webCardId','web','claim','shopQr','memberProduct','shopProduct',
    'checkin','nfcAct','nfcCheckin','verifyCheckin','checkinRowId','registrationId','activityId','a',
    'admin','adminPage','monitor','lineoaMonitor','open','mode','lineoaKeywordShare','keywordShareRuleId',
    'send','share','autoShare','action','pt_uid','uid','userId','LINE_user_id','lineUserId','pointUserId','wallet_uid'];
  const isShopId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  const paramsOf = source => new URLSearchParams(source === undefined ? window.location.search : source);
  function readTarget(source) {
    const params = paramsOf(source);
    if (params.get('shopSection') !== 'store' || params.getAll('shopSection').length !== 1 || params.getAll('shopId').length !== 1) return '';
    if (conflicts.some(key => params.get(key))) return '';
    const id = params.get('shopId');
    return isShopId(id) ? id.toLowerCase() : '';
  }
  function withAttribution(href, source) {
    const url = new URL(href, window.location.href);
    if (!['https:', 'http:'].includes(url.protocol) || (url.origin !== new URL(window.location.href).origin && url.origin !== 'https://liff.line.me')) return '';
    const params = paramsOf(source);
    for (const key of attributionKeys) {
      const value = (params.get(key) || '').trim();
      if (value && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value)) url.searchParams.set(key, value);
    }
    return url.href;
  }
  function buildUrl(id, source, login) {
    if (!isShopId(id)) return '';
    const url = new URL(login ? 'index.html' : 'store-shop.html', window.location.href);
    url.search = '';
    url.hash = '';
    if (login) url.searchParams.set('shopSection', 'store');
    url.searchParams.set(login ? 'shopId' : 'shop', id.toLowerCase());
    return withAttribution(url.href, source);
  }
  window.StoreInviteRoute = Object.freeze({isShopId, readTarget, withAttribution,
    buildPublicUrl: (id, source) => buildUrl(id, source, false),
    buildLoginUrl: (id, source) => buildUrl(id, source, true)});
})();
