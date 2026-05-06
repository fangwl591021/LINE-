/* ==================== 設定與參數管理 (Settings) ==================== */

window.initSettingsPage = function() {
  if (!window.currentUserProfile) return;

  const bindInput = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  if (window.currentUser) {
    bindInput('profile-name', window.currentUser.name);
    bindInput('profile-phone', window.currentUser.phone);
    bindInput('profile-industry', window.currentUser.industry);
    bindInput('profile-birthday', window.currentUser.birthday);

    bindInput('setting-tg-token', window.currentUser.tgToken);
    bindInput('setting-tg-chatid', window.currentUser.tgChatId);

    window.userSocials = [];
    if (window.currentUser.socials) {
      try {
        window.userSocials = typeof window.currentUser.socials === 'string' 
          ? JSON.parse(window.currentUser.socials) 
          : window.currentUser.socials;
      } catch(e) {}
    }
  } else {
    window.userSocials = [];
  }
  
  window.renderUserSocials();

  if (window.hasAdminRights) {
    window.loadStoreBannerSettings();
  }
};

window.renderUserSocials = function() {
  const container = document.getElementById('user-socials-list');
  if (!container) return;
  const socialTypes = ['LINE','FB','IG','YT','TEL','WEB'];
  
  if (!window.userSocials || window.userSocials.length === 0) {
    container.innerHTML = '<p class="text-[12px] text-slate-400 text-center py-2">尚未設定任何連結</p>';
    return;
  }

  container.innerHTML = window.userSocials.map((s, i) =>
    '<div class="flex gap-2 items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">' +
      '<select class="bg-white border-none rounded-lg p-2.5 text-[12px] font-bold shadow-sm focus:ring-2 focus:ring-blue-500/30 outline-none w-[70px] shrink-0 cursor-pointer" onchange="window.userSocials['+i+'].type=this.value" style="-webkit-appearance:none;appearance:none;">' +
        socialTypes.map(t => '<option value="' + t + '" ' + (s.type===t?'selected':'') + '>' + t + '</option>').join('') +
      '</select>' +
      '<input class="flex-1 bg-white border-none rounded-lg p-2.5 text-[12px] font-mono shadow-sm focus:ring-2 focus:ring-blue-500/30 outline-none" placeholder="https://" value="' + window.escapeJS(s.url||'') + '" oninput="window.userSocials['+i+'].url=this.value">' +
      '<button type="button" onclick="window.userSocials.splice('+i+',1);window.renderUserSocials()" class="text-red-400 bg-red-50 hover:bg-red-100 w-9 h-9 rounded-lg flex items-center justify-center shrink-0 active:scale-90 transition-transform"><span class="material-symbols-outlined text-[18px]">delete</span></button>' +
    '</div>'
  ).join('');
};

window.addUserSocial = function() {
  if (!window.userSocials) window.userSocials = [];
  if (window.userSocials.length >= 5) {
    window.showToast('最多只能設定 5 個連結', true);
    return;
  }
  window.userSocials.push({type: 'LINE', url: ''});
  window.renderUserSocials();
};

