/* ==================== 系統參數與設定模組 ==================== */

const LOCAL_OPENAI_KEY_STORAGE = 'line_engine_local_openai_api_key';
const RICHMAN_COUPON_DEFAULTS = {
  enabled: true,
  title: '',
  body: '',
  validDays: 30,
  redeemLimit: 'once'
};

function normalizeRichmanCouponSettings(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const validDays = Math.max(1, Math.min(365, Number(raw.validDays || raw.valid_days || 30) || 30));
  const redeemLimit = String(raw.redeemLimit || raw.redeem_limit || 'once') === 'manual' ? 'manual' : 'once';
  return {
    enabled: raw.enabled === undefined ? true : !!raw.enabled,
    title: String(raw.title || '').trim().slice(0, 80),
    body: String(raw.body || raw.description || '').trim().slice(0, 1000),
    validDays,
    redeemLimit,
    updatedAt: raw.updatedAt || raw.updated_at || ''
  };
}

function setRichmanCouponStatus(message, isError) {
  const status = document.getElementById('richman-coupon-status');
  if (!status) return;
  status.textContent = message;
  status.className = 'rounded-2xl border p-4 text-[13px] font-bold leading-relaxed ' + (isError
    ? 'bg-red-50 border-red-100 text-red-600'
    : 'bg-slate-50 border-slate-100 text-slate-500');
}

window.loadLocalGptKeySettings = function() {
  const input = document.getElementById('local-gpt-api-key');
  const status = document.getElementById('local-gpt-api-key-status');
  let key = '';
  try { key = localStorage.getItem(LOCAL_OPENAI_KEY_STORAGE) || ''; } catch (e) {}
  if (input) input.value = key;
  if (status) {
    status.textContent = key
      ? '已在本機保存 GPT API Key。AI 功能會優先使用這把 key，不會寫入資料庫。'
      : '尚未設定。本機 key 只存在這台裝置，AI 請求時才會送到 Worker 使用。';
    status.className = 'text-[12px] leading-relaxed ' + (key ? 'text-emerald-700' : 'text-slate-500');
  }
};

window.saveLocalGptApiKey = function(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('local-gpt-api-key');
  const key = input ? String(input.value || '').trim() : '';
  if (!/^sk-[A-Za-z0-9_\-]+/.test(key)) {
    return window.showToast('請輸入正確的 OpenAI API Key，通常以 sk- 開頭。', true);
  }
  try {
    localStorage.setItem(LOCAL_OPENAI_KEY_STORAGE, key);
    window.showToast('本機 GPT API Key 已保存');
    window.loadLocalGptKeySettings();
  } catch (err) {
    window.showToast('本機保存失敗：' + (err.message || err), true);
  }
};

window.clearLocalGptApiKey = function(e) {
  if (e) e.preventDefault();
  try { localStorage.removeItem(LOCAL_OPENAI_KEY_STORAGE); } catch (err) {}
  const input = document.getElementById('local-gpt-api-key');
  if (input) input.value = '';
  window.loadLocalGptKeySettings();
  window.showToast('已清除本機 GPT API Key');
};

/**
 * 儲存後台 Banner 與 系統名稱設定
 */
window.saveStoreBanner = async function(e) {
  if (e) e.preventDefault();
  
  const btn = document.getElementById('btn-save-store-banner');
  const oriHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';

  const cachedSettings = (typeof window.readCachedStoreSettings === 'function'
    ? window.readCachedStoreSettings(window.currentNetworkId)
    : null) || {};
  const settings = {
    ...cachedSettings,
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
    const [bonusRes, treeRes, referralStatsRes] = await Promise.all([
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
      }, true),
      window.fetchAPI('mlmGetReferralStats', {
        memberId: userId
      }, true).catch(error => {
        console.warn('[dealer performance] referral stats skipped', error);
        return { data: {} };
      })
    ]);

    const bonuses = Array.isArray(bonusRes)
      ? bonusRes
      : (Array.isArray(bonusRes?.transactions) ? bonusRes.transactions : (Array.isArray(bonusRes?.data) ? bonusRes.data : []));
    const tree = treeRes?.tree || treeRes?.data?.root || treeRes?.data || null;
    const referralStats = referralStatsRes?.data || referralStatsRes || {};
    renderDealerBonusSummary(bonuses, tree, referralStats);
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

