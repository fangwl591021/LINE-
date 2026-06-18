// ✅ 宣告全域變數存放當前編輯的按鈕
window.currentEcardButtons = [];
window.currentEcardImgs = { landscape: '', portrait: '', square: '' };
window.currentEcardRatios = { landscape: '20:13', portrait: '400:600', square: '1:1' };
window.__ecardAutoSyncBound = window.__ecardAutoSyncBound || false;

const ECardAutoDefaults = {
  lineUrl: 'https://lin.ee/y7h8BUF',
  addressUrl: 'https://www.google.com/maps',
  legacyIntroUrl: 'https://lihi2.me/yXhCf'
};

function readECardField(name, fallbackCard) {
  const input = document.getElementById('edit-' + name);
  const live = input ? String(input.value || '').trim() : '';
  if (live) return live;
  return String((fallbackCard || window.currentCard || {})[name] || '').trim();
}

function readECardCardValue(card, keys) {
  const source = card || window.currentCard || {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function parseStoredECardConfig(card) {
  const source = card || {};
  const candidates = [
    source.customConfig,
    source.custom_config,
    source.ecardConfig,
    source['自訂名片設定'],
    source['電子名片設定'],
    source['自訂版面'],
    source['名片設定'],
    source['?芾???閮剖?']
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    if (typeof raw === 'object') return raw;
    try {
      const parsed = JSON.parse(String(raw));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) {}
  }
  return {};
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

function buildGoogleMapsUrl(address) {
  const cleanAddress = String(address || '').trim();
  return cleanAddress
    ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(cleanAddress)
    : ECardAutoDefaults.addressUrl;
}

function normalizeECardActionUriForSave(value) {
  const raw = String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!raw) return { value: '', error: '請輸入按鈕連結。' };

  if (/^mailto:/i.test(raw)) {
    const email = raw.replace(/^mailto:/i, '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { value: 'mailto:' + email };
    return { value: '', error: 'Email 格式錯誤，請確認 @ 與網域。' };
  }

  if (/^tel:/i.test(raw)) {
    const phone = raw.replace(/^tel:/i, '').replace(/[\s().-]/g, '');
    if (/^\+?\d{7,16}$/.test(phone)) return { value: 'tel:' + phone };
    return { value: '', error: '電話格式錯誤，請輸入 7 到 16 碼電話。' };
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return { value: 'mailto:' + raw };
  }

  const compactPhone = raw.replace(/[\s().-]/g, '');
  if (/^\+?\d{7,16}$/.test(compactPhone)) {
    return { value: 'tel:' + compactPhone };
  }

  if (/^(https?:\/\/|line:\/\/)/i.test(raw)) {
    if (/\s/.test(raw)) return { value: '', error: '網址不能包含空白。' };
    return { value: raw };
  }

  if (/^(line\.me|lin\.ee|lihi\d?\.me|maps\.app\.goo\.gl|www\.)/i.test(raw) ||
      /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(raw)) {
    if (/\s/.test(raw)) return { value: '', error: '網址不能包含空白。' };
    return { value: 'https://' + raw };
  }

  return { value: '', error: '連結格式錯誤，請輸入網址、電話或 Email。' };
}

function normalizeECardButtonsForSave(buttons) {
  return (Array.isArray(buttons) ? buttons : []).map((button, index) => {
    const label = String(button?.l || '').trim();
    const uri = String(button?.u || '').trim();
    if (!label && !uri) return null;
    if (!label) throw new Error(`第 ${index + 1} 顆按鈕缺少文字。`);
    const normalized = normalizeECardActionUriForSave(uri);
    if (normalized.error) throw new Error(`第 ${index + 1} 顆按鈕「${label}」${normalized.error}`);
    return {
      l: label,
      u: normalized.value,
      c: /^#[0-9a-f]{6}$/i.test(button?.c || '') ? button.c : '#06C755'
    };
  }).filter(Boolean).slice(0, 4);
}

function getECardButtonKind(button, index) {
  const label = String(button?.l || '').toLowerCase();
  const url = String(button?.u || '').toLowerCase();
  if (label.includes('line') || label.includes('好友') || url.includes('lin.ee') || url.includes('line.me')) return 'line';
  if (label.includes('電話') || label.includes('手機') || url.startsWith('tel:')) return 'phone';
  if (label.includes('地址') || label.includes('地圖') || url.includes('google.com/maps')) return 'address';
  if (label.includes('包租公') || label.includes('簡介') || url.includes('lihi2.me')) return 'address';
  if (index === 0) return 'line';
  if (index === 1) return 'phone';
  if (index === 2) return 'address';
  return 'custom';
}

function buildAutoECardButtons(card, existingButtons) {
  const existing = Array.isArray(existingButtons) ? existingButtons : [];
  const phone = readECardField('\u624b\u6a5f\u865f\u78bc', card) || readECardField('\u516c\u53f8\u96fb\u8a71', card) ||
    readECardCardValue(card, ['mobile', 'phone', 'officePhone', 'office_phone', '\u624b\u6a5f\u865f\u78bc', '\u516c\u53f8\u96fb\u8a71']);
  const social = readECardField('\u793e\u7fa4\u5e33\u865f', card) ||
    readECardCardValue(card, ['socials', 'social', 'lineUrl', 'line_url', '\u793e\u7fa4\u5e33\u865f']);
  const address = readECardField('\u516c\u53f8\u5730\u5740', card) ||
    readECardCardValue(card, ['address', 'companyAddress', 'company_address', '\u516c\u53f8\u5730\u5740']);
  const lineUrl = normalizeUrlValue(social) || ECardAutoDefaults.lineUrl;
  const addressUrl = buildGoogleMapsUrl(address);

  const auto = {
    line: { l: '加LINE好友', u: lineUrl, c: '#06C755' },
    phone: { l: '行動電話', u: normalizeTelValue(phone), c: '#3b82f6' },
    address: { l: '店家地址', u: addressUrl, c: '#1e293b' }
  };

  if (existing.length) {
    return existing.map((button, index) => {
      const kind = getECardButtonKind(button, index);
      const autoButton = auto[kind];
      if (!autoButton) return button;
      return {
        l: resolveECardButtonLabel(kind, button, autoButton.l),
        u: resolveECardButtonUrl(kind, button, autoButton.u),
        c: button?.c || autoButton.c
      };
    });
  }

  const used = new Set();
  const merged = ['line', 'phone', 'address'].map(kind => {
    const foundIndex = existing.findIndex((button, index) => !used.has(index) && getECardButtonKind(button, index) === kind);
    const found = foundIndex >= 0 ? existing[foundIndex] : null;
    if (foundIndex >= 0) used.add(foundIndex);
    return {
      l: resolveECardButtonLabel(kind, found, auto[kind].l),
      u: resolveECardButtonUrl(kind, found, auto[kind].u),
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

function resolveECardButtonLabel(kind, found, autoLabel) {
  const label = String(found?.l || '').trim();
  const url = String(found?.u || '').trim();
  if (!label) return autoLabel;
  if (kind === 'address' && (
    label.includes('包租公') ||
    label.includes('簡介') ||
    label.includes('網站') ||
    label.includes('官網') ||
    url === ECardAutoDefaults.legacyIntroUrl ||
    url.includes('lihi2.me/yXhCf')
  )) return autoLabel;
  return label;
}

function resolveECardButtonUrl(kind, found, autoUrl) {
  const existing = String(found?.u || '').trim();
  const label = String(found?.l || '').trim();
  const auto = String(autoUrl || '').trim();
  if (!existing) return auto;
  if (kind === 'phone' && /^tel:/i.test(existing)) {
    const existingPhone = existing.replace(/^tel:/i, '').replace(/[^0-9+]/g, '');
    if (!existingPhone || /x/i.test(existing)) return auto || existing;
    return existing;
  }
  if (kind === 'line' && existing === ECardAutoDefaults.lineUrl) return auto || existing;
  if (kind === 'address' && (
    label.includes('包租公') ||
    label.includes('簡介') ||
    label.includes('網站') ||
    label.includes('官網') ||
    existing === ECardAutoDefaults.addressUrl ||
    existing === ECardAutoDefaults.legacyIntroUrl ||
    existing.includes('lihi2.me/yXhCf')
  )) return auto || existing;
  return existing;
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
  window.currentEcardButtons = normalizeECardButtonsForSave(window.currentEcardButtons);
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
  const normalized = normalizeECardActionUriForSave(uri);
  if (!normalized.error) return normalized.value;
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
  if (/^https:\/\/photoman\.fangwl591021\.workers\.dev\//i.test(value)) {
    return value.replace(/^https:\/\/photoman\.fangwl591021\.workers\.dev/i, 'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev');
  }
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

function buildECardHeroWithShareBadge(imgUrl, aspectRatio, badgeUrl) {
  const image = {
    type: 'image',
    url: imgUrl,
    size: 'full',
    aspectRatio,
    aspectMode: 'cover'
  };
  if (badgeUrl) image.action = { type: 'uri', uri: badgeUrl };

  const contents = [image];
  const shareActionUrl = appendECardShareMode(badgeUrl);
  if (shareActionUrl) {
    contents.push({
      type: 'box',
      layout: 'vertical',
      position: 'absolute',
      offsetTop: '12px',
      offsetEnd: '12px',
      backgroundColor: '#EF4444',
      cornerRadius: '20px',
      paddingTop: '6px',
      paddingBottom: '6px',
      paddingStart: '14px',
      paddingEnd: '14px',
      contents: [{
        type: 'text',
        text: '分享',
        color: '#FFFFFF',
        size: 'xs',
        weight: 'bold',
        align: 'center'
      }],
      action: { type: 'uri', uri: shareActionUrl }
    });
  }

  return {
    type: 'box',
    layout: 'vertical',
    paddingAll: '0px',
    contents
  };
}

function buildECardShareHeader(badgeUrl) {
  const shareActionUrl = appendECardShareMode(badgeUrl);
  const likeActionUrl = buildECardLikeUrl(badgeUrl);
  if (!shareActionUrl) return undefined;
  return {
    type: 'box',
    layout: 'horizontal',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingAll: '8px',
    contents: [{
      type: 'box',
      layout: 'horizontal',
      alignItems: 'center',
      spacing: 'xs',
      backgroundColor: '#F1F5F9',
      width: '65px',
      height: '25px',
      cornerRadius: '6px',
      paddingStart: '8px',
      paddingEnd: '8px',
      contents: [
        { type: 'text', text: '\uD83D\uDC4D', size: 'xs', flex: 0 },
        { type: 'text', text: '0', weight: 'bold', color: '#334155', size: 'xs', flex: 1 }
      ],
      action: likeActionUrl ? { type: 'uri', uri: likeActionUrl } : undefined
    }, {
      type: 'box',
      layout: 'vertical',
      justifyContent: 'center',
      backgroundColor: '#EF4444',
      width: '65px',
      height: '25px',
      cornerRadius: '25px',
      contents: [{
        type: 'text',
        text: '分享',
        weight: 'bold',
        align: 'center',
        color: '#FFFFFF',
        size: 'xs'
      }],
      action: { type: 'uri', uri: shareActionUrl }
    }]
  };
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
    ? (config.imgRatioPortrait || '400:600')
    : (layoutStyle === 'square' ? (config.imgRatioSquare || '1:1') : (config.imgRatioLandscape || '20:13'));
  const imageAspectMode = 'cover';
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
  buttons = buttons.slice(0, 4);

  return JSON.parse(JSON.stringify({
    type: 'bubble',
    size: layoutStyle === 'portrait' ? 'giga' : 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '8px',
      contents: [{
        type: 'button',
        style: 'primary',
        color: '#EF4444',
        height: 'sm',
        action: shareActionUrl ? { type: 'uri', label: '分享名片', uri: shareActionUrl } : undefined
      }]
    },
    hero: {
      type: 'image',
      url: imgUrl,
      size: 'full',
      aspectRatio,
      aspectMode: imageAspectMode,
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
  const savedConfig = parseStoredECardConfig(card);
  config = Object.assign({}, savedConfig, config || {});
  const layoutStyle = String(config.layoutStyle || config.layout || 'landscape').trim();
  const cardImageUrl = readECardCardValue(card, ['imageUrl', 'image_url', 'cardImage', 'card_image', '\u540d\u7247\u5716\u6a94']);
  const rawImgUrl = layoutStyle === 'portrait'
    ? (config.imgUrlPortrait || config.imgUrl || cardImageUrl)
    : (layoutStyle === 'square'
      ? (config.imgUrlSquare || config.imgUrl || cardImageUrl)
      : (config.imgUrl || config.imgUrlLandscape || cardImageUrl));
  const imgUrl = cleanECardFlexImageUrl(rawImgUrl) || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
  const aspectRatio = layoutStyle === 'portrait'
    ? (config.imgRatioPortrait || '400:600')
    : (layoutStyle === 'square' ? (config.imgRatioSquare || '1:1') : (config.imgRatioLandscape || '20:13'));
  const imageAspectMode = 'cover';
  const badgeUrl = cleanECardFlexHttpsUri(shareUrl || buildECardShareUrl(card.rowId || card.rowID || card.id || ''));
  const cleanVideoUrl = cleanECardFlexHttpsUri(config.videoUrl || config.video_url || config.heroVideoUrl || '');
  const titleText = String(config.title || readECardCardValue(card, ['name', 'title', '\u59d3\u540d']) || '\u6578\u4f4d\u540d\u7247').trim() || '\u6578\u4f4d\u540d\u7247';
  const bodyText = String(config.desc || readECardCardValue(card, ['services', 'description', 'desc', '\u670d\u52d9\u9805\u76ee']) || ' ').trim() || ' ';
  const buttonSource = Array.isArray(config.buttons) && config.buttons.length ? config.buttons : buildAutoECardButtons(card, []);
  let buttons = buttonSource
    .map(btn => ({
      label: String(btn?.l || btn?.label || '').trim(),
      uri: cleanECardFlexUri(btn?.u || btn?.url || btn?.uri),
      color: /^#[0-9a-f]{6}$/i.test(String(btn?.c || btn?.color || '')) ? (btn.c || btn.color) : '#06C755'
    }))
    .filter(btn => btn.label && btn.uri)
    .map(btn => ({
      type: 'button',
      style: 'primary',
      color: btn.color,
      height: 'sm',
      action: { type: 'uri', label: btn.label.substring(0, 40), uri: btn.uri }
    }));

  buttons = buttons.slice(0, 4);

  const bubble = {
    type: 'bubble',
    size: layoutStyle === 'portrait' ? 'giga' : 'mega',
    header: buildECardShareHeader(badgeUrl),
    hero: cleanVideoUrl ? {
      type: 'video',
      url: cleanVideoUrl,
      previewUrl: imgUrl,
      aspectRatio,
      altContent: {
        type: 'image',
        url: imgUrl,
        size: 'full',
        aspectRatio,
        aspectMode: imageAspectMode,
        action: badgeUrl ? { type: 'uri', uri: badgeUrl } : undefined
      }
    } : {
      type: 'image',
      url: imgUrl,
      size: 'full',
      aspectRatio,
      aspectMode: imageAspectMode,
      action: badgeUrl ? { type: 'uri', uri: badgeUrl } : undefined
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '15px',
      contents: [
        {
          type: 'text',
          text: titleText,
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

window.buildLocalECardFlexMessage = buildLocalECardFlexMessage;

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
    landscape: cleanECardFlexImageUrl(cfg.imgUrl || card['名片圖檔'] || ''),
    portrait: cleanECardFlexImageUrl(cfg.imgUrlPortrait || ''),
    square: cleanECardFlexImageUrl(cfg.imgUrlSquare || '')
  };
  
  window.currentEcardRatios = {
    landscape: cfg.imgRatioLandscape || '20:13',
    portrait: cfg.imgRatioPortrait || '400:600',
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
      <div class="border-b border-slate-100 pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <p class="text-[13px] font-black text-slate-700">按鈕 ${i + 1}</p>
          <button type="button" onclick="window.currentEcardButtons.splice(${i},1); window.renderV1Buttons(); window.updateECardPreview()" class="w-11 h-11 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl shrink-0 transition-colors flex items-center justify-center" aria-label="刪除按鈕"><span class="material-symbols-outlined text-[18px]">delete</span></button>
        </div>
        <label class="block">
          <span class="block text-[13px] font-bold text-slate-600 mb-2">按鈕顏色</span>
          <div class="grid grid-cols-[52px_minmax(0,1fr)] gap-3 items-center">
            <input type="color" value="${/^#[0-9a-f]{6}$/i.test(b.c || '') ? b.c : '#06C755'}" class="w-[52px] h-[52px] p-1 cursor-pointer rounded-xl shrink-0 border border-blue-300 bg-white" onchange="window.currentEcardButtons[${i}].c=this.value; var next=this.parentElement.querySelector('.button-color-text'); if(next) next.value=this.value; window.updateECardPreview()">
            <input type="text" value="${escapeHTML(b.c || '#06C755')}" placeholder="#06C755" class="button-color-text min-w-0 w-full text-base font-mono bg-white border border-blue-300 outline-none focus:ring-2 focus:ring-blue-500 rounded-xl px-4 py-3" oninput="window.currentEcardButtons[${i}].c=this.value; window.updateECardPreview()">
          </div>
        </label>
        <label class="block">
          <span class="block text-[13px] font-bold text-slate-600 mb-2">按鈕文字</span>
          <input type="text" value="${escapeHTML(b.l || '')}" placeholder="例如：加入LINE好友" class="min-w-0 w-full text-base font-bold bg-white border border-blue-300 outline-none focus:ring-2 focus:ring-blue-500 rounded-xl px-4 py-3" oninput="window.currentEcardButtons[${i}].l=this.value; window.updateECardPreview()">
        </label>
        <label class="block">
          <span class="block text-[13px] font-bold text-slate-600 mb-2">網址 / 電話 / LINE 連結</span>
          <input type="text" value="${escapeHTML(b.u || '')}" placeholder="https://... 或 tel:0927136847" class="min-w-0 w-full text-base font-mono bg-white border border-blue-300 outline-none focus:ring-2 focus:ring-blue-500 rounded-xl px-4 py-3" oninput="window.currentEcardButtons[${i}].u=this.value; window.updateECardPreview()">
        </label>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" onclick="window.moveV1Button(${i}, -1)" ${i === 0 ? 'disabled' : ''} class="h-11 rounded-xl border border-blue-200 bg-white text-slate-600 flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 transition-transform"><span class="material-symbols-outlined text-[20px]">keyboard_arrow_up</span></button>
          <button type="button" onclick="window.moveV1Button(${i}, 1)" ${i === window.currentEcardButtons.length - 1 ? 'disabled' : ''} class="h-11 rounded-xl border border-blue-200 bg-white text-slate-600 flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 transition-transform"><span class="material-symbols-outlined text-[20px]">keyboard_arrow_down</span></button>
        </div>
      </div>
    `).join('');
  }
};

window.moveV1Button = function(index, direction) {
  const nextIndex = index + direction;
  if (!Array.isArray(window.currentEcardButtons)) return;
  if (nextIndex < 0 || nextIndex >= window.currentEcardButtons.length) return;
  const moved = window.currentEcardButtons.splice(index, 1)[0];
  window.currentEcardButtons.splice(nextIndex, 0, moved);
  window.renderV1Buttons();
  window.updateECardPreview();
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

function ecardLayoutFromImageRatio(ratio, fallback) {
    const text = String(ratio || '').trim();
    const parts = text.match(/^(\d+(?:\.\d+)?)[/:](\d+(?:\.\d+)?)$/);
    const value = parts ? Number(parts[1]) / Number(parts[2]) : Number(text);
    if (text === '1:1' || text === '1/1' || (Number.isFinite(value) && Math.abs(value - 1) < 0.01)) return 'square';
    if (text === '400:600' || text === '400/600' || text === '2:3' || text === '2/3' || (Number.isFinite(value) && Math.abs(value - (400 / 600)) < 0.01)) return 'portrait';
    if (text === '20:13' || text === '20/13' || (Number.isFinite(value) && Math.abs(value - (20 / 13)) < 0.01)) return 'landscape';
    return fallback || 'landscape';
}

function selectOtherECardLayout(layout) {
    const target = document.querySelector('input[name="ecard-layout"][value="' + layout + '"]');
    if (target) target.checked = true;
}

window.setOtherUploadImage = function(url, ratio) {
    const currentLayout = document.querySelector('input[name="ecard-layout"]:checked')?.value || 'landscape';
    const layoutStyle = ratio ? ecardLayoutFromImageRatio(ratio, currentLayout) : currentLayout;
    const cleanUrl = cleanECardFlexImageUrl(url);
    selectOtherECardLayout(layoutStyle);
    window.currentEcardImgs[layoutStyle] = cleanUrl || url;
    if (ratio) window.currentEcardRatios[layoutStyle] = ratio.replace(':', '/');
    const imgInput = document.getElementById('v1-img-url');
    if (imgInput) imgInput.value = window.currentEcardImgs[layoutStyle];
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
  const imgUrl = cleanECardFlexImageUrl(window.currentEcardImgs[layoutStyle]) || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
  
  const descRaw = document.getElementById('edit-服務項目')?.value || '';
  const desc = descRaw.replace(/\n/g, '<br>');
  const color = document.getElementById('edit-desc-color')?.value || '#666666';
  
  let align = 'center';
  
  if (document.getElementById('align-start')?.classList.contains('bg-white')) align = 'left';
  if (document.getElementById('align-end')?.classList.contains('bg-white')) align = 'right';
  if (window.currentDescAlign === 'start') align = 'left';
  if (window.currentDescAlign === 'end') align = 'right';

  let ratio = '20/13';
  if (layoutStyle === 'portrait') ratio = window.currentEcardRatios.portrait.replace(':', '/') || '400/600';
  if (layoutStyle === 'square') ratio = '1/1';
  if (layoutStyle === 'landscape') ratio = '20/13';

  const btnsHtml = window.currentEcardButtons.map(b => 
    `<div class="block py-3 rounded-xl text-white text-center text-[14px] font-black mb-2.5 shadow-sm" style="background:${b.c||'#06C755'}">${escapeHTML(b.l||'按鈕')}</div>`
  ).join('');

  area.innerHTML = `
    <div class="flex flex-col w-full">
      <div class="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-100 bg-white">
        <button type="button" data-social-like-button class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[12px] font-black text-slate-600 active:scale-95 transition-transform">
          <span class="material-symbols-outlined text-[16px] text-amber-500">thumb_up</span>
          <span data-social-like-count>0</span>
        </button>
        <div class="bg-[#EF4444] text-white text-[12px] font-bold px-4 py-1.5 rounded-full shadow-sm">分享</div>
      </div>
      <div class="relative w-full">
        <div class="w-full bg-slate-100 bg-cover bg-center" style="aspect-ratio: ${ratio}; background-image:url('${imgUrl}');"></div>
      </div>
      <div class="p-6 text-center">
        <div class="font-black text-[22px] text-slate-800 mb-2">${escapeHTML(name)}</div>
        <div class="text-[14px] leading-relaxed" style="color: ${color}; text-align: ${align};">${desc}</div>
      </div>
      ${btnsHtml ? `<div class="px-6">${btnsHtml}</div>` : ''}
    </div>
  `;
  const cardId = window.currentCard?.rowId || window.currentCard?.cardRowId || window.currentCard?.id || '';
  if (cardId && typeof window.initSocialLikeWidget === 'function') {
    setTimeout(() => window.initSocialLikeWidget(cardId, window.currentNetworkId || 'admin'), 0);
  }
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

  let cfg;
  try {
    cfg = window.buildECardConfigFromFields();
  } catch (e) {
    window.showToast(e.message || '按鈕連結格式錯誤，請修正後再儲存。', true);
    if (btn) {
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> ?脣?';
      btn.disabled = false;
    }
    return;
  }
  const rowId = window.currentCard.rowId || window.currentCard["rowId"] || window.currentCard.id || "";
  if (!rowId) {
    window.showToast('⚠️ 儲存失敗：找不到名片編號，請重新整理後再試', true);
    if (btn) {
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> 儲存';
      btn.disabled = false;
    }
    return;
  }

  const payloadData = {
    '名片圖檔': cfg.imgUrl,
    '服務項目': cfg.desc,
    '自訂名片設定': JSON.stringify(cfg)
  };

  try {
    const res = await window.fetchAPI('updateCard', { rowId, data: payloadData }, true);
    if (!res || res.error || res.success === false) {
      throw new Error((res && res.error) || '後端沒有確認儲存成功');
    }

    window.showToast('✅ 數位名片設定已成功儲存');

    window.currentCard['自訂名片設定'] = payloadData['自訂名片設定'];
    window.currentCard.customConfig = payloadData['自訂名片設定'];
    window.currentCard['名片圖檔'] = payloadData['名片圖檔'];
    window.currentCard.imageUrl = payloadData['名片圖檔'];
    window.currentCard['服務項目'] = payloadData['服務項目'];
    window.currentCard.services = payloadData['服務項目'];

    if (Array.isArray(window.allCards)) {
      const match = window.allCards.find(c => String(c.rowId || c["rowId"] || c.id || '') === String(rowId));
      if (match) {
        match['自訂名片設定'] = payloadData['自訂名片設定'];
        match.customConfig = payloadData['自訂名片設定'];
        match['名片圖檔'] = payloadData['名片圖檔'];
        match.imageUrl = payloadData['名片圖檔'];
        match['服務項目'] = payloadData['服務項目'];
        match.services = payloadData['服務項目'];
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
      if (shared === false) return;
    } else if (fallbackUrl) {
      window.showToast('無法產生 LINE 名片訊息，請稍後再試', true);
    }
  } catch(e) {
    window.showToast('⚠️ 傳送失敗: ' + (e.message || '請稍後再試'), true);
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

function buildECardLikeUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const cardId = parsed.searchParams.get("shareCardId") || parsed.searchParams.get("cardId") || "";
    if (cardId) {
      parsed.searchParams.delete("shareCardId");
      parsed.searchParams.delete("cardId");
      parsed.searchParams.delete("share");
      parsed.searchParams.set("likeCardId", cardId);
    } else {
      parsed.searchParams.set("like", "1");
    }
    return parsed.toString();
  } catch (e) {
    return url;
  }
}

function routeECardFlexHeaderShareToPicker(flexMsg, shareUrl) {
  const actionUrl = appendECardShareMode(shareUrl);
  if (!flexMsg || !actionUrl) return flexMsg;
  try {
    if (flexMsg.header && Array.isArray(flexMsg.header.contents) && flexMsg.header.contents.length) {
      const headerItem = flexMsg.header.contents[flexMsg.header.contents.length - 1];
      const action = headerItem.action || {};
      headerItem.action = headerItem.type === "button"
        ? { type: "uri", label: action.label || "分享名片", uri: actionUrl }
        : { type: "uri", uri: actionUrl };
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
