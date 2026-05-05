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
      
      // 🚀 初始化三圖片記憶庫，並保留各自的比例
      window.myEcardImages = {
        landscape: { url: cfg.imgUrl || currentUserCard['名片圖檔'] || '', ratio: cfg.imgRatioLandscape || '20:13' },
        portrait: { url: cfg.imgUrlPortrait || '', ratio: cfg.imgRatioPortrait || '2:3' },
        square: { url: cfg.imgUrlSquare || '', ratio: cfg.imgRatioSquare || '1:1' }
      };

      // 嚴格確保預設值，支援三種版型
      let layoutStyle = 'landscape';
      if (cfg.layoutStyle === 'portrait' || cfg.layoutStyle === 'square') {
        layoutStyle = cfg.layoutStyle;
      }
      
      const layoutRadio = document.querySelector(`input[name="my-ecard-layout"][value="${layoutStyle}"]`);
      if (layoutRadio) layoutRadio.checked = true;

      document.getElementById('my-v1-img-url').value = window.myEcardImages[layoutStyle].url || '';

    } catch(e) {
      myV1Buttons = [{l:'加為好友', u:'https://line.me/R/', c:'#06C755'}];
      window.myEcardImages = { 
        landscape: { url: currentUserCard['名片圖檔'] || '', ratio: '20:13' },
        portrait: { url: '', ratio: '2:3' },
        square: { url: '', ratio: '1:1' }
      };
      document.getElementById('my-v1-img-url').value = window.myEcardImages['landscape'].url;
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
      {l:'加LINE好友', u:'https://line.me/R/', c:'#06C755'},
      {l:'行動電話', u:'tel:' + (currentUser?.phone || '').replace(/[^0-9+]/g, ''), c:'#3b82f6'}
    ];
    
    const templateDesc = "⭐請填寫公司/店家介紹\n⭐請填寫公司/店家服務項目\n⭐請填寫公司/店家特色\n⭐請填寫〔優惠資訊〕\n⭐建議4-～5行，每行16字內";

    const config = {
      cardType: 'v1',
      imgUrl: currentUserProfile?.pictureUrl || '',
      imgRatioLandscape: '1:1', // LINE頭貼是方形的
      title: currentUser?.name || '我的名片',
      desc: templateDesc,
      buttons: defaultBtns,
      isPrivate: false,
      descAlign: 'start',
      descColor: '#666666',
      layoutStyle: 'landscape'
    };

    const newCardPayload = {
      userId: currentUserProfile.userId,
      姓名: currentUser?.name || '',
      手機號碼: currentUser?.phone || '',
      服務項目: templateDesc,
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
      
      const detailBtn = document.querySelector('#my-ecard-edit-state button[onclick^="window.openCardDetail"]');
      if (detailBtn) {
        detailBtn.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'animate-pulse');
        setTimeout(() => detailBtn.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'animate-pulse'), 3000);
      }
    } else {
      throw new Error('建立失敗');
    }
  } catch(e) {
    window.showToast('⚠️ 生成失敗:' + e.message, true);
    btn.innerHTML = oriHtml;
    btn.disabled = false;
  }
};

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

// 🚀 接收並儲存裁切好的真實比例
window.setMyUploadImage = function(url, ratio) {
  const layoutRadio = document.querySelector('input[name="my-ecard-layout"]:checked');
  const layoutStyle = layoutRadio ? layoutRadio.value : 'landscape';
  
  if (!window.myEcardImages || !window.myEcardImages[layoutStyle]) {
     window.myEcardImages = {
       landscape: { url: '', ratio: '20:13' },
       portrait: { url: '', ratio: '2:3' },
       square: { url: '', ratio: '1:1' }
     };
  }
  
  window.myEcardImages[layoutStyle] = { url: url, ratio: ratio };
  document.getElementById('my-v1-img-url').value = url;
  window.updateMyECardPreview();
};

