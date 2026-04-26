/* ==================== 首頁模組(Banner、活動列表、活動紀錄) ==================== */

// 更新首頁 Banner / YouTube / 系統名稱
window.updateHomeBanner = function() {
  let bannerUrl = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1000&q=80';
  let ytUrl = '';
  let siteName = 'LINE商機引擎';

  const ownerCard = allCards.find(c => String(c['LINE ID']).trim() === currentNetworkId);
  if (ownerCard && ownerCard['自訂名片設定']) {
    try {
      const cfg = JSON.parse(ownerCard['自訂名片設定']);
      if (cfg.homeBanner) bannerUrl = cfg.homeBanner;
      if (cfg.homeYoutube) ytUrl = cfg.homeYoutube;
      if (cfg.siteName) siteName = cfg.siteName;
    } catch(e){}
  }

  const headerEl = document.getElementById('header-site-name');
  if (headerEl) headerEl.textContent = siteName;
  const inputEl = document.getElementById('input-site-name');
  if (inputEl && !inputEl.value) inputEl.value = siteName === 'LINE商機引擎' ? '' : siteName;

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
  const container = document.getElementById('user-activities-list');
  if (!container) return;

  try {
    const res = await window.fetchAPI('getPublicActivities', {}, true);
    if (res && res.length > 0) {
      const validActs = res.filter(a => a['狀態'] === '上架').reverse();
      if (validActs.length === 0) {
        container.innerHTML = '<div class="bg-white rounded-2xl p-6 text-center shadow-sm border border-slate-100 text-slate-400 text-sm font-bold">近期無公開活動</div>';
        return;
      }
      container.innerHTML = validActs.map(act => {
        const title = window.escapeJS(act['活動名稱'] || '未命名活動');
        const time = window.formatDisplayTime(act['開始時間']);
        const fee = act['金額'] > 0 ? 'NT$ ' + act['金額'] : '免費';
        const img = act['宣傳圖'] || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80';

        let rawDesc = act['活動說明'] || '';
        const desc = String(rawDesc)
          .replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\\n/g, '<br>')
          .replace(/\n/g, '<br>');

        const actId = window.escapeJS(act['活動ID'] || act.rowId || '');

        return '<div class="bg-white mb-6 flex flex-col pb-4 border-b border-slate-100 last:border-0">' +
          '<div class="w-full aspect-[16/9] relative rounded-lg overflow-hidden bg-slate-100">' +
            '<img src="' + img + '" class="w-full h-full object-cover">' +
            '<div class="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-0.5 rounded font-normal">' + fee + '</div>' +
          '</div>' +
          '<div class="pt-3 flex flex-col">' +
            '<h4 class="text-[16px] text-slate-800 font-bold leading-snug mb-1">' + title + '</h4>' +
            '<div class="text-[13px] text-slate-500 mb-2">' + time + '</div>' +
            (desc ? '<p class="text-[13px] text-slate-600 line-clamp-3 leading-relaxed mb-3">' + desc + '</p>' : '') +
            '<button type="button" onclick="window.userJoinActivity(\'' + actId + '\', \'' + title + '\', event)" class="mt-1 w-full py-3 bg-[#06C755] hover:bg-green-600 text-white rounded-xl text-[14px] font-bold active:scale-95 transition-all flex justify-center items-center gap-1 shadow-sm">' +
              '立即報名' +
            '</button>' +
          '</div>' +
        '</div>';
      }).join('');
    } else {
      container.innerHTML = '<div class="bg-white rounded-2xl p-6 text-center shadow-sm border border-slate-100 text-slate-400 text-sm font-bold">近期無公開活動</div>';
    }
  } catch(e) {
    container.innerHTML = '<div class="text-center py-6 text-red-400 text-sm font-bold">無法載入活動</div>';
  }
};

