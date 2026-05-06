/* ==================== 前端共用函式與全域狀態 ==================== */

// 宣告全域狀態變數，確保各模組呼叫時不會報錯
window.allCards = [];
window.currentUserCard = null;
window.allActivities = [];
window.allSystemUsers = [];
window.currentUserProfile = null;
window.currentUser = null;
window.userRole = 'user';
window.currentNetworkId = 'admin';
window.currentStoreId = '';
window.hasAdminRights = false;

// 嚴格安全跳脫函式：防範 XSS 跨站腳本攻擊
window.escapeHTML = function(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// 安全跳脫函式：保護 Inline JS 參數
window.escapeJS = function(str) {
  return String(str || '')
    .replace(/\\/g, "\\\\") 
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/</g, "\\x3c") 
    .replace(/>/g, "\\x3e");
};

// 時間格式化
window.formatDisplayTime = function(val) {
  if (!val) return '';
  try {
    let d = new Date(val);
    if (isNaN(d.getTime())) {
      return String(val).replace('T', ' ').replace('.000Z', '').substring(0, 16);
    }
    const pad = (n) => n.toString().padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
         + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  } catch(e) {
    return String(val);
  }
};

// 圖示對應
window.getIconUrl = function(type) {
  const icons = {
    "LINE": "https://aiwe.cc/wp-content/uploads/2026/02/b75a5831fd553c7130aeafbb9783cf79.png",
    "FB":   "https://aiwe.cc/wp-content/uploads/2026/02/3986d1fd62384c8cdaa0e7c82f2740d1.png",
    "IG":   "https://aiwe.cc/wp-content/uploads/2026/02/a33306edcecd1ebdfd14baea6718cf23.png",
    "YT":   "https://aiwe.cc/wp-content/uploads/2026/02/87e6f8054bd3672f2885e38bddb112e2.png",
    "TEL":  "https://aiwe.cc/wp-content/uploads/2026/02/7254567388850a6b4d77b75208ebd4b8.png",
    "WEB":  "https://cdn-icons-png.flaticon.com/512/1006/1006771.png"
  };
  return icons[type] || icons['WEB'];
};

// 清理 URI
window.cleanURI = function(uri) {
  if (!uri) return '';
  uri = uri.trim();
  if (uri === 'http://' || uri === 'https://') return '';
  if (!uri.match(/^(http|https|tel|mailto|line):/i)) return 'https://' + uri;
  return uri;
};

// Toast 通知
window.showToast = function(msg, isError = false) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'px-4 py-3 rounded-full shadow-lg text-[13px] font-bold text-white transition-all duration-300 toast-enter flex items-center gap-2 max-w-[90%] text-center';
  toast.classList.add(isError ? 'bg-red-500' : 'bg-slate-800');
  toast.innerHTML = '<span class="material-symbols-outlined icon-filled text-[18px]">'
    + (isError ? 'error' : 'info') + '</span> ' + msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

// 統一 API 呼叫
window.fetchAPI = async function(action, payload = {}, silent = false) {
  try {
    const safePayload = { ...payload };
    safePayload.networkId = safePayload.networkId !== undefined ? safePayload.networkId : window.currentNetworkId;
    safePayload.role = safePayload.role !== undefined ? safePayload.role : window.userRole;
    safePayload.userId = safePayload.userId !== undefined ? safePayload.userId : window.currentUserProfile?.userId;

    try {
      if (typeof liff !== 'undefined' && liff.isLoggedIn()) {
        safePayload.lineAccessToken = liff.getAccessToken();
      }
    } catch (e) {
      console.warn("LIFF token fetch failed:", e);
    }

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload: safePayload })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data || data;
  } catch (err) {
    if (!silent) window.showToast(err.message, true);
    return { success: false, error: err.message };
  }
};

