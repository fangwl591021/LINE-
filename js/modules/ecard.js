// ✅ 宣告全域變數存放當前編輯的按鈕
window.currentEcardButtons = [];
window.currentEcardImgs = { landscape: '', portrait: '', square: '' };
window.currentEcardRatios = { landscape: '20:13', portrait: '2:3', square: '1:1' };

/**
 * 載入名片設定到 UI (請確保在 cards.js 的 openCardDetail 中呼叫此函數)
 * 範例呼叫: window.initECardSettings(cardData);
 */
window.initECardSettings = function(card) {
  if (!card) return;

  // 1. 安全解析 JSON
  let cfg = {};
  try { 
    cfg = JSON.parse(card['自訂名片設定'] || '{}'); 
  } catch(e) {
    console.error("JSON 解析錯誤", e);
  }

  window.currentEcardImgs = {
    landscape: cfg.imgUrl || card['名片圖檔'] || '',
    portrait: cfg.imgUrlPortrait || '',
    square: cfg.imgUrlSquare || ''
  };
  
  window.currentEcardRatios = {
    landscape: cfg.imgRatioLandscape || '20:13',
    portrait: cfg.imgRatioPortrait || '2:3',
    square: cfg.imgRatioSquare || '1:1'
  };

  // 2. 版型設定 (優先取 JSON，預設 landscape)
  let layoutVal = cfg.layoutStyle || cfg.layout || 'landscape';
  let layoutRadio = document.querySelector(`input[name="ecard-layout"][value="${layoutVal}"]`);
  if (layoutRadio) layoutRadio.checked = true;

  // 3. 封面圖片 (優先取 JSON，若無則抓取傳統「名片圖檔」欄位作為備援)
  const imgInput = document.getElementById('v1-img-url');
  if (imgInput) {
    imgInput.value = window.currentEcardImgs[layoutVal];
    imgInput.oninput = function() {
       window.currentEcardImgs[layoutVal] = this.value;
       window.updateECardPreview();
    };
  }

  // 4. 按鈕列表
  window.currentEcardButtons = Array.isArray(cfg.buttons) ? cfg.buttons : [];
  window.renderV1Buttons();

  // 5. 強制刷新預覽畫面
  window.updateECardPreview();
};

/**
 * 渲染底部按鈕列表
 */
window.renderV1Buttons = function() {
  const container = document.getElementById('v1-buttons-list');
  if (!container) return;
  
  if (window.currentEcardButtons.length === 0) {
    container.innerHTML = '<p class="text-[12px] text-slate-400">尚未設定任何按鈕</p>';
  } else {
    container.innerHTML = window.currentEcardButtons.map((b, i) => `
      <div class="flex gap-2 items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <input type="color" value="${b.c || '#06C755'}" class="w-10 h-10 p-0 cursor-pointer rounded-lg shrink-0 border border-slate-200 bg-white" onchange="window.currentEcardButtons[${i}].c=this.value; window.updateECardPreview()">
        <div class="flex-1 flex flex-col gap-1.5">
          <input type="text" value="${escapeHTML(b.l || '')}" placeholder="按鈕顯示文字" class="w-full text-[13px] font-bold bg-white border-none outline-none focus:ring-1 focus:ring-blue-500 rounded px-2.5 py-1.5" oninput="window.currentEcardButtons[${i}].l=this.value; window.updateECardPreview()">
          <input type="text" value="${escapeHTML(b.u || '')}" placeholder="https://..." class="w-full text-[12px] font-mono bg-white border-none outline-none focus:ring-1 focus:ring-blue-500 rounded px-2.5 py-1.5" oninput="window.currentEcardButtons[${i}].u=this.value">
        </div>
        <button onclick="window.currentEcardButtons.splice(${i},1); window.renderV1Buttons(); window.updateECardPreview()" class="text-red-400 bg-red-50 hover:bg-red-100 p-2.5 rounded-lg shrink-0 transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
      </div>
    `).join('');
  }
};

/**
 * 新增按鈕
 */
window.addV1Button = function() {
  window.currentEcardButtons.push({ l: '新按鈕', u: '', c: '#06C755' });
  window.renderV1Buttons();
  window.updateECardPreview();
};

/**
 * 切換版型時觸發
 */
window.changeOtherLayout = function() {
  const layoutStyle = document.querySelector('input[name="ecard-layout"]:checked')?.value || 'landscape';
  const imgInput = document.getElementById('v1-img-url');
  if (imgInput) {
    imgInput.value = window.currentEcardImgs[layoutStyle] || '';
    imgInput.oninput = function() {
       window.currentEcardImgs[layoutStyle] = this.value;
       window.updateECardPreview();
    };
  }
  window.updateECardPreview();
};

