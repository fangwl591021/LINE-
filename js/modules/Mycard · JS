/* ==================== 我的專屬名片模組 ==================== */

// 初始化我的專屬名片區塊
window.initMyECard = function() {
  const emptyState = document.getElementById('my-ecard-empty-state');
  const editState = document.getElementById('my-ecard-edit-state');

  if (currentUserCard) {
    if (emptyState) emptyState.classList.add('hidden');
    if (editState) editState.classList.remove('hidden');

    try {
      const cfg = JSON.parse(currentUserCard['自訂名片設定'] || '{}');
      myV1Buttons = cfg.buttons || [{l:'加為好友', u:'https://line.me/R/', c:'#06C755'}];
      document.getElementById('my-v1-img-url').value = cfg.imgUrl || currentUserCard['名片圖檔'] || '';
    } catch(e) {
      myV1Buttons = [{l:'加為好友', u:'https://line.me/R/', c:'#06C755'}];
      document.getElementById('my-v1-img-url').value = currentUserCard['名片圖檔'] || '';
    }
    window.renderMyECardSettings();
    window.updateMyECardPreview();
  } else {
    if (emptyState) emptyState.classList.remove('hidden');
    if (editState) editState.classList.add('hidden');
  }
};

// 從 LINE Profile 一鍵生成名片
window.generateCardFromProfile = async function(event) {
  const btn = event.currentTarget;
  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 生成中...';
  btn.disabled = true;

  try {
    const defaultBtns = [
      {l:'撥打電話', u:'tel:' + (currentUser?.phone || '').replace(/[^0-9+]/g, ''), c:'#06C755'},
      {l:'加為好友', u:'https://line.me/R/', c:'#3b82f6'}
    ];
    const config = {
      cardType: 'v1',
      imgUrl: currentUserProfile?.pictureUrl || '',
      title: currentUser?.name || '我的名片',
      desc: currentUser?.industry || '商務人士',
      buttons: defaultBtns,
      isPrivate: false,
      descAlign: 'center',
      descColor: '#666666'
    };

    const newCardPayload = {
      userId: currentUserProfile.userId,
      姓名: currentUser?.name || '',
      手機號碼: currentUser?.phone || '',
      服務項目: currentUser?.industry || '',
      自訂名片設定: JSON.stringify(config),
      名片圖檔: config.imgUrl || ''
    };

    const res = await window.fetchAPI('saveCard', newCardPayload, true);

    if (res && res.rowId) {
      window.showToast('✅ 專屬名片生成成功！');
      newCardPayload.rowId = res.rowId;
      allCards.unshift(newCardPayload);
      currentUserCard = newCardPayload;
      window.initMyECard();
      window.renderCardList(allCards);
    } else {
      throw new Error('建立失敗');
    }
  } catch(e) {
    window.showToast('⚠️ 生成失敗:' + e.message, true);
    btn.innerHTML = oriHtml;
    btn.disabled = false;
  }
};

// 渲染我的專屬名片按鈕設定
window.renderMyECardSettings = function() {
  document.getElementById('my-v1-buttons-list').innerHTML = myV1Buttons.map((btn, i) =>
    '<div class="bg-white p-3 rounded-xl border border-slate-200 space-y-2">' +
      '<div class="flex gap-2 items-center">' +
        '<input type="color" class="w-9 h-9 p-0.5 bg-white border border-slate-200 rounded-lg cursor-pointer shrink-0 shadow-sm" title="設定按鈕顏色" value="' + (btn.c || '#06C755') + '" onchange="myV1Buttons[' + i + '].c=this.value;window.updateMyECardPreview()">' +
        '<input class="flex-1 min-w-0 bg-slate-50 border-none rounded-lg p-2.5 text-[13px] font-bold shadow-sm focus:ring-2 focus:ring-blue-500/30 outline-none" placeholder="按鈕文字" value="' + window.escapeJS(btn.l||'') + '" oninput="myV1Buttons[' + i + '].l=this.value;window.updateMyECardPreview()">' +
        '<button type="button" onclick="myV1Buttons.splice(' + i + ',1);window.renderMyECardSettings();window.updateMyECardPreview()" class="text-red-400 bg-red-50 w-9 h-9 rounded-lg flex items-center justify-center shrink-0 active:scale-90 transition-transform"><span class="material-symbols-outlined text-[18px]">delete</span></button>' +
      '</div>' +
      '<input class="w-full bg-slate-50 border-none rounded-lg p-2.5 text-[12px] font-mono shadow-sm focus:ring-2 focus:ring-blue-500/30 outline-none" placeholder="https:// 或 tel:0912345678" value="' + window.escapeJS(btn.u||'') + '" oninput="myV1Buttons[' + i + '].u=this.value">' +
    '</div>'
  ).join('');
};