// LIFF Flex Message 分享
window.triggerFlexSharing = async function(flexMsg, altText) {
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return;
  }
  try {
    if (!liff.isApiAvailable('shareTargetPicker')) {
      window.showToast('您的環境不支援分享功能', true);
      return;
    }
    const message = {
      type: "flex",
      altText: altText || "您收到一則訊息",
      contents: flexMsg
    };
    await liff.shareTargetPicker([message]);
    window.showToast('✅ 已成功發送！');
  } catch (err) {
    window.showToast('發送失敗：' + (err.message || '未知錯誤'), true);
  }
};

// 統一處理畫面權限解鎖(防止閃爍)
window.applyUserPermissions = function() {
  window.hasAdminRights = (window.userRole === 'admin' || window.userRole === 'store');

  const adminBadge = document.getElementById('header-admin-badge');
  const adminSwitch = document.getElementById('admin-switch-container');
  const topNavSwitch = document.getElementById('top-nav-switch');
  const bannerMgmtBlock = document.getElementById('details-store-banner');
  const storeMgmtBlock = document.getElementById('details-store-management');

  if (window.hasAdminRights) {
    if (adminBadge) adminBadge.classList.remove('hidden');
    if (adminSwitch) adminSwitch.classList.remove('hidden');
    if (topNavSwitch) topNavSwitch.classList.remove('hidden');
    if (bannerMgmtBlock) bannerMgmtBlock.classList.remove('hidden');
  } else {
    if (adminBadge) adminBadge.classList.add('hidden');
    if (adminSwitch) adminSwitch.classList.add('hidden');
    if (topNavSwitch) topNavSwitch.classList.add('hidden');
    if (bannerMgmtBlock) bannerMgmtBlock.classList.add('hidden');
  }

  if (window.userRole === 'admin') {
    if (storeMgmtBlock) storeMgmtBlock.classList.remove('hidden');
  } else {
    if (storeMgmtBlock) storeMgmtBlock.classList.add('hidden');
  }
};

// 🚀 強效配對機制：如果 ID 找不到，用「手機號碼」強制抓回使用者的名片！
window.syncUserCardMatch = function() {
  if (!window.currentUserProfile || !window.allCards || window.allCards.length === 0) {
    return false;
  }

  const uid = String(window.currentUserProfile.userId).trim();
  const uPhone = window.currentUser?.phone ? String(window.currentUser.phone).replace(/[^0-9]/g, '') : null;

  window.currentUserCard = window.allCards.find(c => {
    // 1. 常規 ID 配對
    if (c['LINE ID'] && String(c['LINE ID']).trim() === uid) return true;
    if (c['userId'] && String(c['userId']).trim() === uid) return true;
    if (c['User ID'] && String(c['User ID']).trim() === uid) return true;

    // 2. 終極備援配對：ID 遺失或對不上時，用「手機號碼」強制配對
    if (uPhone && c['手機號碼']) {
      const cPhone = String(c['手機號碼']).replace(/[^0-9]/g, '');
      if (cPhone === uPhone && cPhone.length >= 9) {
        // 自動幫他把遺失的 ID 補回去
        c['LINE ID'] = uid; 
        return true;
      }
    }
    return false;
  });

  return !!window.currentUserCard;
};

// 初始化載入
window.loadAllData = async function() {
  try {
    const cardsRes = await window.fetchAPI('getCardContacts', {}, true);
    window.allCards = (cardsRes && Array.isArray(cardsRes)) ? cardsRes : [];
    
    // 執行強效配對
    window.syncUserCardMatch();

    const actsRes = await window.fetchAPI('getPublicActivities', {}, true);
    window.allActivities = (actsRes && Array.isArray(actsRes)) ? actsRes : [];

    if (typeof window.renderCardList === 'function') window.renderCardList(window.allCards);
    
    // 同步重啟所有 UI 確保畫面更新
    if (typeof window.initMyECard === 'function') window.initMyECard();
    if (typeof window.initSettingsPage === 'function') window.initSettingsPage();
    if (typeof window.loadUserActivities === 'function') window.loadUserActivities();
    if (typeof window.renderActivities === 'function') window.renderActivities();
    
  } catch (err) {
    console.error("資料載入失敗:", err);
  }
};

