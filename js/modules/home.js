// ... existing code ...
/* ==================== 首頁模組(Banner、活動列表、活動紀錄) ==================== */

// 更新首頁 Banner / YouTube / 系統名稱
window.updateHomeBanner = function() {
  let bannerUrl = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1000&q=80';
  let ytUrl = '';
  let siteName = 'LINE商機引擎';

  // 嘗試從 localStorage 拿快取 (避免首頁延遲跳動)
  const cacheKey = 'store_banner_' + currentNetworkId;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.homeBanner) bannerUrl = parsed.homeBanner;
      if (parsed.homeYoutube) ytUrl = parsed.homeYoutube;
      if (parsed.siteName) siteName = parsed.siteName;
    }
  } catch(e) {}

  // 如果名片庫已載入，則以資料庫為準，並更新快取
  if (allCards && allCards.length > 0) {
    const ownerCard = allCards.find(c => String(c['LINE ID']).trim() === currentNetworkId);
    if (ownerCard && ownerCard['自訂名片設定']) {
      try {
        const cfg = JSON.parse(ownerCard['自訂名片設定']);
        if (cfg.homeBanner) bannerUrl = cfg.homeBanner;
        if (cfg.homeYoutube) ytUrl = cfg.homeYoutube;
        if (cfg.siteName) siteName = cfg.siteName;
        
        // 更新快取
        localStorage.setItem(cacheKey, JSON.stringify({
          homeBanner: bannerUrl,
          homeYoutube: ytUrl,
          siteName: siteName
        }));
      } catch(e){}
    }
  }

  const headerEl = document.getElementById('header-site-name');
  if (headerEl) headerEl.textContent = siteName;
  
  // 同步更新設定頁的 input，避免為空
  const inputEl = document.getElementById('input-site-name');
  if (inputEl && !inputEl.value) inputEl.value = siteName === 'LINE商機引擎' ? '' : siteName;

  const inputYtEl = document.getElementById('input-store-youtube');
  if (inputYtEl && !inputYtEl.value) inputYtEl.value = ytUrl;

  const inputBannerEl = document.getElementById('input-store-banner');
  if (inputBannerEl && !inputBannerEl.value) inputBannerEl.value = bannerUrl === 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1000&q=80' ? '' : bannerUrl;

  const settingPreviewBanner = document.getElementById('setting-preview-banner');
  if (settingPreviewBanner && bannerUrl) settingPreviewBanner.src = bannerUrl;

  const bannerImg = document.getElementById('home-main-banner');
  if (bannerImg) bannerImg.src = bannerUrl;

  const ytContainer = document.getElementById('home-youtube-container');
  const ytIframe = document.getElementById('home-youtube-iframe');
  if (ytContainer && ytIframe) {
    if (ytUrl) {
      const match = ytUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      const videoId = match ? match[1] : null;
      if (videoId) {
        ytIframe.src = 'https://www.youtube.com/embed/' + videoId + '?rel=0&modestbranding=1';
        ytContainer.classList.remove('hidden');
      } else {
        ytContainer.classList.add('hidden');
      }
    } else {
      ytContainer.classList.add('hidden');
      ytIframe.src = '';
    }
  }
};

// 載入首頁公開活動列表
window.loadUserActivities = async function() {
// ... existing code ...
