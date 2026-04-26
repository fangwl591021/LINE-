/* ==================== CRM 客戶關係管理模組 ==================== */

// 全域狀態
window.crmContactsCache = [];
window.crmCurrentFilters = { search: '', store: '', tag: '' };
window.crmCurrentPersonPhone = null;

// 預設標籤(快選)
window.CRM_DEFAULT_TAGS = ['VIP', '待跟進', '拒接'];

// ============ 載入 CRM 主頁 ============
window.loadCrm = async function() {
  const container = document.getElementById('crm-list');
  if (!container) return;

  container.innerHTML = '<div class="text-center py-10"><span class="material-symbols-outlined animate-spin text-3xl text-slate-300">refresh</span><p class="text-sm text-slate-400 font-bold mt-2">載入聯絡人中...</p></div>';

  try {
    const res = await window.fetchAPI('getCrmContacts', {}, true);
    if (res && Array.isArray(res)) {
      window.crmContactsCache = res;
      window.renderCrmStoreFilter();
      window.renderCrmList();
    } else {
      throw new Error('無法取得聯絡人');
    }
  } catch (e) {
    container.innerHTML = '<div class="text-center py-10 text-red-400 text-sm font-bold">載入失敗:' + e.message + '</div>';
  }
};

// ============ 渲染 store 篩選器(只 admin 看得到) ============
window.renderCrmStoreFilter = function() {
  const wrapper = document.getElementById('crm-store-filter-wrapper');
  if (!wrapper) return;

  if (userRole !== 'admin') {
    wrapper.classList.add('hidden');
    return;
  }
  wrapper.classList.remove('hidden');

  // 撈出所有不重複的 store
  const storeSet = {};
  window.crmContactsCache.forEach(p => {
    if (p.ownerName || p.ownerStoreId) {
      const key = p.ownerNetwork || 'admin';
      if (!storeSet[key]) {
        storeSet[key] = (p.ownerName || '未命名') + (p.ownerStoreId ? ' (' + p.ownerStoreId + ')' : '');
      }
    }
  });

  const select = document.getElementById('crm-store-filter');
  if (!select) return;
  select.innerHTML = '<option value="">所有商家</option>' +
    Object.keys(storeSet).map(k =>
      '<option value="' + window.escapeJS(k) + '">' + window.escapeJS(storeSet[k]) + '</option>'
    ).join('');
};

// ============ 渲染列表 ============
window.renderCrmList = function() {
  const container = document.getElementById('crm-list');
  if (!container) return;

  let filtered = window.crmContactsCache;

  // 搜尋
  const q = window.crmCurrentFilters.search.toLowerCase().trim();
  if (q) {
    filtered = filtered.filter(p =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.phone || '').toLowerCase().includes(q) ||
      String(p.email || '').toLowerCase().includes(q) ||
      String(p.company || '').toLowerCase().includes(q) ||
      String(p.tags || '').toLowerCase().includes(q)
    );
  }

  // 商店篩選
  if (window.crmCurrentFilters.store) {
    filtered = filtered.filter(p => p.ownerNetwork === window.crmCurrentFilters.store);
  }

  // 標籤篩選
  if (window.crmCurrentFilters.tag) {
    filtered = filtered.filter(p => String(p.tags || '').includes(window.crmCurrentFilters.tag));
  }

  // 計數顯示
  const countEl = document.getElementById('crm-count');
  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center py-10 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200"><span class="material-symbols-outlined text-4xl text-slate-300 mb-2">search_off</span><p class="text-slate-400 font-bold text-sm">找不到符合條件的聯絡人</p></div>';
    return;
  }

  container.innerHTML = filtered.map(p => {
    const initial = (p.name || '?').charAt(0);
    const lastTime = p.lastActivityTime ? window.formatDisplayTime(p.lastActivityTime).substring(0, 10) : '';
    const tagList = String(p.tags || '').split(',').filter(t => t.trim());

    const tagsHtml = tagList.map(t =>
      '<span class="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded font-bold">' + window.escapeJS(t.trim()) + '</span>'
    ).join('');

    // admin 顯示歸屬商家
    const storeBadge = (userRole === 'admin' && p.ownerName)
      ? '<span class="bg-purple-50 text-purple-600 text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">storefront</span>' + window.escapeJS(p.ownerName) + '</span>'
      : '';

    return '<div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-3 active:bg-slate-50 transition-colors cursor-pointer" onclick="window.openCrmPerson(\'' + window.escapeJS(p.phone) + '\')">' +
      '<div class="flex items-start gap-3">' +
        '<div class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-lg shrink-0 border border-blue-100">' + window.escapeJS(initial) + '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center gap-2 mb-1 flex-wrap">' +
            '<p class="font-black text-slate-800">' + window.escapeJS(p.name || '未命名') + '</p>' +
            storeBadge +
          '</div>' +
          '<p class="text-[12px] text-slate-500 font-mono">' + window.escapeJS(p.phone) + '</p>' +
          (p.company ? '<p class="text-[12px] text-slate-500 truncate">' + window.escapeJS(p.company) + (p.title ? ' · ' + window.escapeJS(p.title) : '') + '</p>' : '') +
          '<div class="flex items-center gap-1.5 mt-1.5 flex-wrap">' +
            tagsHtml +
            (p.activityCount > 0 ? '<span class="bg-orange-50 text-orange-600 text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1"><span class="material-symbols-outlined text-[10px]">event</span>' + p.activityCount + ' 場</span>' : '') +
            (lastTime ? '<span class="text-[10px] text-slate-400">最近 ' + lastTime + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<span class="material-symbols-outlined text-slate-300">chevron_right</span>' +
      '</div>' +
    '</div>';
  }).join('');
};