/* ==================== 名片庫模組 (Cards) ==================== */

window.renderCardList = function(cards) {
  const list = document.getElementById('card-list');
  if (!cards || cards.length === 0) {
    list.innerHTML = '<div class="bg-white p-8 rounded-3xl text-center text-slate-400 border border-slate-100 shadow-sm"><span class="material-symbols-outlined text-4xl mb-2 text-slate-300">search_off</span><p class="font-bold text-[13px]">目前沒有找到任何名片</p></div>';
    return;
  }

  const displayCards = [...cards].reverse();

  const html = displayCards.map(c => {
    let rawService = c['服務項目'] || c['職稱'] || c['公司名稱'] || '';
    let serviceStr = String(rawService).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ');
    if (serviceStr.length > 25) serviceStr = serviceStr.substring(0, 25) + '...';
    
    let tagHtml = '';
    if (c['標籤']) {
      tagHtml = String(c['標籤']).split(' ').map(t => `<span class="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold mr-1">${window.escapeHTML(t)}</span>`).join('');
    }

    let imgHtml = '';
    let cfg = {};
    try { cfg = JSON.parse(c['自訂名片設定'] || '{}'); } catch(e){}
    let imgUrl = cfg.imgUrl || c['名片圖檔'] || '';
    if (imgUrl) {
      imgHtml = `<img src="${window.escapeHTML(imgUrl)}" class="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-100 shadow-sm">`;
    } else {
      imgHtml = `<div class="w-12 h-12 rounded-xl bg-slate-100 text-slate-300 flex items-center justify-center shrink-0 shadow-sm"><span class="material-symbols-outlined">person</span></div>`;
    }

    return `
      <div class="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all cursor-pointer flex gap-3 items-center" onclick="window.openCardDetailByRowId('${c.rowId}')">
        ${imgHtml}
        <div class="flex-1 min-w-0">
          <div class="font-black text-slate-800 text-[16px] leading-tight flex items-center gap-1">
             ${window.escapeHTML(c['姓名'] || '未知')}
             ${c['LINE ID'] === window.currentUserProfile?.userId ? '<span class="bg-primary-light text-primary text-[9px] px-1.5 py-0.5 rounded font-black tracking-wider">我的</span>' : ''}
          </div>
          <div class="text-[12px] text-slate-500 font-medium truncate mt-0.5">${serviceStr}</div>
          ${tagHtml ? `<div class="mt-1.5 truncate">${tagHtml}</div>` : ''}
        </div>
        <span class="material-symbols-outlined text-slate-300 text-[20px] shrink-0">chevron_right</span>
      </div>
    `;
  }).join('');
  list.innerHTML = html;
};

window.filterCards = function() {
  const keyword = document.getElementById('search-card-input').value.toLowerCase().trim();
  if (!keyword) {
    window.renderCardList(window.allCards);
    return;
  }
  const filtered = window.allCards.filter(c => {
    const str = [c['姓名'], c['公司名稱'], c['手機號碼'], c['公司電話'], c['標籤']].join(' ').toLowerCase();
    return str.includes(keyword);
  });
  window.renderCardList(filtered);
};

window.openCardDetailByRowId = function(rowId) {
  const c = window.allCards.find(card => String(card.rowId) === String(rowId));
  if (c) window.openCardDetail(c);
};

