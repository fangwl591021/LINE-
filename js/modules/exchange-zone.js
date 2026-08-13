(function() {
  const state = {
    initialized: false,
    loading: false,
    access: { mode: 'private', allowed: false, canManage: false },
    panelOpen: false,
    panelTrigger: null,
    panelCloseTimer: null,
    drawerOpen: false,
    lastTrigger: null,
    closeTimer: null
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function safeHttpsUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'https:' ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function formatDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const date = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
    if (Number.isNaN(date.getTime())) return raw.slice(0, 16);
    return new Intl.DateTimeFormat('zh-TW', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function initials(name) {
    const clean = String(name || '會員').trim();
    return escapeHtml(clean.slice(0, 1) || '會');
  }

  function avatar(author, sizeClass) {
    const name = String(author?.name || '會員').trim();
    const url = safeHttpsUrl(author?.avatarUrl);
    const classes = sizeClass || 'w-12 h-12';
    if (url) {
      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" class="${classes} rounded-full object-cover border border-slate-100 bg-slate-100 shrink-0">`;
    }
    return `<span class="${classes} rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-[16px] font-black shrink-0" aria-hidden="true">${initials(name)}</span>`;
  }

  function tagsHtml(items) {
    const tags = Array.isArray(items) ? items.slice(0, 3) : [];
    if (!tags.length) return '';
    return `<span class="flex flex-wrap gap-1.5">${tags.map((tag) => `<span class="rounded-full bg-blue-50 border border-blue-100 px-2.5 py-1 text-[11px] font-black text-blue-700">${escapeHtml(tag)}</span>`).join('')}</span>`;
  }

  function setStatus(message, isError) {
    const el = document.getElementById('exchange-zone-status');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.toggle('hidden', !message);
    el.classList.toggle('bg-red-50', Boolean(isError));
    el.classList.toggle('border-red-100', Boolean(isError));
    el.classList.toggle('text-red-700', Boolean(isError));
    el.classList.toggle('bg-amber-50', !isError);
    el.classList.toggle('border-amber-100', !isError);
    el.classList.toggle('text-amber-700', !isError);
  }

  function applyAccess(access) {
    const normalized = access && typeof access === 'object' ? access : {};
    state.access = {
      mode: ['private', 'pilot', 'open'].includes(String(normalized.mode || '').toLowerCase())
        ? String(normalized.mode).toLowerCase()
        : 'private',
      allowed: normalized.allowed === true,
      canManage: normalized.canManage === true
    };
    const button = document.getElementById('home-exchange-zone-button');
    if (button) button.classList.toggle('hidden', !state.access.allowed);
    const badge = document.getElementById('exchange-zone-private-badge');
    if (badge) {
      const labels = { private: '私人測試', pilot: '指定測試', open: '正式開放' };
      badge.textContent = labels[state.access.mode] || labels.private;
      badge.classList.toggle('hidden', state.access.mode === 'open');
    }
    return state.access;
  }

  window.refreshExchangeZoneAccess = async function() {
    const button = document.getElementById('home-exchange-zone-button');
    if (!window.currentUserProfile?.userId || typeof window.fetchAPI !== 'function') {
      if (button) button.classList.add('hidden');
      return applyAccess(null);
    }
    const result = await window.fetchAPI('getExchangeZoneAccess', {}, true);
    return applyAccess(result?.access);
  };

  window.openExchangeZone = async function() {
    const access = state.access.allowed ? state.access : await window.refreshExchangeZoneAccess();
    if (!access.allowed) {
      window.showToast?.('交流專區尚未開放', true);
      return;
    }
    const root = document.getElementById('page-exchange-zone');
    const panel = document.getElementById('exchange-zone-panel');
    if (!root || !panel) return;
    if (state.panelCloseTimer) clearTimeout(state.panelCloseTimer);
    state.panelTrigger = document.activeElement;
    state.panelOpen = true;
    root.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    requestAnimationFrame(() => {
      panel.classList.remove('translate-x-full');
      document.getElementById('exchange-zone-panel-close')?.focus();
    });
    window.loadExchangeZone?.();
  };

  window.closeExchangeZonePanel = function() {
    const root = document.getElementById('page-exchange-zone');
    const panel = document.getElementById('exchange-zone-panel');
    if (!root || !panel || !state.panelOpen) return;
    if (state.drawerOpen) window.closeExchangeZoneDrawer?.();
    state.panelOpen = false;
    panel.classList.add('translate-x-full');
    document.body.classList.remove('overflow-hidden');
    state.panelCloseTimer = setTimeout(() => {
      root.classList.add('hidden');
      if (state.panelTrigger && typeof state.panelTrigger.focus === 'function') state.panelTrigger.focus();
      state.panelTrigger = null;
    }, 210);
  };

  function renderList(posts) {
    const list = document.getElementById('exchange-zone-list');
    const empty = document.getElementById('exchange-zone-empty');
    const count = document.getElementById('exchange-zone-count');
    const safePosts = Array.isArray(posts) ? posts : [];
    if (count) count.textContent = `${safePosts.length} 則`;
    if (empty) empty.classList.toggle('hidden', safePosts.length > 0);
    if (!list) return;
    list.innerHTML = safePosts.map((post) => {
      const author = post?.author || {};
      const title = String(post?.title || '未命名交流內容');
      const excerpt = String(post?.excerpt || '點擊查看內容');
      return `
        <button type="button" data-exchange-post-handle="${escapeHtml(post?.postHandle || '')}" class="w-full px-5 py-4 text-left flex items-start gap-3 bg-white active:bg-slate-50 transition-colors">
          ${avatar(author)}
          <span class="min-w-0 flex-1">
            <span class="flex items-start justify-between gap-3">
              <span class="truncate text-[15px] font-black text-slate-800">${escapeHtml(title)}</span>
              <span class="shrink-0 text-[11px] font-bold text-slate-400">${escapeHtml(formatDate(post?.publishedAt))}</span>
            </span>
            <span class="mt-1 block truncate text-[13px] font-bold text-slate-500">${escapeHtml(author.name || '會員')}・${escapeHtml(excerpt)}</span>
            <span class="mt-2 flex items-center gap-2">
              ${tagsHtml(post?.contactTags)}
              ${post?.cardAvailable ? '<span class="ml-auto shrink-0 material-symbols-outlined text-[17px] text-emerald-600" title="附電子名片">badge</span>' : ''}
            </span>
          </span>
          <span class="material-symbols-outlined text-[20px] text-slate-300 mt-3">chevron_right</span>
        </button>`;
    }).join('');
  }

  window.loadExchangeZone = async function() {
    if (state.loading) return;
    state.loading = true;
    setStatus('正在讀取交流內容…', false);
    try {
      const result = await window.fetchAPI('listExchangeZonePosts', { limit: 30 }, true);
      if (result?.success === false) throw new Error(result.error || '交流內容讀取失敗');
      if (result?.access) applyAccess(result.access);
      renderList(result?.posts || []);
      setStatus('', false);
    } catch (error) {
      renderList([]);
      setStatus(error?.message || '交流內容讀取失敗，請稍後再試', true);
    } finally {
      state.loading = false;
    }
  };

  function renderDrawer(post) {
    const author = post?.author || {};
    const title = document.getElementById('exchange-zone-drawer-title');
    const content = document.getElementById('exchange-zone-drawer-content');
    if (title) title.textContent = String(post?.title || '交流內容');
    if (!content) return;
    const card = post?.card;
    const cardHtml = card ? `
      <section class="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50/70 overflow-hidden">
        <div class="px-4 py-3 border-b border-emerald-100 flex items-center gap-2 text-emerald-800">
          <span class="material-symbols-outlined text-[20px]">badge</span>
          <h4 class="text-[13px] font-black">電子名片</h4>
        </div>
        ${safeHttpsUrl(card.imageUrl) ? `<img src="${escapeHtml(safeHttpsUrl(card.imageUrl))}" alt="${escapeHtml(card.name || '電子名片')}" class="w-full max-h-64 object-contain bg-white">` : ''}
        <div class="p-4">
          <p class="text-[17px] font-black text-slate-800">${escapeHtml(card.name || author.name || '會員')}</p>
          ${card.companyName ? `<p class="mt-1 text-[13px] font-bold text-slate-600">${escapeHtml(card.companyName)}</p>` : ''}
          ${card.title ? `<p class="mt-1 text-[12px] font-bold text-slate-400">${escapeHtml(card.title)}</p>` : ''}
        </div>
      </section>` : '';
    content.innerHTML = `
      <div class="flex items-center gap-3">
        ${avatar(author, 'w-12 h-12')}
        <div class="min-w-0">
          <p class="truncate text-[15px] font-black text-slate-800">${escapeHtml(author.name || '會員')}</p>
          <p class="mt-1 text-[11px] font-bold text-slate-400">${escapeHtml(formatDate(post?.publishedAt))}</p>
        </div>
      </div>
      <div class="mt-5">${tagsHtml(post?.contactTags)}</div>
      <article class="mt-5 whitespace-pre-wrap break-words text-[15px] leading-7 font-medium text-slate-700">${escapeHtml(post?.body || '')}</article>
      ${cardHtml}`;
  }

  function showDrawer(trigger) {
    const drawer = document.getElementById('exchange-zone-drawer');
    const panel = document.getElementById('exchange-zone-drawer-panel');
    const content = document.getElementById('exchange-zone-drawer-content');
    const title = document.getElementById('exchange-zone-drawer-title');
    if (!drawer || !panel) return;
    if (state.closeTimer) clearTimeout(state.closeTimer);
    state.lastTrigger = trigger || document.activeElement;
    state.drawerOpen = true;
    drawer.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    if (title) title.textContent = '讀取中';
    if (content) content.innerHTML = '<div class="py-16 text-center text-[13px] font-bold text-slate-400">正在讀取內容…</div>';
    requestAnimationFrame(() => {
      panel.classList.remove('translate-x-full');
      document.getElementById('exchange-zone-drawer-close')?.focus();
    });
  }

  window.closeExchangeZoneDrawer = function() {
    const drawer = document.getElementById('exchange-zone-drawer');
    const panel = document.getElementById('exchange-zone-drawer-panel');
    if (!drawer || !panel || !state.drawerOpen) return;
    state.drawerOpen = false;
    panel.classList.add('translate-x-full');
    if (!state.panelOpen) document.body.classList.remove('overflow-hidden');
    state.closeTimer = setTimeout(() => {
      drawer.classList.add('hidden');
      if (state.lastTrigger && typeof state.lastTrigger.focus === 'function') state.lastTrigger.focus();
      state.lastTrigger = null;
    }, 210);
  };

  window.openExchangeZonePost = async function(postHandle, trigger) {
    const handle = String(postHandle || '').trim();
    if (!handle) return;
    showDrawer(trigger);
    try {
      const result = await window.fetchAPI('getExchangeZonePost', { postHandle: handle }, true);
      if (result?.success === false || !result?.post) throw new Error(result?.error || '找不到交流內容');
      renderDrawer(result.post);
    } catch (error) {
      const title = document.getElementById('exchange-zone-drawer-title');
      const content = document.getElementById('exchange-zone-drawer-content');
      if (title) title.textContent = '無法顯示';
      if (content) content.innerHTML = `<div class="rounded-2xl bg-red-50 border border-red-100 p-4 text-[13px] font-bold text-red-700">${escapeHtml(error?.message || '內容讀取失敗，請稍後再試')}</div>`;
    }
  };

  function initialize() {
    if (state.initialized) return;
    state.initialized = true;
    document.getElementById('exchange-zone-list')?.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-exchange-post-handle]');
      if (trigger) window.openExchangeZonePost(trigger.dataset.exchangePostHandle, trigger);
    });
    document.getElementById('exchange-zone-drawer-close')?.addEventListener('click', () => window.closeExchangeZoneDrawer());
    document.getElementById('exchange-zone-drawer-backdrop')?.addEventListener('click', () => window.closeExchangeZoneDrawer());
    document.getElementById('exchange-zone-panel-close')?.addEventListener('click', () => window.closeExchangeZonePanel());
    document.getElementById('exchange-zone-panel-backdrop')?.addEventListener('click', () => window.closeExchangeZonePanel());
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (state.drawerOpen) window.closeExchangeZoneDrawer();
      else if (state.panelOpen) window.closeExchangeZonePanel();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
