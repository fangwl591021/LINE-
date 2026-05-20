/* ==================== 系統參數與設定模組 ==================== */

/**
 * 儲存後台 Banner 與 系統名稱設定
 */
window.saveStoreBanner = async function(e) {
  if (e) e.preventDefault();
  
  const btn = document.getElementById('btn-save-store-banner');
  const oriHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';

  // 封裝設定資料
  const settings = {
    siteName: document.getElementById('input-site-name').value.trim(),
    bannerUrl: document.getElementById('input-store-banner').value.trim(),
    showBanner: document.getElementById('toggle-show-banner').checked,
    youtubeUrl: document.getElementById('input-store-youtube').value.trim(),
    showYoutube: document.getElementById('toggle-show-youtube').checked
  };

  try {
    // 呼叫 Worker 並轉發至 GAS 的 saveStoreSettings
    const res = await window.fetchAPI('saveStoreSettings', {
      ...settings,
      networkId: window.currentNetworkId || 'admin'
    });
    
    if (res && res.success !== false) {
      window.showToast('✅ 系統設定已同步至雲端');
      
      const savedSettings = window.normalizeStoreSettings(res) || settings;
      const mergedSettings = {
        ...settings,
        ...savedSettings,
        networkId: window.currentNetworkId || 'admin'
      };
      if (typeof window.clearCachedStoreSettings === 'function') {
        window.clearCachedStoreSettings(mergedSettings.networkId);
      }
      window.writeCachedStoreSettings(mergedSettings, mergedSettings.networkId);
      window.applyStoreSettingsToHome(mergedSettings);
      if (typeof window.refreshStoreSettingsInBackground === 'function') {
        window.refreshStoreSettingsInBackground();
      }
      
      // 重新觸發首頁資料載入以確保 Banner 同步
      if (typeof window.loadUserActivities === 'function') {
        window.loadUserActivities();
      }
    } else {
      throw new Error(res.error || '儲存失敗');
    }
  } catch (err) {
    window.showToast('儲存失敗：' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = oriHtml;
  }
};

/**
 * 進入設定頁面時，從雲端讀取目前的設定值
 */
window.loadStoreBannerSettings = async function() {
  try {
    const res = await window.fetchAPI('getStoreSettings', { networkId: window.currentNetworkId });
    const d = window.normalizeStoreSettings(res);
    if (d) {
      window.writeCachedStoreSettings(d, window.currentNetworkId);
      document.getElementById('input-site-name').value = d.siteName || '';
      document.getElementById('input-store-banner').value = d.bannerUrl || '';
      document.getElementById('setting-preview-banner').src = d.bannerUrl || 'assets/entry-banner.png';
      // 注意：從 Sheets 讀回來的布林值可能是字串 "true"
      document.getElementById('toggle-show-banner').checked = window.isStoreToggleOn(d.showBanner, true);
      document.getElementById('input-store-youtube').value = d.youtubeUrl || '';
      document.getElementById('toggle-show-youtube').checked = window.isStoreToggleOn(d.showYoutube, true);
      window.applyStoreSettingsToHome(d);
    }
  } catch (e) {
    console.warn("無法加載系統設定值", e);
  }
};

window.loadDealerPerformance = async function(force) {
  const panel = document.getElementById('details-dealer-performance');
  if (!panel || panel.classList.contains('hidden')) return;
  const userId = window.currentUserProfile?.userId || window.currentUser?.userId || '';
  if (!userId) return window.showToast('請先登入後再查看分享成效', true);

  const bonusList = document.getElementById('dealer-bonus-list');
  const orgBox = document.getElementById('dealer-org-tree');
  if (bonusList) bonusList.innerHTML = '<div class="p-4 text-slate-400">讀取獎金流水...</div>';
  if (orgBox) orgBox.innerHTML = '<div class="text-slate-400">讀取組織圖...</div>';

  try {
    const [bonusRes, treeRes] = await Promise.all([
      window.fetchAPI('mlmListBonusTransactions', {
        memberId: userId,
        beneficiaryId: userId,
        status: 'all',
        page: 1,
        pageSize: 20
      }, true),
      window.fetchAPI('mlmGetOrganizationTree', {
        memberId: userId,
        treeType: 'placement',
        depth: 3
      }, true)
    ]);

    const bonuses = Array.isArray(bonusRes)
      ? bonusRes
      : (Array.isArray(bonusRes?.transactions) ? bonusRes.transactions : (Array.isArray(bonusRes?.data) ? bonusRes.data : []));
    const tree = treeRes?.tree || treeRes?.data?.root || treeRes?.data || null;
    renderDealerBonusSummary(bonuses, tree);
    renderDealerBonusList(bonuses);
    renderDealerOrgTree(tree);
  } catch (e) {
    console.warn('[dealer performance] load failed', e);
    if (bonusList) bonusList.innerHTML = '<div class="p-4 text-red-500">分享成效讀取失敗，請稍後再試。</div>';
    if (orgBox) orgBox.innerHTML = '<div class="text-red-500">組織圖讀取失敗。</div>';
  }
};

function dealerCurrency(value) {
  if (typeof window.formatCurrency === 'function') return window.formatCurrency(Number(value || 0));
  return 'NT$ ' + Number(value || 0).toLocaleString('zh-TW');
}

function dealerStatusText(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'paid') return '已付款';
  if (value === 'payable') return '待付款';
  if (value === 'frozen') return '凍結中';
  if (value === 'reversed') return '已退回';
  if (value === 'cancelled') return '已取消';
  return status || '-';
}

