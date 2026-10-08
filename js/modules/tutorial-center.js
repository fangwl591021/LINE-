/* Read-only help: no account/API dependencies and no changes to the current page. */
(function () {
  'use strict';
  const mediaBase = 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-05/';
  const courses = [
    { id: 'registration', icon: 'person_add', title: '會員註冊', description: '接收與使用購物金', duration: '1:24', file: 'registration-v2.mp4', chapters: [[0, '從頭觀看']], note: '中文旁白＋繁體字幕。購物金依實際入帳與店家規則為準。' },
    { id: 'mycard', icon: 'badge', title: '建立與分享名片', description: '三種版型，打造專屬名片', duration: '3:12', file: 'business-card-v2.mp4', chapters: [[0, '建立名片'], [131.01, '分享給好友／群組']], note: '中文旁白＋繁體字幕。分享介面可能因 LINE 版本略有不同。' },
    { id: 'collection', icon: 'wallet', title: '收藏名片', description: '正面必填・背面選填・兩面辨識', duration: '6:26', file: 'card-collection-v2.mp4', chapters: [[25.016, '上傳正反面'], [52.905, '兩面一起辨識'], [104.6, '搜尋與篩選'], [125.389, '聯絡資料'], [156.096, '補上背面'], [177.487, '核對與儲存'], [218.278, '編輯名片'], [231.968, '標籤與星座'], [278.437, '名片版型'], [299.943, '分享名片'], [325.266, '本人認領'], [354.669, '配對排名']], note: '中文旁白＋操作重點。原段落保留字幕，正反面新增段落使用固定步驟文字。' },
    { id: 'merchant', icon: 'storefront', title: '店家登錄與商品上架', description: '首頁商城橫幅 → 店家設定 → 公司資訊與商品上架', duration: '6:41', file: 'merchant-tutorial-v3.mp4', mediaBase: 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-06/', chapters: [[0, '從頭觀看'], [10.938, '首頁點商城橫幅'], [18.410, '商城點店家設定'], [28.345, '公司／店家登錄'], [101.216, '商品上架'], [175.038, '收款與運費設定'], [203.027, '網購折抵預覽'], [249.382, '取消與退點'], [279.240, 'DM 輔助辨識'], [315.820, '檢查與分享'], [355.921, '修改與封存']], note: '中文旁白＋繁體字幕。從首頁商城橫幅進入，再點店家設定。網購折抵是新流程預覽，尚待安全驗收、未正式開放；實際交易依帳號權限與系統開關為準。' }
    ,{ id: 'ai-advance', icon: 'auto_awesome', title: 'AI推進', description: '建立任務・執行回報・AI 下一步・LINE 提醒', duration: '4:18', file: 'ai-advance-tutorial-v1.mp4', mediaBase: 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-06/', chapters: [[24.329, '任務清單'], [47.986, '建立任務'], [100.925, '執行回報'], [124.902, 'AI 下一步'], [193.639, 'LINE 提醒']], note: '中文旁白＋繁體字幕，虛構示範資料。現在請直接點首頁「AI推進」進入功能；影片開頭的舊教學入口位置已調整，後續任務操作相同。AI 建議需由您確認，提醒預設關閉。' }
    ,{ id: 'activity-publish', icon: 'event_available', title: '活動上架', description: '首頁個人行事曆 → 辦活動 → DM核對 → 選擇公開範圍', duration: '3:18', file: 'activity-publish-tutorial-v1.mp4', mediaBase: 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-08/', chapters: [[0, '從頭觀看'], [12.125, '首頁個人行事曆入口'], [22.208, '勾選辦活動'], [34.417, 'DM／PDF 輔助辨識'], [49.292, '核對日期與當年規則'], [81.417, '修改活動草稿與分類'], [100.833, '選擇公開／歸屬可見'], [123, '取消不送出'], [140.875, '上架後修改公開範圍'], [154.833, '首頁活動縮圖'], [169.625, '詳細內容與完整 DM']], note: '台灣中文旁白與操作重點，以真實 UI 模擬活動示範，AI 辨識回應為示範資料。公開指所有登入平台會員可見，未登入不開放；選「否」則僅歸屬會員可見。取消不送出活動。DM 未標示年分採當年；發布前仍須人工核對。' }
  ];
  let dialog = null;
  let opener = null;
  let video = null;
  let fromList = false;
  let listScroll = 0;
  let previousOverflow = '';

  function stopMedia() {
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video = null;
  }

  function cleanup() {
    stopMedia();
    dialog?.remove();
    dialog = null;
    document.body.style.overflow = previousOverflow;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }

  function close() {
    if (!dialog) return;
    // Cleanup synchronously so a quick reopen cannot inherit a stale close event.
    const closing = dialog;
    cleanup();
    if (closing.open) closing.close();
  }

  function ensureDialog() {
    if (dialog) return;
    opener = document.activeElement;
    previousOverflow = document.body.style.overflow;
    dialog = document.createElement('dialog');
    dialog.id = 'tutorial-dialog';
    dialog.className = 'tutorial-dialog';
    dialog.setAttribute('aria-labelledby', 'tutorial-heading');
    dialog.innerHTML = '<div class="tutorial-shell"><header class="tutorial-header"><button type="button" class="tutorial-icon-button" data-tutorial-back aria-label="返回教學清單" hidden>‹</button><h2 id="tutorial-heading"></h2><button type="button" class="tutorial-icon-button" data-tutorial-close aria-label="關閉教學">×</button></header><div class="tutorial-body"></div></div>';
    dialog.querySelector('[data-tutorial-close]').addEventListener('click', close);
    dialog.querySelector('[data-tutorial-back]').addEventListener('click', showList);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    document.body.appendChild(dialog);
    dialog.showModal();
    document.body.style.overflow = 'hidden';
  }

  function frame(title, back) {
    stopMedia();
    ensureDialog();
    dialog.querySelector('#tutorial-heading').textContent = title;
    dialog.querySelector('[data-tutorial-back]').hidden = !back;
    const body = dialog.querySelector('.tutorial-body');
    body.replaceChildren();
    body.scrollTop = 0;
    return body;
  }

  function showList() {
    const body = frame('新手教學', false);
    body.innerHTML = '<p class="tutorial-intro">選擇想了解的功能</p><div class="tutorial-courses"></div><p class="tutorial-note">影片可暫停、重播與全螢幕觀看。關閉教學即可繼續原本的操作。</p>';
    const list = body.querySelector('.tutorial-courses');
    courses.forEach(course => {
      const item = document.createElement(course.file ? 'button' : 'div');
      item.className = 'tutorial-course';
      item.dataset.course = course.id;
      // All course metadata is fixed application text, never user content.
      item.innerHTML = `<span class="tutorial-course-icon material-symbols-outlined" aria-hidden="true">${course.icon}</span><span class="tutorial-course-copy"><strong>${course.title}</strong><span>${course.description}</span>${course.duration ? `<small>${course.duration}</small>` : '<small>即將推出</small>'}</span>${course.file ? '<span class="tutorial-play" aria-hidden="true">▶</span>' : ''}`;
      if (course.file) {
        item.type = 'button';
        item.addEventListener('click', () => {
          listScroll = body.scrollTop;
          fromList = true;
          showPlayer(course);
        });
      }
      list.appendChild(item);
    });
    body.scrollTop = listScroll;
    body.querySelector('button')?.focus({ preventScroll: true });
  }

  function showPlayer(course) {
    const body = frame(course.title + '教學', fromList);
    body.innerHTML = '<div class="tutorial-video-wrap"><video controls playsinline preload="metadata" aria-label="教學影片"></video></div><p class="tutorial-status" role="status" aria-live="polite"></p><button type="button" class="tutorial-retry" hidden>重新載入影片</button><section class="tutorial-chapter-section" aria-label="教學章節"><h3>快速跳至</h3><div class="tutorial-chapters"></div></section><p class="tutorial-note"></p><p class="tutorial-note">操作示範，非正式資料操作實錄。關閉影片即可繼續操作。</p>';
    video = body.querySelector('video');
    const currentVideo = video;
    const status = body.querySelector('.tutorial-status');
    const retry = body.querySelector('.tutorial-retry');
    body.querySelector('.tutorial-note').textContent = course.note;
    let pendingSeek = null;
    currentVideo.addEventListener('error', () => {
      if (video !== currentVideo) return;
      status.textContent = '影片載入失敗，請確認網路後重試。';
      retry.hidden = false;
    });
    function seek() {
      if (pendingSeek === null || video !== currentVideo || currentVideo.readyState < 1) return;
      currentVideo.currentTime = Math.min(pendingSeek, Number.isFinite(currentVideo.duration) ? currentVideo.duration : pendingSeek);
      pendingSeek = null;
    }
    currentVideo.addEventListener('loadedmetadata', seek);
    retry.addEventListener('click', () => {
      status.textContent = '重新載入中，載入後請按播放。';
      retry.hidden = true;
      currentVideo.load();
    });
    currentVideo.addEventListener('loadeddata', () => { if (video === currentVideo) status.textContent = ''; });
    const chapters = body.querySelector('.tutorial-chapters');
    course.chapters.forEach(([time, title]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = title;
      button.dataset.time = String(time);
      button.addEventListener('click', () => {
        pendingSeek = time;
        seek();
        currentVideo.play().catch(() => {
          if (video === currentVideo) status.textContent = '已選取章節，請按影片上的播放鍵。';
        });
      });
      chapters.appendChild(button);
    });
    currentVideo.src = (course.mediaBase || mediaBase) + course.file;
    dialog.querySelector('[data-tutorial-close]').focus({ preventScroll: true });
  }

  window.openTutorialCenter = function (courseId) {
    const course = courses.find(item => item.id === courseId && item.file);
    fromList = false;
    listScroll = 0;
    if (course) showPlayer(course); else showList();
  };
  window.closeTutorialCenter = close;
  document.addEventListener('click', event => {
    const entry = event.target.closest('[data-tutorial-open]');
    if (!entry) return;
    event.preventDefault();
    event.stopPropagation();
    window.openTutorialCenter(entry.dataset.tutorialOpen);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video?.pause(); });
  window.addEventListener('pagehide', close);
})();
