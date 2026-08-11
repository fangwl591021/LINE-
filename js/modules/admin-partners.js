(function() {
  let partnerSourceCards = [];
  const text = (id) => String(document.getElementById(id)?.value || '').trim();
  const number = (id) => Number.parseInt(text(id), 10) || 0;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function statusLabel(status) {
    const labels = { active: '啟用', draft: '草稿', hidden: '隱藏', suspended: '暫停', archived: '已封存' };
    const colors = status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500';
    return `<span class="rounded-full px-3 py-1 text-[11px] font-black ${colors}">${escapeHtml(labels[status] || status)}</span>`;
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? '';
  }

  function setIfEmpty(id, value) {
    if (!text(id) && String(value ?? '').trim()) setValue(id, value);
  }

  function cardValue(card, ...keys) {
    for (const key of keys) {
      const value = card?.[key];
      if (String(value ?? '').trim()) return String(value).trim();
    }
    return '';
  }

  function cardLabel(card) {
    return [cardValue(card, 'companyName', '公司名稱'), cardValue(card, 'name', '姓名'), cardValue(card, 'officePhone', '公司電話', 'mobile', '手機號碼')].filter(Boolean).join('｜') || '未命名收藏名片';
  }

  async function loadSourceCards() {
    const select = document.getElementById('admin-partner-card-select');
    if (!select) return;
    select.innerHTML = '<option value="">載入收藏名片中…</option>';
    try {
      const response = await window.fetchAPI('getCardHarvestContacts', { limit: 200 }, true);
      const cards = Array.isArray(response) ? response : (Array.isArray(response?.data) ? response.data : (Array.isArray(response?.contacts) ? response.contacts : []));
      partnerSourceCards = cards.filter((card) => cardValue(card, 'rowId', 'id'));
      select.innerHTML = '<option value="">請選擇收藏名片</option>' + partnerSourceCards.map((card) => `<option value="${escapeHtml(cardValue(card, 'rowId', 'id'))}">${escapeHtml(cardLabel(card))}</option>`).join('');
      const status = document.getElementById('admin-partner-card-status');
      if (status && !partnerSourceCards.length) status.textContent = '目前沒有可用的收藏名片，請先到「收藏名片」掃描或上傳。';
    } catch (error) {
      partnerSourceCards = [];
      select.innerHTML = '<option value="">收藏名片載入失敗</option>';
    }
  }

  window.applyAdminPointRedemptionSourceCard = function() {
    const selectedRowId = text('admin-partner-card-select');
    const card = partnerSourceCards.find((item) => cardValue(item, 'rowId', 'id') === selectedRowId);
    if (!card) return message('請先選擇一張收藏名片', true);
    const company = cardValue(card, 'companyName', '公司名稱');
    const name = cardValue(card, 'name', '姓名');
    const phone = cardValue(card, 'officePhone', '公司電話') || cardValue(card, 'mobile', '手機號碼');
    setValue('admin-partner-source-card', selectedRowId);
    setIfEmpty('admin-partner-name', company || (name === '未命名' ? '' : name));
    setIfEmpty('admin-partner-contact-name', name === '未命名' ? '' : name);
    setIfEmpty('admin-partner-contact-email', cardValue(card, 'email', 'Email'));
    setIfEmpty('admin-partner-tax-id', cardValue(card, 'taxId', '統一編號'));
    setIfEmpty('admin-partner-phone', phone);
    setIfEmpty('admin-partner-website-url', cardValue(card, 'website', '公司網站'));
    setIfEmpty('admin-partner-branch-name', company || (name === '未命名' ? '' : name));
    setIfEmpty('admin-partner-address', cardValue(card, 'address', '地址'));
    setIfEmpty('admin-partner-location-phone', phone);
    const status = document.getElementById('admin-partner-card-status');
    if (status) status.textContent = `已從「${cardLabel(card)}」帶入空白欄位，請確認後再儲存。`;
    message('已帶入收藏名片資料；店家仍為草稿。', false);
  };

  function readPayload() {
    return {
      partner: {
        partnerHandle: text('admin-partner-handle'),
        name: text('admin-partner-name'),
        category: text('admin-partner-category'),
        status: text('admin-partner-status') || 'draft',
        summary: text('admin-partner-summary'),
        description: text('admin-partner-description'),
        phone: text('admin-partner-phone'),
        sortOrder: number('admin-partner-sort-order') || 9999,
        logoUrl: text('admin-partner-logo-url'),
        coverImageUrl: text('admin-partner-cover-url'),
        lineUrl: text('admin-partner-line-url'),
        websiteUrl: text('admin-partner-website-url')
      },
      contact: {
        name: text('admin-partner-contact-name'),
        email: text('admin-partner-contact-email'),
        taxId: text('admin-partner-tax-id')
      },
      sourceCardRowId: text('admin-partner-source-card'),
      redeemPolicy: {
        enabled: document.getElementById('admin-partner-redeem-enabled')?.checked === true,
        maxRedeemPercent: number('admin-partner-max-percent'),
        minSpendAmount: number('admin-partner-min-spend'),
        note: text('admin-partner-policy-note')
      },
      location: {
        locationHandle: text('admin-partner-location-handle'),
        branchName: text('admin-partner-branch-name'),
        city: text('admin-partner-city'),
        district: text('admin-partner-district'),
        address: text('admin-partner-address'),
        phone: text('admin-partner-location-phone'),
        businessHours: text('admin-partner-hours'),
        mapsUrl: text('admin-partner-maps-url'),
        status: text('admin-partner-location-status') || 'active',
        sortOrder: 1
      }
    };
  }

  function message(value, error) {
    const element = document.getElementById('admin-partner-status-message');
    if (!element) return;
    element.textContent = value || '';
    element.className = `rounded-2xl border px-4 py-3 text-[13px] font-bold mb-4 ${error ? 'border-rose-100 bg-rose-50 text-rose-600' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`;
    element.classList.toggle('hidden', !value);
  }

  window.clearAdminPointRedemptionPartnerForm = function() {
    ['admin-partner-handle', 'admin-partner-location-handle', 'admin-partner-source-card', 'admin-partner-name', 'admin-partner-category',
      'admin-partner-summary', 'admin-partner-description', 'admin-partner-phone', 'admin-partner-logo-url',
      'admin-partner-cover-url', 'admin-partner-line-url', 'admin-partner-website-url', 'admin-partner-policy-note',
      'admin-partner-contact-name', 'admin-partner-contact-email', 'admin-partner-tax-id',
      'admin-partner-branch-name', 'admin-partner-city', 'admin-partner-district', 'admin-partner-address',
      'admin-partner-location-phone', 'admin-partner-hours', 'admin-partner-maps-url'].forEach((id) => setValue(id, ''));
    setValue('admin-partner-status', 'draft');
    setValue('admin-partner-location-status', 'active');
    setValue('admin-partner-sort-order', 9999);
    setValue('admin-partner-max-percent', 0);
    setValue('admin-partner-min-spend', 0);
    const enabled = document.getElementById('admin-partner-redeem-enabled');
    if (enabled) enabled.checked = false;
    const title = document.getElementById('admin-partner-form-title');
    if (title) title.textContent = '新增合作店家';
    setValue('admin-partner-card-select', '');
    const cardStatus = document.getElementById('admin-partner-card-status');
    if (cardStatus) cardStatus.textContent = '';
    message('', false);
  };

  window.editAdminPointRedemptionPartner = function(partnerHandle) {
    const partner = (window._adminPointRedemptionPartners || []).find((item) => item.partnerHandle === partnerHandle);
    if (!partner) return message('找不到店家資料', true);
    const location = partner.locations?.[0] || {};
    const policy = partner.redeemPolicy || {};
    setValue('admin-partner-handle', partner.partnerHandle);
    setValue('admin-partner-location-handle', location.locationHandle || '');
    setValue('admin-partner-name', partner.name);
    setValue('admin-partner-category', partner.category);
    setValue('admin-partner-status', partner.status || 'draft');
    setValue('admin-partner-summary', partner.summary);
    setValue('admin-partner-description', partner.description);
    setValue('admin-partner-phone', partner.phone);
    setValue('admin-partner-sort-order', partner.sortOrder || 9999);
    setValue('admin-partner-logo-url', partner.logoUrl);
    setValue('admin-partner-cover-url', partner.coverImageUrl);
    setValue('admin-partner-line-url', partner.lineUrl);
    setValue('admin-partner-website-url', partner.websiteUrl);
    setValue('admin-partner-contact-name', partner.contact?.name);
    setValue('admin-partner-contact-email', partner.contact?.email);
    setValue('admin-partner-tax-id', partner.contact?.taxId);
    setValue('admin-partner-max-percent', policy.maxRedeemPercent || 0);
    setValue('admin-partner-min-spend', policy.minSpendAmount || 0);
    setValue('admin-partner-policy-note', policy.note);
    const enabled = document.getElementById('admin-partner-redeem-enabled');
    if (enabled) enabled.checked = policy.enabled === true;
    setValue('admin-partner-branch-name', location.branchName);
    setValue('admin-partner-city', location.city);
    setValue('admin-partner-district', location.district);
    setValue('admin-partner-address', location.address);
    setValue('admin-partner-location-phone', location.phone);
    setValue('admin-partner-hours', location.businessHours);
    setValue('admin-partner-maps-url', location.mapsUrl);
    setValue('admin-partner-location-status', location.status || 'active');
    const title = document.getElementById('admin-partner-form-title');
    if (title) title.textContent = `修改：${partner.name}`;
    setValue('admin-partner-source-card', '');
    setValue('admin-partner-card-select', '');
    const cardStatus = document.getElementById('admin-partner-card-status');
    if (cardStatus) cardStatus.textContent = partner.sourceCardLinked ? '此店家已保留收藏名片來源關聯；重新選擇才會更新來源。' : '';
    document.getElementById('page-admin-partners')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.saveAdminPointRedemptionPartner = async function(button) {
    const payload = readPayload();
    if (!payload.partner.name) return message('請輸入店家名稱', true);
    const original = button?.innerHTML || '';
    if (button) { button.disabled = true; button.textContent = '儲存中…'; }
    try {
      const response = await window.fetchAPI('savePointRedemptionPartner', payload, true);
      if (!response?.success) throw new Error(response?.error || '儲存失敗');
      window.clearAdminPointRedemptionPartnerForm();
      message('店家資料已儲存；只有「啟用」狀態會顯示在前台。', false);
      await window.loadAdminPointRedemptionPartners();
    } catch (error) {
      message(error?.message || '店家儲存失敗', true);
    } finally {
      if (button) { button.disabled = false; button.innerHTML = original; }
    }
  };

  window.archiveAdminPointRedemptionPartner = async function(partnerHandle) {
    const partner = (window._adminPointRedemptionPartners || []).find((item) => item.partnerHandle === partnerHandle);
    if (!partner || !confirm(`確定停用「${partner.name}」？店家會從前台目錄隱藏，但資料仍保留。`)) return;
    try {
      const response = await window.fetchAPI('archivePointRedemptionPartner', { partnerHandle }, true);
      if (!response?.success) throw new Error(response?.error || '停用失敗');
      message('店家已停用並從前台隱藏。', false);
      await window.loadAdminPointRedemptionPartners();
    } catch (error) {
      message(error?.message || '停用店家失敗', true);
    }
  };

  window.loadAdminPointRedemptionPartners = async function() {
    const list = document.getElementById('admin-partner-list');
    if (!list) return;
    if (String(window.userRole || '').toLowerCase() !== 'admin') {
      list.innerHTML = '<div class="rounded-3xl border border-rose-100 bg-rose-50 p-6 text-center text-[13px] font-black text-rose-600">此功能僅限總管使用。</div>';
      return;
    }
    await loadSourceCards();
    list.innerHTML = '<div class="py-8 text-center text-[13px] font-bold text-slate-400">載入合作店家中…</div>';
    try {
      const response = await window.fetchAPI('listAdminPointRedemptionPartners', { limit: 50 }, true);
      if (!response?.success) throw new Error(response?.error || '讀取失敗');
      const partners = Array.isArray(response.partners) ? response.partners : [];
      window._adminPointRedemptionPartners = partners;
      if (!partners.length) {
        list.innerHTML = '<div class="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-[13px] font-bold text-slate-400">尚未建立合作店家</div>';
        return;
      }
      list.innerHTML = partners.map((partner) => {
        const primary = partner.locations?.[0];
        return `<article class="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="text-[11px] font-black text-emerald-600">${escapeHtml(partner.category || '未分類')}</p><h3 class="mt-1 text-[17px] font-black text-slate-800">${escapeHtml(partner.name)}</h3></div>${statusLabel(partner.status)}</div>
          <p class="mt-2 text-[12px] font-bold text-slate-500">${escapeHtml(primary ? [primary.city, primary.district, primary.address].filter(Boolean).join(' ') : '尚無據點')}</p>
          <p class="mt-2 text-[12px] font-black text-amber-700">${partner.redeemPolicy?.enabled ? `規劃最高折抵 ${Number(partner.redeemPolicy.maxRedeemPercent) || 0}%` : '折抵未開放'}</p>
          <div class="mt-4 grid grid-cols-2 gap-3"><button type="button" data-action="edit" data-handle="${escapeHtml(partner.partnerHandle)}" class="rounded-2xl bg-blue-50 py-3 text-[13px] font-black text-blue-600">修改</button><button type="button" data-action="archive" data-handle="${escapeHtml(partner.partnerHandle)}" class="rounded-2xl bg-rose-50 py-3 text-[13px] font-black text-rose-600">停用</button></div>
        </article>`;
      }).join('');
    } catch (error) {
      list.innerHTML = `<div class="rounded-3xl border border-rose-100 bg-rose-50 p-6 text-center text-[13px] font-black text-rose-600">${escapeHtml(error?.message || '合作店家讀取失敗')}</div>`;
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('admin-partner-list')?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action][data-handle]');
      if (!button) return;
      if (button.dataset.action === 'edit') window.editAdminPointRedemptionPartner(button.dataset.handle || '');
      if (button.dataset.action === 'archive') window.archiveAdminPointRedemptionPartner(button.dataset.handle || '');
    });
  });
})();
