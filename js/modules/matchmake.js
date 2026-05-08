/* ==================== AI 智能配對模組 ==================== */

function showMatchStatus_(html) {
  const ui = document.getElementById('matchmaker-ui');
  if (!ui) return;

  let status = document.getElementById('match-status-card');
  if (!status) {
    status = document.createElement('div');
    status.id = 'match-status-card';
    status.className = 'mb-4 rounded-2xl bg-slate-50 border border-slate-100 p-5';
    ui.parentNode.insertBefore(status, ui);
  }

  status.innerHTML = html;
  status.classList.remove('hidden');
}

function hideMatchStatus_() {
  const status = document.getElementById('match-status-card');
  if (status) status.classList.add('hidden');
}

window.initMatchmakePage = async function() {
  const lock = document.getElementById('privacy-lock-container');
  const ui = document.getElementById('matchmaker-ui');
  const results = document.getElementById('match-results');
  const adminTools = document.getElementById('admin-tools-container');

  if (lock) lock.classList.add('hidden');
  if (ui) ui.classList.add('hidden');
  if (results) results.classList.add('hidden');
  if (adminTools) adminTools.classList.toggle('hidden', !window.hasAdminRights);

  if (typeof window.checkDatabaseStatus === 'function') window.checkDatabaseStatus();

  if (!window.allCards || window.allCards.length === 0) {
    showMatchStatus_(
      '<div class="text-center text-slate-400 font-bold text-sm">' +
        '<span class="material-symbols-outlined animate-spin text-3xl mb-2">refresh</span>' +
        '<p>名片資料載入中...</p>' +
      '</div>'
    );

    try {
      if (typeof window.loadCardData === 'function') await window.loadCardData({ render: false });
      else if (typeof window.loadAllData === 'function') await window.loadAllData();
    } catch (e) {}
  }

  if (!window.currentUserCard && typeof window.syncUserCardMatch === 'function') {
    window.syncUserCardMatch();
  }

  const isAdmin = window.hasAdminRights || window.userRole === 'admin';
  if (!window.currentUserCard && !isAdmin) {
    if (ui) ui.classList.add('hidden');
    showMatchStatus_(
      '<div class="text-center">' +
        '<span class="material-symbols-outlined text-4xl text-slate-300 mb-3">badge</span>' +
        '<h3 class="font-black text-slate-800 mb-2">尚未找到您的專屬名片</h3>' +
        '<p class="text-[13px] text-slate-500 leading-relaxed">請先在設定中建立或認領您的名片，再使用智能配對。</p>' +
      '</div>'
    );
    return;
  }

  let config = {};
  try {
    config = JSON.parse(window.currentUserCard?.['自訂名片設定'] || '{}');
  } catch (e) {}

  const isPrivate = !!config.isPrivate;
  const toggleEl = document.getElementById('fate-privacy-toggle');
  if (toggleEl) toggleEl.checked = !isPrivate;

  if (isPrivate && !isAdmin) {
    hideMatchStatus_();
    if (lock) lock.classList.remove('hidden');
    return;
  }

  if (ui) {
    hideMatchStatus_();
    ui.classList.remove('hidden');
  }
};

// 切換配對隱私
window.toggleFatePrivacy = async function(forceOpen = false) {
  if (!window.currentUserCard) return window.showToast('找不到您的名片資料', true);
  let config = {};
  try { config = JSON.parse(window.currentUserCard['自訂名片設定']); } catch(e){}

  const toggleEl = document.getElementById('fate-privacy-toggle');
  const templateDesc = '請填寫公司/店家介紹\n請填寫公司/店家服務項目\n請填寫公司/店家特色\n請填寫優惠資訊\n建議 4-5 行，每行 16 字內';
  const isTemplateContent = String(window.currentUserCard['服務項目'] || '').trim() === templateDesc;
  const wantsPublic = forceOpen || (toggleEl && toggleEl.checked);
  if (wantsPublic && isTemplateContent) {
    if (toggleEl) toggleEl.checked = false;
    config.isPrivate = true;
    window.showToast('請先編輯名片介紹內容，再公開上架到配對池', true);
    return;
  }

  if (forceOpen) {
    config.isPrivate = false;
    if (toggleEl) toggleEl.checked = true;
  } else {
    config.isPrivate = !toggleEl.checked;
  }

  try {
    await window.fetchAPI('updateCard', {
      rowId: window.currentUserCard.rowId,
      data: { '自訂名片設定': JSON.stringify(config) }
    }, true);
    window.currentUserCard['自訂名片設定'] = JSON.stringify(config);
    window.showToast(config.isPrivate ? '已切換為私人模式' : '✅ 已公開名片,解鎖配對功能');

    if (!config.isPrivate) {
      document.getElementById('privacy-lock-container').classList.add('hidden');
      document.getElementById('matchmaker-ui').classList.remove('hidden');
    } else if (!window.hasAdminRights) {
      document.getElementById('privacy-lock-container').classList.remove('hidden');
      document.getElementById('matchmaker-ui').classList.add('hidden');
    }
  } catch(e) {
    window.showToast('狀態更新失敗:' + e.message, true);
    if (toggleEl) toggleEl.checked = !config.isPrivate;
  }
};

