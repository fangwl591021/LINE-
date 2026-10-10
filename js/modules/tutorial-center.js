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
    ,{ id: 'activity-settings', icon: 'groups', title: '活動設定', description: '首頁近期活動 → 活動 → 完整發佈 → 選擇公開範圍', duration: '4:48', file: 'activity-settings-tutorial-v1.mp4', mediaBase: 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-09/', chapters: [[0, '從頭觀看'], [14.875, '首頁活動入口'], [28.375, '完整發佈'], [44.875, '封面與圖片版型'], [64.208, '名稱與活動時間'], [82.917, '感應簽到時段'], [101.708, '活動類型與身份'], [118.5, '免費或收費'], [136.792, '地點與活動說明'], [155.375, '確認建立並發佈'], [166.167, '公開／僅歸屬可見'], [186.917, '取消返回、不送出'], [201.125, '首頁縮圖'], [219.625, '詳細與完整封面'], [235.375, '編輯原活動'], [251.917, '修改後再選公開範圍']], note: '第一種設定教學。中文旁白＋步驟標示，以真實前端搭配虛構資料示範，沒有建立正式活動或報名。從首頁「近期活動 → 活動」進入，範例保留例會類型；與行事曆 DM 上架教學不同。公開指所有登入且已註冊的平台會員，未登入不開放；選「否」僅歸屬會員可見。取消不送出；填費用不代表已收款，也不會自動扣點。範例日期請改成實際活動日期。' }
    ,{ id: 'course-settings', icon: 'co_present', title: '課程設定', description: '首頁近期活動 → 課程 → 單堂課設定 → 公開與修改', duration: '4:10', file: 'course-settings-tutorial-v1.mp4', mediaBase: 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-09/', chapters: [[0, '從頭觀看'], [13.917, '首頁課程入口'], [26.083, '完整發佈單堂課'], [37.917, '上傳課程封面'], [54.75, '名稱與上課時間'], [71.042, '感應簽到時段'], [85.25, '確認課程類型'], [98.417, '免費或課程費用'], [112.125, '講師、地點與準備事項'], [129.167, '確認建立並發佈'], [139.792, '公開／僅歸屬可見'], [156.333, '取消返回、不送出'], [168.958, '選是完成發布'], [181.208, '首頁課程縮圖'], [195.625, '詳細與完整封面'], [208.917, '編輯原課程'], [221.417, '修改後再選公開範圍']], note: '第二種設定教學。中文旁白＋步驟標示，以真實前端搭配虛構資料示範，沒有建立正式課程或報名。從首頁「近期活動 → 課程」進入並保留課程類型，示範單堂課的完整發佈。公開指所有登入且已註冊的平台會員，未登入不開放；選「否」僅歸屬會員可見。取消不送出；填費用不代表已收款，也不會自動扣點。範例日期請改成實際上課日期。' }
    ,{ id: 'social-settings', icon: 'celebration', title: '聯誼設定', description: '首頁近期活動 → 聯誼 → 對象、流程與公開範圍', duration: '4:13', file: 'social-settings-tutorial-v1.mp4', mediaBase: 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-09/', chapters: [[0, '從頭觀看'], [14.208, '首頁聯誼入口'], [25.958, '完整發佈單場聯誼'], [37.917, '上傳聯誼封面'], [54.708, '名稱與聯誼時間'], [71.125, '感應簽到時段'], [85.583, '確認聯誼類型'], [99.25, '免費或聯誼費用'], [113.208, '對象、地點與交流流程'], [132.375, '確認建立並發佈'], [143, '公開／僅歸屬可見'], [159.542, '取消返回、不送出'], [172.125, '選是完成發布'], [184.292, '首頁聯誼縮圖'], [198.667, '詳細與完整封面'], [211.958, '編輯原活動'], [224.375, '修改後再選公開範圍']], note: '第三種設定教學。中文旁白＋步驟標示，以真實前端搭配虛構資料示範，沒有建立正式聯誼或報名。從首頁「近期活動 → 聯誼」進入並保留聯誼類型，設定對象、地點、交流流程與注意事項。公開指所有登入且已註冊的平台會員，未登入不開放；選「否」僅歸屬會員可見。取消不送出；填費用不代表已收款，也不會自動扣點。範例日期請改成實際活動日期。' }
    ,{"id":"attendee-checkin","icon":"qr_code_2","title":"報名者接受核銷","description":"我的報名 → 出示報名 QR → 重新產生 → 確認已核銷","duration":"2:06","file":"attendee-accept-checkin-tutorial-v1.mp4","mediaBase":"https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-10/","chapters":[[0,"從頭觀看"],[13.583,"首頁我的報名"],[28.458,"會員活動／課程報名"],[40.542,"查看本場活動"],[52.125,"出示報名 QR"],[65.667,"重新產生 QR"],[80.375,"現場出示 QR"],[93.208,"確認已核銷"],[110.208,"重點複習"]],"note":"中文旁白＋步驟標示，示範會員自建活動／課程。真實平台介面搭配虛構會員、測試資料與測試相機，未異動正式報名或核銷紀錄。請登入原報名帳號，出示本場活動的報名 QR，不是商城點數 QR。QR 五分鐘有效，重新產生後舊碼失效；由本場主辦人使用平台內的核銷掃描器，不能用 LINE 一般掃描器代替。只能在活動期間核銷，成功後可返回活動確認已核銷。"}
    ,{"id":"organizer-checkin","icon":"qr_code_scanner","title":"主辦人核銷報名者","description":"我辦的活動 → 報名名冊 → 平台掃描器 → 更新名單","duration":"2:24","file":"organizer-checkin-roster-tutorial-v1.mp4","mediaBase":"https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-10/","chapters":[[0,"從頭觀看"],[14.583,"首頁個人行事曆"],[27.292,"我辦的活動"],[39.333,"報名名冊"],[55.167,"開啟核銷掃描器"],[68.833,"開始掃描"],[83.75,"確認核銷成功"],[96,"貼上 QR 內容"],[111.917,"查看更新名單"],[125.958,"重點複習"]],"note":"中文旁白＋步驟標示，示範會員自建活動／課程。真實平台介面搭配虛構會員、測試資料與測試相機，未異動正式報名或核銷紀錄；不等同真人手機相機驗收。僅本場主辦人可以在活動期間核銷。從報名名冊開啟平台內的核銷掃描器，允許相機並掃描報名者的活動 QR，不能用 LINE 一般掃描器或商城點數 QR 代替。看到核銷成功才算完成；無法使用相機可貼上 QR 內容，重複核銷不重複計算，再查看更新名單。"}
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
