/* ==================== 首頁資訊流模組 ==================== */

/**
 * 載入首頁內容 (含系統設定同步與活動列表)
 */
window.loadUserActivities = async function() {
  // 1. 同步讀取系統 Banner 與 名稱
  try {
    const settingsRes = await window.fetchAPI('getStoreSettings', { networkId: window.currentNetworkId });
    if (settingsRes && settingsRes.data) {
      const d = settingsRes.data;
      
      // 更新頂部標題
      if (d.siteName) {
        document.getElementById('header-site-name').innerText = d.siteName;
      }

      // 更新 Banner 大圖顯示邏輯
      const bannerImg = document.getElementById('home-main-banner');
      if (String(d.showBanner) === 'false') {
        bannerImg.parentElement.classList.add('hidden');
      } else {
        bannerImg.parentElement.classList.remove('hidden');
        if (d.bannerUrl) bannerImg.src = d.bannerUrl;
      }

      // 更新 YouTube 影片顯示邏輯
      const ytContainer = document.getElementById('home-youtube-container');
      const ytIframe = document.getElementById('home-youtube-iframe');
      if (String(d.showYoutube) === 'true' && d.youtubeUrl) {
        ytContainer.classList.remove('hidden');
        
        // 解析 YouTube URL 轉為嵌入格式 (Embed)
        let videoId = '';
        if (d.youtubeUrl.includes('v=')) {
          videoId = d.youtubeUrl.split('v=')[1].split('&')[0];
        } else if (d.youtubeUrl.includes('youtu.be/')) {
          videoId = d.youtubeUrl.split('youtu.be/')[1].split('?')[0];
        }
        
        if (videoId) {
          ytIframe.src = `https://www.youtube.com/embed/${videoId}`;
        }
      } else {
        ytContainer.classList.add('hidden');
        ytIframe.src = '';
      }
    }
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