// 用戶報名活動
window.userJoinActivity = async function(actId, actName, event) {
  if (!currentUser || !currentUser.name || !currentUser.phone) {
    window.showToast('⚠️ 報名需要姓名與手機,已為您導向設定頁面', true);
    window.goPage('admin-settings');
    const elName = document.getElementById('profile-name');
    if (elName) setTimeout(() => elName.focus(), 300);
    return;
  }

  if (!confirm('確定要報名「' + actName + '」嗎？')) return;
  const btn = event.currentTarget;
  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 報名中...';
  btn.disabled = true;
  try {
    const res = await window.fetchAPI('joinActivity', {
      activityId: actId,
      activityName: actName,
      userId: currentUserProfile.userId,
      userName: currentUser.name,
      userPhone: currentUser.phone,
      defaultIdentity: '會員'
    }, true);
    if (res && !res.error) {
      window.showToast('🎉 報名成功！');
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">check_circle</span> 已報名';
      btn.classList.replace('bg-[#06C755]', 'bg-slate-200');
      btn.classList.replace('hover:bg-green-600', 'hover:bg-slate-200');
      btn.classList.replace('text-white', 'text-slate-500');
      btn.classList.remove('active:scale-95', 'shadow-sm');
      btn.classList.add('cursor-not-allowed');
    } else {
      throw new Error(res.error || '報名失敗');
    }
  } catch (e) {
    window.showToast('⚠️ ' + e.message, true);
    btn.innerHTML = oriHtml;
    btn.disabled = false;
  }
};

