/* ==================== 數位名片模組(eCard) ==================== */

// 設定服務項目文字對齊
window.setDescAlign = function(align) {
  window.currentDescAlign = align;
  ['start', 'center', 'end'].forEach(a => {
    const btn = document.getElementById('align-' + a);
    if (!btn) return;
    if (a === align) {
      btn.className = "w-7 h-7 rounded flex items-center justify-center bg-white shadow-sm text-blue-600 transition-all";
    } else {
      btn.className = "w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:bg-white hover:shadow-sm transition-all";
    }
  });
  window.updateECardPreview();
};

// 渲染 V1 按鈕設定列
window.renderECardSettings = function() {
  document.getElementById('v1-buttons-list').innerHTML = v1Buttons.map((btn, i) =>
    '<div class="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">' +
      '<div class="flex gap-2 items-center">' +
        '<input type="color" class="w-9 h-9 p-0.5 bg-white border border-slate-200 rounded-lg cursor-pointer shrink-0 shadow-sm" title="設定按鈕顏色" value="' + (btn.c || '#06C755') + '" onchange="v1Buttons[' + i + '].c=this.value;window.updateECardPreview()">' +
        '<input class="flex-1 min-w-0 bg-white border-none rounded-lg p-2.5 text-[13px] font-bold shadow-sm focus:ring-2 focus:ring-blue-500/30 outline-none" placeholder="按鈕文字" value="' + window.escapeJS(btn.l||'') + '" oninput="v1Buttons[' + i + '].l=this.value;window.updateECardPreview()">' +
        '<button type="button" onclick="v1Buttons.splice(' + i + ',1);window.renderECardSettings();window.updateECardPreview()" class="text-red-400 bg-red-50 w-9 h-9 rounded-lg flex items-center justify-center shrink-0 active:scale-90 transition-transform"><span class="material-symbols-outlined text-[18px]">delete</span></button>' +
      '</div>' +
      '<input class="w-full bg-white border-none rounded-lg p-2.5 text-[12px] font-mono shadow-sm focus:ring-2 focus:ring-blue-500/30 outline-none" placeholder="https:// 或 tel:0912345678" value="' + window.escapeJS(btn.u||'') + '" oninput="v1Buttons[' + i + '].u=this.value">' +
    '</div>'
  ).join('');
};

window.addV1Button = function() {
  v1Buttons.push({l:'新按鈕',u:'',c:'#06C755'});
  window.renderECardSettings();
};

// 產生名片預覽 HTML
window.getPreviewHTML = function(card, style, configParams) {
  const name = window.escapeJS(card['姓名'] || '姓名');
  
  // 🚀 修正：將服務項目的文字獨立處理，將 literal \n 或 真實換行 替換為 <br> 標籤
  const rawService = card['服務項目'] || card['職稱'] || card['公司名稱'] || '';
  const service = String(rawService)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\n/g, '<br>')
    .replace(/\n/g, '<br>');

  const imgUrl = configParams.imgUrl || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
  const buttons = configParams.buttons || [];

  const btnsHtml = buttons.map(btn =>
    '<div class="block py-3 rounded-xl text-white text-center text-[14px] font-black mb-2.5 shadow-sm" style="background:' + (btn.c||'#06C755') + '">' +
    window.escapeJS(btn.l||'按鈕') + '</div>'
  ).join('');

  const heroImageHtml = '<div class="relative aspect-[20/13] bg-slate-100 bg-cover bg-center" style="background-image:url(' + imgUrl + ');"><div class="absolute top-4 left-4 bg-[#FF0000] text-white text-[11px] font-black px-3 py-1 rounded-full shadow-sm tracking-widest">分享</div></div>';

  const alignMap = { 'start': 'left', 'center': 'center', 'end': 'right' };
  const textAlign = alignMap[configParams.descAlign || 'center'] || 'center';
  const textColor = configParams.descColor || '#666666';

  return '<div class="bg-white pb-6 flex flex-col w-full h-full">' +
    heroImageHtml +
    '<div class="p-6 text-center">' +
      '<div class="font-black text-[22px] text-slate-800 leading-tight mb-2">' + name + '</div>' +
      '<div class="text-[14px] font-medium leading-relaxed" style="color: ' + textColor + '; text-align: ' + textAlign + ';">' + service + '</div>' +
    '</div>' +
    (btnsHtml ? '<div class="px-6">' + btnsHtml + '</div>' : '') +
  '</div>';
};

