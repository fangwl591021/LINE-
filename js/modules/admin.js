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

// 將「渲染邏輯」獨立出來,讓快取與 API 都能重用
window._renderAdminActivities = function(res) {
  const container = document.getElementById('admin-activities-list');
  if (!container) return;

  if (res && Array.isArray(res) && res.length > 0) {
    const acts = [...res].reverse();
    container.innerHTML = acts.map(act => {
      const title = window.escapeJS(act['活動名稱'] || '未命名活動');
      const time = window.formatDisplayTime(act['開始時間']);
      const status = act['狀態'] || '上架';
      const fee = parseInt(act['金額']) > 0 ? 'NT$ ' + act['金額'] : '免費';
      const img = act['宣傳圖'] || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80';
      const actId = window.escapeJS(act['活動ID'] || act.rowId || '');
      const statusColor = status === '上架' ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white';

      return '<div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">' +
        '<div class="w-full aspect-[16/9] bg-slate-100 relative">' +
          '<img src="' + img + '" class="w-full h-full object-cover" loading="lazy">' +
          '<div class="absolute top-3 left-3 ' + statusColor + ' text-[11px] px-2 py-1 rounded-full font-bold">' + status + '</div>' +
          '<div class="absolute top-3 right-3 bg-black/60 text-white text-[11px] px-2 py-1 rounded-full font-bold">' + fee + '</div>' +
        '</div>' +
        '<div class="p-4">' +
          '<h4 class="text-[15px] font-black text-slate-800 leading-snug mb-1">' + title + '</h4>' +
          '<div class="text-[12px] text-slate-500 mb-3 flex items-center gap-1">' +
            '<span class="material-symbols-outlined text-[14px]">schedule</span>' + time +
          '</div>' +
          '<button onclick="window.openActivityShareModal(\'' + actId + '\', \'' + title + '\')" class="w-full mb-2 py-3 bg-blue-600 text-white rounded-xl text-[13px] font-black active:scale-95 transition-transform flex justify-center items-center gap-1.5">' +
            '<span class="material-symbols-outlined text-[17px]">ios_share</span> 分享活動' +
          '</button>' +
          '<div class="grid grid-cols-4 gap-2">' +
            '<button onclick="window.openCheckinPage(\'' + actId + '\', \'' + title + '\')" class="py-2.5 bg-blue-50 text-blue-600 rounded-xl text-[12px] font-bold active:scale-95 transition-transform flex justify-center items-center gap-1">' +
              '<span class="material-symbols-outlined text-[15px]">fact_check</span> 核銷' +
            '</button>' +
            '<button onclick="window.copyNfcCheckinUrl(\'' + actId + '\')" class="py-2.5 bg-emerald-700 text-white rounded-xl text-[12px] font-bold active:scale-95 transition-transform flex justify-center items-center gap-1">' +
              '<span class="material-symbols-outlined text-[15px]">nfc</span> NFC' +
            '</button>' +
            '<button onclick="window.openEditActivity(\'' + actId + '\')" class="py-2.5 bg-amber-50 text-amber-600 rounded-xl text-[12px] font-bold active:scale-95 transition-transform flex justify-center items-center gap-1">' +
              '<span class="material-symbols-outlined text-[15px]">edit</span> 編輯' +
            '</button>' +
            '<button onclick="window.unpublishActivity(\'' + actId + '\', this)" class="py-2.5 bg-red-50 text-red-500 rounded-xl text-[12px] font-bold active:scale-95 transition-transform flex justify-center items-center gap-1">' +
              '<span class="material-symbols-outlined text-[15px]">delete</span> 下架' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
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
  if (!confirm('確認此筆款項已收款？')) return;
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
  if (!confirm('確定要下架此活動嗎？相關的所有報名資料也將一併移除。')) return;
  const oriHtml = btnEl.innerHTML;
  btnEl.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span>';
  btnEl.disabled = true;

  try {
    const res = await window.fetchAPI('removeAct', { activityId: actId }, true);
    if (res && !res.error) {
      window.showToast('✅ 活動已成功下架！');
      // 清快取讓下次進核銷頁時重新從 API 拉
      window._adminActsCache = { data: null, time: 0 };
      window.loadAdminActivities(true);
      window.loadUserActivities();
    } else {
      throw new Error(res.error || '下架失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
    btnEl.innerHTML = oriHtml;
    btnEl.disabled = false;
  }
};

// 載入營運統計
window.loadAdminStats = async function() {
  const content = document.getElementById('admin-stats-content');
  if (!content) return;
  content.innerHTML = '<div class="text-center py-10"><span class="material-symbols-outlined animate-spin text-3xl text-slate-300">refresh</span><p class="text-sm text-slate-400 font-bold mt-2">載入數據中...</p></div>';

  try {
    const res = await window.fetchAPI('getAdminStats', {}, true);
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