function renderDealerBonusSummary(bonuses, tree, referralStats = {}) {
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
  setText('dealer-scan-count', String(Number(referralStats.scanCount || referralStats.scannedCount || 0)));
  setText('dealer-bound-count', String(Number(referralStats.boundCount || referralStats.bindingCount || 0)));
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

/* ==================== LINE VOOM media extractor ==================== */

function voomSettingsText(value) {
  return String(value || '').trim();
}

function voomSettingsEscape(value) {
  return window.escapeHTML ? window.escapeHTML(value) : String(value || '').replace(/[&<>"']/g, function(ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
  });
}

function voomSettingsResultRow(label, value, copyName) {
  if (!value) return '';
  return '<div class="rounded-xl bg-white border border-slate-100 p-3">' +
    '<div class="text-[11px] font-black text-slate-400 mb-1">' + voomSettingsEscape(label) + '</div>' +
    '<div class="flex items-center gap-2">' +
      '<input readonly value="' + voomSettingsEscape(value) + '" class="flex-1 min-w-0 bg-slate-50 rounded-lg px-3 py-2 text-[12px] font-mono text-slate-600 outline-none">' +
      '<button type="button" onclick="window.copyVoomMediaValue(\'' + copyName + '\')" class="shrink-0 rounded-lg bg-slate-900 text-white px-3 py-2 text-[12px] font-black">複製</button>' +
    '</div>' +
  '</div>';
}

window.voomCaptureLastResult = null;

window.copyVoomMediaValue = async function(key) {
  const result = window.voomCaptureLastResult || {};
  const value = voomSettingsText(result[key]);
  if (!value) return window.showToast && window.showToast('沒有可複製的內容', true);
  try {
    await navigator.clipboard.writeText(value);
    if (window.showToast) window.showToast('已複製');
  } catch (e) {
    const input = document.createElement('input');
    input.value = value;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    if (window.showToast) window.showToast('已複製');
  }
};

window.applyVoomMediaToStoreBanner = function() {
  const result = window.voomCaptureLastResult || {};
  const videoUrl = voomSettingsText(result.videoUrl);
  const thumbnailUrl = voomSettingsText(result.thumbnailUrl || result.imageUrl);
  const videoInput = document.getElementById('input-store-youtube');
  const bannerInput = document.getElementById('input-store-banner');
  const preview = document.getElementById('setting-preview-banner');
  const showVideo = document.getElementById('toggle-show-youtube');
  const showBanner = document.getElementById('toggle-show-banner');
  if (videoInput && videoUrl) videoInput.value = videoUrl;
  if (bannerInput && thumbnailUrl) bannerInput.value = thumbnailUrl;
  if (preview && thumbnailUrl) preview.src = thumbnailUrl;
  if (showVideo && videoUrl) showVideo.checked = true;
  if (showBanner && thumbnailUrl) showBanner.checked = true;
  if (window.showToast) window.showToast('已套用到 Banner 與影片欄位，請記得儲存');
};

window.applyVoomMediaToMyVideoCard = function() {
  const result = window.voomCaptureLastResult || {};
  const videoUrl = voomSettingsText(result.videoUrl);
  const thumbnailUrl = voomSettingsText(result.thumbnailUrl || result.imageUrl);
  if (!videoUrl) return window.showToast && window.showToast('沒有可套用的影片網址', true);
  if (typeof window.applyMyVideoCardMedia !== 'function') {
    return window.showToast && window.showToast('影音名片區尚未載入，請先打開我的專屬名片', true);
  }
  window.applyMyVideoCardMedia(videoUrl, thumbnailUrl);
};

window.extractVoomMediaForSettings = async function(event) {
  const btn = event && event.currentTarget;
  const input = document.getElementById('input-voom-url');
  const box = document.getElementById('voom-capture-result');
  const url = voomSettingsText(input && input.value);
  if (!url) return window.showToast && window.showToast('請先貼上 LINE VOOM 網址', true);
  if (!/^https:\/\/(linevoom\.line\.me|line\.me)\//i.test(url)) {
    return window.showToast && window.showToast('請貼上 LINE VOOM 或 LINE 文章網址', true);
  }

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px] align-middle">refresh</span>';
  }
  if (box) {
    box.classList.remove('hidden');
    box.innerHTML = '<div class="text-slate-500 font-bold">解析中...</div>';
  }

  try {
    const res = await window.fetchAPI('extractLineVoomMedia', { url: url }, true);
    if (res && res.success === false) throw new Error(res.error || '解析失敗');
    const data = res && res.data ? res.data : res;
    const video = data && data.video ? data.video : null;
    const images = Array.isArray(data && data.images) ? data.images : [];
    const videoUrl = voomSettingsText(video && (video.videoUrl || video.url));
    const thumbnailUrl = voomSettingsText((video && video.thumbnailUrl) || (images[0] && images[0].url));
    const imageUrl = voomSettingsText(images[0] && images[0].url);
    if (!videoUrl && !thumbnailUrl && !imageUrl) throw new Error('沒有解析到影片或縮圖網址');

    window.voomCaptureLastResult = { videoUrl, thumbnailUrl, imageUrl };
    if (box) {
      box.innerHTML =
        '<div class="space-y-3">' +
          '<div class="flex items-center justify-between gap-3">' +
            '<div class="font-black text-slate-800">解析完成</div>' +
            '<span class="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-[11px] font-black">' + voomSettingsEscape(data.type || 'MEDIA') + '</span>' +
          '</div>' +
          voomSettingsResultRow('影片網址', videoUrl, 'videoUrl') +
          voomSettingsResultRow('縮圖網址', thumbnailUrl, 'thumbnailUrl') +
          (!thumbnailUrl && imageUrl ? voomSettingsResultRow('圖片網址', imageUrl, 'imageUrl') : '') +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' +
            '<button type="button" onclick="window.applyVoomMediaToMyVideoCard()" class="w-full rounded-xl bg-blue-600 text-white py-3 font-black active:scale-95 transition-transform">套用到影音名片區</button>' +
            '<button type="button" onclick="window.applyVoomMediaToStoreBanner()" class="w-full rounded-xl bg-slate-900 text-white py-3 font-black active:scale-95 transition-transform">套用到 Banner 與影片欄位</button>' +
          '</div>' +
        '</div>';
    }
  } catch (e) {
    if (box) box.innerHTML = '<div class="text-red-500 font-bold">解析失敗：' + voomSettingsEscape(e.message || e) + '</div>';
    if (window.showToast) window.showToast('VOOM 解析失敗：' + (e.message || e), true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml || '解析';
    }
  }
};