function flattenDealerTree(node, list) {
  if (!node) return list;
  (node.children || []).forEach(child => {
    list.push(child);
    flattenDealerTree(child, list);
  });
  return list;
}

function renderDealerBonusSummary(bonuses, tree) {
  const total = bonuses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const pending = bonuses
    .filter(item => ['frozen', 'payable'].includes(String(item.status || '').toLowerCase()))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paid = bonuses
    .filter(item => String(item.status || '').toLowerCase() === 'paid')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const orgCount = flattenDealerTree(tree, []).length;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setText('dealer-bonus-total', dealerCurrency(total));
  setText('dealer-bonus-pending', dealerCurrency(pending));
  setText('dealer-bonus-paid', dealerCurrency(paid));
  setText('dealer-org-count', String(orgCount));
}

function renderDealerBonusList(bonuses) {
  const box = document.getElementById('dealer-bonus-list');
  if (!box) return;
  if (!bonuses.length) {
    box.innerHTML = '<div class="p-4 text-slate-400">目前還沒有獎金流水。</div>';
    return;
  }
  box.innerHTML = bonuses.slice(0, 10).map(item => {
    const status = dealerStatusText(item.status);
    const note = item.note || item.bonusType || item.orderId || '推薦獎金';
    const date = item.createdAt || item.updatedAt || '';
    return '<div class="p-4 flex items-center justify-between gap-3">' +
      '<div class="min-w-0">' +
        '<div class="text-slate-800 font-bold truncate">' + window.escapeHTML(note) + '</div>' +
        '<div class="text-[12px] text-slate-400 mt-0.5">' + window.escapeHTML(date ? window.formatDisplayTime(date) : '-') + ' · ' + window.escapeHTML(status) + '</div>' +
      '</div>' +
      '<div class="text-slate-900 font-black whitespace-nowrap">' + dealerCurrency(item.amount || 0) + '</div>' +
    '</div>';
  }).join('');
}

function renderDealerOrgTree(tree) {
  const box = document.getElementById('dealer-org-tree');
  if (!box) return;
  if (!tree || !tree.memberId) {
    box.innerHTML = '<div class="text-slate-400">目前還沒有組織資料。</div>';
    return;
  }

  const renderNode = (node, level) => {
    const children = Array.isArray(node.children) ? node.children : [];
    const indent = Math.min(level * 14, 42);
    const side = node.placementSide ? ' · ' + node.placementSide : '';
    return '<div class="py-2 border-b border-slate-100 last:border-b-0" style="padding-left:' + indent + 'px">' +
      '<div class="flex items-center justify-between gap-3">' +
        '<div class="min-w-0">' +
          '<div class="font-bold text-slate-800 truncate">' + window.escapeHTML(node.name || node.memberId || '-') + '</div>' +
          '<div class="text-[12px] text-slate-400 font-mono truncate">' + window.escapeHTML((node.memberId || '') + side) + '</div>' +
        '</div>' +
        '<span class="shrink-0 text-[12px] px-2 py-1 rounded-full bg-slate-100 text-slate-600">' + children.length + ' 人</span>' +
      '</div>' +
    '</div>' + children.map(child => renderNode(child, level + 1)).join('');
  };

  box.innerHTML = renderNode(tree, 0);
};

