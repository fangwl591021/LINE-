(function() {
  const couponState = {
    activePost: null,
    posts: new Map(),
    fetchWrapped: false
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function formatDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function dateInputValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
    const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return taipei.toISOString().slice(0, 10);
  }

  function couponForm() {
    return document.getElementById('exchange-zone-coupon-fields');
  }

  function couponForCompose(form) {
    const handle = String(form?.querySelector('[name="postHandle"]')?.value || '').trim();
    if (!handle) return null;
    const post = couponState.posts.get(handle) || couponState.activePost;
    return post?.postHandle === handle ? (post?.coupon || null) : null;
  }

  function setCouponFieldsState(container) {
    if (!container) return;
    const enabled = container.querySelector('[name="couponEnabled"]')?.checked === true;
    const body = container.querySelector('[data-coupon-body]');
    if (body) body.classList.toggle('hidden', !enabled);
    container.querySelectorAll('[data-coupon-required]').forEach((input) => {
      input.required = enabled;
      input.disabled = !enabled;
    });
    container.querySelectorAll('[data-coupon-optional]').forEach((input) => {
      input.disabled = !enabled;
    });
  }

  function augmentComposeForm() {
    const form = document.getElementById('exchange-zone-compose-form');
    if (!form || form.querySelector('#exchange-zone-coupon-fields')) return;
    const attachCard = form.querySelector('[name="attachMyCard"]')?.closest('label');
    if (!attachCard) return;
    const existing = couponForCompose(form);
    const redeemedCount = Math.max(0, Number(existing?.redemptionCount) || 0);
    const checked = Boolean(existing);
    const wrapper = document.createElement('section');
    wrapper.id = 'exchange-zone-coupon-fields';
    wrapper.className = 'rounded-3xl border border-rose-100 bg-rose-50/70 overflow-hidden';
    wrapper.innerHTML = `
      <label class="flex items-center justify-between gap-3 px-4 py-4 cursor-pointer">
        <span class="min-w-0">
          <span class="flex items-center gap-2 text-[14px] font-black text-slate-800"><span class="material-symbols-outlined text-rose-500 text-[21px]">confirmation_number</span>附加優惠券</span>
          <span class="mt-1 block text-[11px] font-bold text-slate-500">一篇貼文最多 1 張，每位會員只能核銷一次</span>
        </span>
        <input type="checkbox" name="couponEnabled" ${checked ? 'checked' : ''} class="h-5 w-5 accent-rose-500 shrink-0">
      </label>
      <div data-coupon-body class="${checked ? '' : 'hidden'} border-t border-rose-100 bg-white/80 px-4 py-4 space-y-4">
        ${redeemedCount > 0 ? `<div class="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[12px] font-black text-amber-700">已有 ${redeemedCount} 筆核銷紀錄，可修改內容，但不能移除這張優惠券。</div>` : ''}
        <label class="block">
          <span class="text-[12px] font-black text-slate-700">優惠券名稱</span>
          <input name="couponTitle" data-coupon-required maxlength="80" value="${escapeHtml(existing?.title || '')}" class="mt-2 w-full min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-[14px] font-bold text-slate-800 outline-none focus:border-rose-300" placeholder="例如：新朋友體驗券">
        </label>
        <label class="block">
          <span class="text-[12px] font-black text-slate-700">優惠內容</span>
          <textarea name="couponDescription" data-coupon-required maxlength="800" rows="3" class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-medium leading-6 text-slate-800 outline-none focus:border-rose-300 resize-none" placeholder="例如：首次體驗現折 $300">${escapeHtml(existing?.description || '')}</textarea>
        </label>
        <label class="block">
          <span class="text-[12px] font-black text-slate-700">使用期限</span>
          <input type="date" name="couponExpiresAt" data-coupon-required value="${escapeHtml(dateInputValue(existing?.expiresAt))}" class="mt-2 w-full min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-[14px] font-bold text-slate-800 outline-none focus:border-rose-300">
        </label>
        <label class="block">
          <span class="text-[12px] font-black text-slate-700">使用說明／限制</span>
          <textarea name="couponTerms" data-coupon-optional maxlength="800" rows="3" class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-medium leading-6 text-slate-800 outline-none focus:border-rose-300 resize-none" placeholder="限本人使用，每人限使用一次，不得兌換現金。">${escapeHtml(existing?.terms || '限本人使用，每人限使用一次，不得兌換現金。')}</textarea>
        </label>
      </div>`;
    attachCard.parentNode.insertBefore(wrapper, attachCard);

    const toggle = wrapper.querySelector('[name="couponEnabled"]');
    toggle?.addEventListener('change', () => {
      if (!toggle.checked && redeemedCount > 0) {
        toggle.checked = true;
        window.showToast?.('這張優惠券已有核銷紀錄，不能移除', true);
      }
      setCouponFieldsState(wrapper);
    });
    setCouponFieldsState(wrapper);
  }

  function readCouponForm() {
    const container = couponForm();
    if (!container) return undefined;
    const enabled = container.querySelector('[name="couponEnabled"]')?.checked === true;
    if (!enabled) return { enabled: false };
    const expiresDate = String(container.querySelector('[name="couponExpiresAt"]')?.value || '').trim();
    return {
      enabled: true,
      title: String(container.querySelector('[name="couponTitle"]')?.value || '').trim(),
      description: String(container.querySelector('[name="couponDescription"]')?.value || '').trim(),
      terms: String(container.querySelector('[name="couponTerms"]')?.value || '').trim(),
      expiresAt: expiresDate ? `${expiresDate}T23:59:59+08:00` : ''
    };
  }

  function validateCouponForm(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'exchange-zone-compose-form') return;
    const coupon = readCouponForm();
    if (!coupon?.enabled) return;
    const error = document.getElementById('exchange-zone-compose-error');
    let message = '';
    if (coupon.title.length < 2) message = '優惠券名稱至少需要 2 個字';
    else if (coupon.description.length < 2) message = '優惠內容至少需要 2 個字';
    else if (!coupon.expiresAt) message = '請設定優惠券使用期限';
    else if (new Date(coupon.expiresAt).getTime() <= Date.now()) message = '優惠券期限必須晚於現在時間';
    if (!message) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (error) {
      error.textContent = message;
      error.classList.remove('hidden');
    }
    window.showToast?.(message, true);
  }

  function augmentList() {
    document.querySelectorAll('[data-exchange-post-handle]').forEach((item) => {
      const handle = String(item.dataset.exchangePostHandle || '').trim();
      const post = couponState.posts.get(handle);
      item.querySelector('[data-exchange-coupon-badge]')?.remove();
      if (!post?.couponAvailable) return;
      const row = item.querySelector('.mt-2.flex.items-center.gap-2');
      if (!row) return;
      const badge = document.createElement('span');
      badge.dataset.exchangeCouponBadge = '1';
      badge.className = `inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${post.couponStatus === 'expired' ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-rose-100 bg-rose-50 text-rose-600'}`;
      badge.innerHTML = `<span class="material-symbols-outlined text-[15px]">confirmation_number</span>${post.couponStatus === 'expired' ? '優惠券已過期' : '附優惠券'}`;
      row.appendChild(badge);
    });
  }

  function couponButtonLabel(coupon) {
    if (coupon?.isOwner) return '你是發券者';
    if (coupon?.status === 'redeemed') return '已核銷';
    if (coupon?.status === 'expired') return '已過期';
    if (coupon?.status === 'inactive') return '已失效';
    return '現場核銷優惠券';
  }

  function renderCouponDetail(post) {
    const content = document.getElementById('exchange-zone-drawer-content');
    if (!content) return;
    content.querySelector('[data-exchange-coupon-detail]')?.remove();
    const coupon = post?.coupon;
    if (!post?.couponAvailable || !coupon) return;
    const actionRow = document.getElementById('exchange-zone-inquiry-button')?.parentElement
      || content.querySelector('[data-exchange-like-detail="1"]')?.parentElement;
    if (!actionRow) return;

    const section = document.createElement('section');
    section.dataset.exchangeCouponDetail = '1';
    section.className = 'mt-5 rounded-3xl border border-rose-100 bg-rose-50/70 overflow-hidden';
    const redeemed = coupon.status === 'redeemed';
    const expired = coupon.status === 'expired';
    const owner = coupon.isOwner === true;
    section.innerHTML = `
      <button type="button" data-coupon-expand class="w-full px-4 py-4 flex items-center gap-3 text-left active:bg-rose-50">
        <span class="w-11 h-11 shrink-0 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center"><span class="material-symbols-outlined text-[25px]">confirmation_number</span></span>
        <span class="min-w-0 flex-1">
          <span class="block text-[11px] font-black text-rose-500">${redeemed ? '已核銷優惠券' : expired ? '已過期優惠券' : '交流區優惠券'}</span>
          <span class="mt-1 block truncate text-[16px] font-black text-slate-800">${escapeHtml(coupon.title || '優惠券')}</span>
        </span>
        <span class="material-symbols-outlined text-slate-400" data-coupon-chevron>expand_more</span>
      </button>
      <div data-coupon-expanded class="hidden border-t border-rose-100 bg-white px-4 py-4">
        <div class="whitespace-pre-wrap break-words text-[15px] font-bold leading-7 text-slate-700">${escapeHtml(coupon.description || '')}</div>
        ${coupon.terms ? `<div class="mt-4 rounded-2xl bg-slate-50 px-3 py-3 text-[12px] font-bold leading-5 text-slate-500 whitespace-pre-wrap">${escapeHtml(coupon.terms)}</div>` : ''}
        <div class="mt-4 flex items-center justify-between gap-3 text-[12px] font-black text-slate-500"><span>有效期限</span><span>${escapeHtml(formatDate(coupon.expiresAt))}</span></div>
        ${redeemed && coupon.redeemedAt ? `<div class="mt-2 flex items-center justify-between gap-3 text-[12px] font-black text-emerald-600"><span>核銷時間</span><span>${escapeHtml(formatDate(coupon.redeemedAt))}</span></div>` : ''}
        ${owner ? `<div class="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] font-black text-blue-700">目前核銷 ${Math.max(0, Number(coupon.redemptionCount) || 0)} 次</div>` : ''}
        <button type="button" data-coupon-redeem ${coupon.canRedeem ? '' : 'disabled'} class="mt-4 w-full min-h-12 rounded-2xl ${coupon.canRedeem ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-slate-100 text-slate-400'} text-[14px] font-black flex items-center justify-center gap-2 active:scale-[0.98] disabled:active:scale-100">
          <span class="material-symbols-outlined text-[20px]">${redeemed ? 'verified' : 'redeem'}</span>${escapeHtml(couponButtonLabel(coupon))}
        </button>
        ${coupon.canRedeem ? '<p class="mt-2 text-center text-[11px] font-bold text-rose-500">請到店出示此畫面，由現場人員確認後核銷。核銷後不能復原。</p>' : ''}
      </div>`;
    actionRow.insertAdjacentElement('afterend', section);

    const expand = section.querySelector('[data-coupon-expand]');
    const detail = section.querySelector('[data-coupon-expanded]');
    const chevron = section.querySelector('[data-coupon-chevron]');
    expand?.addEventListener('click', () => {
      const opening = detail?.classList.contains('hidden');
      detail?.classList.toggle('hidden', !opening);
      if (chevron) chevron.textContent = opening ? 'expand_less' : 'expand_more';
    });

    section.querySelector('[data-coupon-redeem]')?.addEventListener('click', async (event) => {
      if (!coupon.canRedeem) return;
      if (!confirm(`確認現場核銷「${coupon.title || '這張優惠券'}」？\n核銷後只能使用一次，不能復原。`)) return;
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = '核銷中…';
      try {
        const result = await window.fetchAPI('redeemExchangeZoneCoupon', { couponHandle: coupon.couponHandle }, true);
        if (result?.success === false) throw new Error(result.error || '核銷失敗');
        couponState.activePost = { ...post, coupon: result.coupon, couponAvailable: true };
        couponState.posts.set(post.postHandle, couponState.activePost);
        renderCouponDetail(couponState.activePost);
        window.showToast?.('優惠券已核銷');
      } catch (error) {
        button.disabled = false;
        button.textContent = couponButtonLabel(coupon);
        window.showToast?.('核銷失敗：' + (error?.message || error), true);
      }
    });
  }

  function scheduleUiRefresh() {
    setTimeout(() => {
      augmentComposeForm();
      augmentList();
      if (couponState.activePost) renderCouponDetail(couponState.activePost);
    }, 0);
  }

  function wrapFetchAPI() {
    if (couponState.fetchWrapped || typeof window.fetchAPI !== 'function') return false;
    const original = window.fetchAPI.bind(window);
    window.fetchAPI = async function(action, payload, ...rest) {
      let nextPayload = payload && typeof payload === 'object' ? { ...payload } : payload;
      if ((action === 'publishExchangeZonePost' || action === 'updateExchangeZonePost') && document.getElementById('exchange-zone-compose-form')) {
        const coupon = readCouponForm();
        if (coupon !== undefined) nextPayload = { ...(nextPayload || {}), coupon };
      }
      const result = await original(action, nextPayload, ...rest);
      if (action === 'listExchangeZonePosts' && Array.isArray(result?.posts)) {
        result.posts.forEach((post) => {
          if (post?.postHandle) couponState.posts.set(post.postHandle, post);
        });
        scheduleUiRefresh();
      }
      if (action === 'getExchangeZonePost' && result?.post?.postHandle) {
        couponState.activePost = result.post;
        couponState.posts.set(result.post.postHandle, result.post);
        scheduleUiRefresh();
      }
      if ((action === 'publishExchangeZonePost' || action === 'updateExchangeZonePost') && result?.couponWarning) {
        window.showToast?.(result.couponWarning, true);
      }
      return result;
    };
    couponState.fetchWrapped = true;
    return true;
  }

  function init() {
    if (!wrapFetchAPI()) {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (wrapFetchAPI() || attempts > 40) clearInterval(timer);
      }, 100);
    }
    const drawer = document.getElementById('exchange-zone-drawer-content');
    if (drawer) {
      drawer.addEventListener('submit', validateCouponForm, true);
      new MutationObserver(() => augmentComposeForm()).observe(drawer, { childList: true, subtree: true });
    }
    augmentComposeForm();
  }

  init();
})();
