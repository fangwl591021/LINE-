/* ==================== 首頁模組(Banner、活動列表、活動紀錄) ==================== */

// 更新首頁 Banner / YouTube / 系統名稱 (加入開關邏輯)
window.updateHomeBanner = function() {
  let bannerUrl = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1000&q=80';
  let ytUrl = '';
  let siteName = 'LINE商機引擎';
  let showBanner = true;
  let showYoutube = true;

  // 1. 嘗試從 localStorage 拿快取 (避免首頁延遲跳動)
  const cacheKey = 'store_banner_' + currentNetworkId;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.homeBanner) bannerUrl = parsed.homeBanner;
      if (parsed.homeYoutube) ytUrl = parsed.homeYoutube;
      if (parsed.siteName) siteName = parsed.siteName;
      if (parsed.showBanner !== undefined) showBanner = parsed.showBanner;
      if (parsed.showYoutube !== undefined) showYoutube = parsed.showYoutube;
    }
  } catch(e) {}

  // 2. 如果名片庫已載入，則以資料庫為準，並更新快取
  if (allCards && allCards.length > 0) {
    const ownerCard = allCards.find(c => String(c['LINE ID']).trim() === currentNetworkId);
    if (ownerCard && ownerCard['自訂名片設定']) {
      try {
        const cfg = JSON.parse(ownerCard['自訂名片設定']);
        if (cfg.homeBanner) bannerUrl = cfg.homeBanner;
        if (cfg.homeYoutube) ytUrl = cfg.homeYoutube;
        if (cfg.siteName) siteName = cfg.siteName;
        if (cfg.showBanner !== undefined) showBanner = cfg.showBanner;
        if (cfg.showYoutube !== undefined) showYoutube = cfg.showYoutube;
        
        // 更新快取
        localStorage.setItem(cacheKey, JSON.stringify({
          homeBanner: bannerUrl,
          homeYoutube: ytUrl,
          siteName: siteName,
          showBanner: showBanner,
          showYoutube: showYoutube
        }));
      } catch(e){}
    }
  }

  // --- 執行渲染 ---
  const headerEl = document.getElementById('header-site-name');
  if (headerEl) headerEl.textContent = siteName;
  
  // 更新設定頁控制項
  const inputEl = document.getElementById('input-site-name');
  if (inputEl && !inputEl.value) inputEl.value = siteName === 'LINE商機引擎' ? '' : siteName;

  const inputYtEl = document.getElementById('input-store-youtube');
  if (inputYtEl && !inputYtEl.value) inputYtEl.value = ytUrl;

  const inputBannerEl = document.getElementById('input-store-banner');
  if (inputBannerEl && !inputBannerEl.value) inputBannerEl.value = bannerUrl === 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1000&q=80' ? '' : bannerUrl;

  const settingPreviewBanner = document.getElementById('setting-preview-banner');
  if (settingPreviewBanner && bannerUrl) settingPreviewBanner.src = bannerUrl;

  // 設定頁開關同步
  const toggleB = document.getElementById('toggle-show-banner');
  if (toggleB) toggleB.checked = showBanner;
  const toggleY = document.getElementById('toggle-show-youtube');
  if (toggleY) toggleY.checked = showYoutube;

  // 首頁 Banner 顯示/隱藏
  const bannerImg = document.getElementById('home-main-banner');
  if (bannerImg) {
    bannerImg.src = bannerUrl;
    bannerImg.parentElement.classList.toggle('hidden', !showBanner);
  }

  // 首頁 YouTube 顯示/隱藏
  const ytContainer = document.getElementById('home-youtube-container');
  const ytIframe = document.getElementById('home-youtube-iframe');
  if (ytContainer && ytIframe) {
    if (showYoutube && ytUrl) {
      const match = ytUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      const videoId = match ? match[1] : null;
      if (videoId) {
        ytIframe.src = 'https://www.youtube.com/embed/' + videoId + '?rel=0&modestbranding=1';
        ytContainer.classList.remove('hidden');
      } else {
        ytContainer.classList.add('hidden');
      }
    } else {
      ytContainer.classList.add('hidden');
      ytIframe.src = '';
    }
  }
};

