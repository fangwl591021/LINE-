(function() {
  'use strict';
  let enabled = false, checkedAt = 0, pending;
  async function refresh(force = false) {
    if (!force && Date.now() - checkedAt < 30000) return enabled;
    if (pending) return pending;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    pending = Promise.resolve().then(async () => {
      try {
        const base = window.Config?.WORKER_URL || window.WORKER_URL || window.Config?.API_URL;
        if (!base) throw new Error('missing worker');
        const response = await fetch(base.replace(/\/$/, '') + '/api/card-links/config', { cache:'no-store', signal:controller.signal });
        if (!response.ok) throw new Error('config unavailable');
        enabled = (await response.json()).enabled === true;
      } catch { enabled = false; }
      finally { checkedAt = Date.now(); clearTimeout(timer); pending = null; }
      return enabled;
    });
    return pending;
  }
  window.CardLinksRuntime = Object.freeze({ refresh, enabled:() => enabled });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(true); });
})();