window.addMyV1Button = function() {
  myV1Buttons.push({l:'新按鈕',u:'',c:'#06C755'});
  window.renderMyECardSettings();
};

// 更新我的名片預覽
window.updateMyECardPreview = function() {
  const area = document.getElementById('my-ecard-preview-area');
  if (!area) return;
  let configParams = {
    imgUrl: document.getElementById('my-v1-img-url').value || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80',
    buttons: myV1Buttons,
    descAlign: 'center',
    descColor: '#666666'
  };

  if (currentUserCard && currentUserCard['自訂名片設定']) {
    try {
      let c = JSON.parse(currentUserCard['自訂名片設定']);
      configParams.descAlign = c.descAlign || 'center';
      configParams.descColor = c.descColor || '#666666';
    } catch(e){}
  }

  let mockCard = currentUserCard || {
    '姓名': currentUser?.name || '未知',
    '服務項目': currentUser?.industry || '商務人士',
  };
  area.innerHTML = window.getPreviewHTML(mockCard, 'v1', configParams);
};

// 儲存我的專屬名片設定
window.saveMyECardConfig = async function() {
  if (!currentUserCard) return;

  const btn = document.getElementById('btn-save-my-ecard');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  btn.disabled = true;

  myV1Buttons.forEach(b => { b.u = window.cleanURI(b.u); });

  let prevAlign = 'center', prevColor = '#666666';
  if (currentUserCard['自訂名片設定']) {
    try {
      let c = JSON.parse(currentUserCard['自訂名片設定']);
      prevAlign = c.descAlign || 'center';
      prevColor = c.descColor || '#666666';
    } catch(e){}
  }

  const config = {
    cardType: 'v1',
    imgUrl: document.getElementById('my-v1-img-url').value,
    title: currentUserCard['姓名'] || currentUser?.name || '我的名片',
    desc: currentUserCard['服務項目'] || currentUserCard['職稱'] || currentUser?.industry || '',
    buttons: myV1Buttons,
    isPrivate: false,
    descAlign: prevAlign,
    descColor: prevColor
  };

  try {
    await window.fetchAPI('updateCard', {
      rowId: currentUserCard.rowId,
      data: { '自訂名片設定': JSON.stringify(config), '名片圖檔': config.imgUrl || '' }
    }, true);
    currentUserCard['自訂名片設定'] = JSON.stringify(config);
    currentUserCard['名片圖檔'] = config.imgUrl || '';

    window.showToast('✅ 專屬名片已儲存！您現在可以在首頁發送名片了。');
  } catch(e) {
    window.showToast('⚠️ 儲存失敗:' + e.message, true);
  } finally {
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> 儲存名片設定';
    btn.disabled = false;
    window.updateMyECardPreview();
  }
};

// 分享我的名片
window.shareMyCard = async function(btn) {
  if (!currentUserCard) {
    window.showToast('尚未建立專屬名片,為您導向設定頁面', true);
    window.goPage('admin-settings');
    const detailEl = document.getElementById('details-my-ecard');
    if (detailEl) detailEl.open = true;
    setTimeout(() => detailEl?.scrollIntoView({behavior: 'smooth'}), 300);
    return;
  }
  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-4xl text-[#06C755]">refresh</span><span class="font-bold text-slate-700">準備中...</span>';
  btn.disabled = true;
  try {
    let config = {};
    try { config = JSON.parse(currentUserCard['自訂名片設定']); } catch(e){}
    const flexMsg = await window.fetchAPI('buildFlexMessage', {
      card: currentUserCard,
      config: config,
      referrerId: currentUserProfile.userId,
      networkId: currentNetworkId
    }, true);
    if (flexMsg) {
      await window.triggerFlexSharing(flexMsg, "您收到一張數位名片");
    }
  } catch(e) {
    window.showToast('發送失敗:' + e.message, true);
  } finally {
    if (btn) { btn.innerHTML = oriHtml; btn.disabled = false; }
  }
};

// 顯示專屬 QR Code
window.showMyQRCode = function() {
  if (!currentUserCard) {
    window.showToast('請先建立專屬名片', true);
    return;
  }
  const modal = document.getElementById('qr-modal');
  const img = document.getElementById('qr-code-img');
  const loading = document.getElementById('qr-loading');

  modal.classList.remove('hidden');
  img.classList.add('hidden');
  loading.classList.remove('hidden');

  let badgeUrl = 'https://liff.line.me/' + LIFF_ID + '?shareCardId=' + currentUserCard.rowId;
  badgeUrl += '&ref=' + currentUserProfile.userId;
  badgeUrl += '&net=' + currentNetworkId;

  const qrUrl = 'https://quickchart.io/qr?text=' + encodeURIComponent(badgeUrl) + '&size=300&margin=2';

  img.onload = () => {
    loading.classList.add('hidden');
    img.classList.remove('hidden');
  };
  img.src = qrUrl;
};