// 載入我的活動紀錄
window.loadMyActivities = async function() {
  const container = document.getElementById('my-activities-list');
  if (!container) return;
  container.innerHTML = '<div class="text-center py-10"><span class="material-symbols-outlined animate-spin text-3xl text-slate-300">refresh</span><p class="text-sm text-slate-400 font-bold mt-2">載入紀錄中...</p></div>';

  try {
    const res = await window.fetchAPI('getUserActivities', { phone: currentUser?.phone || '' }, true);
    if (res && res.length > 0) {
      window.myActivitiesData = res.reverse();
      container.innerHTML = window.myActivitiesData.map(act => {
        const title = window.escapeJS(act['活動名稱'] || '未命名活動');
        const time = window.formatDisplayTime(act['開始時間']);
        const price = parseInt(act['金額']) || 0;

        let status = window.escapeJS(act['簽到'] === true || String(act['簽到']).toUpperCase() === 'TRUE' ? '已簽到' : '已報名');
        let payStatus = act['繳費狀態'] || '';

        if (payStatus === '待對帳') status = '待對帳';
        if (payStatus === '已繳費') status = '報名成功 (已繳費)';

        const statusColor = (status === '已簽到' || status.includes('已繳費'))
          ? 'text-slate-400'
          : (status === '待對帳' ? 'text-orange-500' : 'text-[#06C755]');
        const rowId = window.escapeJS(act.rowId);

        return `
          <div onclick="window.showMyActivityDetail('${rowId}')" class="px-5 py-4 flex justify-between items-center active:bg-slate-50 transition-colors cursor-pointer border-b border-slate-50 last:border-0">
            <div class="flex flex-col">
              <span class="text-[15px] font-normal text-slate-800 leading-snug">${title}</span>
              <div class="mt-1 flex items-center gap-3 text-[12px]">
                <span class="text-slate-400">${time ? time.substring(5,16) : '時間未定'}</span>
                <span class="${statusColor} font-normal">${status}</span>
              </div>
            </div>
            <span class="material-symbols-outlined text-slate-300 text-[18px]">chevron_right</span>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<div class="text-center py-10 text-slate-400 text-[13px] font-normal">目前無活動紀錄</div>';
    }
  } catch(e) {
    container.innerHTML = '<div class="text-center py-10 text-red-400 text-[13px] font-normal">無法載入紀錄:' + e.message + '</div>';
  }
};

// 顯示活動明細
window.showMyActivityDetail = function(rowId) {
  const act = window.myActivitiesData.find(a => String(a.rowId) === String(rowId));
  if (!act) return;

  const title = window.escapeJS(act['活動名稱'] || '');
  const time = window.formatDisplayTime(act['開始時間']);
  const price = parseInt(act['金額']) || 0;
  const feeText = price > 0 ? `NT$ ${price}` : '免費';
  const img = act['宣傳圖'] || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80';

  let rawDesc = act['活動說明'] || '';
  const desc = String(rawDesc).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br>').replace(/\n/g, '<br>');

  let status = window.escapeJS(act['簽到'] === true || String(act['簽到']).toUpperCase() === 'TRUE' ? '已簽到' : '已報名');
  let payStatus = act['繳費狀態'] || '';
  if (payStatus === '待對帳') status = '待對帳';
  if (payStatus === '已繳費') status = '報名成功 (已繳費)';
  const statusColor = (status === '已簽到' || status.includes('已繳費'))
    ? 'text-slate-400'
    : (status === '待對帳' ? 'text-orange-500' : 'text-[#06C755]');

  let paymentHtml = '';
  if (payStatus === '未繳費' && price > 0) {
    paymentHtml = `
      <div class="mt-2 flex flex-col gap-2">
        <p class="text-[13px] font-normal text-slate-700">請完成繳費並填寫對帳資訊:</p>
        <div class="flex items-center gap-2">
          <input type="text" id="detail-pay-${act.rowId}" maxlength="5" placeholder="輸入匯款帳號後五碼" class="flex-1 bg-slate-50 border border-slate-100 outline-none rounded-lg px-3 py-2.5 text-[13px] font-mono text-slate-700 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-[12px]">
          <button onclick="window.submitPaymentDetail('${act.rowId}')" class="shrink-0 bg-white text-slate-600 px-4 py-2.5 rounded-lg text-[13px] font-normal active:scale-95 transition-transform border border-slate-200 shadow-sm">提交對帳</button>
        </div>
      </div>
    `;
  }

  const contentContainer = document.getElementById('my-act-detail-content');
  if (!contentContainer) {
    window.showToast('系統錯誤:找不到明細畫面元件', true);
    return;
  }

  contentContainer.innerHTML = `
    <div class="w-full aspect-[16/9] bg-slate-100 mb-5 rounded-2xl overflow-hidden shadow-sm border border-slate-100">
      <img src="${img}" class="w-full h-full object-cover">
    </div>
    <div class="px-2">
      <h3 class="text-[18px] font-normal text-slate-800 leading-snug mb-1">${title}</h3>
      <p class="text-[13px] ${statusColor} font-normal mb-5">${status}</p>

      <div class="border-t border-b border-slate-100 py-3 mb-5 space-y-2">
        <div class="flex items-center gap-2 text-[13px] text-slate-600">
          <span class="material-symbols-outlined text-[16px] text-slate-400">schedule</span>
          <span class="font-normal">${time || '時間未定'}</span>
        </div>
        <div class="flex items-center gap-2 text-[13px] text-slate-600">
          <span class="material-symbols-outlined text-[16px] text-slate-400">payments</span>
          <span class="font-normal">${feeText}</span>
        </div>
      </div>
      ${desc ? '<div class="text-[13px] text-slate-600 leading-relaxed font-normal mb-6">' + desc + '</div>' : ''}
      ${paymentHtml}
    </div>
  `;

  window.goPage('my-act-detail');
};

// 提交繳費對帳資訊(明細頁版本)
window.submitPaymentDetail = async function(rowId) {
  const inputEl = document.getElementById('detail-pay-' + rowId);
  const last5 = inputEl ? inputEl.value.trim() : '';
  if (!last5 || last5.length < 5) return window.showToast('請輸入完整的帳號後五碼', true);

  const btn = inputEl.nextElementSibling;
  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px]">refresh</span>';
  btn.disabled = true;

  try {
    const res = await window.fetchAPI('submitPaymentInfo', { rowId: rowId, accountLast5: last5 }, true);
    if (res && !res.error) {
      window.showToast('✅ 已送出對帳資訊！');
      await window.loadMyActivities();
      window.showMyActivityDetail(rowId);
    } else {
      throw new Error(res.error || '送出失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
    btn.innerHTML = oriHtml;
    btn.disabled = false;
  }
};

// 提交繳費對帳資訊(列表頁版本)
window.submitPayment = async function(rowId) {
  const inputEl = document.getElementById('pay-' + rowId);
  const last5 = inputEl ? inputEl.value.trim() : '';
  if (!last5 || last5.length < 5) return window.showToast('請輸入完整的帳號後五碼', true);

  const btn = inputEl.nextElementSibling;
  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px]">refresh</span>';
  btn.disabled = true;

  try {
    const res = await window.fetchAPI('submitPaymentInfo', { rowId: rowId, accountLast5: last5 }, true);
    if (res && !res.error) {
      window.showToast('✅ 已送出對帳資訊！');
      window.loadMyActivities();
    } else {
      throw new Error(res.error || '送出失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
    btn.innerHTML = oriHtml;
    btn.disabled = false;
  }
};