// 更新名片預覽
window.updateECardPreview = function() {
  if (!currentCard) return;
  const area = document.getElementById('ecard-preview-area');
  const colorInput = document.getElementById('edit-desc-color');
  let configParams = {
    imgUrl: document.getElementById('v1-img-url').value || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80',
    buttons: v1Buttons,
    descAlign: window.currentDescAlign || 'center',
    descColor: colorInput ? colorInput.value : '#666666'
  };
  area.innerHTML = window.getPreviewHTML(currentCard, currentECardStyle, configParams);
};

// 儲存數位名片設定
window.saveECardConfig = async function(isSilent = false) {
  const btn = document.getElementById('btn-ecard-save');
  if (!isSilent && btn) {
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中';
    btn.disabled = true;
  }

  let prevIsPrivate = false;
  if (currentCard['自訂名片設定']) {
    try { prevIsPrivate = JSON.parse(currentCard['自訂名片設定']).isPrivate || false; } catch(e){}
  }

  v1Buttons.forEach(b => { b.u = window.cleanURI(b.u); });

  const colorInput = document.getElementById('edit-desc-color');
  const config = {
    cardType: 'v1',
    imgUrl: document.getElementById('v1-img-url').value,
    title: currentCard['姓名'],
    desc: currentCard['服務項目'] || currentCard['職稱'],
    buttons: v1Buttons,
    isPrivate: prevIsPrivate,
    descAlign: window.currentDescAlign || 'center',
    descColor: colorInput ? colorInput.value : '#666666'
  };

  try {
    await window.fetchAPI('updateCard', {
      rowId: currentCard.rowId,
      data: { '自訂名片設定': JSON.stringify(config), '名片圖檔': config.imgUrl || '' }
    }, true);
    currentCard['自訂名片設定'] = JSON.stringify(config);
    currentCard['名片圖檔'] = config.imgUrl || '';
    if (!isSilent) window.showToast('✅ 數位名片設定已儲存！');
  } catch(e) {
    if (!isSilent) window.showToast('⚠️ 儲存失敗:' + e.message, true);
    else throw e;
  } finally {
    if (!isSilent && btn) {
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> 儲存';
      btn.disabled = false;
    }
  }
  return config;
};

// 分享數位名片到 LINE
window.shareECardToLine = async function(btnId) {
  if (!currentCard) return window.showToast('無法取得名片資料', true);
  const btn = document.getElementById(btnId);
  const oriHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 準備中...';
    btn.disabled = true;
  }

  try {
    const config = await window.saveECardConfig(true);
    const flexMsg = await window.fetchAPI('buildFlexMessage', {
      card: currentCard,
      config: config,
      referrerId: currentUserProfile.userId,
      networkId: currentNetworkId,
      liffId: LIFF_ID // 🚀 動態傳遞當前最新的 LIFF_ID
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

// 發送認領邀請
window.sendClaimInvitation = async function() {
  if (!currentCard) return;
  const link = "https://liff.line.me/" + LIFF_ID + "?claim=" + currentCard.rowId;
  const text = '您好！這是為您建立的數位名片:\n' + link + '\n請點擊連結認領並管理您的專屬名片。';
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return;
  }
  try {
    await liff.shareTargetPicker([{ type: "text", text: text }]);
    window.showToast('✅ 認領邀請已發送');
  } catch(e) {
    window.showToast('發送失敗', true);
  }
};

// 唯讀名片彈窗的關閉/分享
window.closeReadOnlyCard = function() {
  document.getElementById('readonly-card-modal').classList.add('hidden');
};

window.shareReadOnlyCardToLine = async function(btn) {
  if (!window.roCardData) return;
  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 準備中...';
  btn.disabled = true;
  try {
    let config = {};
    try { config = JSON.parse(window.roCardData['自訂名片設定']); } catch(e){}
    const flexMsg = await window.fetchAPI('buildFlexMessage', {
      card: window.roCardData,
      config: config,
      referrerId: currentUserProfile.userId,
      networkId: currentNetworkId,
      liffId: LIFF_ID // 🚀 動態傳遞當前最新的 LIFF_ID
    }, true);
    if (flexMsg) await window.triggerFlexSharing(flexMsg, "您收到一張數位名片");
  } catch (e) {
    window.showToast('發送失敗:' + e.message, true);
  } finally {
    if (btn) { btn.innerHTML = oriHtml; btn.disabled = false; }
  }
};