/* ==================== 個人 AI 助理核心 ==================== */

window.personalAssistantCoreDraft = null;

function assistantCoreText(value, fallback = '') {
  const next = String(value ?? '').trim();
  return next || fallback;
}

function assistantCoreJsonSource(rawText) {
  let source = String(rawText || '').trim();
  const fenceMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) source = fenceMatch[1].trim();
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) source = source.slice(firstBrace, lastBrace + 1);
  return source;
}

function parsePersonalAssistantCoreText(rawText) {
  const jsonText = assistantCoreJsonSource(rawText);
  if (!jsonText) throw new Error('請上傳或貼上標準 JSON 結果');
  const core = JSON.parse(jsonText);
  if (!core || typeof core !== 'object' || Array.isArray(core)) throw new Error('JSON 格式不正確');
  if (core.schemaVersion !== 'personal_ai_assistant_core_v1') {
    throw new Error('schemaVersion 必須是 personal_ai_assistant_core_v1');
  }
  return core;
}

function summarizePersonalAssistantCore(core) {
  core = core || {};
  const owner = core.ownerProfile || {};
  const biz = core.businessIdentity || {};
  const crm = core.crmRules || {};
  const daily = core.dailyAssistantRules || {};
  const offers = Array.isArray(core.productsAndOffers) ? core.productsAndOffers : [];
  const tags = Array.isArray(crm.defaultTags) ? crm.defaultTags.filter(Boolean) : [];
  return {
    displayName: assistantCoreText(owner.displayName, '未命名'),
    companyName: assistantCoreText(owner.companyName),
    title: assistantCoreText(owner.title),
    positioning: assistantCoreText(biz.oneLinePositioning),
    serviceSummary: assistantCoreText(biz.serviceSummary),
    productCount: offers.length,
    tagCount: tags.length,
    tags: tags.slice(0, 8),
    suggestionCount: Array.isArray(daily.cardScanSuggestions) ? daily.cardScanSuggestions.length : 0,
    isComplete: !!(core.uploadReview && core.uploadReview.isComplete)
  };
}

function renderPersonalAssistantCoreStatus(data, options = {}) {
  const box = document.getElementById('assistant-core-status');
  if (!box) return;
  if (!data || !data.exists && !data.core) {
    box.innerHTML = '尚未建立 AI 助理核心。請先下載訪談規格，完成外部 AI 訪談後再上傳 JSON。';
    return;
  }

  const core = data.core || data;
  const summary = data.summary || summarizePersonalAssistantCore(core);
  const updatedAt = data.updatedAt || '';
  const badgeClass = options.isDraft
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-emerald-100 text-emerald-700 border-emerald-200';
  const badgeText = options.isDraft ? '待儲存' : '已儲存';
  const tags = Array.isArray(summary.tags) && summary.tags.length
    ? summary.tags.map(tag => '<span class="px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-600">' + window.escapeHTML(tag) + '</span>').join('')
    : '<span class="text-slate-400">尚未提供標籤</span>';

  box.innerHTML =
    '<div class="flex items-start justify-between gap-3">' +
      '<div class="min-w-0">' +
        '<div class="font-black text-slate-900 text-[15px] truncate">' + window.escapeHTML(summary.displayName || '未命名') + '</div>' +
        '<div class="text-slate-500 mt-1 truncate">' + window.escapeHTML([summary.companyName, summary.title].filter(Boolean).join(' / ') || '尚未提供公司與角色') + '</div>' +
      '</div>' +
      '<span class="shrink-0 px-2.5 py-1 rounded-full border text-[12px] font-black ' + badgeClass + '">' + badgeText + '</span>' +
    '</div>' +
    '<div class="mt-3 rounded-xl bg-white border border-slate-100 p-3">' +
      '<div class="text-[12px] text-slate-400 font-bold">定位</div>' +
      '<div class="mt-1 text-slate-700 leading-relaxed">' + window.escapeHTML(summary.positioning || summary.serviceSummary || '尚未提供定位內容') + '</div>' +
    '</div>' +
    '<div class="mt-3 flex flex-wrap gap-2 text-[12px]">' + tags + '</div>' +
    '<div class="mt-3 grid grid-cols-3 gap-2 text-center text-[12px]">' +
      '<div class="rounded-xl bg-white border border-slate-100 p-2"><b class="block text-slate-900 text-[15px]">' + Number(summary.productCount || 0) + '</b>產品</div>' +
      '<div class="rounded-xl bg-white border border-slate-100 p-2"><b class="block text-slate-900 text-[15px]">' + Number(summary.tagCount || 0) + '</b>標籤</div>' +
      '<div class="rounded-xl bg-white border border-slate-100 p-2"><b class="block text-slate-900 text-[15px]">' + Number(summary.suggestionCount || 0) + '</b>建議</div>' +
    '</div>' +
    (updatedAt ? '<div class="mt-3 text-[12px] text-slate-400">最後更新：' + window.escapeHTML(window.formatDisplayTime ? window.formatDisplayTime(updatedAt) : updatedAt) + '</div>' : '');
}

