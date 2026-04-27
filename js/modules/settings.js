// ... existing code ...
  const ytInput = document.getElementById('input-store-youtube');
  if (ytInput) cfg.homeYoutube = ytInput.value.trim();

  const siteNameInput = document.getElementById('input-site-name');
  if (siteNameInput) {
    const newName = siteNameInput.value.trim();
    cfg.siteName = newName || 'LINE商機引擎';
  }

  try {
    await window.fetchAPI('updateCard', {
      rowId: currentUserCard.rowId,
      data: { '自訂名片設定': JSON.stringify(cfg), '名片圖檔': cfg.imgUrl || currentUserCard['名片圖檔'] || '' }
    }, true);
    currentUserCard['自訂名片設定'] = JSON.stringify(cfg);
    
    // 🚀 新增：儲存成功後立即寫入快取，確保下次進入不會跳回預設
    const cacheKey = 'store_banner_' + currentNetworkId;
    localStorage.setItem(cacheKey, JSON.stringify({
      homeBanner: cfg.homeBanner || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1000&q=80',
      homeYoutube: cfg.homeYoutube || '',
      siteName: cfg.siteName || 'LINE商機引擎'
    }));

    window.showToast('✅ 首頁 Banner 與影片已更新！');
    window.updateHomeBanner();
  } catch(e) {
    window.showToast('⚠️ 儲存失敗:' + e.message, true);
  } finally {
    btn.innerHTML = oriHtml;
    btn.disabled = false;
  }
};
// ... existing code ...
