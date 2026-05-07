/* ==================== 首頁資訊流模組 ==================== */

window.normalizeStoreSettings = window.normalizeStoreSettings || function(raw) {
  if (!raw || raw.success === false) return null;
  if (raw.data && typeof raw.data === 'object') return raw.data;
  return raw;
};

window.getStoreSettingsCacheKey = window.getStoreSettingsCacheKey || function(networkId) {
  return 'ACTMASTER_STORE_SETTINGS_' + String(networkId || window.currentNetworkId || 'admin');
};

window.readCachedStoreSettings = window.readCachedStoreSettings || function(networkId) {
  try {
    const raw = localStorage.getItem(window.getStoreSettingsCacheKey(networkId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

window.writeCachedStoreSettings = window.writeCachedStoreSettings || function(settings, networkId) {
  const d = window.normalizeStoreSettings(settings);
  if (!d) return;
  try {
    localStorage.setItem(window.getStoreSettingsCacheKey(networkId || d.networkId), JSON.stringify(d));
  } catch (e) {}
};

window.isStoreToggleOn = window.isStoreToggleOn || function(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() !== 'false';
};

window.getYoutubeEmbedUrl = window.getYoutubeEmbedUrl || function(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  let videoId = '';
  if (raw.includes('v=')) {
    videoId = raw.split('v=')[1].split('&')[0];
  } else if (raw.includes('youtu.be/')) {
    videoId = raw.split('youtu.be/')[1].split('?')[0];
  } else if (raw.includes('/embed/')) {
    videoId = raw.split('/embed/')[1].split('?')[0];
  }

  return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
};

window.applyStoreSettingsToHome = window.applyStoreSettingsToHome || function(settings) {
  const d = window.normalizeStoreSettings(settings);
  if (!d) return;

  const headerName = document.getElementById('header-site-name');
  if (headerName && d.siteName !== undefined) {
    headerName.innerText = d.siteName || 'LINE商機引擎';
  }

  const bannerImg = document.getElementById('home-main-banner');
  if (bannerImg && bannerImg.parentElement) {
    if (!window.isStoreToggleOn(d.showBanner, true)) {
      bannerImg.parentElement.classList.add('hidden');
    } else {
      bannerImg.parentElement.classList.remove('hidden');
      if (d.bannerUrl && bannerImg.src !== d.bannerUrl) bannerImg.src = d.bannerUrl;
    }
  }

  const ytContainer = document.getElementById('home-youtube-container');
  const ytIframe = document.getElementById('home-youtube-iframe');
  if (ytContainer && ytIframe) {
    const embedUrl = window.getYoutubeEmbedUrl(d.youtubeUrl);
    if (window.isStoreToggleOn(d.showYoutube, true) && embedUrl) {
      ytContainer.classList.remove('hidden');
      if (ytIframe.src !== embedUrl) ytIframe.src = embedUrl;
    } else {
      ytContainer.classList.add('hidden');
      ytIframe.src = '';
    }
  }
};

window.refreshStoreSettingsInBackground = window.refreshStoreSettingsInBackground || async function() {
  try {
    const settingsRes = await window.fetchAPI('getStoreSettings', { networkId: window.currentNetworkId }, true);
    const d = window.normalizeStoreSettings(settingsRes);
    if (d) {
      window.writeCachedStoreSettings(d, window.currentNetworkId);
      window.applyStoreSettingsToHome(d);
    }
  } catch (e) {
    console.error('系統設定同步失敗', e);
  }
};

function getPublicActivityId_(activity) {
  return String(activity['活動ID'] || activity.rowId || '').trim();
}

function getPublicActivityStatus_(activity) {
  return String(activity['狀態'] || '上架').trim();
}

window.homeActivityFilter = window.homeActivityFilter || '全部';

window.setHomeActivityFilter = function(type) {
  window.homeActivityFilter = type || '全部';
  window.renderHomeActivities();
};

function renderHomeActivityFilters_(types) {
  const list = document.getElementById('user-activities-list');
  if (!list || !list.parentElement) return;

  let filterBar = document.getElementById('home-activity-filters');
  if (!filterBar) {
    filterBar = document.createElement('div');
    filterBar.id = 'home-activity-filters';
    list.parentElement.insertBefore(filterBar, list);
  }

  const categories = ['全部'].concat(types.filter(Boolean));
  if (categories.indexOf(window.homeActivityFilter) === -1) window.homeActivityFilter = '全部';

  filterBar.className = 'flex gap-2 overflow-x-auto hide-scrollbar pb-2 mb-3';
  filterBar.innerHTML = categories.map(type => {
    const active = type === window.homeActivityFilter;
    const safeType = window.escapeHTML(type);
    const jsType = window.escapeJS(type);
    return '<button type="button" onclick="window.setHomeActivityFilter(&quot;' + jsType + '&quot;)" class="shrink-0 px-4 py-2 rounded-full text-[13px] font-black transition-all active:scale-95 ' +
      (active ? 'bg-[#ff5a1f] text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-100') +
      '">' + safeType + '</button>';
  }).join('');
}

window.renderHomeActivities = function() {
  const list = document.getElementById('user-activities-list');
  if (!list) return;

  const activities = Array.isArray(window.allActivities) ? window.allActivities : [];
  const allActiveActs = activities
    .filter(a => getPublicActivityStatus_(a) === '上架')
    .slice()
    .reverse();
  const types = Array.from(new Set(allActiveActs.map(a => String(a['活動類型'] || '活動').trim()).filter(Boolean)));
  renderHomeActivityFilters_(types);

  const activeActs = window.homeActivityFilter === '全部'
    ? allActiveActs
    : allActiveActs.filter(a => String(a['活動類型'] || '活動').trim() === window.homeActivityFilter);

  list.className = 'grid grid-cols-2 gap-3';

  if (activeActs.length === 0) {
    list.className = 'space-y-4';
    list.innerHTML = '<p class="text-center text-slate-400 py-8 text-sm">目前暫無開放中的活動</p>';
    return;
  }

  list.innerHTML = activeActs.map(a => {
    const actId = window.escapeJS(getPublicActivityId_(a));
    const title = window.escapeHTML(a['活動名稱'] || '未命名活動');
    const type = window.escapeHTML(a['活動類型'] || '活動');
    const time = window.escapeHTML(window.formatDisplayTime(a['開始時間']));
    const desc = window.escapeHTML(a['活動說明'] || '');
    const img = window.escapeHTML(a['宣傳圖'] || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80');

    return '' +
      '<div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex flex-col min-h-[250px]">' +
        '<div class="w-full aspect-[4/3] bg-slate-100 overflow-hidden relative">' +
          '<img src="' + img + '" class="w-full h-full object-cover" loading="lazy">' +
          '<span class="absolute top-2 left-2 bg-[#ff5a1f] text-white text-[11px] px-2.5 py-1 rounded-lg font-black shadow-sm">' + type + '</span>' +
        '</div>' +
        '<div class="p-3 flex flex-col flex-1">' +
          '<div class="flex justify-end mb-2">' +
            '<span class="text-slate-400 text-[10px] font-mono shrink-0">' + time + '</span>' +
          '</div>' +
          '<h4 class="font-black text-slate-800 text-[14px] leading-snug line-clamp-2 mb-1">' + title + '</h4>' +
          '<p class="text-slate-500 text-[12px] line-clamp-2 leading-relaxed mb-3">' + desc + '</p>' +
          '<div class="grid grid-cols-2 gap-2 mt-auto">' +
            '<button type="button" onclick="event.stopPropagation(); window.openActivityDetail(&quot;' + actId + '&quot;)" class="py-2 bg-slate-100 text-slate-600 rounded-xl text-[12px] font-bold active:scale-95 transition-transform">詳細</button>' +
            '<button type="button" onclick="event.stopPropagation(); window.joinPublicActivity(&quot;' + actId + '&quot;, this)" class="py-2 bg-[#06C755] text-white rounded-xl text-[12px] font-bold active:scale-95 transition-transform">報名</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }).join('');
};

window.openActivityDetail = function(activityId) {
  const activity = (window.allActivities || []).find(a => getPublicActivityId_(a) === String(activityId));
  if (!activity) return window.showToast('找不到活動資料，請稍後再試', true);

  const backBtn = document.querySelector('#page-my-act-detail button');
  if (backBtn) backBtn.setAttribute('onclick', "window.goPage('home')");

  const content = document.getElementById('my-act-detail-content');
  if (!content) return;

  const title = window.escapeHTML(activity['活動名稱'] || '未命名活動');
  const type = window.escapeHTML(activity['活動類型'] || '活動');
  const startTime = window.escapeHTML(window.formatDisplayTime(activity['開始時間']));
  const endTime = window.escapeHTML(window.formatDisplayTime(activity['結束時間']));
  const desc = window.escapeHTML(activity['活動說明'] || '尚無活動說明');
  const img = window.escapeHTML(activity['宣傳圖'] || '');
  const price = parseInt(activity['金額']) || 0;
  const fee = price > 0 ? 'NT$ ' + price.toLocaleString() : '免費';
  const safeId = window.escapeJS(activityId);

  content.innerHTML = '' +
    '<div class="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100">' +
      (img ? '<img src="' + img + '" class="w-full aspect-video object-cover">' : '') +
      '<div class="p-5 space-y-4">' +
        '<div class="flex items-center justify-between gap-2">' +
          '<span class="bg-primary-light text-primary text-[12px] px-2.5 py-1 rounded-full font-bold">' + type + '</span>' +
          '<span class="bg-slate-100 text-slate-600 text-[12px] px-2.5 py-1 rounded-full font-bold">' + fee + '</span>' +
        '</div>' +
        '<h3 class="text-[22px] font-black text-slate-800 leading-tight">' + title + '</h3>' +
        '<div class="text-[13px] text-slate-500 font-medium leading-relaxed">' +
          '<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px]">schedule</span>' + startTime + (endTime ? ' - ' + endTime : '') + '</div>' +
        '</div>' +
        '<p class="text-[14px] text-slate-600 leading-relaxed whitespace-pre-wrap">' + desc + '</p>' +
        '<button onclick="window.joinPublicActivity(&quot;' + safeId + '&quot;, this)" class="w-full py-4 bg-[#06C755] text-white rounded-2xl font-black text-[16px] active:scale-95 transition-transform">我要報名</button>' +
      '</div>' +
    '</div>';

  window.goPage('my-act-detail', true);
};

window.joinPublicActivity = async function(activityId, btn) {
  const activity = (window.allActivities || []).find(a => getPublicActivityId_(a) === String(activityId));
  if (!activity) return window.showToast('找不到活動資料，請稍後再試', true);

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[15px] align-middle">refresh</span>';
  }

  try {
    const res = await window.fetchAPI('joinActivity', {
      activityId: getPublicActivityId_(activity),
      activityName: activity['活動名稱'] || '',
      userName: window.currentUser?.name || window.currentUserProfile?.displayName || '',
      userPhone: window.currentUser?.phone || '',
      defaultIdentity: activity['預設身份'] || '會員'
    }, true);

    if (res && !res.error) {
      window.showToast(res.existed ? '您已報名過此活動' : '報名成功');
      if (typeof window.loadMyActivities === 'function') window.loadMyActivities();
    } else {
      throw new Error(res?.error || '報名失敗');
    }
  } catch (e) {
    window.showToast(e.message || '報名失敗', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
};

window.myActivityRecords = window.myActivityRecords || [];

window.loadMyActivities = async function() {
  const list = document.getElementById('my-activities-list');
  if (!list) return;

  list.innerHTML = '<div class="text-center py-10 text-slate-400 text-sm font-bold">載入活動紀錄中...</div>';

  try {
    const res = await window.fetchAPI('getUserActivities', {
      phone: window.currentUser?.phone || '',
      userId: window.currentUserProfile?.userId || ''
    }, true);

    if (res && res.error) throw new Error(res.error);
    const records = Array.isArray(res) ? res : [];
    window.myActivityRecords = records;

    if (records.length === 0) {
      list.innerHTML = '<div class="text-center py-12 px-6 text-slate-400"><span class="material-symbols-outlined text-4xl mb-2">event_busy</span><p class="text-sm font-bold">目前沒有活動紀錄</p></div>';
      return;
    }

    list.innerHTML = records.map((r, i) => {
      const title = window.escapeHTML(r['活動名稱'] || '未命名活動');
      const time = window.escapeHTML(window.formatDisplayTime(r['開始時間']));
      const status = window.escapeHTML(r['繳費狀態'] || '');
      const checked = String(r['簽到']).toLowerCase() === 'true';
      const paidClass = status === '已繳費' || status === '免費' ? 'text-green-600 bg-green-50' : 'text-amber-600 bg-amber-50';
      return '' +
        '<div class="w-full p-4 bg-white">' +
          '<div class="flex items-start justify-between gap-3">' +
            '<div class="min-w-0 flex-1">' +
              '<h4 class="font-black text-slate-800 text-[15px] leading-snug truncate">' + title + '</h4>' +
              '<p class="text-[12px] text-slate-400 font-mono mt-1">' + time + '</p>' +
            '</div>' +
            '<div class="flex flex-col items-end gap-1 shrink-0">' +
              '<span class="px-2 py-1 rounded-full text-[11px] font-black ' + paidClass + '">' + status + '</span>' +
              '<span class="px-2 py-1 rounded-full text-[11px] font-black ' + (checked ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400') + '">' + (checked ? '已簽到' : '未簽到') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-2 mt-3">' +
            '<button type="button" onclick="window.openMyActivityRecord(' + i + ')" class="py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[12px] font-black active:scale-95 transition-transform">明細</button>' +
            '<button type="button" onclick="window.cancelMyActivityRecord(' + i + ', this)" class="py-2.5 rounded-xl text-[12px] font-black active:scale-95 transition-transform ' + (checked ? 'bg-slate-100 text-slate-300' : 'bg-red-50 text-red-500') + '"' + (checked ? ' disabled' : '') + '>取消</button>' +
          '</div>' +
        '</div>';
    }).join('');
  } catch(e) {
    list.innerHTML = '<div class="text-center py-12 px-6 text-red-400 text-sm font-bold">活動紀錄載入失敗：' + window.escapeHTML(e.message || '請稍後再試') + '</div>';
  }
};

window.openMyActivityRecord = function(index) {
  const record = window.myActivityRecords && window.myActivityRecords[index];
  if (!record) return window.showToast('找不到活動紀錄', true);

  const backBtn = document.querySelector('#page-my-act-detail button');
  if (backBtn) backBtn.setAttribute('onclick', "window.goPage('my-activities')");

  const content = document.getElementById('my-act-detail-content');
  if (!content) return;

  const title = window.escapeHTML(record['活動名稱'] || '未命名活動');
  const startTime = window.escapeHTML(window.formatDisplayTime(record['開始時間']));
  const desc = window.escapeHTML(record['活動說明'] || '尚無活動說明');
  const img = window.escapeHTML(record['宣傳圖'] || '');
  const payStatus = window.escapeHTML(record['繳費狀態'] || '');
  const identity = window.escapeHTML(record['身份'] || '');
  const amount = parseInt(record['金額'], 10) || 0;
  const checked = String(record['簽到']).toLowerCase() === 'true';

  content.innerHTML = '' +
    '<div class="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100">' +
      (img ? '<img src="' + img + '" class="w-full aspect-video object-cover">' : '') +
      '<div class="p-5 space-y-4">' +
        '<div class="flex items-center justify-between gap-2">' +
          '<span class="bg-slate-100 text-slate-600 text-[12px] px-2.5 py-1 rounded-full font-bold">' + identity + '</span>' +
          '<span class="bg-green-50 text-green-600 text-[12px] px-2.5 py-1 rounded-full font-bold">' + payStatus + '</span>' +
        '</div>' +
        '<h3 class="text-[22px] font-black text-slate-800 leading-tight">' + title + '</h3>' +
        '<div class="space-y-2 text-[13px] text-slate-500 font-medium">' +
          '<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px]">schedule</span>' + startTime + '</div>' +
          '<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px]">payments</span>' + (amount > 0 ? 'NT$ ' + amount.toLocaleString() : '免費') + '</div>' +
          '<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px]">fact_check</span>' + (checked ? '已簽到' : '尚未簽到') + '</div>' +
        '</div>' +
        '<p class="text-[14px] text-slate-600 leading-relaxed whitespace-pre-wrap">' + desc + '</p>' +
        '<button type="button" onclick="window.cancelMyActivityRecord(' + index + ', this)" class="w-full py-3.5 rounded-2xl font-black text-[15px] active:scale-95 transition-transform ' + (checked ? 'bg-slate-100 text-slate-300' : 'bg-red-50 text-red-500') + '"' + (checked ? ' disabled' : '') + '>' + (checked ? '已簽到不可取消' : '取消報名') + '</button>' +
      '</div>' +
    '</div>';

  window.goPage('my-act-detail', true);
};

window.cancelMyActivityRecord = async function(index, btn) {
  const record = window.myActivityRecords && window.myActivityRecords[index];
  if (!record) return window.showToast('找不到活動紀錄', true);
  if (String(record['簽到']).toLowerCase() === 'true') return window.showToast('已簽到紀錄不能取消', true);
  if (!confirm('確定要取消「' + (record['活動名稱'] || '此活動') + '」的報名嗎？')) return;

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[15px] align-middle">refresh</span>';
  }

  try {
    const res = await window.fetchAPI('cancelActivityRegistration', {
      rowId: record.rowId || record['rowId'] || '',
      activityId: record['活動ID'] || '',
      phone: window.currentUser?.phone || ''
    }, true);

    if (res && res.error) throw new Error(res.error);
    window.showToast('已取消報名');
    await window.loadMyActivities();
    if (typeof window.loadHomeData === 'function') window.loadHomeData();
    window.goPage('my-activities');
  } catch(e) {
    window.showToast(e.message || '取消失敗', true);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
};

window.loadUserActivities = function() {
  const cachedSettings = window.readCachedStoreSettings(window.currentNetworkId);
  if (cachedSettings) window.applyStoreSettingsToHome(cachedSettings);

  window.renderHomeActivities();
  window.refreshStoreSettingsInBackground();
};
