// ✅ 宣告全域變數存放當前編輯的按鈕
window.currentEcardButtons = [];
window.currentEcardImgs = { landscape: '', portrait: '', square: '' };
window.currentEcardRatios = { landscape: '20:13', portrait: '2:3', square: '1:1' };
window.__ecardAutoSyncBound = window.__ecardAutoSyncBound || false;

const ECardAutoDefaults = {
  lineUrl: 'https://lin.ee/y7h8BUF',
  introUrl: 'https://lihi2.me/yXhCf'
};

function readECardField(name, fallbackCard) {
  const input = document.getElementById('edit-' + name);
  const live = input ? String(input.value || '').trim() : '';
  if (live) return live;
  return String((fallbackCard || window.currentCard || {})[name] || '').trim();
}

function normalizeTelValue(value) {
  const clean = String(value || '').replace(/[^0-9+]/g, '');
  return clean ? 'tel:' + clean : 'tel:XXXXXXXXXX';
}

function normalizeUrlValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/https?:\/\/[^\s,，;；]+/i);
  if (match) return match[0];
  if (/^line\.me|^lin\.ee/i.test(raw)) return 'https://' + raw;
  return '';
}

function getECardButtonKind(button, index) {
  const label = String(button?.l || '').toLowerCase();
  const url = String(button?.u || '').toLowerCase();
  if (label.includes('line') || label.includes('好友') || url.includes('lin.ee') || url.includes('line.me')) return 'line';
  if (label.includes('電話') || label.includes('手機') || url.startsWith('tel:')) return 'phone';
  if (label.includes('簡介') || label.includes('網站') || label.includes('官網') || url.includes('lihi2.me')) return 'intro';
  if (index === 0) return 'line';
  if (index === 1) return 'phone';
  if (index === 2) return 'intro';
  return 'custom';
}

function buildAutoECardButtons(card, existingButtons) {
  const existing = Array.isArray(existingButtons) ? existingButtons : [];
  const phone = readECardField('手機號碼', card) || readECardField('公司電話', card);
  const social = readECardField('社群帳號', card);
  const companyUrl = normalizeUrlValue(readECardField('公司網址', card));
  const lineUrl = normalizeUrlValue(social) || ECardAutoDefaults.lineUrl;
  const introUrl = companyUrl || ECardAutoDefaults.introUrl;

  const auto = {
    line: { l: '加LINE好友', u: lineUrl, c: '#06C755' },
    phone: { l: '行動電話', u: normalizeTelValue(phone), c: '#3b82f6' },
    intro: { l: companyUrl ? '公司網站' : '數位包租公簡介', u: introUrl, c: '#1e293b' }
  };

  const used = new Set();
  const merged = ['line', 'phone', 'intro'].map(kind => {
    const foundIndex = existing.findIndex((button, index) => !used.has(index) && getECardButtonKind(button, index) === kind);
    const found = foundIndex >= 0 ? existing[foundIndex] : null;
    if (foundIndex >= 0) used.add(foundIndex);
    return {
      l: found?.l || auto[kind].l,
      u: auto[kind].u || found?.u || '',
      c: found?.c || auto[kind].c
    };
  });

  existing.forEach((button, index) => {
    if (!used.has(index) && getECardButtonKind(button, index) === 'custom') {
      merged.push(button);
    }
  });

  return merged;
}

window.syncECardButtonsFromFields = function(options = {}) {
  if (!window.currentCard && !options.card) return window.currentEcardButtons || [];
  window.currentEcardButtons = buildAutoECardButtons(options.card || window.currentCard, window.currentEcardButtons);
  if (options.render !== false) {
    window.renderV1Buttons();
    window.updateECardPreview();
  }
  return window.currentEcardButtons;
};