window.handlePersonalAssistantCoreFile = async function(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  if (file.size > 300 * 1024) {
    input.value = '';
    return window.showToast('檔案太大，請只上傳標準 JSON 結果', true);
  }

  try {
    const raw = await file.text();
    const core = parsePersonalAssistantCoreText(raw);
    window.personalAssistantCoreDraft = core;
    const textArea = document.getElementById('assistant-core-json-text');
    if (textArea) textArea.value = JSON.stringify(core, null, 2);
    renderPersonalAssistantCoreStatus({ core, summary: summarizePersonalAssistantCore(core) }, { isDraft: true });
    window.showToast('AI 核心 JSON 已讀取，確認後請按儲存');
  } catch (e) {
    window.personalAssistantCoreDraft = null;
    window.showToast(e.message || 'JSON 讀取失敗', true);
  } finally {
    input.value = '';
  }
};

window.loadPersonalAssistantCore = async function() {
  const userId = window.currentUserProfile?.userId || window.currentUser?.userId || '';
  if (!userId) {
    renderPersonalAssistantCoreStatus(null);
    return;
  }
  try {
    const res = await window.fetchAPI('getPersonalAssistantCore', {}, true);
    if (res && res.success === false) throw new Error(res.error || '讀取失敗');
    const data = res && res.data ? res.data : res;
    renderPersonalAssistantCoreStatus(data);
  } catch (e) {
    const box = document.getElementById('assistant-core-status');
    if (box) box.innerHTML = '<span class="text-red-500">AI 核心資料讀取失敗：' + window.escapeHTML(e.message || e) + '</span>';
  }
};

window.savePersonalAssistantCore = async function(event) {
  const btn = event?.currentTarget || document.getElementById('btn-save-assistant-core');
  const raw = document.getElementById('assistant-core-json-text')?.value || '';
  let core = window.personalAssistantCoreDraft;

  try {
    if (raw.trim()) core = parsePersonalAssistantCoreText(raw);
    if (!core) throw new Error('請先上傳或貼上標準 JSON 結果');
  } catch (e) {
    return window.showToast(e.message || 'JSON 格式不正確', true);
  }

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  }

  try {
    const res = await window.fetchAPI('savePersonalAssistantCore', { core }, true);
    if (res && res.success === false) throw new Error(res.error || '儲存失敗');
    const data = res && res.data ? res.data : res;
    window.personalAssistantCoreDraft = null;
    renderPersonalAssistantCoreStatus(data);
    window.showToast('AI 助理核心已儲存');
  } catch (e) {
    window.showToast(e.message || 'AI 核心資料儲存失敗', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml || '<span class="material-symbols-outlined text-[18px]">save</span> 儲存 AI 核心資料';
    }
  }
};