// 啟動 AI 配對
window.startMatchmaking = async function() {
  const queryEl = document.getElementById('match-query');
  const query = queryEl ? queryEl.value.trim() : '';
  if (!query) return window.showToast('請輸入您的配對需求', true);

  if (!window.allCards || window.allCards.length === 0) {
    window.showToast('名片資料仍在載入，請稍後再試', true);
    if (typeof window.loadCardData === 'function') window.loadCardData({ render: false });
    else if (typeof window.loadAllData === 'function') window.loadAllData();
    return;
  }

  const role = window.currentUser?.role || 'user';
  const limit = (window.LIMITS[role] || window.LIMITS.user).matchmake;

  const today = new Date().toLocaleDateString('en-CA');
  const usageKey = `matchmake_usage_${today}`;
  let currentUsage = parseInt(localStorage.getItem(usageKey) || '0');

  if (currentUsage >= limit) {
    return window.showToast(`⚠️ 用量限制：您的方案 (${role.toUpperCase()}) 每日最多配對 ${limit} 次，請明日再試。`, true);
  }

  const btn = document.getElementById('btn-match');
  if (!btn) return window.showToast('配對按鈕尚未載入，請重新進入智能配對頁', true);

  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> AI 正在尋找...';
  btn.disabled = true;

  try {
    const pool = window.allCards.filter(c => {
      if (c.rowId === window.currentUserCard?.rowId) return false;
      let isPriv = false;
      try { isPriv = JSON.parse(c['自訂名片設定']||'{}').isPrivate; } catch(e){}
      return !isPriv;
    });

    if (pool.length === 0) {
      throw new Error('目前沒有可配對的公開名片');
    }

    const res = await window.fetchAPI('matchmakeContacts', {
      currentUser: window.currentUser,
      query: query,
      contacts: pool.map(c => ({
        rowId: c.rowId,
        Name: c['姓名'],
        Company: c['公司名稱'],
        Title: c['職稱'],
        Tags: (c['個性']||'') + (c['興趣']||'') + (c['事業']||'')
      }))
    }, true);

    const matches = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : null);

    if (matches) {
      localStorage.setItem(usageKey, currentUsage + 1);

      const resultsList = document.getElementById('results-list');
      const resultsContainer = document.getElementById('match-results');
      if (!resultsList || !resultsContainer) throw new Error('配對結果區塊尚未載入');

      if (matches.length === 0) {
        resultsList.innerHTML = '<div class="text-center py-6 text-slate-500">目前沒有合適的人選</div>';
      } else {
        resultsList.innerHTML = matches.map(match => {
          const c = window.allCards.find(card => String(card.rowId) === String(match.rowId));
          if (!c) return '';
          return '<div class="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-2">' +
            '<div class="flex justify-between items-center">' +
              '<div class="font-black text-slate-800">' + window.escapeJS(c['姓名'] || '未知') + ' <span class="text-[12px] font-medium text-slate-500 ml-1">' + window.escapeJS(c['公司名稱'] || '') + '</span></div>' +
              '<div class="bg-[#06C755] text-white px-2 py-0.5 rounded text-[11px] font-bold">契合度 ' + match.score + '%</div>' +
            '</div>' +
            '<div class="text-[13px] text-slate-600">' + window.escapeJS(match.reason) + '</div>' +
            '<button type="button" onclick="window.openCardDetailById(\'' + window.escapeJS(match.rowId) + '\')" class="mt-2 w-full py-2 bg-white text-blue-600 rounded-lg font-bold text-[13px] border border-blue-100 active:scale-95 transition-transform">查看名片</button>' +
          '</div>';
        }).join('');
      }

      const remaining = limit - (currentUsage + 1);
      const limitNotice = limit === Infinity ? '無限制' : `剩餘 ${remaining} 次`;

      if (!document.getElementById('match-limit-notice')) {
        resultsContainer.insertAdjacentHTML('afterbegin', `<div id="match-limit-notice" class="text-[11px] text-slate-400 font-bold mb-2 text-right px-1">今日配對額度: ${limitNotice}</div>`);
      } else {
        document.getElementById('match-limit-notice').textContent = `今日配對額度: ${limitNotice}`;
      }

      resultsContainer.classList.remove('hidden');

    } else if (res && res.error) {
      if (res.error.includes('上限')) {
        localStorage.setItem(usageKey, limit);
      }
      throw new Error(res.error);
    } else {
      throw new Error('無法取得配對結果');
    }
  } catch(e) {
    window.showToast('配對失敗:' + e.message, true);
  } finally {
    if (btn) { btn.innerHTML = oriHtml; btn.disabled = false; }
  }
};