window.openCardDetail = function(card) {
  if (!card) return;
  window.currentCard = card;
  
  const isOwner = (card['LINE ID'] === window.currentUserProfile?.userId);
  const isAdminOrStore = (window.userRole === 'admin' || window.userRole === 'store');
  const isSameNetwork = (card['歸屬網'] === window.currentNetworkId);
  const canEdit = isOwner || isAdminOrStore || isSameNetwork;

  const tabEdit = document.getElementById('tab-edit');
  const tabEcard = document.getElementById('tab-ecard');
  const btnDelete = document.getElementById('btn-delete-card');

  if (canEdit) {
    tabEdit.classList.remove('hidden');
    tabEcard.classList.remove('hidden');
    if (btnDelete) btnDelete.classList.remove('hidden');
  } else {
    tabEdit.classList.add('hidden');
    tabEcard.classList.add('hidden');
    if (btnDelete) btnDelete.classList.add('hidden');
    window.switchTab('info'); 
  }

  let infoHtml = '';
  const displayFields = [
    { label: '公司名稱', icon: 'business', key: '公司名稱' },
    { label: '職稱', icon: 'badge', key: '職稱' },
    { label: '手機號碼', icon: 'smartphone', key: '手機號碼', isPhone: true },
    { label: '公司電話', icon: 'call', key: '公司電話', isPhone: true },
    { label: '電子郵件', icon: 'mail', key: '電子郵件' },
    { label: '公司網址', icon: 'language', key: '公司網址' },
    { label: '公司地址', icon: 'location_on', key: '公司地址' },
    { label: '服務項目', icon: 'design_services', key: '服務項目' },
    { label: '標籤', icon: 'label', key: '標籤' },
  ];

  displayFields.forEach(f => {
    let val = card[f.key];
    if (val) {
      let displayVal = window.escapeHTML(val);
      if (f.key === '服務項目') displayVal = displayVal.replace(/\n/g, '<br>');
      if (f.key === '標籤') displayVal = val.split(' ').map(t => `<span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold text-[11px] mr-1">${window.escapeHTML(t)}</span>`).join('');
      
      let actionHtml = '';
      if (f.isPhone) actionHtml = `<a href="tel:${val.replace(/[^0-9+]/g, '')}" class="text-[#06C755] bg-green-50 p-1.5 rounded-lg active:scale-90 transition-transform"><span class="material-symbols-outlined text-[18px]">call</span></a>`;
      else if (f.key === '公司地址') actionHtml = `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(val)}" target="_blank" class="text-blue-500 bg-blue-50 p-1.5 rounded-lg active:scale-90 transition-transform"><span class="material-symbols-outlined text-[18px]">map</span></a>`;
      else if (f.key === '電子郵件') actionHtml = `<a href="mailto:${val}" class="text-orange-500 bg-orange-50 p-1.5 rounded-lg active:scale-90 transition-transform"><span class="material-symbols-outlined text-[18px]">mail</span></a>`;

      infoHtml += `
        <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex gap-3">
          <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shrink-0 shadow-sm border border-slate-100">
            <span class="material-symbols-outlined text-[16px]">${f.icon}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-bold text-slate-400 mb-0.5">${f.label}</p>
            <p class="text-[14px] text-slate-700 font-medium leading-relaxed">${displayVal}</p>
          </div>
          ${actionHtml}
        </div>
      `;
    }
  });
  
  if (!infoHtml) infoHtml = '<div class="text-center text-slate-400 py-8 text-sm">無詳細資料</div>';
  document.getElementById('detail-fields').innerHTML = infoHtml;

  if (canEdit) {
    const editableFields = ['姓名','英文名','職稱','部門','公司名稱','統一編號','手機號碼','公司電話','分機','傳真','電子郵件','公司網址','社群帳號','公司地址','服務項目','建檔人/備註'];
    editableFields.forEach(f => {
      const el = document.getElementById('edit-' + f);
      if (el) el.value = card[f] || '';
    });

    if (typeof window.initECardSettings === 'function') {
      window.initECardSettings(card);
    }

    let cfg = {};
    try { cfg = JSON.parse(card['自訂名片設定'] || '{}'); } catch(e){}
    const colorInput = document.getElementById('edit-desc-color');
    if(colorInput) colorInput.value = cfg.descColor || '#666666';

    if (typeof window.setDescAlign === 'function') {
      window.setDescAlign(cfg.descAlign || 'center');
    }

    window.currentLoadedCardId = null; 
  }

  const btnClaim = document.getElementById('btn-send-claim');
  if (btnClaim) {
    if (card['LINE ID']) {
      btnClaim.classList.add('hidden'); 
    } else {
      btnClaim.classList.remove('hidden'); 
    }
  }

  window.goPage('card-detail');
};