// 活動快取與標籤狀態
window._homeActivitiesCache = [];
window._currentActTag = '全部';

// 載入首頁公開活動列表
window.loadUserActivities = async function(forceRefresh = false) {
  const container = document.getElementById('user-activities-list');
  if (!container) return;

  if (forceRefresh || window._homeActivitiesCache.length === 0) {
    try {
      const res = await window.fetchAPI('getPublicActivities', {}, true);
      if (res && res.length > 0) {
        window._homeActivitiesCache = res.filter(a => a['狀態'] === '上架').reverse();
      } else {
        window._homeActivitiesCache = [];
      }
    } catch(e) {
      container.innerHTML = '<div class="text-center py-6 text-red-400 text-sm font-bold">無法載入活動</div>';
      return;
    }
  }

  window.renderHomeActivities();
};

// 渲染活動列表 (標籤 + 一排兩個 Grid + 雙按鈕)
window.renderHomeActivities = function() {
  const container = document.getElementById('user-activities-list');
  if (!container) return;

  const validActs = window._homeActivitiesCache;
  if (validActs.length === 0) {
    container.innerHTML = '<div class="bg-white rounded-2xl p-6 text-center shadow-sm border border-slate-100 text-slate-400 text-sm font-bold">近期無公開活動</div>';
    return;
  }

  // 1. 提取所有活動類型作為標籤
  const tags = ['全部', ...new Set(validActs.map(a => a['活動類型'] || '其他'))];

  // 2. 構建標籤 HTML (橫向捲動)
  const tagsHtml = `<div class="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
    ${tags.map(t => {
      const active = t === window._currentActTag;
      const bg = active ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600';
      return `<button onclick="window.filterHomeActivities('${window.escapeJS(t)}')" class="px-3.5 py-1.5 rounded-full text-[12px] font-medium shrink-0 transition-colors ${bg}">${window.escapeJS(t)}</button>`;
    }).join('')}
  </div>`;

  // 3. 過濾活動
  const filteredActs = window._currentActTag === '全部'
    ? validActs
    : validActs.filter(a => (a['活動類型'] || '其他') === window._currentActTag);

  // 4. 構建 2 Column Grid HTML (模擬 LINE OA 極簡卡片，拆分詳情與報名)
  let gridHtml = '';
  if (filteredActs.length === 0) {
    gridHtml = '<div class="text-center py-8 text-slate-400 text-[13px]">此分類目前無活動</div>';
  } else {
    gridHtml = `<div class="grid grid-cols-2 gap-3 mt-2">
      ${filteredActs.map(act => {
        const title = window.escapeJS(act['活動名稱'] || '未命名活動');
        const time = window.formatDisplayTime(act['開始時間']);
        const fee = parseInt(act['金額']) > 0 ? 'NT$ ' + act['金額'] : '免費';
        const img = act['宣傳圖'] || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80';
        const actId = window.escapeJS(act['活動ID'] || act.rowId || '');

        return `<div class="flex flex-col h-full">
          <div class="w-full aspect-[4/3] relative rounded-xl overflow-hidden bg-slate-100 mb-2 border border-slate-100/50 shrink-0">
            <img src="${img}" class="w-full h-full object-cover">
            <div class="absolute top-1.5 left-1.5 bg-black/50 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded font-medium">${fee}</div>
          </div>
          <div class="flex-1 flex flex-col">
            <h4 class="text-[13px] text-slate-800 font-medium leading-snug line-clamp-2 mb-1">${title}</h4>
            <div class="text-[11px] text-slate-400 mb-2 flex items-center gap-0.5 mt-auto pt-1">
              <span class="material-symbols-outlined text-[12px]">schedule</span> ${time ? time.substring(5,16) : '時間未定'}
            </div>
            
            <div class="flex gap-1.5 mt-1 shrink-0">
              <button type="button" onclick="window.showPublicActivityDetail('${actId}')" class="flex-1 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-[12px] font-medium active:scale-95 transition-all flex justify-center items-center">
                詳情
              </button>
              <button type="button" onclick="window.userJoinActivity('${actId}', '${title}', event)" class="flex-1 py-1.5 bg-blue-50 border border-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-[12px] font-medium active:scale-95 transition-all flex justify-center items-center">
                報名
              </button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  container.innerHTML = tagsHtml + gridHtml;
};

// 標籤篩選觸發器
window.filterHomeActivities = function(tag) {
  window._currentActTag = tag;
  window.renderHomeActivities();
};

// 顯示公開活動詳情彈出視窗
window.showPublicActivityDetail = function(actId) {
  const act = window._homeActivitiesCache.find(a => String(a['活動ID'] || a.rowId) === String(actId));
  if (!act) return;

  const title = window.escapeJS(act['活動名稱'] || '未命名活動');
  const time = window.formatDisplayTime(act['開始時間']);
  const fee = parseInt(act['金額']) > 0 ? 'NT$ ' + act['金額'] : '免費';
  const img = act['宣傳圖'] || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80';
  let rawDesc = act['活動說明'] || '尚無詳細說明';
  const desc = String(rawDesc).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br>').replace(/\n/g, '<br>');

  let modal = document.getElementById('public-act-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'public-act-modal';
    modal.className = 'fixed inset-0 bg-slate-800/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-300 z-[2050] w-full max-w-md mx-auto left-0 right-0';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-white rounded-t-3xl overflow-hidden flex flex-col max-h-[85vh] shadow-2xl animate-in slide-in-from-bottom-8">
      <div class="px-5 py-4 flex justify-between items-center border-b border-slate-100 shrink-0 bg-white">
        <h3 class="text-lg font-black text-slate-800 truncate pr-4">${title}</h3>
        <button onclick="document.getElementById('public-act-modal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:scale-90 transition-transform shrink-0"><span class="material-symbols-outlined">close</span></button>
      </div>

      <div class="flex-1 overflow-y-auto p-0 flex flex-col bg-slate-50">
        <div class="w-full aspect-[16/9] bg-slate-100 relative shrink-0 border-b border-slate-100">
          <img src="${img}" class="w-full h-full object-cover">
          <div class="absolute top-3 left-3 bg-black/50 backdrop-blur-sm text-white text-[11px] px-2 py-1 rounded font-medium">${fee}</div>
        </div>
        <div class="p-5 bg-white">
          <div class="flex items-center gap-2 text-[13px] text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span class="material-symbols-outlined text-[18px] text-blue-500">schedule</span>
            <span class="font-bold">${time ? time : '時間未定'}</span>
          </div>
          <div class="text-[14px] text-slate-700 leading-relaxed font-medium">
            ${desc}
          </div>
        </div>
      </div>

      <div class="bg-white border-t border-slate-100 p-4 pb-safe flex justify-center shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.03)]">
        <button onclick="document.getElementById('public-act-modal').classList.add('hidden'); window.userJoinActivity('${window.escapeJS(actId)}', '${title}', event);" class="w-[90%] py-3.5 bg-[#06C755] text-white rounded-2xl font-bold text-[15px] shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2">
          立即報名
        </button>
      </div>
    </div>
  `;
  
  modal.classList.remove('hidden');
};

// 用戶報名活動
window.userJoinActivity = async function(actId, actName, event) {
  if (!currentUser || !currentUser.name || !currentUser.phone) {
    window.showToast('⚠️ 報名需要姓名與手機,已為您導向設定頁面', true);
    window.goPage('admin-settings');
    const elName = document.getElementById('profile-name');
    if (elName) setTimeout(() => elName.focus(), 300);
    return;
  }

  if (!confirm('確定要報名「' + actName + '」嗎？')) return;
  
  // 處理按鈕動畫狀態
  let btn = event ? event.currentTarget : null;
  let oriHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[14px]">refresh</span>';
    btn.disabled = true;
  }
  
  try {
    const res = await window.fetchAPI('joinActivity', {
      activityId: actId,
      activityName: actName,
      userId: currentUserProfile.userId,
      userName: currentUser.name,
      userPhone: currentUser.phone,
      defaultIdentity: '會員'
    }, true);
    
    if (res && !res.error) {
      window.showToast('🎉 報名成功！');
      if (btn) {
        btn.innerHTML = '<span class="material-symbols-outlined text-[14px]">check_circle</span> 已報名';
        btn.className = 'flex-1 py-1.5 bg-slate-200 text-slate-400 rounded-lg text-[12px] font-medium cursor-not-allowed flex justify-center items-center gap-1 border border-transparent';
      }
    } else {
      throw new Error(res.error || '報名失敗');
    }
  } catch (e) {
    window.showToast('⚠️ ' + e.message, true);
    if (btn) {
      btn.innerHTML = oriHtml;
      btn.disabled = false;
    }
  }
};

// 載入我的活動紀錄
window.loadMyActivities = async function() {
  const container = document.getElementById('my-activities-list');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-10"><span class="material-symbols-outlined animate-spin text-3xl text-slate-300">refresh</span><p class="text-sm text-slate-400 font-bold mt-2">載入紀錄中...</p></div>';

  try {
    const res = await window.fetchAPI('getUserActivities', { phone: currentUser?.phone || '' }, true);
    if (res && res.length > 0) {
      window.myActivitiesData = res.reverse();
      container.innerHTML = window.myActivitiesData.map(act => {
        const title = window.escapeJS(act['活動名稱'] || '未命名活動');
        const time = window.formatDisplayTime(act['開始時間']);
        const price = parseInt(act['金額']) || 0;

        let status = window.escapeJS(act['簽到'] === true || String(act['簽到']).toUpperCase() === 'TRUE' ? '已簽到' : '已報名');
        let payStatus = act['繳費狀態'] || '';

        if (payStatus === '待對帳') status = '待對帳';
        if (payStatus === '已繳費') status = '報名成功 (已繳費)';

        const statusColor = (status === '已簽到' || status.includes('已繳費'))
          ? 'text-slate-400'
          : (status === '待對帳' ? 'text-orange-500' : 'text-[#06C755]');
        const rowId = window.escapeJS(act.rowId);

        return `
          <div onclick="window.showMyActivityDetail('${rowId}')" class="px-5 py-4 flex justify-between items-center active:bg-slate-50 transition-colors cursor-pointer border-b border-slate-50 last:border-0">
            <div class="flex flex-col">
              <span class="text-[15px] font-normal text-slate-800 leading-snug">${title}</span>
              <div class="mt-1 flex items-center gap-3 text-[12px]">
                <span class="text-slate-400">${time ? time.substring(5,16) : '時間未定'}</span>
                <span class="${statusColor} font-normal">${status}</span>
              </div>
            </div>
            <span class="material-symbols-outlined text-slate-300 text-[18px]">chevron_right</span>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<div class="text-center py-10 text-slate-400 text-[13px] font-normal">目前無活動紀錄</div>';
    }
  } catch(e) {
    container.innerHTML = '<div class="text-center py-10 text-red-400 text-[13px] font-normal">無法載入紀錄:' + e.message + '</div>';
  }
};