window.saveUserSettings = async function(event) {
  const btn = event.currentTarget || document.getElementById('btn-save-settings');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  btn.disabled = true;

  window.userSocials.forEach(s => { s.url = window.cleanURI(s.url); });

  const payloadData = {
    '社群帳號': JSON.stringify(window.userSocials),
    'TG Token': document.getElementById('setting-tg-token')?.value.trim() || '',
    'TG Chat ID': document.getElementById('setting-tg-chatid')?.value.trim() || ''
  };

  try {
    const res = await window.fetchAPI('updateUserProfile', {
      userId: window.currentUserProfile.userId,
      data: payloadData
    }, true);

    if (res && !res.error) {
      window.showToast('✅ 系統參數已更新！');
      if (window.currentUser) {
        window.currentUser.socials = payloadData['社群帳號'];
        window.currentUser.tgToken = payloadData['TG Token'];
        window.currentUser.tgChatId = payloadData['TG Chat ID'];
      }
    } else {
      throw new Error(res.error || '更新失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
  } finally {
    if(btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
};

window.updateUserProfile = async function(event) {
  const btn = event.currentTarget;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  btn.disabled = true;

  const data = {
    name: document.getElementById('profile-name')?.value || '',
    phone: document.getElementById('profile-phone')?.value || '',
    industry: document.getElementById('profile-industry')?.value || '',
    birthday: document.getElementById('profile-birthday')?.value || ''
  };

  try {
    const res = await window.fetchAPI('updateUserProfile', {
      userId: window.currentUserProfile.userId,
      data: data
    }, true);

    if (res) {
      window.showToast('✅ 個人資料已更新');
      if (window.currentUser) {
        window.currentUser.name = data.name;
        window.currentUser.phone = data.phone;
        window.currentUser.industry = data.industry;
        window.currentUser.birthday = data.birthday;
      }
    }
  } catch(e) {
    window.showToast('⚠️ 儲存失敗', true);
  } finally {
    if(btn){
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
};

// ==================== 首頁 Banner 管理 (PRO) ====================

// 載入 Store Banner 邏輯
window.loadStoreBannerSettings = function() {
  if (!window.currentUserCard && typeof window.syncUserCardMatch === 'function') {
    window.syncUserCardMatch();
  }

  let cfg = {};

  if (window.currentUserCard) {
    try { 
      cfg = JSON.parse(window.currentUserCard['自訂名片設定'] || '{}'); 
    } catch(e) {}
  }
  
  if (!cfg.homeBanner) {
    const cacheKey = 'store_banner_' + window.currentNetworkId;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        cfg.homeBanner = parsed.homeBanner || cfg.homeBanner;
        cfg.siteName = parsed.siteName || cfg.siteName;
        cfg.homeYoutube = parsed.homeYoutube || cfg.homeYoutube;
        if (parsed.showBanner !== undefined) cfg.showBanner = parsed.showBanner;
        if (parsed.showYoutube !== undefined) cfg.showYoutube = parsed.showYoutube;
      }
    } catch(e) {}
  }

  const siteNameEl = document.getElementById('input-site-name');
  if (siteNameEl) siteNameEl.value = cfg.siteName || '';

  const bannerImgEl = document.getElementById('input-store-banner');
  const toggleBannerEl = document.getElementById('toggle-show-banner');
  const previewBannerEl = document.getElementById('setting-preview-banner');
  
  if (bannerImgEl) bannerImgEl.value = cfg.homeBanner || '';
  if (toggleBannerEl) toggleBannerEl.checked = cfg.showBanner !== false; 
  if (previewBannerEl && cfg.homeBanner) previewBannerEl.src = cfg.homeBanner;

  const ytEl = document.getElementById('input-store-youtube');
  const toggleYtEl = document.getElementById('toggle-show-youtube');
  
  if (ytEl) ytEl.value = cfg.homeYoutube || '';
  if (toggleYtEl) toggleYtEl.checked = cfg.showYoutube !== false; 
};

window.saveStoreBanner = async function(event) {
  const btn = event.currentTarget || document.getElementById('btn-save-store-banner');

  if (!window.currentUserCard && window.currentUserProfile) {
    if (typeof window.syncUserCardMatch === 'function') {
       window.syncUserCardMatch();
    }
  }

  if (!window.currentUserCard) {
    return window.showToast('⚠️ 找不到名片連結，請先至名片庫建立或認領名片', true);
  }

  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  btn.disabled = true;

  let cfg = {};
  try { cfg = JSON.parse(window.currentUserCard['自訂名片設定'] || '{}'); } catch(e){}

  const bannerInput = document.getElementById('input-store-banner');
  if (bannerInput) cfg.homeBanner = bannerInput.value.trim();

  const ytInput = document.getElementById('input-store-youtube');
  if (ytInput) cfg.homeYoutube = ytInput.value.trim();

  const siteNameInput = document.getElementById('input-site-name');
  if (siteNameInput) {
    const newName = siteNameInput.value.trim();
    cfg.siteName = newName || 'LINE商機引擎';
  }

  const toggleBanner = document.getElementById('toggle-show-banner');
  if (toggleBanner) cfg.showBanner = toggleBanner.checked;

  const toggleYt = document.getElementById('toggle-show-youtube');
  if (toggleYt) cfg.showYoutube = toggleYt.checked;

  try {
    const updateData = { 
      '自訂名片設定': JSON.stringify(cfg), 
      '名片圖檔': cfg.imgUrl || window.currentUserCard['名片圖檔'] || '' 
    };

    const res = await window.fetchAPI('updateCard', {
      rowId: window.currentUserCard.rowId,
      data: updateData
    }, true);
    
    if (res && !res.error) {
      // 1. 更新前端當前的名片暫存物件
      window.currentUserCard['自訂名片設定'] = updateData['自訂名片設定'];
      
      // 2. ✅ 同步更新全域 allCards 陣列中的對應資料（解決同步問題）
      if (window.allCards && window.allCards.length > 0) {
        const match = window.allCards.find(c => String(c.rowId) === String(window.currentUserCard.rowId));
        if (match) {
          match['自訂名片設定'] = updateData['自訂名片設定'];
        }
      }

      // 3. 更新 LocalStorage 快取
      const cacheKey = 'store_banner_' + window.currentNetworkId;
      localStorage.setItem(cacheKey, JSON.stringify({
        homeBanner: cfg.homeBanner,
        homeYoutube: cfg.homeYoutube,
        siteName: cfg.siteName,
        showBanner: cfg.showBanner,
        showYoutube: cfg.showYoutube
      }));

      window.showToast('✅ 設定已成功儲存至雲端！');
      
      // 4. 即時更新首頁 UI
      if (typeof window.updateHomeBanner === 'function') {
        window.updateHomeBanner();
      }
    } else {
      throw new Error(res.error || 'API 儲存失敗');
    }
  } catch(e) {
    window.showToast('⚠️ 儲存失敗:' + e.message, true);
  } finally {
    if(btn){
      btn.innerHTML = oriHtml;
      btn.disabled = false;
    }
  }
};

window.showInviteLink = function() {
  if (!window.currentUserProfile) {
    window.showToast('請先完成登入與註冊', true);
    return;
  }
  
  const uid = window.currentUserProfile.userId;
  const inviteUrl = `https://liff.me/${LIFF_ID}?ref=${uid}&net=${window.currentNetworkId}`;
  
  document.getElementById('invite-link-input').value = inviteUrl;
  document.getElementById('invite-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(inviteUrl)}&color=000000&bgcolor=FFFFFF`;
  document.getElementById('invite-tracking-info').innerText = `Ref: ${uid.substring(0,8)}... | Net: ${window.currentNetworkId}`;
  document.getElementById('invite-link-modal').classList.remove('hidden');
};

window.closeInviteModal = function() {
  document.getElementById('invite-link-modal').classList.add('hidden');
};

window.copyInviteLink = function() {
  const copyText = document.getElementById("invite-link-input");
  copyText.select();
  copyText.setSelectionRange(0, 99999);
  
  try {
    navigator.clipboard.writeText(copyText.value).then(() => {
      window.showToast("✅ 連結已複製");
    }).catch(err => {
      document.execCommand("copy"); 
      window.showToast("✅ 連結已複製");
    });
  } catch (err) {
    document.execCommand("copy");
    window.showToast("✅ 連結已複製");
  }
};

window.shareInviteLink = async function() {
  const url = document.getElementById("invite-link-input").value;
  const msg = {
    type: "flex",
    altText: "誠摯邀請您加入智能商機網絡",
    contents: {
      type: "bubble",
      size: "mega",
      hero: {
        type: "image",
        url: "https://images.unsplash.com/photo-1556761175-5973dc0f32d7?w=800&q=80",
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "商務人脈智能配對", weight: "bold", size: "xl", color: "#06C755" },
          { type: "text", text: "點擊下方連結立即啟用專屬智能名片，體驗 AI 推薦精準人脈！", size: "sm", color: "#666666", wrap: true, margin: "md" }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "button", style: "primary", height: "sm", color: "#06C755", action: { type: "uri", label: "立即加入", uri: url } }
        ]
      }
    }
  };
  
  window.triggerFlexSharing(msg, "邀請您加入商務智能網絡");
};