window.buildECardConfigFromFields = function() {
  const layoutVal = document.querySelector('input[name="ecard-layout"]:checked')?.value || 'landscape';
  window.syncECardButtonsFromFields({ render: false });
  return {
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
};

function cleanECardFlexUri(uri) {
  const value = String(uri || '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^line:\/\//i.test(value)) return value;
  if (/^tel:/i.test(value)) {
    const phone = value.replace(/^tel:/i, '').replace(/[^0-9+]/g, '');
    return phone ? 'tel:' + phone : '';
  }
  if (/^(line\.me|lin\.ee|lihi\d?\.me)/i.test(value)) return 'https://' + value;
  return '';
}

function toAbsoluteECardUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return 'https:' + value;
  if (/^(line\.me|lin\.ee|lihi\d?\.me)/i.test(value)) return 'https://' + value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  try {
    const path = window.location.pathname || '/LINE-/';
    const basePath = path.endsWith('/') ? path : path.replace(/\/[^/]*$/, '/');
    return new URL(value, window.location.origin + basePath).toString();
  } catch (e) {
    return value;
  }
}

function cleanECardFlexImageUrl(url) {
  const value = toAbsoluteECardUrl(url);
  return /^https:\/\//i.test(value) ? value : '';
}

function cleanECardFlexHttpsUri(uri) {
  const value = toAbsoluteECardUrl(uri);
  return /^https:\/\//i.test(value) ? value : '';
}

function buildLocalECardFlexMessageLegacy(card, config, shareUrl) {
  const layoutStyle = String(config.layoutStyle || config.layout || 'landscape').trim();
  const rawImgUrl = (
    layoutStyle === 'portrait' ? (config.imgUrlPortrait || config.imgUrl || card['名片圖檔']) :
    layoutStyle === 'square' ? (config.imgUrlSquare || config.imgUrl || card['名片圖檔']) :
    (config.imgUrl || config.imgUrlLandscape || card['名片圖檔'])
  );
  const imgUrl = cleanECardFlexImageUrl(rawImgUrl) || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
  const aspectRatio = layoutStyle === 'portrait'
    ? (config.imgRatioPortrait || '2:3')
    : (layoutStyle === 'square' ? (config.imgRatioSquare || '1:1') : (config.imgRatioLandscape || '20:13'));
  const badgeUrl = cleanECardFlexHttpsUri(shareUrl || buildECardShareUrl(card.rowId || card.rowID || card.id || ''));
  const shareActionUrl = appendECardShareMode(badgeUrl);
  let buttons = (Array.isArray(config.buttons) ? config.buttons : [])
    .map(btn => ({
      label: String(btn?.l || '').trim(),
      uri: cleanECardFlexUri(btn?.u),
      color: btn?.c || '#06C755'
    }))
    .filter(btn => btn.label && btn.uri)
    .map(btn => ({
      type: 'button',
      style: 'primary',
      color: btn.color,
      height: 'sm',
      action: { type: 'uri', label: btn.label.substring(0, 40), uri: btn.uri }
    }));
  if (badgeUrl) {
    buttons.unshift({
      type: 'button',
      style: 'primary',
      color: '#1D4ED8',
      height: 'sm',
      action: { type: 'uri', label: '\u67e5\u770b\u540d\u7247', uri: badgeUrl }
    });
  }
  buttons = buttons.slice(0, 4);

  return JSON.parse(JSON.stringify({
    type: 'bubble',
    size: layoutStyle === 'portrait' ? 'giga' : 'mega',
    header: {
      type: 'box',
      layout: 'horizontal',
      justifyContent: 'flex-end',
      paddingAll: '8px',
      contents: [{
        type: 'box',
        layout: 'vertical',
        justifyContent: 'center',
        backgroundColor: '#FF0000',
        width: '65px',
        height: '25px',
        cornerRadius: '25px',
        contents: [{ type: 'text', text: '分享', weight: 'bold', align: 'center', color: '#FFFFFF', size: 'xs' }],
        action: shareActionUrl ? { type: 'uri', uri: shareActionUrl } : undefined
      }]
    },
    hero: {
      type: 'image',
      url: imgUrl,
      size: 'full',
      aspectRatio,
      aspectMode: 'cover',
      action: badgeUrl ? { type: 'uri', uri: badgeUrl } : undefined
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '15px',
      contents: [
        { type: 'text', text: String(config.title || card['姓名'] || ' ').trim() || ' ', weight: 'bold', size: 'xl', align: 'center', wrap: true },
        { type: 'text', text: String(config.desc || card['服務項目'] || ' ').trim() || ' ', size: 'sm', margin: 'md', color: config.descColor || '#666666', wrap: true, align: config.descAlign || 'center' }
      ]
    },
    footer: buttons.length ? { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '10px', contents: buttons } : undefined
  }));
}

function buildLocalECardFlexMessage(card, config, shareUrl) {
  const layoutStyle = String(config.layoutStyle || config.layout || 'landscape').trim();
  const rawImgUrl = layoutStyle === 'portrait'
    ? (config.imgUrlPortrait || config.imgUrl || card['名片圖檔'])
    : (layoutStyle === 'square'
      ? (config.imgUrlSquare || config.imgUrl || card['名片圖檔'])
      : (config.imgUrl || config.imgUrlLandscape || card['名片圖檔']));
  const imgUrl = cleanECardFlexImageUrl(rawImgUrl) || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
  const aspectRatio = layoutStyle === 'portrait'
    ? (config.imgRatioPortrait || '2:3')
    : (layoutStyle === 'square' ? (config.imgRatioSquare || '1:1') : (config.imgRatioLandscape || '20:13'));
  const badgeUrl = cleanECardFlexHttpsUri(shareUrl || buildECardShareUrl(card.rowId || card.rowID || card.id || ''));
  const bodyText = String(config.desc || card['描述'] || card['服務項目'] || ' ').trim() || ' ';
  let buttons = (Array.isArray(config.buttons) ? config.buttons : [])
    .map(btn => ({
      label: String(btn?.l || '').trim(),
      uri: cleanECardFlexUri(btn?.u),
      color: /^#[0-9a-f]{6}$/i.test(String(btn?.c || '')) ? btn.c : '#06C755'
    }))
    .filter(btn => btn.label && btn.uri)
    .map(btn => ({
      type: 'button',
      style: 'primary',
      color: btn.color,
      height: 'sm',
      action: { type: 'uri', label: btn.label.substring(0, 40), uri: btn.uri }
    }));

  if (badgeUrl) {
    buttons.unshift({
      type: 'button',
      style: 'primary',
      color: '#1D4ED8',
      height: 'sm',
      action: { type: 'uri', label: '查看名片', uri: badgeUrl }
    });
  }
  buttons = buttons.slice(0, 4);

  const bubble = {
    type: 'bubble',
    size: layoutStyle === 'portrait' ? 'giga' : 'mega',
    hero: {
      type: 'image',
      url: imgUrl,
      size: 'full',
      aspectRatio,
      aspectMode: 'cover'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '15px',
      contents: [
        {
          type: 'text',
          text: String(config.title || card['姓名'] || '數位名片').trim() || '數位名片',
          weight: 'bold',
          size: 'xl',
          align: 'center',
          wrap: true
        },
        {
          type: 'text',
          text: bodyText,
          size: 'sm',
          margin: 'md',
          color: /^#[0-9a-f]{6}$/i.test(String(config.descColor || '')) ? config.descColor : '#666666',
          wrap: true,
          align: ['start', 'end', 'center'].includes(config.descAlign) ? config.descAlign : 'center'
        }
      ]
    }
  };
  if (badgeUrl) bubble.hero.action = { type: 'uri', uri: badgeUrl };
  if (buttons.length) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '10px',
      contents: buttons
    };
  }
  return bubble;
}