// 顯示活動明細
window.showMyActivityDetail = function(rowId) {
  const act = window.myActivitiesData.find(a => String(a.rowId) === String(rowId));
  if (!act) return;

  const title = window.escapeJS(act['活動名稱'] || '');
  const time = window.formatDisplayTime(act['開始時間']);
  const price = parseInt(act['金額']) || 0;
  const feeText = price > 0 ? `NT$ ${price}` : '免費';
  const img = act['宣傳圖'] || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80';

  let rawDesc = act['活動說明'] || '';
  const desc = String(rawDesc).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br>').replace(/\n/g, '<br>');

  let status = window.escapeJS(act['簽到'] === true || String(act['簽到']).toUpperCase() === 'TRUE' ? '已簽到' : '已報名');
  let payStatus = act['繳費狀態'] || '';
  if (payStatus === '待對帳') status = '待對帳';
  if (payStatus === '已繳費') status = '報名成功 (已繳費)';
  const statusColor = (status === '已簽到' || status.includes('已繳費'))
    ? 'text-slate-400'
    : (status === '待對帳' ? 'text-orange-500' : 'text-[#06C755]');

  let paymentHtml = '';
  if (payStatus === '未繳費' && price > 0) {
    paymentHtml = `
      <div class="mt-2 flex flex-col gap-2">
        <p class="text-[13px] font-normal text-slate-700">請完成繳費並填寫對帳資訊:</p>
        <div class="flex items-center gap-2">
          <input type="text" id="detail-pay-${act.rowId}" maxlength="5" placeholder="輸入匯款帳號後五碼" class="flex-1 bg-slate-50 border border-slate-100 outline-none rounded-lg px-3 py-2.5 text-[13px] font-mono text-slate-700 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-[12px]">
          <button onclick="window.submitPaymentDetail('${act.rowId}')" class="shrink-0 bg-white text-slate-600 px-4 py-2.5 rounded-lg text-[13px] font-normal active:scale-95 transition-transform border border-slate-200 shadow-sm">提交對帳</button>
        </div>
      </div>
    `;
  }

  const contentContainer = document.getElementById('my-act-detail-content');
  if (!contentContainer) {
    window.showToast('系統錯誤:找不到明細畫面元件', true);
    return;
  }

  contentContainer.innerHTML = `
    <div class="w-full aspect-[16/9] bg-slate-100 mb-5 rounded-2xl overflow-hidden shadow-sm border border-slate-100">
      <img src="${img}" class="w-full h-full object-cover">
    </div>
    <div class="px-2">
      <h3 class="text-[18px] font-normal text-slate-800 leading-snug mb-1">${title}</h3>
      <p class="text-[13px] ${statusColor} font-normal mb-5">${status}</p>

      <div class="border-t border-b border-slate-100 py-3 mb-5 space-y-2">
        <div class="flex items-center gap-2 text-[13px] text-slate-600">
          <span class="material-symbols-outlined text-[16px] text-slate-400">schedule</span>
          <span class="font-normal">${time || '時間未定'}</span>
        </div>
        <div class="flex items-center gap-2 text-[13px] text-slate-600">
          <span class="material-symbols-outlined text-[16px] text-slate-400">payments</span>
          <span class="font-normal">${feeText}</span>
        </div>
      </div>
      ${desc ? '<div class="text-[13px] text-slate-600 leading-relaxed font-normal mb-6">' + desc + '</div>' : ''}
      ${paymentHtml}
    </div>
  `;

  window.goPage('my-act-detail');
};

