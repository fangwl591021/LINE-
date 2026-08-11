(function() {
  const state = {
    initialized: false,
    loading: false,
    filterTimer: null,
    categories: [],
    cities: []
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function safeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.href);
      return ['https:', 'http:', 'tel:'].includes(url.protocol) ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function normalizePartner(raw) {
    const policy = raw?.redeemPolicy || {};
    return {
      partnerHandle: String(raw?.partnerHandle || '').trim(),
      name: String(raw?.name || '未命名店家').trim(),
      category: String(raw?.category || '合作店家').trim(),
      summary: String(raw?.summary || '').trim(),
      description: String(raw?.description || '').trim(),
      logoUrl: safeUrl(raw?.logoUrl),
      coverImageUrl: safeUrl(raw?.coverImageUrl),
      phone: String(raw?.phone || '').trim(),
      lineUrl: safeUrl(raw?.lineUrl),
      websiteUrl: safeUrl(raw?.websiteUrl),
      redeemPolicy: {
        enabled: policy.enabled === true,
        maxRedeemPercent: Math.min(100, Math.max(0, Number(policy.maxRedeemPercent) || 0)),
        minSpendAmount: Math.max(0, Number(policy.minSpendAmount) || 0),
        note: String(policy.note || '').trim()
      },
      locations: Array.isArray(raw?.locations) ? raw.locations.map((location) => ({
        locationHandle: String(location?.locationHandle || '').trim(),
        branchName: String(location?.branchName || '').trim(),
        city: String(location?.city || '').trim(),
        district: String(location?.district || '').trim(),
        address: String(location?.address || '').trim(),
        mapsUrl: safeUrl(location?.mapsUrl),
        phone: String(location?.phone || '').trim(),
        businessHours: String(location?.businessHours || '').trim()
      })) : []
    };
  }

  function redeemLabel(partner) {
    if (!partner.redeemPolicy.enabled) return '折抵尚未開放';
    if (partner.redeemPolicy.maxRedeemPercent > 0) return `規劃最高折抵 ${partner.redeemPolicy.maxRedeemPercent}%`;
    return '規劃開放點數折抵';
  }

  function partnerImage(partner) {
    if (partner.coverImageUrl) return `<img src="${escapeHtml(partner.coverImageUrl)}" alt="" class="w-full h-full object-cover" loading="lazy">`;
    if (partner.logoUrl) return `<div class="w-full h-full bg-emerald-50 flex items-center justify-center"><img src="${escapeHtml(partner.logoUrl)}" alt="" class="w-20 h-20 rounded-2xl object-cover" loading="lazy"></div>`;
    return '<div class="w-full h-full bg-emerald-50 flex items-center justify-center text-emerald-300"><span class="material-symbols-outlined text-[48px]">storefront</span></div>';
  }

  function locationSummary(partner) {
    const names = partner.locations.map((location) => [location.city, location.district].filter(Boolean).join('')).filter(Boolean);
    if (!names.length) return '門市資料準備中';
    return [...new Set(names)].slice(0, 2).join('、') + (names.length > 2 ? ` 等 ${names.length} 處` : '');
  }

  function renderCard(partner) {
    return `
      <article class="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div class="h-36 bg-slate-50">${partnerImage(partner)}</div>
        <div class="p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <span class="text-[11px] font-black text-emerald-600">${escapeHtml(partner.category)}</span>
              <h4 class="text-[18px] font-black text-slate-800 mt-1">${escapeHtml(partner.name)}</h4>
            </div>
            <span class="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black text-emerald-700">${escapeHtml(redeemLabel(partner))}</span>
          </div>
          ${partner.summary ? `<p class="mt-2 text-[13px] font-bold leading-relaxed text-slate-500">${escapeHtml(partner.summary)}</p>` : ''}
          <div class="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <span class="min-w-0 truncate text-[12px] font-bold text-slate-400"><span class="material-symbols-outlined align-middle text-[16px]">location_on</span> ${escapeHtml(locationSummary(partner))}</span>
            <button type="button" data-partner-handle="${escapeHtml(partner.partnerHandle)}" class="partner-directory-detail-button shrink-0 rounded-2xl bg-slate-900 px-4 py-2 text-[13px] font-black text-white">查看店家</button>
          </div>
        </div>
      </article>`;
  }

  function updateSelect(id, placeholder, values) {
    const select = document.getElementById(id);
    if (!select) return;
    const selected = select.value;
    select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    if (values.includes(selected)) select.value = selected;
  }

  function detailLink(url, label, icon) {
    return url ? `<a href="${escapeHtml(url)}" class="rounded-2xl bg-slate-100 px-3 py-3 text-center text-[13px] font-black text-slate-700"><span class="material-symbols-outlined align-middle text-[18px]">${icon}</span> ${escapeHtml(label)}</a>` : '';
  }

  function renderDetail(partner) {
    const locations = partner.locations.length
      ? partner.locations.map((location) => `
        <div class="rounded-2xl border border-slate-100 p-4">
          <p class="text-[14px] font-black text-slate-800">${escapeHtml(location.branchName || '服務據點')}</p>
          <p class="mt-1 text-[12px] font-bold text-slate-500">${escapeHtml([location.city, location.district, location.address].filter(Boolean).join(' ')) || '地址準備中'}</p>
          ${location.businessHours ? `<p class="mt-1 text-[12px] font-bold text-slate-400">${escapeHtml(location.businessHours)}</p>` : ''}
          ${location.mapsUrl ? `<a href="${escapeHtml(location.mapsUrl)}" class="mt-2 inline-block text-[12px] font-black text-emerald-600">開啟地圖</a>` : ''}
        </div>`).join('')
      : '<p class="rounded-2xl bg-slate-50 p-4 text-[13px] font-bold text-slate-400">門市資料準備中</p>';

    return `
      <div class="h-40 bg-emerald-50">${partnerImage(partner)}</div>
      <div class="p-5">
        <p class="text-[12px] font-black text-emerald-600">${escapeHtml(partner.category)}</p>
        <h3 id="partner-directory-detail-title" class="mt-1 text-2xl font-black text-slate-800">${escapeHtml(partner.name)}</h3>
        ${partner.description || partner.summary ? `<p class="mt-3 text-[13px] font-bold leading-relaxed text-slate-500">${escapeHtml(partner.description || partner.summary)}</p>` : ''}
        <div class="mt-4 rounded-2xl bg-emerald-50 p-4">
          <p class="text-[14px] font-black text-emerald-700">${escapeHtml(redeemLabel(partner))}</p>
          ${partner.redeemPolicy.minSpendAmount ? `<p class="mt-1 text-[12px] font-bold text-emerald-600">最低消費 NT$${Math.round(partner.redeemPolicy.minSpendAmount).toLocaleString('zh-TW')}</p>` : ''}
          ${partner.redeemPolicy.note ? `<p class="mt-1 text-[12px] font-bold text-emerald-600">${escapeHtml(partner.redeemPolicy.note)}</p>` : ''}
          <p class="mt-2 text-[11px] font-bold text-emerald-500">Phase 1 不執行扣點或付款。</p>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-2">${detailLink(partner.lineUrl, 'LINE', 'chat')}${detailLink(partner.websiteUrl, '網站', 'language')}${detailLink(partner.phone ? `tel:${partner.phone}` : '', '電話', 'call')}</div>
        <h4 class="mt-5 mb-2 text-[14px] font-black text-slate-700">服務據點</h4>
        <div class="space-y-2">${locations}</div>
      </div>`;
  }

  async function openDetail(partnerHandle) {
    const modal = document.getElementById('partner-directory-detail');
    const content = document.getElementById('partner-directory-detail-content');
    if (!modal || !content || !partnerHandle) return;
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="p-8 text-center text-[13px] font-bold text-slate-400">讀取店家資料中…</div>';
    try {
      const response = await window.fetchAPI('getPointRedemptionPartner', { partnerHandle }, true);
      if (!response?.success || !response.partner) throw new Error(response?.error || '找不到合作店家');
      content.innerHTML = renderDetail(normalizePartner(response.partner));
    } catch (error) {
      content.innerHTML = `<div class="p-8 text-center text-[13px] font-bold text-rose-600">${escapeHtml(error?.message || '店家資料暫時無法讀取')}</div>`;
    }
  }

  function closeDetail() {
    document.getElementById('partner-directory-detail')?.classList.add('hidden');
  }

  function bindEvents() {
    if (state.initialized) return;
    state.initialized = true;
    const scheduleReload = () => {
      clearTimeout(state.filterTimer);
      state.filterTimer = setTimeout(() => window.loadPartnerDirectory(), 250);
    };
    document.getElementById('partner-directory-query')?.addEventListener('input', scheduleReload);
    document.getElementById('partner-directory-category')?.addEventListener('change', () => window.loadPartnerDirectory());
    document.getElementById('partner-directory-city')?.addEventListener('change', () => window.loadPartnerDirectory());
    document.getElementById('partner-directory-list')?.addEventListener('click', (event) => {
      const button = event.target.closest('.partner-directory-detail-button');
      if (button) openDetail(button.dataset.partnerHandle || '');
    });
    document.getElementById('partner-directory-detail-close')?.addEventListener('click', closeDetail);
    document.getElementById('partner-directory-detail')?.addEventListener('click', (event) => {
      if (event.target.id === 'partner-directory-detail') closeDetail();
    });
  }

  window.loadPartnerDirectory = async function() {
    bindEvents();
    if (state.loading) return;
    const list = document.getElementById('partner-directory-list');
    const empty = document.getElementById('partner-directory-empty');
    const status = document.getElementById('partner-directory-status');
    const count = document.getElementById('partner-directory-count');
    if (!list || !empty || !count) return;

    state.loading = true;
    status?.classList.add('hidden');
    empty.classList.add('hidden');
    count.textContent = '讀取中';
    try {
      const response = await window.fetchAPI('listPointRedemptionPartners', {
        query: document.getElementById('partner-directory-query')?.value || '',
        category: document.getElementById('partner-directory-category')?.value || '',
        city: document.getElementById('partner-directory-city')?.value || '',
        limit: 50
      }, true);
      if (!response?.success) throw new Error(response?.error || '合作店家資料讀取失敗');
      const partners = Array.isArray(response.partners) ? response.partners.map(normalizePartner) : [];
      if (!state.categories.length) state.categories = Array.isArray(response.facets?.categories) ? response.facets.categories : [];
      if (!state.cities.length) state.cities = Array.isArray(response.facets?.cities) ? response.facets.cities : [];
      updateSelect('partner-directory-category', '全部類別', state.categories);
      updateSelect('partner-directory-city', '全部縣市', state.cities);
      count.textContent = `${partners.length} 家`;
      list.innerHTML = partners.map(renderCard).join('');
      empty.classList.toggle('hidden', partners.length > 0);
    } catch (error) {
      list.innerHTML = '';
      count.textContent = '讀取失敗';
      if (status) {
        status.textContent = error?.message || '合作店家資料暫時無法讀取，請稍後再試。';
        status.classList.remove('hidden');
      }
    } finally {
      state.loading = false;
    }
  };
})();