// ============ 搜尋處理 ============
window.crmSearch = function() {
  const q = document.getElementById('crm-search-input').value;
  window.crmCurrentFilters.search = q;
  window.renderCrmList();
};

window.crmFilterByStore = function() {
  const v = document.getElementById('crm-store-filter').value;
  window.crmCurrentFilters.store = v;
  window.renderCrmList();
};

// ============ 開啟個人詳細頁 ============
window.openCrmPerson = function(phone) {
  const person = window.crmContactsCache.find(p => p.phone === phone);
  if (!person) return window.showToast('找不到聯絡人', true);

  window.crmCurrentPersonPhone = phone;
  const container = document.getElementById('crm-person-content');
  if (!container) return;

  const tagList = String(person.tags || '').split(',').map(t => t.trim()).filter(t => t);

  // 標籤按鈕區
  const allTags = [...new Set([...window.CRM_DEFAULT_TAGS, ...tagList])];
  const tagsBtnHtml = allTags.map(t => {
    const active = tagList.includes(t);
    return '<button onclick="window.toggleCrmTag(\'' + window.escapeJS(t) + '\')" class="px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ' +
      (active ? 'bg-blue-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600') +
      '">' + window.escapeJS(t) + (active ? ' ✓' : '') + '</button>';
  }).join('');

  // 活動歷程
  const actsHtml = (person.activities || []).length === 0
    ? '<div class="text-center text-slate-400 text-sm py-6">尚未參加過活動</div>'
    : person.activities.map(a => {
        const time = window.formatDisplayTime(a.time);
        const statusBadge = a.checkedIn ?
          '<span class="bg-green-50 text-green-600 text-[10px] px-2 py-0.5 rounded font-bold">已簽到</span>' :
          (a.paid === '已繳費' ?
            '<span class="bg-blue-50 text-blue-600 text-[10px] px-2 py-0.5 rounded font-bold">已繳費</span>' :
            '<span class="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded font-bold">' + (a.paid || '已報名') + '</span>');
        return '<div class="px-4 py-3 border-b border-slate-50 last:border-0 flex justify-between items-center">' +
          '<div>' +
            '<p class="font-bold text-[14px] text-slate-800">' + window.escapeJS(a.activityName || '未命名') + '</p>' +
            '<p class="text-[12px] text-slate-400 mt-0.5">' + (time ? time.substring(0, 16) : '時間未定') + '</p>' +
          '</div>' +
          statusBadge +
        '</div>';
      }).join('');

  container.innerHTML =
    '<div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 mb-4">' +
      '<div class="flex items-start gap-4 mb-4">' +
        '<div class="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-2xl shrink-0 border border-blue-100">' + window.escapeJS(person.name?.charAt(0) || '?') + '</div>' +
        '<div class="flex-1 min-w-0">' +
          '<h2 class="text-lg font-black text-slate-800">' + window.escapeJS(person.name || '未命名') + '</h2>' +
          '<p class="text-[13px] text-slate-500 font-mono">' + window.escapeJS(person.phone) + '</p>' +
          (person.company ? '<p class="text-[13px] text-slate-500 mt-0.5">' + window.escapeJS(person.company) + '</p>' : '') +
          (userRole === 'admin' && person.ownerName ? '<div class="mt-2 inline-flex items-center gap-1 text-[11px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded font-bold"><span class="material-symbols-outlined text-[14px]">storefront</span>歸屬:' + window.escapeJS(person.ownerName) + '</div>' : '') +
        '</div>' +
      '</div>' +

      '<div class="flex gap-2 mb-4">' +
        (person.phone ? '<a href="tel:' + person.phone + '" class="flex-1 bg-[#06C755] text-white py-2.5 rounded-xl text-[13px] font-bold flex justify-center items-center gap-1 active:scale-95 transition-transform"><span class="material-symbols-outlined text-[16px]">call</span> 撥打</a>' : '') +
        (person.email ? '<a href="mailto:' + person.email + '" class="flex-1 bg-blue-500 text-white py-2.5 rounded-xl text-[13px] font-bold flex justify-center items-center gap-1 active:scale-95 transition-transform"><span class="material-symbols-outlined text-[16px]">mail</span> Email</a>' : '') +
      '</div>' +

      '<div class="border-t border-slate-100 pt-4">' +
        '<p class="text-[13px] font-black text-slate-700 mb-2 flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">label</span> 標籤管理</p>' +
        '<div class="flex flex-wrap gap-2 mb-3" id="crm-tags-container">' + tagsBtnHtml + '</div>' +
        '<div class="flex gap-2">' +
          '<input id="crm-new-tag" type="text" placeholder="新增自訂標籤..." class="flex-1 bg-slate-50 border-none rounded-lg p-2.5 text-[13px] focus:ring-2 focus:ring-blue-500/30 outline-none">' +
          '<button onclick="window.addCrmCustomTag()" class="bg-blue-500 text-white px-4 rounded-lg text-[13px] font-bold active:scale-95">+ 新增</button>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">' +
      '<div class="px-5 py-3 bg-slate-50/50 border-b border-slate-100">' +
        '<p class="text-[13px] font-black text-slate-700 flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">event</span> 活動參與歷程 (' + (person.activities || []).length + ')</p>' +
      '</div>' +
      actsHtml +
    '</div>';

  window.goPage('crm-person');
};

