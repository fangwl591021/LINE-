/* ==================== 設定模組(社群、TG、Banner) ==================== */

// 渲染社群連結列
window.renderUserSocials = function() {
  const container = document.getElementById('user-socials-list');
  if (!container) return;
  const socialTypes = ['LINE','FB','IG','YT','TEL','WEB'];
  container.innerHTML = window.userSocials.map((s, i) =>
    '<div class="flex gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-100">' +
      '<select class="bg-white border-none rounded-lg p-2.5 text-[12px] font-bold shadow-sm focus:ring-2 focus:ring-blue-500/30 outline-none w-[70px] shrink-0" onchange="window.userSocials['+i+'].type=this.value" style="-webkit-appearance:none;appearance:none;">' +
        socialTypes.map(t => '<option value="' + t + '" ' + (s.type===t?'selected':'') + '>' + t + '</option>').join('') +
      '</select>' +
      '<input class="flex-1 bg-white border-none rounded-lg p-2.5 text-[12px] font-mono shadow-sm focus:ring-2 focus:ring-blue-500/30 outline-none" placeholder="https://" value="' + window.escapeJS(s.url||'') + '" oninput="window.userSocials['+i+'].url=this.value">' +
      '<button type="button" onclick="window.userSocials.splice('+i+',1);window.renderUserSocials()" class="text-red-400 bg-red-50 w-9 h-9 rounded-lg flex items-center justify-center shrink-0 active:scale-90 transition-transform"><span class="material-symbols-outlined text-[18px]">delete</span></button>' +
    '</div>'
  ).join('');
};

// 新增社群
window.addUserSocial = function() {
  window.userSocials.push({type: 'LINE', url: ''});
  window.renderUserSocials();
};

// 儲存社群與 TG 設定
window.saveUserSettings = async function(event) {
  const btn = event.currentTarget || document.getElementById('btn-save-settings');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  btn.disabled = true;

  window.userSocials.forEach(s => { s.url = window.cleanURI(s.url); });

  const payloadData = {
    '社群帳號': JSON.stringify(window.userSocials),
    'TG Token': document.getElementById('setting-tg-token').value.trim(),
    'TG Chat ID': document.getElementById('setting-tg-chatid').value.trim()
  };

  try {
    const res = await window.fetchAPI('updateUserProfile', {
      userId: currentUserProfile.userId,
      data: payloadData
    }, true);

    if (res && !res.error) {
      window.showToast('✅ 系統參數已更新！');
      currentUser.socials = payloadData['社群帳號'];
      currentUser.tgToken = payloadData['TG Token'];
      currentUser.tgChatId = payloadData['TG Chat ID'];
    } else {
      throw new Error(res.error || '更新失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
};

// 儲存 Store Banner / YouTube / 系統名稱
window.saveStoreBanner = async function(event) {
  const btn = event.currentTarget || document.getElementById('btn-save-store-banner');

  if (!currentUserCard && currentUserProfile) {
    currentUserCard = allCards.find(c =>
      String(c['LINE ID']).trim() === currentUserProfile.userId ||
      String(c.userId).trim() === currentUserProfile.userId
    );
  }

  if (!currentUserCard) {
    window.showToast('正在初始化您的商家專屬檔案...', false);
    try {
      const newCardPayload = {
        userId: currentUserProfile.userId,
        姓名: currentUser?.name || '商家代表',
        手機號碼: currentUser?.phone || '',
        服務項目: currentUser?.industry || '',
        自訂名片設定: '{}',
        名片圖檔: ''
      };
      const res = await window.fetchAPI('saveCard', newCardPayload, true);
      if (res && res.rowId) {
        newCardPayload.rowId = res.rowId;
        allCards.unshift(newCardPayload);
        currentUserCard = newCardPayload;
      } else {
        throw new Error('無法初始化檔案');
      }
    } catch(e) {
      return window.showToast('⚠️ 找不到綁定紀錄。請先至「我的專屬名片」點擊生成', true);
    }
  }

  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  btn.disabled = true;

  let cfg = {};
  try { cfg = JSON.parse(currentUserCard['自訂名片設定'] || '{}'); } catch(e){}

  const bannerInput = document.getElementById('input-store-banner');
  if (bannerInput) cfg.homeBanner = bannerInput.value.trim();

  const ytInput = document.getElementById('input-store-youtube');
  if (ytInput) cfg.homeYoutube = ytInput.value.trim();

  const siteNameInput = document.getElementById('input-site-name');
  if (siteNameInput) {
    const newName = siteNameInput.value.trim();
    cfg.siteName = newName || 'LINE商機引擎';
  }

  try {
    await window.fetchAPI('updateCard', {
      rowId: currentUserCard.rowId,
      data: { '自訂名片設定': JSON.stringify(cfg), '名片圖檔': cfg.imgUrl || currentUserCard['名片圖檔'] || '' }
    }, true);
    currentUserCard['自訂名片設定'] = JSON.stringify(cfg);

    // 🚀 新增：儲存成功後立即寫入快取，確保下次進入不會跳回預設
    const cacheKey = 'store_banner_' + currentNetworkId;
    localStorage.setItem(cacheKey, JSON.stringify({
      homeBanner: cfg.homeBanner || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1000&q=80',
      homeYoutube: cfg.homeYoutube || '',
      siteName: cfg.siteName || 'LINE商機引擎'
    }));

    window.showToast('✅ 首頁 Banner 與影片已更新！');
    window.updateHomeBanner();
  } catch(e) {
    window.showToast('⚠️ 儲存失敗:' + e.message, true);
  } finally {
    btn.innerHTML = oriHtml;
    btn.disabled = false;
  }
};
