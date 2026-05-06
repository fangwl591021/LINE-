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
    // ✅ 安全拷貝：絕不直接改動原始 payload，防止參數污染
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

window.loadAllData = async function() {
  try {
    const cardsRes = await window.fetchAPI('getCardContacts', {}, true);
    
    // ✅ 恢復原狀：絕對不可以直接反轉(reverse)底層陣列，否則 find 會抓到錯誤的名片！
    window.allCards = (cardsRes && Array.isArray(cardsRes)) ? cardsRes : [];
    
    if (typeof window.currentUserProfile !== 'undefined' && window.currentUserProfile) {
      window.currentUserCard = window.allCards.find(c => c['LINE ID'] === window.currentUserProfile.userId);
    }

    const actsRes = await window.fetchAPI('getPublicActivities', {}, true);
    window.allActivities = (actsRes && Array.isArray(actsRes)) ? actsRes : [];

    if (typeof window.renderCardList === 'function') window.renderCardList(window.allCards);
    if (typeof window.initMyECard === 'function') window.initMyECard();
    if (typeof window.loadUserActivities === 'function') window.loadUserActivities();
    if (typeof window.renderActivities === 'function') window.renderActivities();
    
  } catch (err) {
    console.error("資料載入失敗:", err);
  }
};
