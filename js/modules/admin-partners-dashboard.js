let adminPartnerRows = [];
let partnerAdminSourceCards = [];

function partnerAdminValue(id) {
  return String(document.getElementById(id)?.value || '').trim();
}

function partnerAdminNumber(id, fallback = 0) {
  const value = Number.parseInt(partnerAdminValue(id), 10);
  return Number.isFinite(value) ? value : fallback;
}

function partnerAdminEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function partnerAdminSet(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value ?? '';
}

function partnerAdminSetIfEmpty(id, value) {
  if (!partnerAdminValue(id) && String(value ?? '').trim()) partnerAdminSet(id, value);
}

function partnerAdminCardValue(card, ...keys) {
  for (const key of keys) {
    const value = card?.[key];
    if (String(value ?? '').trim()) return String(value).trim();
  }
  return '';
}

function partnerAdminCardLabel(card) {
  const company = partnerAdminCardValue(card, 'companyName', '公司名稱');
  const name = partnerAdminCardValue(card, 'name', '姓名');
  const phone = partnerAdminCardValue(card, 'officePhone', '公司電話', 'mobile', '手機號碼');
  return [company, name, phone].filter(Boolean).join('｜') || '未命名收藏名片';
}

async function loadPartnerAdminSourceCards() {
  const select = document.getElementById('partner-admin-card-select');
  if (!select) return;
  select.innerHTML = '<option value="">載入收藏名片中...</option>';
  try {
    const response = await fetchAPI('getCardHarvestContacts', { limit: 200 });
    const cards = Array.isArray(response) ? response
      : (Array.isArray(response?.data) ? response.data
        : (Array.isArray(response?.contacts) ? response.contacts : []));
    partnerAdminSourceCards = cards.filter(card => partnerAdminCardValue(card, 'rowId', 'id'));
    select.innerHTML = '<option value="">請選擇收藏名片</option>' + partnerAdminSourceCards.map(card => {
      const rowId = partnerAdminCardValue(card, 'rowId', 'id');
      return `<option value="${partnerAdminEscape(rowId)}">${partnerAdminEscape(partnerAdminCardLabel(card))}</option>`;
    }).join('');
    const status = document.getElementById('partner-admin-card-status');
    if (status && !partnerAdminSourceCards.length) status.textContent = '目前沒有可用的收藏名片，請先到「收藏名片」掃描或上傳。';
  } catch (error) {
    partnerAdminSourceCards = [];
    select.innerHTML = '<option value="">收藏名片載入失敗</option>';
  }
}

function applyPartnerAdminSourceCard() {
  const selectedRowId = partnerAdminValue('partner-admin-card-select');
  const card = partnerAdminSourceCards.find(item => partnerAdminCardValue(item, 'rowId', 'id') === selectedRowId);
  if (!card) return showToast('請先選擇一張收藏名片', true);
  const company = partnerAdminCardValue(card, 'companyName', '公司名稱');
  const name = partnerAdminCardValue(card, 'name', '姓名');
  const officePhone = partnerAdminCardValue(card, 'officePhone', '公司電話');
  const mobile = partnerAdminCardValue(card, 'mobile', '手機號碼');
  const phone = officePhone || mobile;
  partnerAdminSet('partner-admin-source-card', selectedRowId);
  partnerAdminSetIfEmpty('partner-admin-name', company || (name === '未命名' ? '' : name));
  partnerAdminSetIfEmpty('partner-admin-contact-name', name === '未命名' ? '' : name);
  partnerAdminSetIfEmpty('partner-admin-contact-email', partnerAdminCardValue(card, 'email', 'Email'));
  partnerAdminSetIfEmpty('partner-admin-tax-id', partnerAdminCardValue(card, 'taxId', '統一編號'));
  partnerAdminSetIfEmpty('partner-admin-phone', phone);
  partnerAdminSetIfEmpty('partner-admin-website', partnerAdminCardValue(card, 'website', '公司網站'));
  partnerAdminSetIfEmpty('partner-admin-branch', company || (name === '未命名' ? '' : name));
  partnerAdminSetIfEmpty('partner-admin-address', partnerAdminCardValue(card, 'address', '地址'));
  partnerAdminSetIfEmpty('partner-admin-location-phone', phone);
  const status = document.getElementById('partner-admin-card-status');
  if (status) status.textContent = `已從「${partnerAdminCardLabel(card)}」帶入空白欄位，請確認後再儲存。`;
  showToast('已帶入收藏名片資料');
}