// 版型切換事件
window.changeMyLayout = function() {
  const layoutRadio = document.querySelector('input[name="my-ecard-layout"]:checked');
  const layoutStyle = layoutRadio ? layoutRadio.value : 'landscape';
  
  if (!window.myEcardImages || !window.myEcardImages[layoutStyle]) {
     window.myEcardImages = {
       landscape: { url: '', ratio: '20:13' },
       portrait: { url: '', ratio: '2:3' },
       square: { url: '', ratio: '1:1' }
     };
  }
  
  document.getElementById('my-v1-img-url').value = window.myEcardImages[layoutStyle].url || '';
  window.updateMyECardPreview();
};

// 更新我的名片預覽
window.updateMyECardPreview = function() {
  const area = document.getElementById('my-ecard-preview-area');
  if (!area) return;

  const layoutRadio = document.querySelector('input[name="my-ecard-layout"]:checked');
  const layoutStyle = layoutRadio ? layoutRadio.value : 'landscape';

  if (!window.myEcardImages || !window.myEcardImages[layoutStyle]) {
     window.myEcardImages = {
       landscape: { url: '', ratio: '20:13' },
       portrait: { url: '', ratio: '2:3' },
       square: { url: '', ratio: '1:1' }
     };
  }

  // 僅更新網址 (若使用者自己貼上網址, 則沿用舊的 ratio)
  window.myEcardImages[layoutStyle].url = document.getElementById('my-v1-img-url').value;

  let configParams = {
    imgUrl: window.myEcardImages[layoutStyle].url || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80',
    imgRatio: window.myEcardImages[layoutStyle].ratio,
    buttons: myV1Buttons,
    descAlign: 'center',
    descColor: '#666666',
    layoutStyle: layoutStyle
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

  const layoutRadio = document.querySelector('input[name="my-ecard-layout"]:checked');
  const layoutStyle = layoutRadio ? layoutRadio.value : 'landscape';
  
  if (!window.myEcardImages || !window.myEcardImages[layoutStyle]) {
     window.myEcardImages = {
       landscape: { url: '', ratio: '20:13' },
       portrait: { url: '', ratio: '2:3' },
       square: { url: '', ratio: '1:1' }
     };
  }
  
  window.myEcardImages[layoutStyle].url = document.getElementById('my-v1-img-url').value;

  const config = {
    cardType: 'v1',
    imgUrl: window.myEcardImages['landscape'].url,
    imgRatioLandscape: window.myEcardImages['landscape'].ratio,
    imgUrlPortrait: window.myEcardImages['portrait'].url,
    imgRatioPortrait: window.myEcardImages['portrait'].ratio,
    imgUrlSquare: window.myEcardImages['square'].url,
    imgRatioSquare: window.myEcardImages['square'].ratio,
    title: currentUserCard['姓名'] || currentUser?.name || '我的名片',
    desc: currentUserCard['服務項目'] || currentUserCard['職稱'] || currentUser?.industry || '',
    buttons: myV1Buttons,
    isPrivate: false,
    descAlign: prevAlign,
    descColor: prevColor,
    layoutStyle: layoutStyle
  };

  try {
    await window.fetchAPI('updateCard', {
      rowId: currentUserCard.rowId,
      data: { '自訂名片設定': JSON.stringify(config), '名片圖檔': config.imgUrl || '' }
    }, true);
    
    currentUserCard['自訂名片設定'] = JSON.stringify(config);
    currentUserCard['名片圖檔'] = config.imgUrl || '';

    if (typeof allCards !== 'undefined') {
      const match = allCards.find(c => String(c.rowId) === String(currentUserCard.rowId));
      if (match) {
        match['自訂名片設定'] = JSON.stringify(config);
        match['名片圖檔'] = config.imgUrl || '';
      }
    }
    if (typeof currentCard !== 'undefined' && currentCard && String(currentCard.rowId) === String(currentUserCard.rowId)) {
      currentCard['自訂名片設定'] = JSON.stringify(config);
      currentCard['名片圖檔'] = config.imgUrl || '';
      if (typeof window.updateECardPreview === 'function') window.updateECardPreview();
    }

    window.showToast('✅ 專屬名片已儲存！您現在可以在首頁發送名片了。');
  } catch(e) {
    window.showToast('⚠️ 儲存失敗:' + e.message, true);
  } finally {
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> 儲存名片設定';
    btn.disabled = false;
    window.updateMyECardPreview();
  }
};

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
      networkId: currentNetworkId,
      liffId: LIFF_ID 
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
