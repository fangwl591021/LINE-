(function() {
  const state = {
    initialized: false,
    loading: false,
    publishing: false,
    access: { mode: 'private', allowed: false, canManage: false, canPublish: false, publishCost: 10, publishDays: 7, contactTags: [] },
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

  function safeActionUrl(value) {
    const raw = String(value || '').trim();
    if (/^tel:\+?[0-9#*(),. -]{5,40}$/i.test(raw)) return raw;
    if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(raw)) return raw;
    return safeHttpsUrl(raw);
  }

  function safeColor(value, fallback) {
    const raw = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw : (fallback || '#06C755');
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
      canManage: normalized.canManage === true,
      canPublish: normalized.canPublish === true,
      publishCost: Number(normalized.publishCost) || 10,
      publishDays: Number(normalized.publishDays) || 7,
      contactTags: Array.isArray(normalized.contactTags) ? normalized.contactTags.slice(0, 8) : []
    };
    const button = document.getElementById('home-exchange-zone-button');
    if (button) button.classList.toggle('hidden', !state.access.allowed);
    const compose = document.getElementById('exchange-zone-compose-button');
    if (compose) compose.classList.toggle('hidden', !state.access.canPublish);
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
    const cardButtons = Array.isArray(card?.buttons) ? card.buttons.map((button) => {
      const url = safeActionUrl(button?.url);
      if (!url) return '';
      return `<a href="${escapeHtml(url)}" class="block w-full rounded-xl px-4 py-3 text-center text-[14px] font-black text-white shadow-sm active:scale-[0.98]" style="background:${escapeHtml(safeColor(button?.color, '#06C755'))}">${escapeHtml(button?.label || '聯絡')}</a>`;
    }).filter(Boolean).join('') : '';
    const cardHtml = card ? `
      <section class="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50/70 overflow-hidden">
        <div class="px-4 py-3 border-b border-emerald-100 flex items-center gap-2 text-emerald-800">
          <span class="material-symbols-outlined text-[20px]">badge</span>
          <h4 class="text-[13px] font-black">電子名片</h4>
        </div>
        ${safeHttpsUrl(card.imageUrl) ? `<img src="${escapeHtml(safeHttpsUrl(card.imageUrl))}" alt="${escapeHtml(card.name || '電子名片')}" class="w-full max-h-[420px] object-contain bg-white">` : ''}
        <div class="p-5">
          <p class="text-center text-[20px] font-black text-slate-800">${escapeHtml(card.name || author.name || '會員')}</p>
          ${(card.companyName || card.title || card.department) ? `<p class="mt-1 text-center text-[13px] font-bold text-slate-600">${escapeHtml([card.companyName, card.department, card.title].filter(Boolean).join(' ・ '))}</p>` : ''}
          ${card.description ? `<p class="mt-4 whitespace-pre-wrap break-words text-[13px] font-medium leading-6" style="color:${escapeHtml(safeColor(card.descriptionColor, '#475569'))};text-align:${['left', 'center', 'right'].includes(card.descriptionAlign) ? card.descriptionAlign : 'center'}">${escapeHtml(card.description)}</p>` : ''}
          ${cardButtons ? `<div class="mt-5 space-y-2.5">${cardButtons}</div>` : ''}
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
      <article class="mt-5 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-4 whitespace-pre-wrap break-words text-[15px] leading-7 font-medium text-slate-700">${escapeHtml(post?.body || '')}</article>
      ${cardHtml}
      ${!post?.canEdit ? `<button id="exchange-zone-inquiry-button" type="button" class="mt-6 w-full min-h-14 rounded-2xl bg-[#06C755] px-4 text-[15px] font-black text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98]"><span class="material-symbols-outlined text-[21px]">mail</span>有興趣・寄站內信</button>` : ''}
      ${post?.canEdit ? `<button id="exchange-zone-edit-button" type="button" class="mt-6 w-full min-h-13 rounded-2xl border border-blue-200 bg-blue-50 px-4 text-[15px] font-black text-blue-700 flex items-center justify-center gap-2 active:scale-[0.98]"><span class="material-symbols-outlined text-[20px]">edit</span>編輯這則內容</button>` : ''}`;
    document.getElementById('exchange-zone-inquiry-button')?.addEventListener('click', () => {
      if (typeof window.openInboxExchangeInquiry !== 'function') return window.showToast?.('收件夾尚未載入，請稍後重試', true);
      window.closeExchangeZoneDrawer?.();
      window.closeExchangeZonePanel?.();
      setTimeout(() => window.openInboxExchangeInquiry(post), 230);
    });
    document.getElementById('exchange-zone-edit-button')?.addEventListener('click', () => renderCompose(post));
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

  function idempotencyKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replaceAll('-', '_');
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return `exchange_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  function renderCompose(existingPost) {
    const editing = Boolean(existingPost?.canEdit && existingPost?.postHandle);
    const title = document.getElementById('exchange-zone-drawer-title');
    const content = document.getElementById('exchange-zone-drawer-content');
    if (title) title.textContent = editing ? '編輯自我宣傳' : '新增自我宣傳';
    if (!content) return;
    const availableTags = state.access.contactTags.length
      ? state.access.contactTags
      : ['合作邀約', '商品服務', '活動邀請', '人才交流', '其他'];
    content.innerHTML = `
      <form id="exchange-zone-compose-form" class="space-y-5" autocomplete="off" data-form-type="other">
        <input type="hidden" name="postHandle" value="${escapeHtml(editing ? existingPost.postHandle : '')}">
        <input type="hidden" name="idempotencyKey" value="${escapeHtml(idempotencyKey())}">
        <div class="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-800">
          ${editing ? '編輯不會再扣點，也不會延長原本 7 天的顯示期限。' : `發布成功才扣 ${state.access.publishCost} 點，內容顯示 ${state.access.publishDays} 天；刪除不退點。`}
        </div>
        <label class="block">
          <span class="text-[13px] font-black text-slate-700">標題</span>
          <input name="title" value="${escapeHtml(editing ? existingPost.title : '')}" required minlength="2" maxlength="80" autocomplete="off" inputmode="text" autocapitalize="sentences" data-form-type="other" data-1p-ignore data-lpignore="true" class="mt-2 w-full min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-[15px] font-bold text-slate-800 outline-none focus:border-emerald-400" placeholder="例如：尋找異業合作夥伴">
        </label>
        <label class="block">
          <span class="text-[13px] font-black text-slate-700">交流內容</span>
          <textarea name="body" required minlength="10" maxlength="2000" rows="7" autocomplete="off" inputmode="text" autocapitalize="sentences" data-form-type="other" data-1p-ignore data-lpignore="true" class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-medium leading-6 text-slate-800 outline-none focus:border-emerald-400 resize-none" placeholder="請介紹您希望交流、合作或宣傳的內容">${escapeHtml(editing ? existingPost.body : '')}</textarea>
        </label>
        <fieldset>
          <legend class="text-[13px] font-black text-slate-700">聯絡標籤（最多 3 個）</legend>
          <div class="mt-2 flex flex-wrap gap-2">
            ${availableTags.map((tag) => `<label class="cursor-pointer"><input type="checkbox" name="contactTags" value="${escapeHtml(tag)}" ${editing && Array.isArray(existingPost.contactTags) && existingPost.contactTags.includes(tag) ? 'checked' : ''} class="peer sr-only"><span class="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-[12px] font-black text-slate-600 peer-checked:border-blue-300 peer-checked:bg-blue-50 peer-checked:text-blue-700">${escapeHtml(tag)}</span></label>`).join('')}
          </div>
        </fieldset>
        <label class="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
          <span><span class="block text-[13px] font-black text-slate-800">附上我的公開電子名片</span><span class="mt-1 block text-[11px] font-bold text-slate-500">只會使用您自己的公開名片</span></span>
          <input type="checkbox" name="attachMyCard" ${!editing || existingPost.cardAvailable ? 'checked' : ''} class="h-5 w-5 accent-emerald-500">
        </label>
        <div id="exchange-zone-compose-error" role="alert" class="hidden rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-700"></div>
        <button id="exchange-zone-publish-button" type="submit" class="w-full min-h-14 rounded-2xl bg-emerald-500 text-white text-[15px] font-black flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50">
          <span class="material-symbols-outlined text-[21px]">send</span>
          ${editing ? '儲存修改（不扣點）' : `確認發布並扣 ${state.access.publishCost} 點`}
        </button>
      </form>`;
  }

  window.openExchangeZoneCompose = function(trigger) {
    if (!state.access.canPublish) {
      window.showToast?.('目前無法刊登交流內容', true);
      return;
    }
    showDrawer(trigger);
    renderCompose();
  };

  async function publishCompose(form) {
    if (state.publishing) return;
    const selectedTags = Array.from(form.querySelectorAll('[name="contactTags"]:checked')).map((input) => input.value);
    const errorBox = document.getElementById('exchange-zone-compose-error');
    if (selectedTags.length > 3) {
      if (errorBox) {
        errorBox.textContent = '聯絡標籤最多選擇 3 個';
        errorBox.classList.remove('hidden');
      }
      return;
    }
    const data = new FormData(form);
    const button = document.getElementById('exchange-zone-publish-button');
    state.publishing = true;
    if (button) {
      button.disabled = true;
      button.textContent = '正在發布…';
    }
    if (errorBox) errorBox.classList.add('hidden');
    try {
      const editing = Boolean(String(data.get('postHandle') || ''));
      const result = await window.fetchAPI(editing ? 'updateExchangeZonePost' : 'publishExchangeZonePost', {
        postHandle: String(data.get('postHandle') || ''),
        title: String(data.get('title') || ''),
        body: String(data.get('body') || ''),
        contactTags: selectedTags,
        attachMyCard: data.get('attachMyCard') === 'on',
        idempotencyKey: String(data.get('idempotencyKey') || '')
      }, true);
      if (result?.success === false) throw new Error(result.error || '刊登失敗');
      await window.loadExchangeZone?.();
      renderPublishSuccess(result, editing);
    } catch (error) {
      if (errorBox) {
        errorBox.textContent = error?.message || '刊登失敗，請稍後再試';
        errorBox.classList.remove('hidden');
      }
    } finally {
      state.publishing = false;
      if (button) {
        button.disabled = false;
        const editing = Boolean(String(new FormData(form).get('postHandle') || ''));
        button.innerHTML = `<span class="material-symbols-outlined text-[21px]">${editing ? 'save' : 'send'}</span>${editing ? '儲存修改（不扣點）' : `確認發布並扣 ${state.access.publishCost} 點`}`;
      }
    }
  }

  function renderPublishSuccess(result, editing) {
    const title = document.getElementById('exchange-zone-drawer-title');
    const content = document.getElementById('exchange-zone-drawer-content');
    if (title) title.textContent = editing ? '更新完成' : '刊登完成';
    if (!content) return;
    const duplicated = result?.alreadyPublished === true;
    const charged = duplicated ? 0 : Number(result?.chargedPoints || state.access.publishCost);
    content.innerHTML = `
      <section class="min-h-full flex items-center justify-center py-8">
        <div class="w-full rounded-3xl border border-emerald-100 bg-emerald-50/70 px-5 py-8 text-center">
          <span class="material-symbols-outlined text-[64px] text-emerald-500" aria-hidden="true">check_circle</span>
          <h4 class="mt-3 text-2xl font-black text-slate-800">${editing ? '更新完成' : '刊登完成'}</h4>
          <p class="mt-3 text-[14px] font-bold leading-6 text-slate-600">${editing ? '內容已更新，本次沒有扣點，原刊登期限保持不變。' : (duplicated ? '這則內容先前已成功刊登，本次沒有重複扣點。' : `已扣除 ${charged} 點，內容將公開顯示 ${state.access.publishDays} 天。`)}</p>
          <button id="exchange-zone-success-close" type="button" class="mt-6 w-full min-h-13 rounded-2xl bg-emerald-500 px-4 text-[15px] font-black text-white active:scale-[0.98]">返回交流專區</button>
        </div>
      </section>`;
    document.getElementById('exchange-zone-success-close')?.addEventListener('click', () => window.closeExchangeZoneDrawer?.());
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
    document.getElementById('exchange-zone-compose-button')?.addEventListener('click', (event) => window.openExchangeZoneCompose(event.currentTarget));
    document.getElementById('exchange-zone-drawer-content')?.addEventListener('change', (event) => {
      if (!event.target.matches('[name="contactTags"]')) return;
      const checked = document.querySelectorAll('#exchange-zone-compose-form [name="contactTags"]:checked');
      if (checked.length > 3) event.target.checked = false;
    });
    document.getElementById('exchange-zone-drawer-content')?.addEventListener('submit', (event) => {
      if (event.target.id !== 'exchange-zone-compose-form') return;
      event.preventDefault();
      publishCompose(event.target);
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