function bindECardFieldAutoSync() {
  if (window.__ecardAutoSyncBound) return;
  window.__ecardAutoSyncBound = true;
  document.addEventListener('input', function(evt) {
    const id = evt.target && evt.target.id;
    if (!['edit-手機號碼', 'edit-公司電話', 'edit-公司網址', 'edit-社群帳號', 'edit-服務項目'].includes(id)) return;
    if (typeof window.syncECardButtonsFromFields === 'function') {
      window.syncECardButtonsFromFields({ render: true });
    }
  });
}

/**
 * 載入名片設定到 UI (請確保在 cards.js 的 openCardDetail 中呼叫此函數)
 * 範例呼叫: window.initECardSettings(cardData);
 */
window.initECardSettings = function(card) {
  if (!card) return;
  bindECardFieldAutoSync();

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
  window.currentEcardButtons = buildAutoECardButtons(card, Array.isArray(cfg.buttons) ? cfg.buttons : []);
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
    <div class="flex flex-col w-full">
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

  const cfg = window.buildECardConfigFromFields();

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
    const cfg = window.buildECardConfigFromFields();
    if (!cfg.imgUrl) cfg.imgUrl = window.currentCard['名片圖檔'] || '';
    if (!cfg.desc) cfg.desc = window.currentCard['服務項目'] || '';

    // 若在「聯絡資料」tab 點擊（ecard UI 可能未初始化），改用已存的設定
    if (!document.getElementById('v1-img-url')?.value) {
      try {
        const saved = JSON.parse(window.currentCard['自訂名片設定'] || '{}');
        Object.assign(cfg, saved);
        cfg.buttons = buildAutoECardButtons(window.currentCard, saved.buttons || cfg.buttons || []);
      } catch(e) {}
    }

    const flexMsg = buildLocalECardFlexMessage(window.currentCard, cfg, fallbackUrl);
    if (flexMsg) {
      routeECardFlexHeaderShareToPicker(flexMsg, fallbackUrl);
      window.__lastECardShareMessages = [{
        type: 'flex',
        altText: '\u60a8\u6536\u5230\u4e00\u5f35\u6578\u4f4d\u540d\u7247',
        contents: flexMsg
      }];
      window.getLastECardShareJson = function() {
        return JSON.stringify(window.__lastECardShareMessages, null, 2);
      };
      window.getLastECardSimulatorJson = function() {
        return JSON.stringify(flexMsg, null, 2);
      };
      console.log('[shareECardToLine] shareTargetPicker messages:', window.__lastECardShareMessages);
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

function appendECardShareMode(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("share", "1");
    return parsed.toString();
  } catch (e) {
    return url + (url.includes("?") ? "&" : "?") + "share=1";
  }
}

function routeECardFlexHeaderShareToPicker(flexMsg, shareUrl) {
  const actionUrl = appendECardShareMode(shareUrl);
  if (!flexMsg || !actionUrl) return flexMsg;
  try {
    if (flexMsg.header && Array.isArray(flexMsg.header.contents) && flexMsg.header.contents[0]) {
      flexMsg.header.contents[0].action = { type: "uri", uri: actionUrl };
    }
  } catch (e) {
    console.warn("[routeECardFlexHeaderShareToPicker] failed:", e);
  }
  return flexMsg;
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
