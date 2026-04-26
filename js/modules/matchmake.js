/* ==================== AI 智能配對模組 ==================== */

// 切換配對隱私
window.toggleFatePrivacy = async function(forceOpen = false) {
  if (!currentUserCard) return window.showToast('找不到您的名片資料', true);
  let config = {};
  try { config = JSON.parse(currentUserCard['自訂名片設定']); } catch(e){}

  const toggleEl = document.getElementById('fate-privacy-toggle');
  if (forceOpen) {
    config.isPrivate = false;
    if (toggleEl) toggleEl.checked = true;
  } else {
    config.isPrivate = !toggleEl.checked;
  }

  try {
    await window.fetchAPI('updateCard', {
      rowId: currentUserCard.rowId,
      data: { '自訂名片設定': JSON.stringify(config) }
    }, true);
    currentUserCard['自訂名片設定'] = JSON.stringify(config);
    window.showToast(config.isPrivate ? '已切換為私人模式' : '✅ 已公開名片,解鎖配對功能');

    if (!config.isPrivate) {
      document.getElementById('privacy-lock-container').classList.add('hidden');
      document.getElementById('matchmaker-ui').classList.remove('hidden');
    } else if (!hasAdminRights) {
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
  const query = document.getElementById('match-query').value.trim();
  if (!query) return window.showToast('請輸入您的配對需求', true);

  const btn = document.getElementById('btn-match');
  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> AI 正在尋找...';
  btn.disabled = true;

  try {
    const pool = allCards.filter(c => {
      if (c.rowId === currentUserCard?.rowId) return false;
      let isPriv = false;
      try { isPriv = JSON.parse(c['自訂名片設定']||'{}').isPrivate; } catch(e){}
      return !isPriv;
    });

    const res = await window.fetchAPI('matchmakeContacts', {
      currentUser: currentUser,
      query: query,
      contacts: pool.map(c => ({
        rowId: c.rowId,
        Name: c['姓名'],
        Company: c['公司名稱'],
        Title: c['職稱'],
        Tags: (c['個性']||'') + (c['興趣']||'') + (c['事業']||'')
      }))
    }, true);

    if (res && Array.isArray(res)) {
      const resultsList = document.getElementById('results-list');
      if (res.length === 0) {
        resultsList.innerHTML = '<div class="text-center py-6 text-slate-500">目前沒有合適的人選</div>';
      } else {
        resultsList.innerHTML = res.map(match => {
          const c = allCards.find(card => String(card.rowId) === String(match.rowId));
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
      document.getElementById('match-results').classList.remove('hidden');
    } else {
      throw new Error('無法取得配對結果');
    }
  } catch(e) {
    window.showToast('配對失敗:' + e.message, true);
  } finally {
    if (btn) { btn.innerHTML = oriHtml; btn.disabled = false; }
  }
};

// 檢查資料庫狀態(管理員工具)
window.checkDatabaseStatus = function() {
  if (allCards.length === 0) return;
  const missingCount = allCards.filter(c =>
    !c['個性'] || String(c['個性']).trim() === '' || String(c['個性']) === '待分析'
  ).length;
  if (document.getElementById('total-count')) document.getElementById('total-count').innerText = allCards.length;
  if (document.getElementById('missing-count')) document.getElementById('missing-count').innerText = missingCount;
};

// 同步舊標籤(批次補漏 / 全庫重算)
window.syncOldTags = async function(forceAll = false) {
  const targetContacts = forceAll
    ? allCards
    : allCards.filter(c =>
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