function clearPartnerAdminForm() {
  ['partner-admin-handle', 'partner-admin-location-handle', 'partner-admin-source-card', 'partner-admin-name', 'partner-admin-category',
    'partner-admin-summary', 'partner-admin-description', 'partner-admin-phone', 'partner-admin-logo',
    'partner-admin-cover', 'partner-admin-line', 'partner-admin-website', 'partner-admin-policy-note',
    'partner-admin-contact-name', 'partner-admin-contact-email', 'partner-admin-tax-id',
    'partner-admin-branch', 'partner-admin-city', 'partner-admin-district', 'partner-admin-address',
    'partner-admin-location-phone', 'partner-admin-hours', 'partner-admin-maps'].forEach(id => partnerAdminSet(id, ''));
  partnerAdminSet('partner-admin-status', 'draft');
  partnerAdminSet('partner-admin-location-status', 'active');
  partnerAdminSet('partner-admin-sort', 9999);
  partnerAdminSet('partner-admin-max-percent', 0);
  partnerAdminSet('partner-admin-min-spend', 0);
  const enabled = document.getElementById('partner-admin-redeem-enabled');
  if (enabled) enabled.checked = false;
  const title = document.getElementById('partner-admin-form-title');
  if (title) title.textContent = '新增合作店家';
  partnerAdminSet('partner-admin-card-select', '');
  const cardStatus = document.getElementById('partner-admin-card-status');
  if (cardStatus) cardStatus.textContent = '';
}

function partnerAdminPayload() {
  return {
    partner: {
      partnerHandle: partnerAdminValue('partner-admin-handle'),
      name: partnerAdminValue('partner-admin-name'),
      category: partnerAdminValue('partner-admin-category'),
      status: partnerAdminValue('partner-admin-status') || 'draft',
      summary: partnerAdminValue('partner-admin-summary'),
      description: partnerAdminValue('partner-admin-description'),
      phone: partnerAdminValue('partner-admin-phone'),
      sortOrder: partnerAdminNumber('partner-admin-sort', 9999),
      logoUrl: partnerAdminValue('partner-admin-logo'),
      coverImageUrl: partnerAdminValue('partner-admin-cover'),
      lineUrl: partnerAdminValue('partner-admin-line'),
      websiteUrl: partnerAdminValue('partner-admin-website')
    },
    contact: {
      name: partnerAdminValue('partner-admin-contact-name'),
      email: partnerAdminValue('partner-admin-contact-email'),
      taxId: partnerAdminValue('partner-admin-tax-id')
    },
    sourceCardRowId: partnerAdminValue('partner-admin-source-card'),
    redeemPolicy: {
      enabled: document.getElementById('partner-admin-redeem-enabled')?.checked === true,
      maxRedeemPercent: partnerAdminNumber('partner-admin-max-percent'),
      minSpendAmount: partnerAdminNumber('partner-admin-min-spend'),
      note: partnerAdminValue('partner-admin-policy-note')
    },
    location: {
      locationHandle: partnerAdminValue('partner-admin-location-handle'),
      branchName: partnerAdminValue('partner-admin-branch'),
      city: partnerAdminValue('partner-admin-city'),
      district: partnerAdminValue('partner-admin-district'),
      address: partnerAdminValue('partner-admin-address'),
      phone: partnerAdminValue('partner-admin-location-phone'),
      businessHours: partnerAdminValue('partner-admin-hours'),
      mapsUrl: partnerAdminValue('partner-admin-maps'),
      status: partnerAdminValue('partner-admin-location-status') || 'active',
      sortOrder: 1
    }
  };
}

function renderPartnerAdminRows() {
  const list = document.getElementById('partner-admin-list');
  const count = document.getElementById('partner-admin-count');
  if (count) count.textContent = `${adminPartnerRows.length} 家`;
  if (!list) return;
  if (!adminPartnerRows.length) {
    list.innerHTML = '<div class="p-10 text-center text-sm font-bold text-slate-400">尚未建立合作店家</div>';
    return;
  }
  const statusNames = { active: '啟用', draft: '草稿', hidden: '隱藏', suspended: '暫停', archived: '已封存' };
  list.innerHTML = adminPartnerRows.map(partner => {
    const location = partner.locations?.[0] || {};
    const locationText = [location.city, location.district, location.address].filter(Boolean).join(' ') || '尚無據點';
    const active = partner.status === 'active';
    return `<article class="p-6"><div class="flex flex-col xl:flex-row xl:items-start justify-between gap-4"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><h4 class="text-lg font-black text-slate-900">${partnerAdminEscape(partner.name)}</h4><span class="rounded-full px-3 py-1 text-xs font-black ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}">${partnerAdminEscape(statusNames[partner.status] || partner.status)}</span></div><p class="mt-1 text-xs font-black text-blue-600">${partnerAdminEscape(partner.category || '未分類')}</p><p class="mt-2 text-sm font-semibold text-slate-500">${partnerAdminEscape(locationText)}</p><p class="mt-2 text-sm font-black text-amber-700">${partner.redeemPolicy?.enabled ? `規劃最高折抵 ${Number(partner.redeemPolicy.maxRedeemPercent) || 0}%` : '折抵未開放'}</p></div><div class="flex gap-2 shrink-0"><button onclick="editPartnerAdmin('${partnerAdminEscape(partner.partnerHandle)}')" class="rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-600">修改</button><button onclick="archivePartnerAdmin('${partnerAdminEscape(partner.partnerHandle)}')" class="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-black text-red-500">停用</button></div></div></article>`;
  }).join('');
}