window.setDescAlign = function(align) {
  window.currentDescAlign = align;
  ['start', 'center', 'end'].forEach(a => {
    const btn = document.getElementById('align-' + a);
    if (btn) {
      if (a === align) {
        btn.classList.add('bg-white', 'shadow-sm');
      } else {
        btn.classList.remove('bg-white', 'shadow-sm');
      }
    }
  });
  if (typeof window.updateECardPreview === 'function') {
    window.updateECardPreview();
  }
};

window.switchTab = function(tab) {
  if (tab !== 'info') {
    const isOwner = (window.currentCard['LINE ID'] === window.currentUserProfile?.userId);
    const isAdminOrStore = (window.userRole === 'admin' || window.userRole === 'store');
    const isSameNetwork = (window.currentCard['歸屬網'] === window.currentNetworkId);
    if (!isOwner && !isAdminOrStore && !isSameNetwork) {
      window.showToast('權限不足，無法編輯此名片', true);
      return;
    }
  }

  ['info', 'edit', 'ecard'].forEach(t => {
    document.getElementById('tab-content-' + t).classList.add('hidden');
    const btn = document.getElementById('tab-' + t);
    btn.classList.remove('text-blue-600', 'border-blue-600');
    btn.classList.add('text-slate-400', 'border-transparent');
  });

  document.getElementById('tab-content-' + tab).classList.remove('hidden');
  const activeBtn = document.getElementById('tab-' + tab);
  activeBtn.classList.remove('text-slate-400', 'border-transparent');
  activeBtn.classList.add('text-blue-600', 'border-blue-600');
};

window.saveCardEdit = async function() {
  if (!window.currentCard) return;
  const btn = document.getElementById('btn-save');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  btn.disabled = true;

  const editableFields = ['姓名','英文名','職稱','部門','公司名稱','統一編號','手機號碼','公司電話','分機','傳真','電子郵件','公司網址','社群帳號','公司地址','服務項目','建檔人/備註'];
  let payloadData = {};
  editableFields.forEach(f => {
    const el = document.getElementById('edit-' + f);
    if (el) payloadData[f] = el.value.trim();
  });

  try {
    const res = await window.fetchAPI('updateCard', { rowId: window.currentCard.rowId, data: payloadData }, true);
    if (res) {
      window.showToast('✅ 變更已儲存');
      Object.keys(payloadData).forEach(k => { window.currentCard[k] = payloadData[k]; });
      
      if (typeof window.allCards !== 'undefined') {
        const match = window.allCards.find(c => String(c.rowId) === String(window.currentCard.rowId));
        if (match) {
           Object.keys(payloadData).forEach(k => { match[k] = payloadData[k]; });
        }
      }
      if (typeof window.currentUserCard !== 'undefined' && window.currentUserCard && String(window.currentUserCard.rowId) === String(window.currentCard.rowId)) {
         Object.keys(payloadData).forEach(k => { window.currentUserCard[k] = payloadData[k]; });
      }

      if (typeof window.updateECardPreview === 'function') window.updateECardPreview();
      window.openCardDetail(window.currentCard); 
    }
  } catch(e) {
    window.showToast('⚠️ 儲存失敗:' + e.message, true);
  } finally {
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> 儲存變更';
    btn.disabled = false;
  }
};

window.deleteCard = async function() {
  if (!window.currentCard) return;
  if (!confirm("確定要刪除這張名片嗎？此操作無法還原！")) return;
  
  try {
    const res = await window.fetchAPI('deleteCard', { rowId: window.currentCard.rowId }, true);
    if (res) {
      window.showToast('✅ 已刪除名片');
      if (typeof window.allCards !== 'undefined') {
        const idx = window.allCards.findIndex(c => String(c.rowId) === String(window.currentCard.rowId));
        if (idx !== -1) {
          window.allCards.splice(idx, 1);
          window.renderCardList(window.allCards);
        }
      }
      window.goPage('card');
    }
  } catch(e) {
    window.showToast('⚠️ 刪除失敗:' + e.message, true);
  }
};
