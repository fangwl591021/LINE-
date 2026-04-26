/* ==================== 管理員模組(核銷、統計、用戶管理) ==================== */

// 載入管理員活動列表(核銷頁面)
window.loadAdminActivities = async function() {
  const container = document.getElementById('admin-activities-list');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-10"><span class="material-symbols-outlined animate-spin text-3xl text-slate-300">refresh</span><p class="text-sm text-slate-400 font-bold mt-2">載入活動中...</p></div>';

  try {
    const res = await window.fetchAPI('getPublicActivities', {}, true);
    if (res && Array.isArray(res) && res.length > 0) {
      const acts = res.reverse();
      container.innerHTML = acts.map(act => {
        const title = window.escapeJS(act['活動名稱'] || '未命名活動');
        const time = window.formatDisplayTime(act['開始時間']);
        const status = act['狀態'] || '上架';
        const fee = parseInt(act['金額']) > 0 ? 'NT$ ' + act['金額'] : '免費';
        const img = act['宣傳圖'] || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80';
        const actId = window.escapeJS(act['活動ID'] || act.rowId || '');
        const statusColor = status === '上架' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500';

        return '<div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">' +
          '<div class="w-full aspect-[16/9] bg-slate-100 relative">' +
            '<img src="' + img + '" class="w-full h-full object-cover">' +
            '<div class="absolute top-3 left-3 ' + statusColor + ' text-[11px] px-2 py-1 rounded-full font-bold">' + status + '</div>' +
            '<div class="absolute top-3 right-3 bg-black/60 text-white text-[11px] px-2 py-1 rounded-full font-bold">' + fee + '</div>' +
          '</div>' +
          '<div class="p-4">' +
            '<h4 class="text-[15px] font-black text-slate-800 leading-snug mb-1">' + title + '</h4>' +
            '<div class="text-[12px] text-slate-500 mb-3 flex items-center gap-1">' +
              '<span class="material-symbols-outlined text-[14px]">schedule</span>' + time +
            '</div>' +
            '<div class="grid grid-cols-2 gap-2">' +
              '<button onclick="window.openCheckinPage(\'' + actId + '\', \'' + title + '\')" class="py-2.5 bg-blue-50 text-blue-600 rounded-xl text-[13px] font-bold active:scale-95 transition-transform flex justify-center items-center gap-1">' +
                '<span class="material-symbols-outlined text-[16px]">fact_check</span> 核銷名單' +
              '</button>' +
              '<button onclick="window.unpublishActivity(\'' + actId + '\', this)" class="py-2.5 bg-red-50 text-red-500 rounded-xl text-[13px] font-bold active:scale-95 transition-transform flex justify-center items-center gap-1">' +
                '<span class="material-symbols-outlined text-[16px]">delete</span> 下架活動' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    } else {
      container.innerHTML = '<div class="bg-white p-8 rounded-3xl text-center shadow-sm border border-slate-100"><span class="material-symbols-outlined text-4xl text-slate-300 mb-2">event_busy</span><p class="text-sm text-slate-400 font-bold mt-2">目前沒有活動</p></div>';
    }
  } catch (e) {
    container.innerHTML = '<div class="text-center py-10 text-red-400 text-sm font-bold">載入失敗:' + e.message + '</div>';
  }
};

// 開啟核銷名單頁
window.openCheckinPage = async function(actId, actTitle) {
  window.goPage('admin-checkin');
  const titleEl = document.getElementById('checkin-act-title');
  const countEl = document.getElementById('checkin-count-display');
  const listEl = document.getElementById('admin-checkin-list');

  if (titleEl) titleEl.textContent = actTitle || '名單核銷';
  if (countEl) countEl.textContent = '0';
  if (listEl) listEl.innerHTML = '<div class="text-center py-10"><span class="material-symbols-outlined animate-spin text-3xl text-slate-300">refresh</span><p class="text-sm text-slate-400 font-bold mt-2">載入名單中...</p></div>';

  try {
    const res = await window.fetchAPI('getActivityRegistrants', { activityId: actId }, true);
    if (res && Array.isArray(res)) {
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
          else if (payStatus === '已繳費') statusBadge = '<span class="bg-green-50 text-green-600 text-[10px] px-2 py-0.5 rounded-full font-bold">已繳費</span>';
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
      window.loadAdminActivities();
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
window.renderStoreManagement = function() {
  const container = document.getElementById('store-management-list');
  if (!container) return;

  if (allSystemUsers.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-slate-400 text-xs">尚無任何註冊用戶</div>';
    return;
  }

  container.innerHTML = allSystemUsers.map(u => {
    const isMe = u.userId === currentUserProfile?.userId;
    return '<div class="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col gap-3 shadow-sm">' +
      '<div class="flex justify-between items-center">' +
        '<div>' +
          '<div class="font-black text-[15px] text-slate-800 flex items-center gap-1.5">' +
            window.escapeJS(u.name || '未命名用戶') + ' ' +
            (isMe ? '<span class="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[10px] tracking-wide">你自己</span>' : '') +
          '</div>' +
          '<div class="text-[12px] text-slate-500 font-mono mt-0.5">' + window.escapeJS(u.phone || '無設定電話') + '</div>' +
        '</div>' +
        '<select onchange="window.changeUserRole(\'' + window.escapeJS(u.userId) + '\', this.value)" ' + (isMe ? 'disabled' : '') + ' class="bg-slate-50 border-none rounded-lg p-2 text-[12px] font-bold text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500/30 outline-none cursor-pointer w-[120px] shrink-0 text-center" style="-webkit-appearance:none;appearance:none;">' +
          '<option value="user" ' + (u.role === 'user' ? 'selected' : '') + '>一般 User</option>' +
          '<option value="store" ' + (u.role === 'store' ? 'selected' : '') + '>商家 Store</option>' +
          '<option value="admin" ' + (u.role === 'admin' ? 'selected' : '') + '>管理 Admin</option>' +
        '</select>' +
      '</div>' +
      '<div class="text-[11px] text-slate-400 flex items-center gap-1.5 bg-slate-50 px-2 py-1.5 rounded-lg w-fit">' +
        '<span class="material-symbols-outlined text-[14px]">storefront</span> ' +
        'StoreID: <span class="font-mono text-slate-700 font-bold">' + window.escapeJS(u.storeid || '尚未生成') + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
};

// 變更用戶角色
window.changeUserRole = async function(userId, newRole) {
  window.showToast('更新權限中...');
  try {
    const res = await window.fetchAPI('updateUserRole', { userId, newRole }, true);
    if (res && !res.error) {
      window.showToast('✅ 用戶權限已成功更新為:' + newRole);
      const user = allSystemUsers.find(u => u.userId === userId);
      if (user) user.role = newRole;
    } else {
      throw new Error(res.error || '更新失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
    window.renderStoreManagement();
  }
};