async function loadPartnerAdmin() {
  const list = document.getElementById('partner-admin-list');
  if (list) list.innerHTML = '<div class="p-10 text-center text-sm font-bold text-slate-400">載入合作店家中...</div>';
  loadPartnerAdminSourceCards();
  const response = await fetchAPI('listAdminPointRedemptionPartners', { limit: 50 });
  if (!response) return;
  adminPartnerRows = Array.isArray(response.partners) ? response.partners : [];
  renderPartnerAdminRows();
}

function editPartnerAdmin(partnerHandle) {
  const partner = adminPartnerRows.find(item => item.partnerHandle === partnerHandle);
  if (!partner) return showToast('找不到店家資料', true);
  const location = partner.locations?.[0] || {};
  const policy = partner.redeemPolicy || {};
  partnerAdminSet('partner-admin-handle', partner.partnerHandle);
  partnerAdminSet('partner-admin-location-handle', location.locationHandle || '');
  partnerAdminSet('partner-admin-name', partner.name);
  partnerAdminSet('partner-admin-category', partner.category);
  partnerAdminSet('partner-admin-status', partner.status || 'draft');
  partnerAdminSet('partner-admin-summary', partner.summary);
  partnerAdminSet('partner-admin-description', partner.description);
  partnerAdminSet('partner-admin-phone', partner.phone);
  partnerAdminSet('partner-admin-sort', partner.sortOrder || 9999);
  partnerAdminSet('partner-admin-logo', partner.logoUrl);
  partnerAdminSet('partner-admin-cover', partner.coverImageUrl);
  partnerAdminSet('partner-admin-line', partner.lineUrl);
  partnerAdminSet('partner-admin-website', partner.websiteUrl);
  partnerAdminSet('partner-admin-contact-name', partner.contact?.name);
  partnerAdminSet('partner-admin-contact-email', partner.contact?.email);
  partnerAdminSet('partner-admin-tax-id', partner.contact?.taxId);
  partnerAdminSet('partner-admin-max-percent', policy.maxRedeemPercent || 0);
  partnerAdminSet('partner-admin-min-spend', policy.minSpendAmount || 0);
  partnerAdminSet('partner-admin-policy-note', policy.note);
  const enabled = document.getElementById('partner-admin-redeem-enabled');
  if (enabled) enabled.checked = policy.enabled === true;
  partnerAdminSet('partner-admin-branch', location.branchName);
  partnerAdminSet('partner-admin-city', location.city);
  partnerAdminSet('partner-admin-district', location.district);
  partnerAdminSet('partner-admin-address', location.address);
  partnerAdminSet('partner-admin-location-phone', location.phone);
  partnerAdminSet('partner-admin-hours', location.businessHours);
  partnerAdminSet('partner-admin-maps', location.mapsUrl);
  partnerAdminSet('partner-admin-location-status', location.status || 'active');
  const title = document.getElementById('partner-admin-form-title');
  if (title) title.textContent = `修改：${partner.name}`;
  partnerAdminSet('partner-admin-source-card', '');
  partnerAdminSet('partner-admin-card-select', '');
  const cardStatus = document.getElementById('partner-admin-card-status');
  if (cardStatus) cardStatus.textContent = partner.sourceCardLinked ? '此店家已保留收藏名片來源關聯；重新選擇才會更新來源。' : '';
  document.getElementById('tab-partners')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function savePartnerAdmin(button) {
  const payload = partnerAdminPayload();
  if (!payload.partner.name) return showToast('請輸入店家名稱', true);
  const original = button?.textContent || '儲存店家';
  if (button) { button.disabled = true; button.textContent = '儲存中...'; }
  try {
    const response = await fetchAPI('savePointRedemptionPartner', payload);
    if (!response) return;
    clearPartnerAdminForm();
    showToast('合作店家已儲存');
    await loadPartnerAdmin();
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function archivePartnerAdmin(partnerHandle) {
  const partner = adminPartnerRows.find(item => item.partnerHandle === partnerHandle);
  if (!partner || !confirm(`確定停用「${partner.name}」？\n\n店家會從前台隱藏，但歷史資料仍保留。`)) return;
  const response = await fetchAPI('archivePointRedemptionPartner', { partnerHandle });
  if (!response) return;
  showToast('合作店家已停用');
  await loadPartnerAdmin();
}
