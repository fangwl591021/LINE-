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

function readMatchmakeSafetyConfig_(card) {
  if (typeof window.getCardSafetyConfig === 'function') return window.getCardSafetyConfig(card);
  try { return JSON.parse(card?.['自訂名片設定'] || card?.['電子名片設定'] || '{}'); } catch (e) { return {}; }
}

function getMatchmakeSafetyFeedback_(card) {
  if (typeof window.getCardSafetyFeedback === 'function') return window.getCardSafetyFeedback(card);
  const readiness = typeof window.validateCardPublicReadiness === 'function'
    ? window.validateCardPublicReadiness(card) : { pass: true, missing: [] };
  const review = readMatchmakeSafetyConfig_(card).safetyReview || {};
  return {
    status: !readiness.pass ? 'readiness' : review.pass === true ? 'passed' : review.pass === false ? 'failed' : 'pending',
    pass: readiness.pass && review.pass === true,
    reasons: !readiness.pass ? (readiness.missing || []).map(field => '尚未完成有效的' + field) : Array.isArray(review.reasons) && review.reasons.length ? review.reasons : ['尚未取得通過的 AI 體檢報告。'],
    suggestions: Array.isArray(review.suggestions) && review.suggestions.length ? review.suggestions : ['請先編輯並儲存名片的圖片、標題、說明與按鈕，再執行 AI 體檢。'],
    issues: Array.isArray(review.issues) ? review.issues : []
  };
}

