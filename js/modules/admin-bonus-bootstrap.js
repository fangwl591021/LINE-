// Load bonus administration only when the administrator opens its tab.
(() => {
  let pending;
  const session = () => ({
    role: typeof adminRole === 'undefined' ? '' : adminRole,
    uid: typeof adminProfile === 'undefined' ? '' : adminProfile?.userId || '',
    token: window.liff?.isLoggedIn?.() ? window.liff.getAccessToken?.() || '' : ''
  });
  const open = () => {
    pending ||= Promise.all([
      import('./admin-bonus-performance-date.mjs?v=1'),
      import('./admin-bonus-release-control.mjs?v=1')
    ]).then(modules => modules.forEach(module => module.mount({workerUrl: WORKER_URL, session})))
      .catch(() => { pending = null; window.showToast?.('獎金管理功能載入失敗，請重新開啟獎金制度', true); });
  };
  document.getElementById('nav-bonus')?.addEventListener('click', open);
  const tab = document.getElementById('tab-bonus');
  if (tab?.classList && !tab.classList.contains('hidden')) open();
})();
