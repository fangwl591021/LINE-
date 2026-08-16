/* ==================== 管理員模組(核銷、統計、用戶管理) ==================== */

// 快取機制:活動列表 30 秒內不重新打 API
window._adminActsCache = { data: null, time: 0 };
window._currentCheckinExport = { activityId: '', activityTitle: '', rows: [] };

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function csvValue(row, keys, fallback = '') {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return fallback;
}

window.downloadCurrentRegistrantsCsv = function() {
  const state = window._currentCheckinExport || {};
  const rows = Array.isArray(state.rows) ? state.rows : [];
  if (!rows.length) return window.showToast('目前沒有可下載的報名名單', true);

  const headers = ['活動名稱', '姓名', '電話', '身份', '付款狀態', '簽到狀態', '簽到時間', '報名編號'];
  const lines = [headers.map(csvCell).join(',')];
  rows.forEach(row => {
    const checked = csvValue(row, ['簽到', 'checkinStatus', 'checkedIn'], false);
    lines.push([
      state.activityTitle || csvValue(row, ['活動名稱', 'activityName']),
      csvValue(row, ['姓名', 'name']),
      csvValue(row, ['電話', 'phone']),
      csvValue(row, ['身份', 'identity']),
      csvValue(row, ['付款狀態', 'paymentStatus']),
      (checked === true || String(checked).toUpperCase() === 'TRUE' || String(checked) === '1') ? '已簽到' : '未簽到',
      csvValue(row, ['nfcCheckinTime', '簽到時間', 'checkedInAt']),
      csvValue(row, ['rowId', 'registrationId', '報名ID'])
    ].map(csvCell).join(','));
  });

  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeTitle = String(state.activityTitle || 'activity').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
  a.href = url;
  a.download = `${safeTitle}_報名名單.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
const ADMIN_CACHE_TTL = 30 * 1000; // 30 秒

// 載入管理員活動列表(核銷頁面)
window.loadAdminActivities = async function(forceRefresh = false) {
  const container = document.getElementById('admin-activities-list');
  if (!container) return;

  const now = Date.now();
  const cache = window._adminActsCache;

  // 1. 若有有效快取,先立即渲染快取資料(秒開)
  if (!forceRefresh && cache.data && (now - cache.time) < ADMIN_CACHE_TTL) {
    window._renderAdminActivities(cache.data);
    return;
  }

  // 2. 沒快取才顯示 loading
  if (!cache.data) {
    container.innerHTML = '<div class="text-center py-10"><span class="material-symbols-outlined animate-spin text-3xl text-slate-300">refresh</span><p class="text-sm text-slate-400 font-bold mt-2">載入活動中...</p></div>';
  }

  try {
    const res = await window.fetchAPI('getPublicActivities', {}, true);
    if (res && Array.isArray(res)) {
      // 寫入快取
      window._adminActsCache = { data: res, time: now };
      window._renderAdminActivities(res);
    } else if (cache.data && Array.isArray(cache.data)) {
      window._renderAdminActivities(cache.data);
      window.showToast((res && res.error) ? res.error + '，已顯示暫存活動' : '連線失敗，已顯示暫存活動', true);
    } else {
      throw new Error((res && res.error) ? res.error : '無法取得活動列表');
    }
  } catch (e) {
    const msg = window.escapeHTML ? window.escapeHTML(e.message || '無法取得活動列表') : String(e.message || '無法取得活動列表');
    container.innerHTML =
      '<div class="text-center py-10 px-6 text-red-400 text-sm font-bold">' +
        '<span class="material-symbols-outlined text-4xl mb-2">wifi_off</span>' +
        '<div>載入失敗：' + msg + '</div>' +
        '<button onclick="window.loadAdminActivities(true)" class="mt-4 px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-black active:scale-95 transition-transform">重新載入</button>' +
      '</div>';
  }
};

function getAdminActivityMeta(act) {
  const rawTitle = act && (act['活動名稱'] || act.activityName || act.name) || '未命名活動';
  const rawId = act && (act['活動ID'] || act.activityId || act.rowId) || '';
  const rawStatus = act && (act['狀態'] || act.status) || '上架';
  const price = parseInt(act && (act['金額'] || act.price) || 0, 10) || 0;
  return {
    title: window.escapeJS(rawTitle),
    titleHtml: window.escapeHTML ? window.escapeHTML(rawTitle) : window.escapeJS(rawTitle),
    actId: window.escapeJS(rawId),
    time: window.formatDisplayTime(act && (act['開始時間'] || act.startTime)),
    status: rawStatus === '下架' ? '下架' : '上架',
    fee: price > 0 ? 'NT$ ' + price : '免費',
    img: window.escapeHTML
      ? window.escapeHTML((act && (act['宣傳圖'] || act.imageUrl)) || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80')
      : ((act && (act['宣傳圖'] || act.imageUrl)) || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80')
  };
}

function renderActiveAdminActivity(act) {
  const meta = getAdminActivityMeta(act);
  return '<div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">' +
    '<div class="w-full aspect-[16/9] bg-slate-100 relative">' +
      '<img src="' + meta.img + '" class="w-full h-full object-cover" loading="lazy">' +
      '<div class="absolute top-3 left-3 bg-emerald-700 text-white text-[11px] px-2 py-1 rounded-full font-bold">上架</div>' +
      '<div class="absolute top-3 right-3 bg-black/60 text-white text-[11px] px-2 py-1 rounded-full font-bold">' + meta.fee + '</div>' +
    '</div>' +
    '<div class="p-4">' +
      '<h4 class="text-[15px] font-black text-slate-800 leading-snug mb-1">' + meta.titleHtml + '</h4>' +
      '<div class="text-[12px] text-slate-500 mb-3 flex items-center gap-1">' +
        '<span class="material-symbols-outlined text-[14px]">schedule</span>' + meta.time +
      '</div>' +
      '<button onclick="window.openActivityShareModal(\'' + meta.actId + '\', \'' + meta.title + '\')" class="w-full mb-2 py-3 bg-blue-600 text-white rounded-xl text-[13px] font-black active:scale-95 transition-transform flex justify-center items-center gap-1.5">' +
        '<span class="material-symbols-outlined text-[17px]">ios_share</span> 分享活動' +
      '</button>' +
      '<div class="grid grid-cols-6 gap-1.5">' +
        '<button onclick="window.copyActivityId(\'' + meta.actId + '\')" class="py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-[11px] font-bold active:scale-95 transition-transform flex flex-col justify-center items-center gap-0.5">' +
          '<span class="material-symbols-outlined text-[15px]">tag</span> 編號' +
        '</button>' +
        '<button onclick="window.openCheckinPage(\'' + meta.actId + '\', \'' + meta.title + '\')" class="py-2.5 bg-blue-50 text-blue-600 rounded-xl text-[11px] font-bold active:scale-95 transition-transform flex flex-col justify-center items-center gap-0.5">' +
          '<span class="material-symbols-outlined text-[15px]">fact_check</span> 核銷' +
        '</button>' +
        '<button onclick="window.copyNfcCheckinUrl(\'' + meta.actId + '\')" class="py-2.5 bg-emerald-700 text-white rounded-xl text-[11px] font-bold active:scale-95 transition-transform flex flex-col justify-center items-center gap-0.5">' +
          '<span class="material-symbols-outlined text-[15px]">nfc</span> NFC' +
        '</button>' +
        '<button onclick="window.openEditActivity(\'' + meta.actId + '\')" class="py-2.5 bg-amber-50 text-amber-600 rounded-xl text-[11px] font-bold active:scale-95 transition-transform flex flex-col justify-center items-center gap-0.5">' +
          '<span class="material-symbols-outlined text-[15px]">edit</span> 編輯' +
        '</button>' +
        '<button onclick="window.duplicateActivity(\'' + meta.actId + '\', this)" class="py-2.5 bg-slate-100 text-slate-700 rounded-xl text-[11px] font-bold active:scale-95 transition-transform flex flex-col justify-center items-center gap-0.5">' +
          '<span class="material-symbols-outlined text-[15px]">content_copy</span> 複製' +
        '</button>' +
        '<button onclick="window.unpublishActivity(\'' + meta.actId + '\', this)" class="py-2.5 bg-red-50 text-red-500 rounded-xl text-[11px] font-bold active:scale-95 transition-transform flex flex-col justify-center items-center gap-0.5">' +
          '<span class="material-symbols-outlined text-[15px]">visibility_off</span> 下架' +
        '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderInactiveAdminActivity(act) {
  const meta = getAdminActivityMeta(act);
  return '<div class="bg-white rounded-2xl border border-slate-100 p-2.5 flex items-center gap-3 shadow-sm">' +
    '<img src="' + meta.img + '" class="w-14 h-14 rounded-xl object-cover bg-slate-100 shrink-0" loading="lazy">' +
    '<div class="min-w-0 flex-1">' +
      '<div class="text-[13px] font-black text-slate-800 truncate">' + meta.titleHtml + '</div>' +
      '<div class="text-[11px] text-slate-500 mt-0.5">' + meta.time + ' · ' + meta.fee + '</div>' +
      '<div class="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">下架</div>' +
    '</div>' +
    '<div class="flex items-center gap-1.5 shrink-0">' +
      '<button onclick="window.republishActivity(\'' + meta.actId + '\', this)" class="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 active:scale-95 transition-transform" title="重新上架"><span class="material-symbols-outlined text-[18px]">publish</span></button>' +
      '<button onclick="window.copyActivityId(\'' + meta.actId + '\')" class="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 active:scale-95 transition-transform" title="複製課程編號"><span class="material-symbols-outlined text-[18px]">tag</span></button>' +
      '<button onclick="window.duplicateActivity(\'' + meta.actId + '\', this)" class="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 active:scale-95 transition-transform" title="複製活動"><span class="material-symbols-outlined text-[18px]">content_copy</span></button>' +
      '<button onclick="window.openEditActivity(\'' + meta.actId + '\')" class="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 active:scale-95 transition-transform" title="編輯活動"><span class="material-symbols-outlined text-[18px]">edit</span></button>' +
    '</div>' +
  '</div>';
}

// 將「渲染邏輯」獨立出來,讓快取與 API 都能重用
window._renderAdminActivities = function(res) {
  const container = document.getElementById('admin-activities-list');
  if (!container) return;

  if (res && Array.isArray(res) && res.length > 0) {
    const acts = [...res].reverse();
    const activeActs = acts.filter(act => getAdminActivityMeta(act).status === '上架');
    const inactiveActs = acts.filter(act => getAdminActivityMeta(act).status === '下架');
    const activeHtml = activeActs.length
      ? activeActs.map(renderActiveAdminActivity).join('')
      : '<div class="bg-white p-6 rounded-3xl text-center shadow-sm border border-slate-100 text-sm text-slate-400 font-bold">目前沒有上架活動</div>';
    const inactiveHtml = inactiveActs.length
      ? '<details class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">' +
          '<summary class="cursor-pointer px-4 py-3 flex items-center justify-between text-[14px] font-black text-slate-700 list-none">' +
            '<span class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px] text-slate-400">inventory_2</span>下架區</span>' +
            '<span class="bg-slate-100 text-slate-500 text-[11px] px-2 py-1 rounded-full">' + inactiveActs.length + ' 筆</span>' +
          '</summary>' +
          '<div class="px-3 pb-3 space-y-2">' + inactiveActs.map(renderInactiveAdminActivity).join('') + '</div>' +
        '</details>'
      : '';

    container.innerHTML =
      '<div class="mb-3 flex items-center justify-between px-1">' +
        '<h3 class="text-[15px] font-black text-slate-800">上架活動</h3>' +
        '<span class="text-[12px] text-slate-400 font-bold">' + activeActs.length + ' 筆</span>' +
      '</div>' +
      '<div class="space-y-4">' + activeHtml + inactiveHtml + '</div>';
  } else {
    container.innerHTML = '<div class="bg-white p-8 rounded-3xl text-center shadow-sm border border-slate-100"><span class="material-symbols-outlined text-4xl text-slate-300 mb-2">event_busy</span><p class="text-sm text-slate-400 font-bold mt-2">目前沒有活動</p></div>';
  }
};

// 開啟核銷名單頁
window.openCheckinPage = async function(actId, actTitle) {
  window.goPage('admin-checkin');
  window._currentCheckinExport = { activityId: actId || '', activityTitle: actTitle || '', rows: [] };
  const titleEl = document.getElementById('checkin-act-title');
  const countEl = document.getElementById('checkin-count-display');
  const listEl = document.getElementById('admin-checkin-list');

  if (titleEl) titleEl.textContent = actTitle || '名單核銷';
  if (countEl) countEl.textContent = '0';
  if (listEl) listEl.innerHTML = '<div class="text-center py-10"><span class="material-symbols-outlined animate-spin text-3xl text-slate-300">refresh</span><p class="text-sm text-slate-400 font-bold mt-2">載入名單中...</p></div>';

  try {
    const res = await window.fetchAPI('getActivityRegistrants', { activityId: actId }, true);
    if (res && Array.isArray(res)) {
      window._currentCheckinExport = { activityId: actId || '', activityTitle: actTitle || (titleEl ? titleEl.textContent : ''), rows: res };
      if (countEl) countEl.textContent = res.length;
      if (res.length === 0) {
        if (listEl) listEl.innerHTML = '<div class="text-center py-10 text-slate-400 text-sm font-bold">尚無報名者</div>';
        return;
      }
      if (listEl) {
        listEl.innerHTML = res.map(reg => {
          const isCheckedIn = reg['簽到'] === true || String(reg['簽到']).toUpperCase() === 'TRUE';
          const payStatus = reg['繳費狀態'] || '';
          const name = window.escapeJS(reg['姓名'] || '未知');
          const phone = window.escapeJS(reg['手機'] || '');
          const identity = window.escapeJS(reg['身份'] || '會員');
          const rowId = window.escapeJS(reg.rowId);

          let statusBadge = '';
          if (isCheckedIn) statusBadge = '<span class="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold">已簽到</span>';
          else if (payStatus === '已繳費') statusBadge = '<span class="bg-emerald-700 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">已繳費</span>';
          else if (payStatus === '待對帳') statusBadge = '<span class="bg-orange-50 text-orange-500 text-[10px] px-2 py-0.5 rounded-full font-bold">待對帳</span>';
          else statusBadge = '<span class="bg-blue-50 text-blue-500 text-[10px] px-2 py-0.5 rounded-full font-bold">已報名</span>';

          return '<div class="px-5 py-4 flex justify-between items-center">' +
            '<div class="flex flex-col gap-1">' +
              '<div class="font-black text-[15px] text-slate-800 flex items-center gap-1.5">' + name + '<span class="bg-slate-50 text-slate-500 text-[10px] px-1.5 py-0.5 rounded">' + identity + '</span></div>' +
              '<div class="text-[12px] text-slate-500 font-mono">' + phone + '</div>' +
              '<div>' + statusBadge + '</div>' +
            '</div>' +
            '<div class="flex gap-1">' +
              (!isCheckedIn
                ? '<button onclick="window.toggleCheckin(\'' + rowId + '\', this)" class="px-3 py-2 bg-[#06C755] text-white rounded-lg text-[12px] font-bold active:scale-95 transition-transform">簽到</button>'
                : '<button onclick="window.toggleCheckin(\'' + rowId + '\', this)" class="px-3 py-2 bg-slate-200 text-slate-600 rounded-lg text-[12px] font-bold active:scale-95 transition-transform">取消簽到</button>') +
              (payStatus !== '已繳費' && parseInt(reg['金額']) > 0
                ? '<button onclick="window.confirmPayment(\'' + rowId + '\', this)" class="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-[12px] font-bold active:scale-95 transition-transform">確認繳費</button>'
                : '') +
            '</div>' +
          '</div>';
        }).join('');
      }
    } else {
      if (listEl) listEl.innerHTML = '<div class="text-center py-10 text-red-400 text-sm font-bold">無法載入名單</div>';
    }
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div class="text-center py-10 text-red-400 text-sm font-bold">載入失敗:' + e.message + '</div>';
  }
};

// 切換簽到狀態
window.toggleCheckin = async function(rowId, btnEl) {
  const oriHtml = btnEl.innerHTML;
  btnEl.innerHTML = '<span class="material-symbols-outlined animate-spin text-[14px]">refresh</span>';
  btnEl.disabled = true;
  try {
    const res = await window.fetchAPI('toggleCheckin', { rowId: rowId }, true);
    if (res && !res.error) {
      window.showToast('✅ 狀態已更新');
      const titleEl = document.getElementById('checkin-act-title');
      window.openCheckinPage('', titleEl ? titleEl.textContent : '');
    } else {
      throw new Error(res.error || '更新失敗');
    }
  } catch (e) {
    window.showToast('⚠️ ' + e.message, true);
    btnEl.innerHTML = oriHtml;
    btnEl.disabled = false;
  }
};

// 確認繳費
window.confirmPayment = async function(rowId, btnEl) {
  if (!await window.appConfirm('確認此筆款項已收款？')) return;
  const oriHtml = btnEl.innerHTML;
  btnEl.innerHTML = '<span class="material-symbols-outlined animate-spin text-[14px]">refresh</span>';
  btnEl.disabled = true;
  try {
    const res = await window.fetchAPI('confirmPayment', { rowId: rowId }, true);
    if (res && !res.error) {
      window.showToast('✅ 已確認繳費');
      const titleEl = document.getElementById('checkin-act-title');
      window.openCheckinPage('', titleEl ? titleEl.textContent : '');
    } else {
      throw new Error(res.error || '更新失敗');
    }
  } catch (e) {
    window.showToast('⚠️ ' + e.message, true);
    btnEl.innerHTML = oriHtml;
    btnEl.disabled = false;
  }
};

// 下架活動
window.unpublishActivity = async function(actId, btnEl) {
  if (!await window.appConfirm('確定要下架此活動嗎？報名資料會保留，之後可重新上架。')) return;
  return window.setActivityStatus(actId, '下架', btnEl);
};

// 重新上架活動
window.republishActivity = async function(actId, btnEl) {
  if (!await window.appConfirm('確定要重新上架此活動嗎？')) return;
  return window.setActivityStatus(actId, '上架', btnEl);
};

window.setActivityStatus = async function(actId, status, btnEl) {
  const oriHtml = btnEl.innerHTML;
  btnEl.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span>';
  btnEl.disabled = true;

  try {
    const action = status === '下架' ? 'removeAct' : 'setActivityStatus';
    const res = await window.fetchAPI(action, { activityId: actId, status: status }, true);
    if (res && !res.error) {
      window.showToast(status === '下架' ? '✅ 活動已下架' : '✅ 活動已重新上架');
      // 清快取讓下次進核銷頁時重新從 API 拉
      window._adminActsCache = { data: null, time: 0 };
      window.loadAdminActivities(true);
      if (typeof window.loadUserActivities === 'function') window.loadUserActivities();
    } else {
      throw new Error(res.error || '更新失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
    btnEl.innerHTML = oriHtml;
    btnEl.disabled = false;
  }
};

window.duplicateActivity = async function(actId, btnEl) {
  if (!await window.appConfirm('要複製此活動為一筆下架草稿嗎？')) return;
  const oriHtml = btnEl.innerHTML;
  btnEl.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span>';
  btnEl.disabled = true;

  try {
    const res = await window.fetchAPI('duplicateActivity', { activityId: actId }, true);
    if (res && !res.error) {
      window.showToast('✅ 已複製為下架草稿');
      window._adminActsCache = { data: null, time: 0 };
      window.loadAdminActivities(true);
    } else {
      throw new Error(res.error || '複製失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
    btnEl.innerHTML = oriHtml;
    btnEl.disabled = false;
  }
};

// 載入營運統計
function adminStatsNumber(value) {
  return Number(value || 0).toLocaleString('zh-TW');
}

function adminStatsTime(value) {
  if (!value) return '-';
  if (typeof window.formatDisplayTime === 'function') return window.formatDisplayTime(value);
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-TW', { hour12: false });
}

function adminInboxTypeLabel(type) {
  if (type === 'coupon') return '優惠券';
  if (type === 'activity_reminder') return '活動提醒';
  return '一般訊息';
}

function renderAdminInboxMonitor(monitor) {
  if (!monitor || monitor.success === false) {
    const msg = monitor && monitor.error ? monitor.error : '尚未取得聊天室資料';
    return '<div class="bg-white rounded-3xl p-5 border border-red-100 shadow-sm mb-6 text-red-500 text-[13px] font-bold">聊天室監控載入失敗：' + window.escapeHTML(msg) + '</div>';
  }
  const summary = monitor.summary || {};
  const recent = Array.isArray(monitor.recent) ? monitor.recent : [];
  const threads = Array.isArray(monitor.threads) ? monitor.threads : [];
  const couponRate = Number(summary.coupons || 0) > 0
    ? Math.round(Number(summary.redeemedCoupons || 0) * 100 / Number(summary.coupons || 0)) + '%'
    : '-';
  const recentHtml = recent.length ? recent.map(item => {
    const sender = window.escapeHTML(item.senderName || item.senderUserId || '-');
    const receiver = window.escapeHTML(item.receiverName || item.receiverUserId || '-');
    const title = window.escapeHTML(item.title || '未命名訊息');
    const statusClass = item.status === 'unread' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500';
    const statusText = item.status === 'unread' ? '未讀' : '已讀';
    return '<div class="px-4 py-3 flex items-start justify-between gap-3 border-t border-slate-100 first:border-t-0">' +
      '<div class="min-w-0">' +
        '<div class="flex items-center gap-2 mb-1">' +
          '<span class="text-[11px] font-black text-blue-600">' + adminInboxTypeLabel(item.messageType) + '</span>' +
          '<span class="text-[11px] font-bold text-slate-400">' + adminStatsTime(item.createdAt) + '</span>' +
        '</div>' +
        '<div class="text-[14px] font-black text-slate-900 truncate">' + title + '</div>' +
        '<div class="text-[12px] font-bold text-slate-500 mt-1 truncate">' + sender + ' → ' + receiver + '</div>' +
      '</div>' +
      '<span class="shrink-0 px-2 py-1 rounded-full text-[10px] font-black ' + statusClass + '">' + statusText + '</span>' +
    '</div>';
  }).join('') : '<div class="px-4 py-8 text-center text-slate-400 text-[13px] font-bold">尚無聊天室訊息</div>';
  const threadHtml = threads.length ? threads.map(thread =>
    '<div class="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">' +
      '<div class="min-w-0">' +
        '<div class="text-[12px] font-black text-slate-700 truncate">' + window.escapeHTML(thread.senderUserId || '-') + '</div>' +
        '<div class="text-[11px] font-bold text-slate-400 truncate">' + window.escapeHTML(thread.receiverUserId || '-') + '</div>' +
      '</div>' +
      '<div class="text-right shrink-0">' +
        '<div class="text-[13px] font-black text-slate-900">' + adminStatsNumber(thread.total) + ' 則</div>' +
        '<div class="text-[11px] font-bold ' + (Number(thread.unread || 0) > 0 ? 'text-red-500' : 'text-slate-400') + '">' + adminStatsNumber(thread.unread) + ' 未讀</div>' +
      '</div>' +
    '</div>'
  ).join('') : '<div class="text-center text-slate-400 text-[13px] font-bold py-5">尚無活躍對話</div>';

  return '<div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mb-6">' +
    '<div class="p-5 border-b border-slate-100 flex items-center justify-between gap-3">' +
      '<div>' +
        '<div class="flex items-center gap-2 text-slate-900">' +
          '<span class="material-symbols-outlined text-[22px] text-blue-600">forum</span>' +
          '<h3 class="text-[18px] font-black">聊天室監控</h3>' +
        '</div>' +
        '<p class="text-[12px] text-slate-500 font-bold mt-1">站內收件匣訊息與優惠券狀態</p>' +
      '</div>' +
      '<button type="button" onclick="window.loadAdminStats()" class="w-9 h-9 rounded-full bg-slate-100 text-slate-600 active:scale-95 transition-transform flex items-center justify-center">' +
        '<span class="material-symbols-outlined text-[18px]">refresh</span>' +
      '</button>' +
    '</div>' +
    '<div class="grid grid-cols-2 gap-3 p-4">' +
      '<div class="rounded-2xl bg-slate-50 p-3"><div class="text-[11px] font-black text-slate-500">總訊息</div><div class="text-[24px] font-black text-slate-900">' + adminStatsNumber(summary.total) + '</div></div>' +
      '<div class="rounded-2xl bg-red-50 p-3"><div class="text-[11px] font-black text-red-500">未讀</div><div class="text-[24px] font-black text-red-600">' + adminStatsNumber(summary.unread) + '</div></div>' +
      '<div class="rounded-2xl bg-blue-50 p-3"><div class="text-[11px] font-black text-blue-600">24 小時新增</div><div class="text-[24px] font-black text-blue-700">' + adminStatsNumber(summary.last24h) + '</div></div>' +
      '<div class="rounded-2xl bg-emerald-50 p-3"><div class="text-[11px] font-black text-emerald-700">優惠券核銷率</div><div class="text-[24px] font-black text-emerald-700">' + couponRate + '</div></div>' +
    '</div>' +
    '<div class="px-4 pb-4">' +
      '<div class="mb-2 text-[13px] font-black text-slate-700">活躍對話</div>' +
      '<div class="space-y-2">' + threadHtml + '</div>' +
    '</div>' +
    '<div class="border-t border-slate-100">' +
      '<div class="px-4 py-3 text-[13px] font-black text-slate-700 bg-slate-50">最近訊息</div>' +
      recentHtml +
    '</div>' +
  '</div>';
}

window.loadAdminStats = async function() {
  const content = document.getElementById('admin-stats-content');
  if (!content) return;
  content.innerHTML = '<div class="text-center py-10"><span class="material-symbols-outlined animate-spin text-3xl text-slate-300">refresh</span><p class="text-sm text-slate-400 font-bold mt-2">載入數據中...</p></div>';

  try {
    const [statsResult, monitorResult] = await Promise.allSettled([
      window.fetchAPI('getAdminStats', {}, true),
      window.fetchAPI('getInboxMonitor', {}, true)
    ]);
    const res = statsResult.status === 'fulfilled' ? statsResult.value : null;
    const inboxMonitor = monitorResult.status === 'fulfilled'
      ? monitorResult.value
      : { success: false, error: monitorResult.reason?.message || monitorResult.reason || '聊天室監控載入失敗' };
    if (res) {
      let tableRows = '';
      if (res.details && res.details.length > 0) {
        tableRows = res.details.map(d =>
          '<tr class="border-b border-slate-100 last:border-0">' +
            '<td class="py-4 px-4 font-bold text-slate-800 text-[13px] whitespace-nowrap">' + window.escapeJS(d.name) + '</td>' +
            '<td class="py-4 px-4 font-black text-blue-600 text-[14px] text-center">' + d.count + '</td>' +
            '<td class="py-4 px-4 font-black text-slate-800 text-[14px] text-center">$' + Number(d.revenue).toLocaleString() + '</td>' +
            '<td class="py-4 px-4 font-black text-orange-500 text-[14px] text-center">' + d.unpaid + '</td>' +
          '</tr>'
        ).join('');
      } else {
        tableRows = '<tr><td colspan="4" class="text-center py-6 text-slate-400 font-bold text-[13px]">目前無活動數據</td></tr>';
      }

      content.innerHTML =
        renderAdminInboxMonitor(inboxMonitor) +
        '<div class="grid grid-cols-2 gap-4 mb-4">' +
          '<div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">' +
            '<div class="flex items-center gap-1.5 text-[#06C755] mb-2">' +
              '<span class="material-symbols-outlined text-[18px] icon-filled">payments</span>' +
              '<span class="text-[12px] font-bold">預估總營收</span>' +
            '</div>' +
            '<div class="text-[28px] font-black text-slate-800 tracking-tight">NT$ ' + Number(res.totalRevenue || 0).toLocaleString() + '</div>' +
          '</div>' +
          '<div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">' +
            '<div class="flex items-center gap-1.5 text-blue-500 mb-2">' +
              '<span class="material-symbols-outlined text-[18px] icon-filled">person</span>' +
              '<span class="text-[12px] font-bold">總報名人數</span>' +
            '</div>' +
            '<div class="text-[28px] font-black text-slate-800 tracking-tight">' + (res.totalRegistrants || 0) + ' <span class="text-[14px] text-slate-400 font-bold ml-1">人</span></div>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex justify-between items-center mb-6">' +
          '<div class="flex items-center gap-2 text-slate-600">' +
            '<span class="material-symbols-outlined text-[20px]">inventory_2</span>' +
            '<span class="text-[14px] font-bold">目前上架活動</span>' +
          '</div>' +
          '<div class="text-[20px] font-black text-slate-800">' + (res.activeActivitiesCount || 0) + ' <span class="text-[13px] text-slate-400 font-bold ml-1">檔</span></div>' +
        '</div>' +

        '<div class="mb-3 flex justify-between items-end px-1">' +
          '<div class="flex items-center gap-1.5 text-blue-600">' +
            '<span class="material-symbols-outlined text-[18px] icon-filled">bar_chart</span>' +
            '<span class="text-[14px] font-black tracking-wide">詳細營運報表</span>' +
          '</div>' +
          '<div class="flex items-center gap-1 text-slate-400">' +
            '<span class="material-symbols-outlined text-[14px]">swipe</span>' +
            '<span class="text-[11px] font-bold">在表格上左右滑動</span>' +
          '</div>' +
        '</div>' +

        '<div class="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">' +
          '<div class="overflow-x-auto hide-scrollbar">' +
            '<table class="w-full text-left border-collapse min-w-[400px]">' +
              '<thead>' +
                '<tr class="bg-slate-50/50 border-b border-slate-100">' +
                  '<th class="py-3 px-4 text-[12px] font-bold text-slate-500 whitespace-nowrap">課程名稱</th>' +
                  '<th class="py-3 px-4 text-[12px] font-bold text-slate-500 text-center whitespace-nowrap">報名總數</th>' +
                  '<th class="py-3 px-4 text-[12px] font-bold text-slate-500 text-center whitespace-nowrap">應收總額</th>' +
                  '<th class="py-3 px-4 text-[12px] font-bold text-orange-500 text-center whitespace-nowrap">待付人數</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody>' +
                tableRows +
              '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>';
    } else {
      throw new Error('無法取得統計資料');
    }
  } catch(e) {
    content.innerHTML = '<div class="text-center py-10 text-red-500 font-bold text-sm">載入失敗:' + e.message + '</div>';
  }
};

// 載入所有用戶(管理員)
window.loadAllUsers = async function() {
  const container = document.getElementById('store-management-list');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-6 text-slate-400 text-xs font-bold animate-pulse">載入用戶資料中...</div>';

  try {
    const res = await window.fetchAPI('getAllUsers', {}, true);
    if (res && !res.error && Array.isArray(res)) {
      allSystemUsers = res;
      window.renderStoreManagement();
    } else {
      container.innerHTML = '<div class="text-center py-6 text-red-400 text-xs font-bold">無法載入用戶資料</div>';
    }
  } catch(e) {
    container.innerHTML = '<div class="text-center py-6 text-red-400 text-xs font-bold">載入失敗,請重試</div>';
  }
};

// 渲染商家管理列表
window.previewIdentityMigration = async function() {
  const box = document.getElementById('identity-migration-preview');
  if (!box) return;
  box.className = 'bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3';
  box.innerHTML = '<div class="text-sm font-bold text-slate-500 animate-pulse">正在檢查身份遷移狀態...</div>';

  try {
    const res = await window.fetchAPI('previewIdentityMigration', { limit: 120 }, true);
    const data = res && (res.data || res);
    if (!data || res.error) throw new Error((res && res.error) || '無法取得身份遷移預覽');

    const counts = data.counts || {};
    const stat = (label, value) =>
      '<div class="bg-white border border-slate-100 rounded-xl p-3">' +
        '<div class="text-[11px] text-slate-500 font-bold">' + window.escapeJS(label) + '</div>' +
        '<div class="text-xl text-slate-900 font-black mt-1">' + window.escapeJS(value) + '</div>' +
      '</div>';
    const listUsers = (data.usersWithoutPointId || []).slice(0, 5).map(u =>
      '<div class="flex justify-between gap-3 text-[12px] py-2 border-t border-slate-100">' +
        '<span class="font-bold text-slate-800">' + window.escapeJS(u.name || '未命名') + '</span>' +
        '<span class="font-mono text-slate-500 truncate max-w-[150px]">' + window.escapeJS(u.userId || '') + '</span>' +
      '</div>'
    ).join('');
    const listDuplicates = (data.duplicatePhones || []).slice(0, 5).map(item =>
      '<div class="text-[12px] py-2 border-t border-amber-100">' +
        '<div class="font-black text-amber-700">' + window.escapeJS(item.phone || '') + '</div>' +
        '<div class="text-slate-500">' + window.escapeJS((item.items || []).map(x => x.name || x.userId || x.cardId).join(' / ')) + '</div>' +
      '</div>'
    ).join('');

    box.innerHTML =
      '<div class="flex items-start justify-between gap-3">' +
        '<div><div class="text-base font-black text-slate-900">身份遷移預覽</div><div class="text-[12px] text-slate-500 mt-1">只讀檢查，不會合併或改寫任何資料。</div></div>' +
        '<span class="px-2 py-1 rounded-full text-[11px] font-black ' + (data.linksTableReady ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100') + '">' + (data.linksTableReady ? 'D1 已就緒' : 'D1 未就緒') + '</span>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-2">' +
        stat('既有對照', counts.existingLinks || 0) +
        stat('未綁 point UID', counts.usersWithoutPointId || 0) +
        stat('名片待補用戶', counts.boundCardsWithoutUser || 0) +
        stat('手機疑似重複', counts.duplicatePhones || 0) +
      '</div>' +
      '<div class="bg-white rounded-2xl border border-slate-100 p-3"><div class="text-[13px] font-black text-slate-800 mb-1">未綁 point UID</div>' + (listUsers || '<div class="text-[12px] text-slate-400 py-2">目前沒有明顯項目</div>') + '</div>' +
      '<div class="bg-amber-50 rounded-2xl border border-amber-100 p-3"><div class="text-[13px] font-black text-amber-800 mb-1">手機疑似重複</div>' + (listDuplicates || '<div class="text-[12px] text-amber-500 py-2">目前沒有明顯重複</div>') + '</div>';
  } catch(e) {
    box.className = 'bg-red-50 border border-red-100 rounded-2xl p-4';
    box.innerHTML = '<div class="text-sm font-black text-red-600">身份預覽失敗：' + window.escapeJS(e.message || '請稍後再試') + '</div>';
  }
};

window.previewIdentityMigration = async function() {
  const box = document.getElementById('identity-migration-preview');
  if (!box) return;
  box.className = 'bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3';
  box.innerHTML = '<div class="text-sm font-bold text-slate-500 animate-pulse">正在檢查身份對照...</div>';

  try {
    const res = await window.fetchAPI('previewIdentityMigration', { limit: 120 }, true);
    const data = res && (res.data || res);
    if (!data || res.error) throw new Error((res && res.error) || '無法取得身份預覽');
    window.identityMigrationPreviewData = data;

    const counts = data.counts || {};
    const stat = (label, value) =>
      '<div class="bg-white border border-slate-100 rounded-xl p-3">' +
        '<div class="text-[11px] text-slate-500 font-bold">' + window.escapeJS(label) + '</div>' +
        '<div class="text-xl text-slate-900 font-black mt-1">' + window.escapeJS(value) + '</div>' +
      '</div>';
    const listUsers = (data.usersWithoutPointId || []).slice(0, 5).map(u =>
      '<div class="flex justify-between gap-3 text-[12px] py-2 border-t border-slate-100">' +
        '<span class="font-bold text-slate-800">' + window.escapeJS(u.name || '未命名') + '</span>' +
        '<span class="font-mono text-slate-500 truncate max-w-[150px]">' + window.escapeJS(u.userId || '') + '</span>' +
      '</div>'
    ).join('');
    const listDuplicates = (data.duplicatePhones || []).slice(0, 8).map((item, idx) => {
      const ids = Array.from(new Set((item.items || []).map(x => x.userId).filter(Boolean)));
      const options = ids.map(id => '<option value="' + window.escapeJS(id) + '">' + window.escapeJS(id.slice(0, 12) + '...') + '</option>').join('');
      const names = (item.items || []).map(x => (x.name || '未命名') + ' / ' + (x.userId || x.cardId || '')).join('；');
      const mergeTools = ids.length >= 2
        ? '<div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 mt-3">' +
            '<label class="text-[11px] font-bold text-slate-500">舊 UID<select id="identity-old-' + idx + '" class="mt-1 w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-[12px] font-mono">' + options + '</select></label>' +
            '<label class="text-[11px] font-bold text-slate-500">新 UID<select id="identity-new-' + idx + '" class="mt-1 w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-[12px] font-mono">' + options + '</select></label>' +
            '<button onclick="window.confirmIdentityMergeFromPreview(' + idx + ')" class="self-end bg-slate-900 text-white rounded-lg px-3 py-2 text-[12px] font-bold hover:bg-slate-700">確認合併</button>' +
          '</div>'
        : '<div class="text-[12px] text-amber-600 mt-2">可疑資料不足，暫不提供合併。</div>';
      return '<div class="text-[12px] py-3 border-t border-amber-100">' +
        '<div class="flex items-center justify-between gap-2">' +
          '<div class="font-black text-amber-800">手機疑似重複：' + window.escapeJS(item.phone || '') + '</div>' +
          '<span class="bg-white text-amber-700 border border-amber-200 rounded-full px-2 py-1 text-[11px] font-bold">' + ids.length + ' 組 UID</span>' +
        '</div>' +
        '<div class="text-slate-600 mt-1 leading-5">' + window.escapeJS(names) + '</div>' +
        mergeTools +
      '</div>';
    }).join('');

    box.innerHTML =
      '<div class="flex items-start justify-between gap-3">' +
        '<div><div class="text-base font-black text-slate-900">身份遷移預覽</div><div class="text-[12px] text-slate-500 mt-1">先檢查，不自動改資料；合併需要人工確認。</div></div>' +
        '<span class="px-2 py-1 rounded-full text-[11px] font-black ' + (data.linksTableReady ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100') + '">' + (data.linksTableReady ? 'D1 對照表可用' : 'D1 對照表異常') + '</span>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-2">' +
        stat('既有對照', counts.existingLinks || 0) +
        stat('缺 point UID', counts.usersWithoutPointId || 0) +
        stat('綁名片未入會員', counts.boundCardsWithoutUser || 0) +
        stat('手機疑似重複', counts.duplicatePhones || 0) +
      '</div>' +
      '<div class="bg-white rounded-2xl border border-slate-100 p-3"><div class="text-[13px] font-black text-slate-800 mb-1">缺 point UID 的會員</div>' + (listUsers || '<div class="text-[12px] text-slate-400 py-2">目前沒有需要處理的資料</div>') + '</div>' +
      '<div class="bg-amber-50 rounded-2xl border border-amber-100 p-3"><div class="text-[13px] font-black text-amber-800 mb-1">手機疑似重複，需要人工確認</div>' + (listDuplicates || '<div class="text-[12px] text-amber-600 py-2">目前沒有疑似重複</div>') + '</div>';
  } catch(e) {
    box.className = 'bg-red-50 border border-red-100 rounded-2xl p-4';
    box.innerHTML = '<div class="text-sm font-black text-red-600">身份預覽失敗：' + window.escapeJS(e.message || '請稍後再試') + '</div>';
  }
};

window.confirmIdentityMergeFromPreview = async function(idx) {
  const data = window.identityMigrationPreviewData || {};
  const item = (data.duplicatePhones || [])[idx];
  const oldEl = document.getElementById('identity-old-' + idx);
  const newEl = document.getElementById('identity-new-' + idx);
  const oldLineId = oldEl && oldEl.value;
  const newLineId = newEl && newEl.value;
  if (!item || !oldLineId || !newLineId) return window.showToast('請先選擇舊 UID 與新 UID', true);
  if (oldLineId === newLineId) return window.showToast('舊 UID 與新 UID 不能相同', true);
  const ok = window.confirm('確認合併這兩個身份？\n\n舊 UID：' + oldLineId + '\n新 UID：' + newLineId + '\n\n系統會把名片、報名、訂單與獎金流水歸到新 UID。');
  if (!ok) return;
  const ok2 = window.confirm('最後確認：這會寫入 D1，並刪除舊 UID 的重複會員列。確定執行？');
  if (!ok2) return;
  try {
    window.showToast('正在合併身份...');
    const res = await window.fetchAPI('confirmIdentityMerge', {
      oldLineId,
      newLineId,
      phone: item.phone || '',
      confirm: 'MERGE_IDENTITY'
    }, true);
    if (!res || res.error || res.success === false) throw new Error((res && res.error) || '合併失敗');
    window.showToast('身份合併完成');
    await window.previewIdentityMigration();
    if (typeof window.loadAllUsers === 'function') await window.loadAllUsers();
  } catch (e) {
    window.showToast('合併失敗：' + (e.message || '請稍後再試'), true);
  }
};

window.renderStoreManagement = function() {
  const container = document.getElementById('store-management-list');
  if (!container) return;

  if (allSystemUsers.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-slate-400 text-xs">尚無任何註冊用戶</div>';
    return;
  }

  const getSafeStoreRole = (u) => {
    const role = String((u && u.role) || 'user').trim().toLowerCase();
    if (role === 'admin') return 'user';
    return role === 'store' ? 'store' : 'user';
  };

  container.innerHTML = allSystemUsers.map(u => {
    const isMe = u.userId === currentUserProfile?.userId;
    const role = getSafeStoreRole(u);
    return '<div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col gap-3 shadow-sm">' +
      '<div class="flex justify-between items-center">' +
        '<div>' +
          '<div class="font-black text-[15px] text-slate-800 flex items-center gap-1.5">' +
            window.escapeJS(u.name || '未命名用戶') + ' ' +
            (isMe ? '<span class="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[10px] tracking-wide">你自己</span>' : '') +
          '</div>' +
          '<div class="text-[12px] text-slate-500 font-mono mt-0.5">' + window.escapeJS(u.phone || '無設定電話') + '</div>' +
        '</div>' +
        '<select onchange="window.changeUserRole(\'' + window.escapeJS(u.userId) + '\', this.value)" ' + (isMe ? 'disabled' : '') + ' class="bg-white border border-slate-200 rounded-lg p-2 text-[12px] font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500/30 outline-none cursor-pointer w-[120px] shrink-0 text-center" style="-webkit-appearance:none;appearance:none;" data-original-role="' + window.escapeJS(role) + '">' +
          '<option value="user" ' + (role === 'user' ? 'selected' : '') + '>一般 User</option>' +
          '<option value="store" ' + (role === 'store' ? 'selected' : '') + '>商家 Store</option>' +
        '</select>' +
      '</div>' +
      '<div class="text-[11px] text-slate-500 flex items-center gap-1.5 bg-white border border-slate-100 px-2 py-1.5 rounded-lg w-fit">' +
        '<span class="material-symbols-outlined text-[14px]">storefront</span> ' +
        'StoreID: <span class="font-mono text-slate-700 font-bold">' + window.escapeJS(u.storeid || '尚未生成') + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
};

// 變更用戶角色
window.changeUserRole = async function(userId, newRole) {
  // 找到下拉選單元素並暫時 disable,給視覺反饋
  const selectEl = event && event.target;
  const oldRole = (allSystemUsers.find(u => u.userId === userId) || {}).role === 'store' ? 'store' : 'user';
  const allowedRoles = new Set(['user', 'store']);
  if (!allowedRoles.has(String(newRole || ''))) {
    if (selectEl) selectEl.value = oldRole === 'store' ? 'store' : 'user';
    return window.showToast('此區只能調整一般或店長，總管權限不可在手機端變更。', true);
  }

  if (selectEl) selectEl.disabled = true;
  window.showToast('更新權限中...');

  try {
    const data = await window.fetchAPI('updateUserRole', {
      userId: userId,
      targetUserId: userId,
      newRole: newRole,
      operatorId: window.currentUserProfile?.userId,
      actorRole: window.userRole,
      networkId: window.currentNetworkId
    }, true);

    if (data && data.success) {
      window.showToast('✅ ' + (allSystemUsers.find(u=>u.userId===userId)?.name || '用戶') + ' 權限已更新為:' + newRole);
      const user = allSystemUsers.find(u => u.userId === userId);
      if (user) user.role = newRole;
    } else {
      throw new Error((data && data.error) || '更新失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
    // 失敗時還原下拉選單為原本的角色
    if (selectEl) selectEl.value = oldRole;
  } finally {
    if (selectEl) selectEl.disabled = false;
  }
};

// Clean override: fetchAPI unwraps successful Worker replies to { userId, role },
// so role updates must not require data.success here.
window.changeUserRole = async function(userId, newRole, evt) {
  const selectEl = (evt && evt.target) || (typeof event !== 'undefined' && event.target) || document.activeElement;
  const user = allSystemUsers.find(u => u.userId === userId);
  const oldRole = (user || {}).role === 'store' ? 'store' : 'user';
  const allowedRoles = new Set(['user', 'store']);
  if (!allowedRoles.has(String(newRole || ''))) {
    if (selectEl) selectEl.value = oldRole === 'store' ? 'store' : 'user';
    return window.showToast('此區只能調整一般或店長，總管權限不可在手機端變更。', true);
  }

  if (selectEl) selectEl.disabled = true;
  window.showToast('更新權限中...');

  try {
    const data = await window.fetchAPI('updateUserRole', {
      userId,
      targetUserId: userId,
      newRole,
      operatorId: window.currentUserProfile?.userId,
      actorRole: window.userRole,
      networkId: window.currentNetworkId
    }, true);

    if (data && (data.success || data.userId || data.role)) {
      if (user) user.role = newRole;
      window.showToast('已更新 ' + ((user && user.name) || '用戶') + ' 身分：' + (newRole === 'store' ? '店長' : '一般'));
    } else {
      throw new Error((data && data.error) || '更新失敗');
    }
  } catch(e) {
    window.showToast('更新失敗：' + (e.message || '請稍後再試'), true);
    if (selectEl) selectEl.value = oldRole;
  } finally {
    if (selectEl) selectEl.disabled = false;
  }
};

window.clearAnnouncementForm = function() {
  const ids = ['announcement-id', 'announcement-title', 'announcement-body', 'announcement-image-url', 'announcement-action-label', 'announcement-action-url'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const status = document.getElementById('announcement-status');
  if (status) status.value = 'active';
};

function readAnnouncementForm_() {
  const val = id => String(document.getElementById(id)?.value || '').trim();
  return {
    announcementId: val('announcement-id'),
    title: val('announcement-title'),
    body: val('announcement-body'),
    imageUrl: val('announcement-image-url'),
    actionLabel: val('announcement-action-label'),
    actionUrl: val('announcement-action-url'),
    status: val('announcement-status') || 'active'
  };
}

function renderAnnouncementStatus_(status) {
  if (status === 'active') return '<span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[12px] font-black">顯示中</span>';
  return '<span class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[12px] font-black">隱藏</span>';
}

window.loadSystemTicker = async function() {
    try {
        const res = await window.fetchAPI('getSystemTicker', {}, true);
        const data = res?.data || res || {};
        const enabled = document.getElementById('system-ticker-enabled');
        const text = document.getElementById('system-ticker-text');
        if (enabled) enabled.checked = data.enabled === true;
        if (text) text.value = String(data.text || '');
    } catch (e) { window.showToast('跑馬燈讀取失敗：' + (e.message || '請稍後再試'), true); }
};
window.saveSystemTicker = async function(btn) {
    const payload = {
        enabled: document.getElementById('system-ticker-enabled')?.checked === true,
        text: String(document.getElementById('system-ticker-text')?.value || '').trim()
    };
    if (payload.enabled && !payload.text) return window.showToast('啟用時請輸入跑馬燈文字', true);
    try {
        btn.disabled = true;
        await window.fetchAPI('saveSystemTicker', payload, true);
        window.showToast(payload.enabled ? '跑馬燈已啟用並儲存' : '跑馬燈已關閉');
    } catch (e) { window.showToast('跑馬燈儲存失敗：' + (e.message || '請稍後再試'), true); }
    finally { btn.disabled = false; }
};
window.loadAdminAnnouncements = async function() {
    window.loadSystemTicker?.();
  const list = document.getElementById('admin-announcements-list');
  if (!list) return;
  list.innerHTML = '<div class="py-8 text-center text-slate-400 text-sm font-bold">載入公告中...</div>';
  try {
    const res = await window.fetchAPI('listAdminAnnouncements', { limit: 100 }, true);
    const rows = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    if (!rows.length) {
      list.innerHTML = '<div class="bg-white rounded-3xl border border-slate-100 p-8 text-center text-slate-400 text-sm font-bold">目前沒有公告</div>';
      return;
    }
    list.innerHTML = rows.map(item => {
      const id = window.escapeJS(item.announcementId || '');
      const title = window.escapeHTML(item.title || '未命名公告');
      const body = window.escapeHTML(item.body || '').replace(/\n/g, '<br>');
      const image = window.escapeHTML(item.imageUrl || '');
      const time = window.escapeHTML(window.formatDisplayTime(item.updatedAt || item.createdAt || ''));
      return `
        <article class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          ${image ? `<img src="${image}" class="w-full h-auto block" loading="lazy" alt="">` : ''}
          <div class="p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="text-[17px] font-black text-slate-800 leading-snug">${title}</h3>
                ${time ? `<div class="text-[12px] text-slate-400 font-bold mt-1">${time}</div>` : ''}
              </div>
              ${renderAnnouncementStatus_(item.status)}
            </div>
            ${body ? `<div class="text-[14px] text-slate-600 leading-relaxed mt-3">${body}</div>` : ''}
            <div class="grid grid-cols-2 gap-3 mt-4">
              <button onclick="window.editAnnouncement('${id}')" class="py-3 rounded-2xl bg-blue-50 text-blue-600 font-black active:scale-95 transition-transform">修改</button>
              <button onclick="window.deleteAnnouncement('${id}', this)" class="py-3 rounded-2xl bg-red-50 text-red-500 font-black active:scale-95 transition-transform">刪除</button>
            </div>
          </div>
        </article>`;
    }).join('');
    window._adminAnnouncements = rows;
  } catch (e) {
    list.innerHTML = '<div class="bg-white rounded-3xl border border-red-100 p-8 text-center text-red-500 text-sm font-bold">公告載入失敗：' + window.escapeHTML(e.message || '請稍後再試') + '</div>';
  }
};

window.editAnnouncement = function(announcementId) {
  const item = (window._adminAnnouncements || []).find(row => String(row.announcementId) === String(announcementId));
  if (!item) return window.showToast('找不到公告資料', true);
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
  };
  set('announcement-id', item.announcementId);
  set('announcement-title', item.title);
  set('announcement-body', item.body);
  set('announcement-image-url', item.imageUrl);
  set('announcement-action-label', item.actionLabel);
  set('announcement-action-url', item.actionUrl);
  set('announcement-status', item.status || 'active');
  document.getElementById('page-admin-announcements')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.saveAnnouncement = async function(btn) {
  const payload = readAnnouncementForm_();
  if (!payload.title && !payload.body) return window.showToast('請輸入公告標題或內容', true);
  const original = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span>';
  }
  try {
    const res = await window.fetchAPI('saveAnnouncement', payload, true);
    if (res && res.error) throw new Error(res.error);
    window.showToast('公告已儲存');
    window.clearAnnouncementForm();
    await window.loadAdminAnnouncements();
    if (typeof window.loadHomeAnnouncements === 'function') window.loadHomeAnnouncements();
  } catch (e) {
    window.showToast('儲存公告失敗：' + (e.message || '請稍後再試'), true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
};

window.deleteAnnouncement = async function(announcementId, btn) {
  if (!announcementId) return;
  if (!confirm('確定刪除此公告？')) return;
  const original = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span>';
  }
  try {
    const res = await window.fetchAPI('deleteAnnouncement', { announcementId }, true);
    if (res && res.error) throw new Error(res.error);
    window.showToast('公告已刪除');
    await window.loadAdminAnnouncements();
    if (typeof window.loadHomeAnnouncements === 'function') window.loadHomeAnnouncements();
  } catch (e) {
    window.showToast('刪除公告失敗：' + (e.message || '請稍後再試'), true);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
};
