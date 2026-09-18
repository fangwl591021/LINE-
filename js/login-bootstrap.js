/* First-screen work only. This module never establishes a member session. */
(function () {
  const queued = new Map();
  let pending = true;
  let readyAt = 0;
  let flushTimer;
  let slowTimer;
  let disposed = false;
  let optimizeEntry = false;
  const clock = () => window.performance?.now?.() ?? Date.now();
  const labels = {
    connecting: '正在連線到 LINE…',
    profile: '正在確認 LINE 身分…',
    friendship: '正在確認官方帳號好友狀態…',
    member: '正在確認會員資料…'
  };
  const mark = name => {
    try { window.performance?.mark?.('login-bootstrap:' + name); } catch (_) {}
  };
  function actor() {
    let token = '';
    try {
      if (window.liff?.isLoggedIn?.()) token = window.liff.getAccessToken?.() || '';
    } catch (_) {}
    return { uid: token ? window.currentUserProfile?.userId || '' : '', token };
  }
  function flush() {
    clearTimeout(flushTimer);
    if (pending || disposed) return;
    flushTimer = setTimeout(() => {
      const tasks = [...queued.values()];
      queued.clear();
      const current = actor();
      for (const entry of tasks) {
        if (disposed || !current.uid || entry.uid !== current.uid || entry.token !== current.token) continue;
        Promise.resolve().then(() => {
          const latest = actor();
          if (!disposed && entry.uid === latest.uid && entry.token === latest.token) return entry.task();
        }).catch(() => console.warn('[login-background] auxiliary refresh failed'));
      }
    }, Math.max(0, readyAt - clock()));
  }
  const bootstrap = window.LoginBootstrap = {
    initialParams: null,
    initPromise: null,
    stage(name) {
      if (!Object.prototype.hasOwnProperty.call(labels, name) || disposed) return;
      mark(name);
      const text = document.getElementById('loading-text');
      if (text) text.textContent = labels[name];
      clearTimeout(slowTimer);
      const hint = document.getElementById('login-slow-hint');
      if (hint) hint.hidden = true;
      slowTimer = setTimeout(() => {
        if (hint && !disposed) hint.hidden = false;
      }, 8000);
    },
    defer(key, task) {
      if (!optimizeEntry) return false;
      if (disposed) return true;
      if (!pending && clock() >= readyAt) return false;
      const current = actor();
      if (current.uid) queued.set(key, { ...current, task });
      flush();
      return true;
    },
    finish(allowBackground) {
      clearTimeout(slowTimer);
      const hint = document.getElementById('login-slow-hint');
      if (hint) hint.hidden = true;
      pending = false;
      readyAt = allowBackground ? clock() + 2000 : 0;
      if (!allowBackground) queued.clear();
      mark(allowBackground ? 'background-released' : 'entry-finished');
      flush();
    }
  };
  window.addEventListener('pagehide', event => {
    disposed = true;
    clearTimeout(flushTimer);
    clearTimeout(slowTimer);
    if (!event.persisted) queued.clear();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      disposed = false;
      if (!pending) readyAt = 0;
      flush();
    }
  });

  // Fail closed for every feature route, including routes nested in liff.state.
  // The existing auth handler remains their sole initialization owner.
  const params = new URLSearchParams(window.location.search || '');
  const ordinaryKeys = new Set(['code', 'state', 'liffClientId', 'liffRedirectUri', 'friendship_status_changed']);
  const state = params.get('state') || '';
  let plainRedirect = true;
  if (params.has('liffRedirectUri')) {
    try {
      const redirect = new URL(params.get('liffRedirectUri'));
      plainRedirect = redirect.origin === window.location.origin && redirect.pathname === window.location.pathname
        && !redirect.search && !redirect.hash;
    } catch (_) { plainRedirect = false; }
  }
  const plainHome = plainRedirect && !window.location.hash && [...params.keys()].every(key => ordinaryKeys.has(key))
    && (!state || /^[A-Za-z0-9_-]+$/.test(state));
  optimizeEntry = plainHome;
  if (plainHome && typeof window.initActmasterLiff === 'function') {
    bootstrap.initialParams = typeof window.readActmasterInitialParams === 'function'
      ? window.readActmasterInitialParams() : new URLSearchParams(params);
    mark('init-start');
    // Keep the full wrapper (including its retry), not the SDK's first promise.
    bootstrap.initPromise = Promise.resolve().then(() => window.initActmasterLiff(window.LIFF_ID, {
      withLoginOnExternalBrowser: true
    })).then(value => {
      mark('init-ready');
      return { ok: true, value };
    }, error => ({ ok: false, error }));
  }
})();