window.loadRichmanCouponSettings = async function() {
  const titleEl = document.getElementById('richman-coupon-title');
  const bodyEl = document.getElementById('richman-coupon-body');
  const validDaysEl = document.getElementById('richman-coupon-valid-days');
  const redeemLimitEl = document.getElementById('richman-coupon-redeem-limit');
  const enabledEl = document.getElementById('richman-coupon-enabled');
  if (!titleEl || !bodyEl || !validDaysEl || !redeemLimitEl || !enabledEl) return;

  setRichmanCouponStatus('讀取優惠券設定中...', false);
  let d = null;
  try {
    const res = await window.fetchAPI('getStoreSettings', { networkId: window.currentNetworkId });
    d = window.normalizeStoreSettings ? window.normalizeStoreSettings(res) : (res && res.data ? res.data : res);
    if (d && typeof window.writeCachedStoreSettings === 'function') window.writeCachedStoreSettings(d, window.currentNetworkId);
  } catch (e) {
    d = typeof window.readCachedStoreSettings === 'function' ? window.readCachedStoreSettings(window.currentNetworkId) : null;
  }

  const coupon = normalizeRichmanCouponSettings((d && d.couponSettings) || RICHMAN_COUPON_DEFAULTS);
  titleEl.value = coupon.title;
  bodyEl.value = coupon.body;
  validDaysEl.value = coupon.validDays;
  redeemLimitEl.value = coupon.redeemLimit;
  enabledEl.checked = !!coupon.enabled;
  setRichmanCouponStatus(coupon.title ? '已載入優惠券設定。' : '尚未設定優惠券內容。', false);
};

window.saveRichmanCouponSettings = async function(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-richman-coupon');
  const title = document.getElementById('richman-coupon-title')?.value?.trim() || '';
  const body = document.getElementById('richman-coupon-body')?.value?.trim() || '';
  const validDays = Number(document.getElementById('richman-coupon-valid-days')?.value || 30) || 30;
  const redeemLimit = document.getElementById('richman-coupon-redeem-limit')?.value || 'once';
  const enabled = !!document.getElementById('richman-coupon-enabled')?.checked;

  if (!title) return window.showToast?.('請輸入優惠券名稱', true);
  if (!body) return window.showToast?.('請輸入優惠內容', true);

  const oldHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  }

  try {
    let base = typeof window.readCachedStoreSettings === 'function' ? (window.readCachedStoreSettings(window.currentNetworkId) || {}) : {};
    try {
      const current = await window.fetchAPI('getStoreSettings', { networkId: window.currentNetworkId }, true);
      base = (window.normalizeStoreSettings ? window.normalizeStoreSettings(current) : (current && current.data ? current.data : current)) || base;
    } catch (e2) {}

    const couponSettings = normalizeRichmanCouponSettings({ title, body, validDays, redeemLimit, enabled, updatedAt: new Date().toISOString() });
    const payload = {
      ...base,
      couponSettings,
      networkId: window.currentNetworkId || 'admin'
    };
    const res = await window.fetchAPI('saveStoreSettings', payload);
    if (!res || res.success === false) throw new Error(res?.error || '儲存失敗');
    const saved = window.normalizeStoreSettings ? window.normalizeStoreSettings(res) : (res.data || payload);
    if (typeof window.writeCachedStoreSettings === 'function') window.writeCachedStoreSettings(saved || payload, payload.networkId);
    setRichmanCouponStatus('優惠券設定已儲存，可提供大富翁流程讀取。', false);
    window.showToast?.('優惠券設定已儲存');
  } catch (err) {
    setRichmanCouponStatus('儲存失敗：' + (err.message || err), true);
    window.showToast?.('優惠券設定儲存失敗', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }
};