// 提交繳費對帳資訊(明細頁版本)
window.submitPaymentDetail = async function(rowId) {
  const inputEl = document.getElementById('detail-pay-' + rowId);
  const last5 = inputEl ? inputEl.value.trim() : '';
  if (!last5 || last5.length < 5) return window.showToast('請輸入完整的帳號後五碼', true);

  const btn = inputEl.nextElementSibling;
  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px]">refresh</span>';
  btn.disabled = true;

  try {
    const res = await window.fetchAPI('submitPaymentInfo', { rowId: rowId, accountLast5: last5 }, true);
    if (res && !res.error) {
      window.showToast('✅ 已送出對帳資訊！');
      await window.loadMyActivities();
      window.showMyActivityDetail(rowId);
    } else {
      throw new Error(res.error || '送出失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
    btn.innerHTML = oriHtml;
    btn.disabled = false;
  }
};

// 提交繳費對帳資訊(列表頁版本)
window.submitPayment = async function(rowId) {
  const inputEl = document.getElementById('pay-' + rowId);
  const last5 = inputEl ? inputEl.value.trim() : '';
  if (!last5 || last5.length < 5) return window.showToast('請輸入完整的帳號後五碼', true);

  const btn = inputEl.nextElementSibling;
  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px]">refresh</span>';
  btn.disabled = true;

  try {
    const res = await window.fetchAPI('submitPaymentInfo', { rowId: rowId, accountLast5: last5 }, true);
    if (res && !res.error) {
      window.showToast('✅ 已送出對帳資訊！');
      window.loadMyActivities();
    } else {
      throw new Error(res.error || '送出失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
    btn.innerHTML = oriHtml;
    btn.disabled = false;
  }
};
