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
