/* ==================== 首頁資訊流模組 ==================== */

window.normalizeStoreSettings = window.normalizeStoreSettings || function(raw) {
  if (!raw || raw.success === false) return null;
  if (raw.data && typeof raw.data === 'object') return raw.data;
  return raw;
};

window.isStoreToggleOn = window.isStoreToggleOn || function(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() !== 'false';
};

window.getYoutubeEmbedUrl = window.getYoutubeEmbedUrl || function(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  let videoId = '';
  if (raw.includes('v=')) {
    videoId = raw.split('v=')[1].split('&')[0];
  } else if (raw.includes('youtu.be/')) {
    videoId = raw.split('youtu.be/')[1].split('?')[0];
  } else if (raw.includes('/embed/')) {
    videoId = raw.split('/embed/')[1].split('?')[0];
  }

  return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
};

window.applyStoreSettingsToHome = window.applyStoreSettingsToHome || function(settings) {
  const d = window.normalizeStoreSettings(settings);
  if (!d) return;

  const headerName = document.getElementById('header-site-name');
  if (headerName && d.siteName !== undefined) {
    headerName.innerText = d.siteName || 'LINE商機引擎';
  }

  const bannerImg = document.getElementById('home-main-banner');
  if (bannerImg && bannerImg.parentElement) {
    if (!window.isStoreToggleOn(d.showBanner, true)) {
      bannerImg.parentElement.classList.add('hidden');
    } else {
      bannerImg.parentElement.classList.remove('hidden');
      if (d.bannerUrl) bannerImg.src = d.bannerUrl;
    }
  }

  const ytContainer = document.getElementById('home-youtube-container');
  const ytIframe = document.getElementById('home-youtube-iframe');
  if (ytContainer && ytIframe) {
    const embedUrl = window.getYoutubeEmbedUrl(d.youtubeUrl);
    if (window.isStoreToggleOn(d.showYoutube, true) && embedUrl) {
      ytContainer.classList.remove('hidden');
      ytIframe.src = embedUrl;
    } else {
      ytContainer.classList.add('hidden');
      ytIframe.src = '';
    }
  }
};

/**
 * 載入首頁內容 (含系統設定同步與活動列表)
 */
window.loadUserActivities = async function() {
  // 1. 同步讀取系統 Banner 與 名稱
  try {
    const settingsRes = await window.fetchAPI('getStoreSettings', { networkId: window.currentNetworkId });
    window.applyStoreSettingsToHome(settingsRes);
  } catch (e) {
    console.error("系統設定同步失敗", e);
  }

  // 2. 既有的活動列表渲染邏輯
  const list = document.getElementById('user-activities-list');
  if (!list) return;

  // 假設資料已在 loadAllData 中取得
  if (!window.allActivities || window.allActivities.length === 0) {
    list.innerHTML = '<p class="text-center text-slate-400 py-10 text-sm">目前暫無開放中的活動</p>';
    return;
  }

  // 僅顯示狀態為「上架」的活動
  const activeActs = window.allActivities.filter(a => a['狀態'] === '上架');
  
  list.innerHTML = activeActs.map(a => `
    <div class="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100 mb-4" onclick="window.openActivityDetail('${a['活動ID']}')">
      ${a['宣傳圖'] ? `<img src="${a['宣傳圖']}" class="w-full aspect-video object-cover">` : ''}
      <div class="p-5">
        <div class="flex justify-between items-start mb-2">
          <span class="bg-primary-light text-primary text-[10px] px-2 py-0.5 rounded-full font-bold">${a['活動類型'] || '活動'}</span>
          <span class="text-slate-400 text-[11px] font-mono">${window.formatDisplayTime(a['開始時間'])}</span>
        </div>
        <h4 class="font-black text-slate-800 text-[17px] mb-1">${a['活動名稱']}</h4>
        <p class="text-slate-500 text-[13px] line-clamp-2 leading-relaxed">${a['活動說明'] || ''}</p>
      </div>
    </div>
  `).join('');
};