function escapeMatchmakeSafetyText_(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

window.renderMatchmakeSafetyFeedback = function(feedback, card = window.currentUserCard) {
  if (card && window.currentUserCard && String(card.rowId || '') !== String(window.currentUserCard.rowId || '')) return;
  const report = feedback || getMatchmakeSafetyFeedback_(card);
  if (report.pass === true || report.status === 'passed') { hideMatchStatus_(); return; }
  if (window.matchmakePoolScope !== 'public') return;
  const titles = {
    readiness: '公開交流池需要先通過 AI 體檢：請先補齊名片',
    pending: '公開交流池需要先通過 AI 體檢',
    failed: 'AI 體檢未通過：原因與修改建議',
    error: 'AI 體檢未完成：請依說明處理後重試'
  };
  const body = typeof window.renderCardSafetyFeedbackHtml === 'function'
    ? window.renderCardSafetyFeedbackHtml(report, { heading: false })
    : '<div class="font-bold mt-3">原因</div><ul class="list-disc pl-5 space-y-1">' + (report.reasons || []).map(reason => '<li>' + escapeMatchmakeSafetyText_(reason) + '</li>').join('') + '</ul>' +
      '<div class="font-bold mt-3">修改建議</div><ul class="list-disc pl-5 space-y-1">' + (report.suggestions || []).map(tip => '<li>' + escapeMatchmakeSafetyText_(tip) + '</li>').join('') + '</ul>';
  showMatchStatus_(
    '<div class="text-[13px] text-slate-600 leading-relaxed" role="status" aria-live="polite">' +
      '<h3 class="font-black text-slate-800 mb-2 flex items-center gap-2"><span class="material-symbols-outlined text-amber-500">health_and_safety</span>' + escapeMatchmakeSafetyText_(titles[report.status] || titles.pending) + '</h3>' +
      '<p class="mb-3">' + (report.errorCode === 'PUBLIC_SETTING_SAVE_FAILED' ? '此次公開／私人切換尚未確認，畫面保留最後已確認設定，請重新整理確認。' : report.status === 'error' ? '本次未完成檢查，不代表名片內容不合格；原公開／私人設定不變。' : '請確認圖片、標題、說明、按鈕都有效；未通過前不會加入公開交流池。') + '</p>' + body +
      '<div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">' +
        '<button type="button" onclick="window.goPage?.(\'admin-settings\');window.focusMyECardSection?.()" class="min-h-11 py-3 px-3 border border-slate-200 bg-white text-slate-700 rounded-xl font-bold">編輯名片</button>' +
        '<button type="button" onclick="window.toggleFatePrivacy(true)" class="min-h-11 py-3 px-3 bg-[#06C755] text-white rounded-xl font-bold">重新執行 AI 體檢並公開</button>' +
      '</div>' +
    '</div>'
  );
  if (!(window.hasAdminRights || window.userRole === 'admin')) {
    if (report.status !== 'error') {
      document.getElementById('matchmaker-ui')?.classList.add('hidden');
      document.getElementById('match-results')?.classList.add('hidden');
      document.getElementById('privacy-lock-container')?.classList.add('hidden');
    }
    const toggle = document.getElementById('fate-privacy-toggle');
    if (toggle) toggle.checked = report.status === 'error' ? !readMatchmakeSafetyConfig_(card).isPrivate : false;
  }
};

window.matchmakePoolScope = window.matchmakePoolScope || 'public';

function renderMatchmakePoolMode_() {
  const scope = window.matchmakePoolScope === 'public' ? 'public' : 'own';
  const ownBtn = document.getElementById('match-pool-own');
  const publicBtn = document.getElementById('match-pool-public');
  const help = document.getElementById('match-pool-mode-help');
  const title = document.getElementById('match-pool-card-title');
  const subtitle = document.getElementById('match-pool-card-subtitle');
  const toggleWrap = document.getElementById('match-public-toggle-wrap');
  const queryTitle = document.getElementById('match-query-title');
  const queryDesc = document.getElementById('match-query-desc');
  const activeClass = ['bg-slate-900', 'text-white'];
  const inactiveClass = ['bg-slate-50', 'text-slate-600'];

  [ownBtn, publicBtn].forEach(btn => {
    if (!btn) return;
    btn.classList.remove(...activeClass, ...inactiveClass);
    btn.classList.add(...inactiveClass);
  });

  const activeBtn = scope === 'public' ? publicBtn : ownBtn;
  if (activeBtn) {
    activeBtn.classList.remove(...inactiveClass);
    activeBtn.classList.add(...activeClass);
  }

  if (help) {
    help.textContent = scope === 'public'
      ? '規則：公開交流池只收錄本人同意公開且通過 AI 體檢的名片，可被跨店搜尋與配對；未通過或未公開不會進入。'
      : '規則：我的名片池只使用你自己掃描、建立或認領的名片，僅供個人配對，不進入跨店配對，也不公開給其他店家搜尋。';
  }
  if (title) title.textContent = scope === 'public' ? '參與公開交流池' : '個人配對池';
  if (subtitle) subtitle.textContent = scope === 'public' ? '名片已公開，允許跨店搜尋' : '只使用我的名片資料，不公開';
  if (toggleWrap) toggleWrap.classList.toggle('hidden', scope !== 'public');
  if (queryTitle) queryTitle.textContent = scope === 'public' ? '尋找跨店合作夥伴' : '整理我的人脈配對';
  if (queryDesc) {
    queryDesc.textContent = scope === 'public'
      ? '輸入您的業務需求，AI 將從已公開的跨店交流池尋找互補人選。'
      : '輸入您的業務需求，AI 只會使用您自己掃描或建立的名片資料進行配對。';
  }
}

window.setMatchmakePoolScope = function(scope) {
  window.matchmakePoolScope = scope === 'public' ? 'public' : 'own';
  renderMatchmakePoolMode_();
  window.initMatchmakePage?.();
};

function isMatchmakeToolsVisibleContext_() {
  if (!(window.hasAdminRights || window.userRole === 'admin')) return false;
  if (window.currentPage === 'matchmake') return true;

  const homeSlot = document.getElementById('home-matchmake-slot');
  const adminTools = document.getElementById('admin-tools-container');
  if (!homeSlot || !adminTools) return false;

  return window.currentPage === 'home' && homeSlot.contains(adminTools);
}

window.initMatchmakePage = async function() {
  const lock = document.getElementById('privacy-lock-container');
  const ui = document.getElementById('matchmaker-ui');
  const results = document.getElementById('match-results');
  const adminTools = document.getElementById('admin-tools-container');

  if (lock) lock.classList.add('hidden');
  if (ui) ui.classList.add('hidden');
  if (results) results.classList.add('hidden');
  if (adminTools) adminTools.classList.toggle('hidden', !isMatchmakeToolsVisibleContext_());
  renderMatchmakePoolMode_();

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
  const scope = window.matchmakePoolScope === 'public' ? 'public' : 'own';
  if (scope === 'public' && !window.currentUserCard && !isAdmin) {
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

  const config = readMatchmakeSafetyConfig_(window.currentUserCard);

  const isPrivate = !!config.isPrivate;
  const toggleEl = document.getElementById('fate-privacy-toggle');
  if (toggleEl) toggleEl.checked = !isPrivate;
  let keepSafetyFeedback = false;

  if (scope === 'public' && !isAdmin) {
    const readiness = typeof window.validateCardPublicReadiness === 'function'
      ? window.validateCardPublicReadiness(window.currentUserCard)
      : { pass: true, missing: [] };
    const review = config.safetyReview || {};
    const feedback = getMatchmakeSafetyFeedback_(window.currentUserCard);
    if (!readiness.pass || review.pass !== true) {
      if (ui) ui.classList.add('hidden');
      if (toggleEl) toggleEl.checked = false;
      window.renderMatchmakeSafetyFeedback(feedback, window.currentUserCard);
      return;
    }
  }
  if (scope === 'public' && window.currentUserCard) {
    const feedback = getMatchmakeSafetyFeedback_(window.currentUserCard);
    if (feedback.pass !== true) {
      window.renderMatchmakeSafetyFeedback(feedback, window.currentUserCard);
      keepSafetyFeedback = true;
    }
  }

  if (scope === 'public' && isPrivate && !isAdmin) {
    if (!keepSafetyFeedback) hideMatchStatus_();
    if (lock) lock.classList.toggle('hidden', keepSafetyFeedback);
    return;
  }

  if (ui) {
    if (!keepSafetyFeedback) hideMatchStatus_();
    ui.classList.remove('hidden');
  }
};

// 切換配對隱私
let matchmakePrivacyUpdating_ = false;
window.toggleFatePrivacy = async function(forceOpen = false) {
  if (matchmakePrivacyUpdating_) return window.showToast?.('名片體檢或公開設定處理中，請稍候。');
  if (!window.currentUserCard) return window.showToast('找不到您的名片資料', true);
  const card = window.currentUserCard;
  matchmakePrivacyUpdating_ = true;
  try {
  let config = readMatchmakeSafetyConfig_(card);

  const toggleEl = document.getElementById('fate-privacy-toggle');
  const templateDesc = '請填寫公司/店家介紹\n請填寫公司/店家服務項目\n請填寫公司/店家特色\n請填寫優惠資訊\n建議 4-5 行，每行 16 字內';
  const isTemplateContent = String(window.currentUserCard['服務項目'] || '').trim() === templateDesc;
  const wantsPublic = forceOpen || (toggleEl && toggleEl.checked);
  if (wantsPublic && isTemplateContent) {
    if (toggleEl) toggleEl.checked = false;
    config.isPrivate = true;
    window.showToast('請先編輯名片介紹內容，再公開上架到配對池', true);
    window.renderMatchmakeSafetyFeedback({ status: 'readiness', pass: false, reasons: ['名片介紹仍是尚未填寫的預設模板。'], suggestions: ['請到「編輯名片」填入實際服務內容並儲存，再重新執行 AI 體檢。'], issues: [] }, card);
    return;
  }

  if (wantsPublic && typeof window.ensureCardCanGoPublic === 'function') {
    if (toggleEl) toggleEl.checked = false;
    window.showToast('AI 正在健檢名片，通過後才會公開搜尋...');
    let canGoPublic;
    try {
      canGoPublic = await window.ensureCardCanGoPublic(window.currentUserCard);
    } catch (error) {
      if (window.currentUserCard !== card) return;
      window.renderMatchmakeSafetyFeedback({ status: 'error', pass: false, reasons: ['AI 服務或網路暫時無法完成檢查，這不代表名片內容不合格。'], suggestions: ['請保留目前名片內容，確認網路正常後重新執行 AI 體檢。'], issues: [] }, card);
      return;
    }
    if (window.currentUserCard !== card) return;
    // The review saves its latest report before returning; do not overwrite it with the pre-review config.
    config = readMatchmakeSafetyConfig_(window.currentUserCard);
    if (!canGoPublic) {
      if (toggleEl) toggleEl.checked = !config.isPrivate;
      window.renderMatchmakeSafetyFeedback(getMatchmakeSafetyFeedback_(window.currentUserCard), window.currentUserCard);
      return;
    }
    if (toggleEl) toggleEl.checked = true;
  }

  if (forceOpen) {
    config.isPrivate = false;
    if (toggleEl) toggleEl.checked = true;
  } else {
    config.isPrivate = !toggleEl.checked;
  }
  // Keep existing legacy privacy aliases consistent with this explicit user choice.
  if (Object.prototype.hasOwnProperty.call(config, 'private')) config.private = config.isPrivate;
  if (Object.prototype.hasOwnProperty.call(config, 'visibility')) config.visibility = config.isPrivate ? 'private' : 'public';

  try {
    const saved = await window.fetchAPI('updateCard', {
      rowId: card.rowId,
      data: { '自訂名片設定': JSON.stringify(config) }
    }, true);
    if (saved?.success !== true) throw new Error('PUBLIC_SETTING_SAVE_FAILED');
    if (window.currentUserCard !== card) return;
    card['自訂名片設定'] = JSON.stringify(config);
    window.showToast(config.isPrivate ? '已切換為私人模式' : '✅ 已公開名片,解鎖配對功能');

    if (!config.isPrivate) {
      hideMatchStatus_();
      document.getElementById('privacy-lock-container').classList.add('hidden');
      document.getElementById('matchmaker-ui').classList.remove('hidden');
    } else if (!window.hasAdminRights) {
      document.getElementById('privacy-lock-container').classList.remove('hidden');
      document.getElementById('matchmaker-ui').classList.add('hidden');
    }
  } catch(e) {
    if (window.currentUserCard !== card) return;
    window.showToast('公開／私人設定未能儲存，請確認目前設定後重試。', true);
    if (toggleEl) toggleEl.checked = !readMatchmakeSafetyConfig_(card).isPrivate;
    window.renderMatchmakeSafetyFeedback({ status: 'error', errorCode: 'PUBLIC_SETTING_SAVE_FAILED', pass: false, reasons: ['公開／私人設定尚未確認儲存成功，不能將這次切換視為完成。'], suggestions: ['請確認網路連線，重新整理核對目前公開狀態後再操作。'], issues: [] }, card);
  }
  } finally {
    matchmakePrivacyUpdating_ = false;
  }
};

function renderAiMatchInterestButton_(button, interested) {
  if (!button) return;
  button.dataset.interested = interested ? '1' : '0';
  button.classList.toggle('bg-pink-50', interested);
  button.classList.toggle('border-pink-200', interested);
  button.classList.toggle('text-pink-600', interested);
  button.classList.toggle('bg-white', !interested);
  button.classList.toggle('border-slate-200', !interested);
  button.classList.toggle('text-slate-600', !interested);
  button.innerHTML = '<span class="material-symbols-outlined text-[18px]">' + (interested ? 'favorite' : 'favorite_border') + '</span>' + (interested ? '已感興趣' : '感興趣');
}

window.loadAiMatchInterestStates = async function(cardRowIds) {
  const ids = [...new Set((Array.isArray(cardRowIds) ? cardRowIds : []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, 20);
  if (!ids.length || typeof window.fetchAPI !== 'function') return;
  try {
    const res = await window.fetchAPI('getAiMatchInterestStates', { targetCardRowIds: ids }, true);
    const rows = Array.isArray(res?.states) ? res.states : (Array.isArray(res?.data?.states) ? res.data.states : []);
    rows.forEach(state => {
      const rowId = String(state?.targetCardRowId || '');
      const button = [...document.querySelectorAll('[data-ai-match-interest-card]')]
        .find(item => item.dataset.aiMatchInterestCard === rowId);
      renderAiMatchInterestButton_(button, state?.interestedByMe === true);
    });
  } catch (error) {
    console.warn('[matchmake] interest states skipped:', error?.message || error);
  }
};

window.toggleAiMatchInterest = async function(button, targetCardRowId) {
  const rowId = String(targetCardRowId || '').trim();
  if (!button || !rowId || typeof window.fetchAPI !== 'function') return;
  button.disabled = true;
  try {
    const res = await window.fetchAPI('toggleAiMatchInterest', { targetCardRowId: rowId }, true);
    const data = res?.data && res.data.interestedByMe !== undefined ? res.data : res;
    if (!data || data.success === false || data.interestedByMe === undefined) throw new Error(data?.error || '關注狀態更新失敗');
    renderAiMatchInterestButton_(button, data.interestedByMe === true);
    window.showToast?.(data.interestedByMe ? '已送出感興趣；對方只會看到人數' : '已取消感興趣');
  } catch (error) {
    window.showToast?.(error?.message || '關注狀態更新失敗', true);
  } finally {
    button.disabled = false;
  }
};

window.openAiMatchInbox = function(targetCardRowId) {
  const rowId = String(targetCardRowId || '').trim();
  const matches = Array.isArray(window.currentAiPublicMatches) ? window.currentAiPublicMatches : [];
  const match = matches.find(item => String(item?.rowId || '') === rowId);
  const card = match?.card || window.allCards?.find(item => String(item?.rowId || '') === rowId);
  if (!rowId || !card) return window.showToast?.('這份公開配對結果已失效，請重新配對', true);
  if (typeof window.openInboxPublicCardInquiry !== 'function') return window.showToast?.('站內信功能尚未就緒', true);
  window.openInboxPublicCardInquiry({ publicCardRowId: rowId, card, reason: match?.reason || '' });
};

// 啟動 AI 配對
window.startMatchmaking = async function() {
  const queryEl = document.getElementById('match-query');
  let query = queryEl ? queryEl.value.trim() : '';
  const businessIntent = window.pendingBusinessIntent || window.getCurrentBusinessIntent?.() || {};
  if (!query) {
    query = [
      businessIntent.offer ? '我可以提供：' + businessIntent.offer : '',
      businessIntent.seek ? '我正在尋找：' + businessIntent.seek : '',
      businessIntent.collaboration ? '我希望合作：' + businessIntent.collaboration : ''
    ].filter(Boolean).join('；');
    if (queryEl && query) queryEl.value = query;
  }
  if (!query) return window.showToast('請先輸入配對需求，或到「我的名片 → 業務需求」完成設定', true);

  if (!window.allCards || window.allCards.length === 0) {
    if (typeof window.loadCardData === 'function') await window.loadCardData({ render: false });
    else if (typeof window.loadAllData === 'function') await window.loadAllData();
  }

  const role = window.currentUser?.role || 'user';
  const limit = (window.LIMITS[role] || window.LIMITS.user).matchmake;

  const today = new Date().toLocaleDateString('en-CA');
  const usageKey = `matchmake_usage_${today}`;
  let currentUsage = parseInt(localStorage.getItem(usageKey) || '0');

  const btn = document.getElementById('btn-match');
  if (!btn) return window.showToast('配對按鈕尚未載入，請重新進入智能配對頁', true);

  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 正在比對...';
  btn.disabled = true;

  try {
    const poolScope = window.matchmakePoolScope === 'public' ? 'public' : 'own';
    if (poolScope === 'public' && !(window.hasAdminRights || window.userRole === 'admin') && typeof window.ensureCardCanGoPublic === 'function') {
      const canUsePublicPool = await window.ensureCardCanGoPublic(window.currentUserCard);
      if (!canUsePublicPool) {
        window.renderMatchmakeSafetyFeedback(getMatchmakeSafetyFeedback_(window.currentUserCard), window.currentUserCard);
        return;
      }
    }
    const res = await window.fetchAPI('matchmakeContacts', {
      currentUser: window.currentUser,
      query: query,
      businessIntent: businessIntent,
      poolScope: poolScope,
      currentCardRowId: window.currentUserCard?.rowId || ''
    }, true);

    const matches = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : null);

    if (matches) {
      const usedAi = res?.aiUsed !== false;
      if (usedAi) localStorage.setItem(usageKey, currentUsage + 1);
      const nextUsage = currentUsage + (usedAi ? 1 : 0);

      const resultsList = document.getElementById('results-list');
      const resultsContainer = document.getElementById('match-results');
      if (!resultsList || !resultsContainer) throw new Error('配對結果區塊尚未載入');
      window.currentAiPublicMatches = poolScope === 'public' ? matches.slice() : [];

      if (matches.length === 0) {
        resultsList.innerHTML = '<div class="text-center py-6 text-slate-500">目前沒有合適的人選</div>';
      } else {
        resultsList.innerHTML = matches.map(match => {
          const c = match.card || window.allCards.find(card => String(card.rowId) === String(match.rowId));
          if (!c) return '';
          if (match.card && !window.allCards.some(card => String(card.rowId) === String(match.rowId))) {
            window.allCards.push(match.card);
          }
          const safeRowId = window.escapeJS(match.rowId);
          const interestButton = poolScope === 'public'
            ? '<button type="button" data-ai-match-interest-card="' + safeRowId + '" onclick="window.toggleAiMatchInterest(this, \'' + safeRowId + '\')" class="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-600 active:scale-95 transition-transform"><span class="material-symbols-outlined text-[18px]">favorite_border</span>感興趣</button>'
            : '';
          const inboxButton = poolScope === 'public'
            ? '<button type="button" onclick="window.openAiMatchInbox(\'' + safeRowId + '\')" class="col-span-2 flex min-h-10 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 text-[13px] font-black text-white active:scale-95 transition-transform"><span class="material-symbols-outlined text-[18px]">mail</span>寫站內信</button>'
            : '';
          return '<div class="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-2">' +
            '<div class="flex justify-between items-center">' +
              '<div class="font-black text-slate-800">' + window.escapeJS(c['姓名'] || '未知') + ' <span class="text-[12px] font-medium text-slate-500 ml-1">' + window.escapeJS(c['公司名稱'] || '') + '</span></div>' +
              '<div class="bg-[#06C755] text-white px-2 py-0.5 rounded text-[11px] font-bold">契合度 ' + match.score + '%</div>' +
            '</div>' +
            '<div class="text-[13px] text-slate-600">' + window.escapeJS(match.reason) + '</div>' +
            '<div class="mt-2 grid ' + (poolScope === 'public' ? 'grid-cols-2' : 'grid-cols-1') + ' gap-2"><button type="button" onclick="window.openCardDetailById(\'' + safeRowId + '\')" class="min-h-10 rounded-lg border border-blue-100 bg-white px-3 text-[13px] font-bold text-blue-600 active:scale-95 transition-transform">查看名片</button>' + interestButton + inboxButton + '</div>' +
          '</div>';
        }).join('');
        if (poolScope === 'public') window.loadAiMatchInterestStates(matches.map(match => match.rowId));
      }

      const remaining = Math.max(0, limit - nextUsage);
      const limitNotice = limit === Infinity ? '無限制' : `剩餘 ${remaining} 次`;
      const resultNotice = res?.quotaDeferred
        ? 'AI 額度已滿，先顯示既有與規則配對結果'
        : usedAi ? `今日配對額度: ${limitNotice}` : '已沿用完成的配對結果，本次未啟動 AI';

      if (!document.getElementById('match-limit-notice')) {
        resultsContainer.insertAdjacentHTML('afterbegin', `<div id="match-limit-notice" class="text-[11px] text-slate-400 font-bold mb-2 text-right px-1">${resultNotice}</div>`);
      } else {
        document.getElementById('match-limit-notice').textContent = resultNotice;
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
          '財富': newTags.Wealth || '待分析',
          '健康': newTags.Health || '待分析',
          '事業': newTags.Career || '待分析'
        };
        await window.fetchAPI('updateCard', { rowId: c.rowId, data: updateData }, true);
        c['個性'] = updateData['個性'];
        c['興趣'] = updateData['興趣'];
        c['財富'] = updateData['財富'];
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