// 檢查資料庫狀態
window.checkDatabaseStatus = function() {
  if (window.allCards.length === 0) return;
  const missingCount = window.allCards.filter(c =>
    !c['個性'] || String(c['個性']).trim() === '' || String(c['個性']) === '待分析'
  ).length;
  if (document.getElementById('total-count')) document.getElementById('total-count').innerText = window.allCards.length;
  if (document.getElementById('missing-count')) document.getElementById('missing-count').innerText = missingCount;
};

// 同步舊標籤
window.syncOldTags = async function(forceAll = false) {
  const targetContacts = forceAll
    ? window.allCards
    : window.allCards.filter(c =>
        !c['個性'] || String(c['個性']).trim() === '' ||
        String(c['個性']) === '待分析' || String(c['個性']) === 'undefined'
      );
  if (targetContacts.length === 0) return window.showToast(forceAll ? '目前無名片資料' : '目前所有名片皆已包含標籤,無需補漏');
  if (!confirm(forceAll ? '確定要強制重新運算全庫名片的命理標籤嗎？(此操作會覆蓋所有舊標籤)' : '系統發現缺乏標籤的名片。是否立即啟動 AI 批次補漏？')) return;

  const btnSync = document.getElementById('btn-sync-tags');
  const btnForce = document.getElementById('btn-force-recalc');
  if (btnSync) btnSync.classList.add('pointer-events-none', 'opacity-50');
  if (btnForce) btnForce.classList.add('pointer-events-none', 'opacity-50');

  const statusEl = document.getElementById('sync-status');
  let successCount = 0;

  for (let i = 0; i < targetContacts.length; i++) {
    const c = targetContacts[i];
    if (statusEl) statusEl.innerHTML = '<span class="material-symbols-outlined animate-spin text-primary text-[14px] align-middle">refresh</span> 正在' + (forceAll?'重算':'同步') + ' <b>' + window.escapeJS(c['姓名'] || '未知') + '</b> (' + (i + 1) + '/' + targetContacts.length + ')...';
    try {
      const newTags = await window.fetchAPI('calculateFateTags', {
        Name: c['姓名'],
        Mobile: String(c['手機號碼'] || c['公司電話'] || '').replace(/[^0-9+]/g, ''),
        Birthday: c['生日'],
        Company: c['公司名稱'],
        Title: c['職稱']
      }, true);
      if (newTags && !newTags.error) {
        const updateData = {
          '個性': newTags.Personality || '待分析',
          '興趣': newTags.Hobbies || '待分析',
          '財運': newTags.Wealth || '待分析',
          '健康': newTags.Health || '待分析',
          '事業': newTags.Career || '待分析'
        };
        await window.fetchAPI('updateCard', { rowId: c.rowId, data: updateData }, true);
        c['個性'] = updateData['個性'];
        c['興趣'] = updateData['興趣'];
        c['財運'] = updateData['財運'];
        c['健康'] = updateData['健康'];
        c['事業'] = updateData['事業'];
        successCount++;
      }
    } catch (err) {
      window.showToast('⚠️ 處理「' + window.escapeJS(c['姓名'] || '未知') + '」時發生錯誤', true);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (btnSync) btnSync.classList.remove('pointer-events-none', 'opacity-50');
  if (btnForce) btnForce.classList.remove('pointer-events-none', 'opacity-50');
  window.checkDatabaseStatus();
  if (successCount > 0) window.showToast('✅ 作業結束！成功' + (forceAll?'重算':'補漏') + ' ' + successCount + ' 張名片。');
};