// ============ 切換標籤 ============
window.toggleCrmTag = async function(tag) {
  const person = window.crmContactsCache.find(p => p.phone === window.crmCurrentPersonPhone);
  if (!person) return;

  const tagList = String(person.tags || '').split(',').map(t => t.trim()).filter(t => t);
  const idx = tagList.indexOf(tag);

  if (idx >= 0) {
    tagList.splice(idx, 1);  // 移除
  } else {
    tagList.push(tag);  // 新增
  }

  const newTagStr = tagList.join(',');

  try {
    const res = await window.fetchAPI('updateCrmTag', {
      phone: person.phone,
      tags: newTagStr,
      name: person.name
    }, true);

    if (res && !res.error) {
      person.tags = newTagStr;
      window.openCrmPerson(person.phone);  // 重新渲染
      window.showToast('✅ 標籤已更新');
    } else {
      throw new Error(res.error || '更新失敗');
    }
  } catch (e) {
    window.showToast('⚠️ ' + e.message, true);
  }
};

// ============ 新增自訂標籤 ============
window.addCrmCustomTag = function() {
  const input = document.getElementById('crm-new-tag');
  if (!input) return;
  const tag = input.value.trim();
  if (!tag) return;
  if (tag.includes(',')) return window.showToast('標籤不能包含逗號', true);

  input.value = '';
  window.toggleCrmTag(tag);
};

// ============ 個人邀約連結 (放在設定頁上方) ============
window.showInviteLink = function() {
  if (!currentUserProfile) return window.showToast('請先登入', true);

  const myUserId = currentUserProfile.userId;
  const myStoreId = currentUser?.storeid || '';

  // 連結結構:
  // - ref=我的userId(誰推薦的)
  // - net=當前networkId(歸屬到哪個 store)
  // - via=storeid_userid(完整追蹤碼,讓 store 知道是誰下的單)
  const tracking = (myStoreId ? myStoreId + '_' : '') + myUserId.substring(0, 10);

  let inviteUrl = 'https://liff.line.me/' + LIFF_ID;
  inviteUrl += '?ref=' + encodeURIComponent(myUserId);
  inviteUrl += '&net=' + encodeURIComponent(currentNetworkId);
  inviteUrl += '&via=' + encodeURIComponent(tracking);

  // 顯示 modal
  const modal = document.getElementById('invite-link-modal');
  const linkInput = document.getElementById('invite-link-input');
  const trackingEl = document.getElementById('invite-tracking-info');

  if (linkInput) linkInput.value = inviteUrl;
  if (trackingEl) trackingEl.textContent = '追蹤碼:' + tracking;

  // QR Code
  const qrImg = document.getElementById('invite-qr-img');
  if (qrImg) {
    qrImg.src = 'https://quickchart.io/qr?text=' + encodeURIComponent(inviteUrl) + '&size=240&margin=2';
  }

  if (modal) modal.classList.remove('hidden');
};

window.closeInviteModal = function() {
  document.getElementById('invite-link-modal')?.classList.add('hidden');
};

window.copyInviteLink = function() {
  const input = document.getElementById('invite-link-input');
  if (!input) return;
  input.select();
  document.execCommand('copy');
  window.showToast('✅ 邀約連結已複製');
};

window.shareInviteLink = async function() {
  const input = document.getElementById('invite-link-input');
  if (!input || !liff.isLoggedIn()) return;
  const url = input.value;
  const text = '✨ 邀請您加入我們的商務社群\n' + (currentUser?.name || '我') + ' 為您準備了專屬名片庫與商機配對\n\n' + url;
  try {
    await liff.shareTargetPicker([{ type: "text", text: text }]);
    window.showToast('✅ 邀約連結已發送');
  } catch (e) {
    window.showToast('發送失敗', true);
  }
};