window.setOtherUploadImage = function(url, ratio) {
    const layoutStyle = document.querySelector('input[name="ecard-layout"]:checked')?.value || 'landscape';
    window.currentEcardImgs[layoutStyle] = url;
    if (ratio) window.currentEcardRatios[layoutStyle] = ratio.replace(':', '/');
    const imgInput = document.getElementById('v1-img-url');
    if (imgInput) imgInput.value = url;
    window.updateECardPreview();
};

/**
 * 渲染預覽畫面 (完全對應 index.html 的欄位)
 */
window.updateECardPreview = function() {
  const area = document.getElementById('ecard-preview-area');
  if (!area) return;

  const layoutStyle = document.querySelector('input[name="ecard-layout"]:checked')?.value || 'landscape';
  const name = document.getElementById('edit-姓名')?.value || '姓名';
  const imgUrl = window.currentEcardImgs[layoutStyle] || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
  
  const descRaw = document.getElementById('edit-服務項目')?.value || '';
  const desc = descRaw.replace(/\n/g, '<br>');
  const color = document.getElementById('edit-desc-color')?.value || '#666666';
  
  let align = 'center';
  
  if (document.getElementById('align-start')?.classList.contains('bg-white')) align = 'left';
  if (document.getElementById('align-end')?.classList.contains('bg-white')) align = 'right';
  if (window.currentDescAlign === 'start') align = 'left';
  if (window.currentDescAlign === 'end') align = 'right';

  let ratio = '20/13';
  if (layoutStyle === 'portrait') ratio = window.currentEcardRatios.portrait.replace(':', '/') || '2/3';
  if (layoutStyle === 'square') ratio = '1/1';
  if (layoutStyle === 'landscape') ratio = '20/13';

  const btnsHtml = window.currentEcardButtons.map(b => 
    `<div class="block py-3 rounded-xl text-white text-center text-[14px] font-black mb-2.5 shadow-sm" style="background:${b.c||'#06C755'}">${escapeHTML(b.l||'按鈕')}</div>`
  ).join('');

  area.innerHTML = `
    <div class="flex flex-col w-full bg-white pb-6 rounded-b-[24px]">
      <div class="w-full bg-slate-100 bg-cover bg-center" style="aspect-ratio: ${ratio}; background-image:url('${imgUrl}');"></div>
      <div class="p-6 text-center">
        <div class="font-black text-[22px] text-slate-800 mb-2">${escapeHTML(name)}</div>
        <div class="text-[14px] leading-relaxed" style="color: ${color}; text-align: ${align};">${desc}</div>
      </div>
      ${btnsHtml ? `<div class="px-6">${btnsHtml}</div>` : ''}
    </div>
  `;
};

// 工具函數
function escapeHTML(str) {
  return String(str || '').replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t]));
}

/**
 * 儲存數位名片設定
 */
window.saveECardConfig = async function() {
  if (!window.currentCard) return;
  const btn = document.getElementById('btn-ecard-save');
  if (btn) {
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
    btn.disabled = true;
  }

  const layoutVal = document.querySelector('input[name="ecard-layout"]:checked')?.value || 'landscape';
  
  const cfg = {
    layoutStyle: layoutVal,
    imgUrl: window.currentEcardImgs.landscape,
    imgUrlPortrait: window.currentEcardImgs.portrait,
    imgUrlSquare: window.currentEcardImgs.square,
    imgRatioLandscape: '20:13',
    imgRatioPortrait: window.currentEcardRatios.portrait.replace('/', ':'),
    imgRatioSquare: '1:1',
    desc: document.getElementById('edit-服務項目')?.value || '',
    descAlign: window.currentDescAlign || 'center',
    descColor: document.getElementById('edit-desc-color')?.value || '#666666',
    buttons: window.currentEcardButtons
  };

  const payloadData = {
    '名片圖檔': cfg.imgUrl,
    '服務項目': cfg.desc,
    '自訂名片設定': JSON.stringify(cfg)
  };

  try {
    const res = await window.fetchAPI('updateCard', { rowId: window.currentCard.rowId, data: payloadData }, false);
    if (res) {
      window.showToast('✅ 數位名片設定已成功儲存');
      
      window.currentCard['自訂名片設定'] = payloadData['自訂名片設定'];
      window.currentCard['名片圖檔'] = payloadData['名片圖檔'];
      window.currentCard['服務項目'] = payloadData['服務項目'];
      
      if (typeof window.allCards !== 'undefined') {
        const match = window.allCards.find(c => String(c.rowId) === String(window.currentCard.rowId));
        if (match) {
           match['自訂名片設定'] = payloadData['自訂名片設定'];
           match['名片圖檔'] = payloadData['名片圖檔'];
           match['服務項目'] = payloadData['服務項目'];
        }
      }
    }
  } catch(e) {
    window.showToast('⚠️ 儲存失敗: ' + e.message, true);
  } finally {
    if (btn) {
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> 儲存';
      btn.disabled = false;
    }
  }
};

