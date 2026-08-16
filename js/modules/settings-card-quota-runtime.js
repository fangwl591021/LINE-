/* ==================== 名片額度伺服器預檢 ==================== */
(function () {
  'use strict';

  function installServerQuotaPreflight() {
    if (window.__cardQuotaServerPreflightInstalled) return true;
    if (typeof window.getCardUploadQuotaStatus !== 'function' || typeof window.fetchAPI !== 'function') return false;

    var localFallback = window.getCardUploadQuotaStatus;
    window.getCardUploadQuotaStatus = async function () {
      try {
        var remote = await window.fetchAPI('getCardUploadQuotaStatus', {}, true);
        if (remote && remote.success === false) throw new Error(remote.error || 'quota status failed');
        if (remote && typeof remote.allowed === 'boolean') return remote;
      } catch (error) {
        console.warn('[card quota] server preflight unavailable, fallback to local count', error);
      }
      return localFallback.apply(this, arguments);
    };

    window.__cardQuotaServerPreflightInstalled = true;
    return true;
  }

  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (installServerQuotaPreflight() || tries > 80) clearInterval(timer);
  }, 250);
  installServerQuotaPreflight();
})();
