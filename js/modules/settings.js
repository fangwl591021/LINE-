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