/**
 * 傳送數位名片至 LINE
 * @param {string} btnId - 觸發按鈕的 ID
 */
window.shareECardToLine = async function(btnId) {
  if (!window.currentCard) {
    window.showToast('找不到名片資料', true);
    return;
  }

  const btn = document.getElementById(btnId);
  const oriHtml = btn?.innerHTML;
  if (btn) {
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 傳送中...';
    btn.disabled = true;
  }

  try {
    const rowId = window.currentCard.rowId || window.currentCard["rowId"] || window.currentCard.id || "";
    const fallbackUrl = buildECardShareUrl(rowId);
    const layoutVal = document.querySelector('input[name="ecard-layout"]:checked')?.value || 'landscape';
    const cfg = {
      layoutStyle: layoutVal,
      imgUrl: window.currentEcardImgs.landscape || window.currentCard['名片圖檔'] || '',
      imgUrlPortrait: window.currentEcardImgs.portrait,
      imgUrlSquare: window.currentEcardImgs.square,
      imgRatioLandscape: '20:13',
      imgRatioPortrait: window.currentEcardRatios.portrait.replace('/', ':'),
      imgRatioSquare: '1:1',
      desc: document.getElementById('edit-服務項目')?.value || window.currentCard['服務項目'] || '',
      descAlign: window.currentDescAlign || 'center',
      descColor: document.getElementById('edit-desc-color')?.value || '#666666',
      buttons: window.currentEcardButtons
    };

    // 若在「聯絡資料」tab 點擊（ecard UI 可能未初始化），改用已存的設定
    if (!document.getElementById('v1-img-url')?.value) {
      try {
        const saved = JSON.parse(window.currentCard['自訂名片設定'] || '{}');
        Object.assign(cfg, saved);
      } catch(e) {}
    }

    const flexMsg = await window.fetchAPI('buildFlexMessage', {
      card: window.currentCard,
      config: cfg,
      referrerId: window.currentUserProfile?.userId,
      networkId: window.currentNetworkId,
      liffId: window.POINT_LIFF_ID || window.LIFF_ID
    }, true);

    if (flexMsg) {
      const shared = await window.triggerFlexSharing(flexMsg, "您收到一張數位名片");
      if (shared === false && fallbackUrl) {
        await shareECardPlainLink(fallbackUrl, window.currentCard["姓名"] || "");
      }
    } else if (fallbackUrl) {
      await shareECardPlainLink(fallbackUrl, window.currentCard["姓名"] || "");
    }
  } catch(e) {
    try {
      const rowId = window.currentCard.rowId || window.currentCard["rowId"] || window.currentCard.id || "";
      const fallbackUrl = buildECardShareUrl(rowId);
      if (fallbackUrl) {
        await shareECardPlainLink(fallbackUrl, window.currentCard["姓名"] || "");
      } else {
        window.showToast('⚠️ 傳送失敗: ' + e.message, true);
      }
    } catch (fallbackErr) {
      window.showToast('⚠️ 傳送失敗: ' + (fallbackErr.message || e.message), true);
    }
  } finally {
    if (btn) {
      btn.innerHTML = oriHtml;
      btn.disabled = false;
    }
  }
};

function buildECardShareUrl(rowId) {
  if (!rowId) return "";
  const params = {
    shareCardId: rowId,
    ref: window.currentUserProfile?.userId || "",
    net: window.currentNetworkId || "admin"
  };
  if (window.buildPointLiffUrl) return window.buildPointLiffUrl(params);

  let url = "https://liff.line.me/" + encodeURIComponent(window.POINT_LIFF_ID || window.LIFF_ID || "") +
    "?shareCardId=" + encodeURIComponent(rowId);
  if (params.ref) url += "&ref=" + encodeURIComponent(params.ref);
  if (params.net) url += "&net=" + encodeURIComponent(params.net);
  return url;
}

async function shareECardPlainLink(url, name) {
  const text = (name ? `這是 ${name} 的數位名片` : "這是我的數位名片") + "\n" + url;

  try {
    if (typeof liff !== "undefined" && liff && liff.isLoggedIn && liff.isLoggedIn() && liff.isApiAvailable && liff.isApiAvailable("shareTargetPicker")) {
      await liff.shareTargetPicker([{ type: "text", text }]);
      window.showToast("✅ 已用連結發送名片");
      return true;
    }
  } catch (e) {
    console.warn("[shareECardPlainLink] LIFF text share failed:", e);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(url);
    window.showToast("✅ 名片連結已複製");
    return true;
  }
  window.prompt("請複製名片連結", url);
  return true;
}
