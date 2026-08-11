let adminPartnerRows = [];

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

function clearPartnerAdminForm() {
  ['partner-admin-handle', 'partner-admin-location-handle', 'partner-admin-name', 'partner-admin-category',
    'partner-admin-summary', 'partner-admin-description', 'partner-admin-phone', 'partner-admin-logo',
    'partner-admin-cover', 'partner-admin-line', 'partner-admin-website', 'partner-admin-policy-note',
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
