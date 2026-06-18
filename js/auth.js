/* ==================== 系統啟動與權限驗證 ==================== */

if (typeof window.addUserSocial !== 'function') {
  window.addUserSocial = function(type = 'LINE', url = '') {
    window.userSocials = Array.isArray(window.userSocials) ? window.userSocials : [];
    window.userSocials.push({ t: type, u: url });
    if (String(type || '').toUpperCase() === 'PROFILE_AVATAR') return;
    const list = document.getElementById('user-socials-list');
    if (!list) return;
    const idx = window.userSocials.length - 1;
    const row = document.createElement('div');
    row.className = 'grid grid-cols-[86px_1fr_auto] gap-2 items-center';
    row.innerHTML =
      '<select class="bg-slate-50 rounded-xl px-2 py-2 text-[13px] font-bold text-slate-600">' +
        ['LINE','FB','IG','YT','WEB'].map(v => '<option value="' + v + '"' + (v === type ? ' selected' : '') + '>' + v + '</option>').join('') +
      '</select>' +
      '<input type="text" class="bg-slate-50 rounded-xl px-3 py-2 text-[13px] text-slate-600 outline-none" value="' + String(url || '').replace(/"/g, '&quot;') + '" placeholder="連結網址">' +
      '<button type="button" class="px-2 py-2 rounded-xl bg-red-50 text-red-500 font-bold">刪除</button>';
    const select = row.querySelector('select');
    const input = row.querySelector('input');
    const remove = row.querySelector('button');
    select.onchange = () => { if (window.userSocials[idx]) window.userSocials[idx].t = select.value; };
    input.oninput = () => { if (window.userSocials[idx]) window.userSocials[idx].u = input.value; };
    remove.onclick = () => { window.userSocials[idx] = null; row.remove(); };
    list.appendChild(row);
  };
}

window.addUserSocial = function(type = 'LINE', url = '') {
  window.userSocials = Array.isArray(window.userSocials) ? window.userSocials : [];
  window.userSocials.push({ t: type, u: url });
  if (String(type || '').toUpperCase() === 'PROFILE_AVATAR') return;
  const list = document.getElementById('user-socials-list');
  if (!list) return;
  const idx = window.userSocials.length - 1;
  const row = document.createElement('div');
  row.className = 'user-social-row rounded-2xl bg-slate-50/70 border border-slate-200 p-3 space-y-2';
  row.dataset.socialIndex = String(idx);
  row.innerHTML =
    '<div class="flex items-center gap-2">' +
      '<select class="user-social-type min-w-0 flex-1 bg-white border border-blue-200 rounded-xl px-3 py-3 text-[14px] font-bold text-slate-700 outline-none focus:border-blue-500">' +
        ['LINE','FB','IG','YT','WEB'].map(v => '<option value="' + v + '"' + (v === type ? ' selected' : '') + '>' + v + '</option>').join('') +
      '</select>' +
      '<button type="button" class="shrink-0 px-3 py-3 rounded-xl bg-red-50 text-red-500 font-bold">刪除</button>' +
    '</div>' +
    '<input type="text" class="user-social-url w-full bg-white border border-blue-200 rounded-xl px-3 py-3 text-[14px] text-slate-700 outline-none focus:border-blue-500" value="' + String(url || '').replace(/"/g, '&quot;') + '" placeholder="連結網址">';
  const select = row.querySelector('select');
  const input = row.querySelector('input');
  const remove = row.querySelector('button');
  select.onchange = () => { if (window.userSocials[idx]) window.userSocials[idx].t = select.value; };
  input.oninput = () => { if (window.userSocials[idx]) window.userSocials[idx].u = input.value; };
  remove.onclick = () => { window.userSocials[idx] = null; row.remove(); };
  list.appendChild(row);
};

function parseSocialArrayForSettings(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

function collectVisibleUserSocials() {
  const rows = Array.from(document.querySelectorAll('#user-socials-list .user-social-row'));
  return rows.map(row => ({
    t: String(row.querySelector('.user-social-type')?.value || '').trim() || 'WEB',
    u: String(row.querySelector('.user-social-url')?.value || '').trim()
  })).filter(item => item.u);
}

window.saveUserSettings = async function(event) {
  if (event) event.preventDefault();
  const btn = event?.currentTarget || null;
  const userId = window.currentUserProfile?.userId || window.currentUser?.userId || window.currentUser?.lineId || '';
  if (!userId) return window.showToast?.('找不到登入會員，請重新開啟 LIFF', true);

  const existingSocials = parseSocialArrayForSettings(window.currentUser?.socials || window.userSocials || []);
  const hiddenSocials = existingSocials.filter(item => String(item && item.t || '').toUpperCase() === 'PROFILE_AVATAR');
  const socials = [...hiddenSocials, ...collectVisibleUserSocials()];
  window.userSocials = socials.slice();

  const payload = {
    userId,
    name: window.currentUser?.name || window.currentUserProfile?.displayName || '',
    phone: window.currentUser?.phone || '',
    industry: window.currentUser?.industry || '',
    birthday: window.currentUser?.birthday || '',
    role: window.currentUser?.role || window.userRole || 'user',
    storeId: window.currentUser?.storeId || window.currentUser?.storeid || '',
    referrerId: window.currentUser?.referrerId || window.currentUser?.referrer_id || '',
    networkId: window.currentUser?.networkId || window.currentNetworkId || 'admin',
    socials: JSON.stringify(socials),
    tgToken: document.getElementById('setting-tg-token')?.value?.trim() || window.currentUser?.tgToken || '',
    tgChatId: document.getElementById('setting-tg-chatid')?.value?.trim() || window.currentUser?.tgChatId || ''
  };

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  }

  try {
    const saved = await window.fetchAPI('updateUserProfile', payload, true);
    if (!saved || saved.error) throw new Error(saved?.error || '儲存失敗');
    const refreshed = await window.fetchAPI('checkUser', { userId }, true).catch(() => null);
    const info = refreshed && refreshed.isRegistered && refreshed.info
      ? refreshed.info
      : { ...(window.currentUser || {}), ...payload };
    info.socials = info.socials || payload.socials;
    window.applyRegisteredUserSession?.(info);
    try {
      localStorage.setItem('ACTMASTER_USER_' + userId, JSON.stringify({ info, savedAt: Date.now() }));
    } catch (e) {}
    window.showToast?.('設定已儲存');
  } catch (e) {
    window.showToast?.((e && e.message) || '設定儲存失敗', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml || '<span class="material-symbols-outlined text-[18px]">save</span> 儲存';
    }
  }
};

function getReferralStorageKey(userId) {
  return 'ACTMASTER_FIRST_REF_' + String(userId || 'guest');
}

function readFirstReferral(userId) {
  try {
    return JSON.parse(localStorage.getItem(getReferralStorageKey(userId)) || 'null') || null;
  } catch (e) {
    return null;
  }
}

function writeFirstReferral(userId, referrerId, networkId) {
  if (!userId || !referrerId || referrerId === userId) return readFirstReferral(userId);
  const existing = readFirstReferral(userId);
  if (existing && existing.referrerId) return existing;
  const data = { referrerId, networkId: networkId || 'admin', savedAt: Date.now() };
  try {
    localStorage.setItem(getReferralStorageKey(userId), JSON.stringify(data));
  } catch (e) {}
  return data;
}

function resolveReferralForRegistration(urlRef, urlNet) {
  const userId = window.currentUserProfile?.userId || '';
  const first = readFirstReferral(userId) || writeFirstReferral(userId, urlRef || '', urlNet || 'admin') || {};
  return {
    referrerId: first.referrerId || urlRef || '',
    networkId: first.networkId || urlNet || 'admin'
  };
}

function trackManualInputField(id) {
  const el = document.getElementById(id);
  if (!el || el.dataset.manualInputTracked === '1') return;
  el.dataset.manualInputTracked = '1';
  const markTouched = () => {
    el.dataset.userTouched = '1';
  };
  el.addEventListener('beforeinput', markTouched);
  el.addEventListener('input', markTouched);
  el.addEventListener('compositionend', markTouched);
  el.addEventListener('change', markTouched);
}

function setInputValueUnlessTouched(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const next = String(value || '').trim();
  if (!next) return;
  if (el.dataset.userTouched === '1' && String(el.value || '').trim()) return;
  el.value = next;
}

window.prepareRegistrationInputs = function() {
  [
    'reg-name',
    'reg-phone',
    'reg-industry',
    'reg-birthday',
    'claim-name',
    'claim-phone',
    'claim-company',
    'claim-title',
    'profile-name',
    'profile-phone',
    'profile-industry',
    'profile-birthday'
  ].forEach(trackManualInputField);
};

function removeAutoShareParamsFromUrl() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('share');
    url.searchParams.delete('autoShare');
    url.searchParams.delete('action');
    window.history.replaceState({}, document.title, url.toString());
  } catch (e) {}
}

function buildCardShareConfig(card) {
  let cfg = {};
  const candidates = [
    card?.customConfig,
    card?.custom_config,
    card?.ecardConfig,
    card?.['自訂名片設定'],
    card?.['電子名片設定'],
    card?.['自訂版面'],
    card?.['名片設定']
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    if (typeof raw === 'object') {
      cfg = raw || {};
      break;
    }
    try {
      cfg = JSON.parse(String(raw)) || {};
      break;
    } catch (e) {}
  }
  return {
    ...cfg,
    layoutStyle: cfg.layoutStyle || cfg.layout || 'landscape',
    imgUrl: cfg.imgUrl || card?.['名片圖檔'] || '',
    imgUrlPortrait: cfg.imgUrlPortrait || '',
    imgUrlSquare: cfg.imgUrlSquare || '',
    imgRatioLandscape: cfg.imgRatioLandscape || '20:13',
    imgRatioPortrait: cfg.imgRatioPortrait || '2:3',
    imgRatioSquare: cfg.imgRatioSquare || '1:1',
    desc: cfg.desc || card?.['服務項目'] || '',
    descAlign: cfg.descAlign || 'center',
    descColor: cfg.descColor || '#666666',
    buttons: Array.isArray(cfg.buttons) ? cfg.buttons : []
  };
}

function buildPlainCardViewUrl(card, referrerId, networkId) {
  const cardId = card?.rowId || card?.['rowId'] || card?.id || '';
  if (!cardId) return '';
  if (window.buildPointLiffUrl) {
    return window.buildPointLiffUrl({
      shareCardId: cardId,
      ref: referrerId || '',
      net: networkId || 'admin'
    });
  }
  let url = 'https://liff.line.me/' + encodeURIComponent(window.POINT_LIFF_ID || window.LIFF_ID || '') +
    '?shareCardId=' + encodeURIComponent(cardId);
  if (referrerId) url += '&ref=' + encodeURIComponent(referrerId);
  if (networkId) url += '&net=' + encodeURIComponent(networkId);
  return url;
}

async function sharePlainCardViewUrl(card, referrerId, networkId) {
  const url = buildPlainCardViewUrl(card, referrerId, networkId);
  if (!url) return false;
  const text = '這是數位名片' + (card?.['姓名'] ? '：' + card['姓名'] : '') + '\n' + url;
  try {
    if (typeof liff !== 'undefined' && liff && liff.isLoggedIn && liff.isLoggedIn() && liff.isApiAvailable && liff.isApiAvailable('shareTargetPicker')) {
      await liff.shareTargetPicker([{ type: 'text', text }]);
      window.showToast?.('✅ 已用連結分享名片');
      return true;
    }
  } catch (e) {
    console.warn('[sharePlainCardViewUrl] shareTargetPicker failed:', e);
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      window.showToast?.('✅ 名片連結已複製');
      return true;
    }
  } catch (e) {}
  window.prompt('請複製名片連結', url);
  return true;
}

function appendCardAutoShareMode(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('share', '1');
    return parsed.toString();
  } catch (e) {
    return url + (url.includes('?') ? '&' : '?') + 'share=1';
  }
}

function routeSharedCardBadgeToPicker(flexMsg, shareUrl) {
  const actionUrl = appendCardAutoShareMode(shareUrl);
  if (!flexMsg || !actionUrl) return flexMsg;
  try {
    if (flexMsg.header && Array.isArray(flexMsg.header.contents) && flexMsg.header.contents.length) {
      const first = flexMsg.header.contents[flexMsg.header.contents.length - 1];
      const oldAction = first.action || {};
      first.action = first.type === 'button'
        ? { type: 'uri', label: oldAction.label || '分享名片', uri: actionUrl }
        : { type: 'uri', uri: actionUrl };
    }
  } catch (e) {
    console.warn('[routeSharedCardBadgeToPicker] failed:', e);
  }
  return flexMsg;
}

async function loadCardByPublicId(cardId) {
  const rowId = String(cardId || '').trim();
  if (!rowId) return null;
  try {
    const result = await window.fetchAPI('getPublicCardById', { rowId }, true);
    const card = result && (result.card || result.data || result);
    if (card && (card.rowId || card.id || card.cardId)) return card;
  } catch (e) {
    console.warn('[loadCardByPublicId] public lookup failed:', e);
  }
  try {
    const cData = await window.fetchAPI('getCardContacts', { networkId: 'admin', role: 'admin', userId: '', limit: 500 }, true);
    const cards = Array.isArray(cData) ? cData : (Array.isArray(cData?.data) ? cData.data : []);
    return cards.find(c => String(c.rowId || c.id || c.cardId) === rowId) || null;
  } catch (e) {
    console.warn('[loadCardByPublicId] fallback lookup failed:', e);
    return null;
  }
}

async function buildFlexForCardLink(card, options = {}) {
  const referrerId = options.referrerId || window.currentUserProfile?.userId || '';
  const networkId = options.networkId || window.currentNetworkId || 'admin';
  const shareUrl = buildPlainCardViewUrl(card, referrerId, networkId);
  const shareConfig = buildCardShareConfig(card);
  let flexMsg = null;

  if (typeof window.buildLocalECardFlexMessage === 'function') {
    flexMsg = window.buildLocalECardFlexMessage(card, shareConfig, shareUrl);
  } else {
    flexMsg = await window.fetchAPI('buildFlexMessage', {
      card,
      config: shareConfig,
      referrerId,
      networkId,
      liffId: window.POINT_LIFF_ID || window.DEFAULT_LIFF_ID || window.LIFF_ID
    }, false);
  }

  if (!flexMsg || flexMsg.error) {
    throw new Error(flexMsg?.error || '無法產生 LINE 名片訊息');
  }
  await enrichSharedCardLikeCount(flexMsg, card, networkId);
  routeSharedCardBadgeToPicker(flexMsg, shareUrl);
  return flexMsg;
}

async function enrichSharedCardLikeCount(flexMsg, card, networkId) {
  const cardId = String(card?.rowId || card?.cardRowId || card?.id || '').trim();
  if (!cardId || !flexMsg?.header?.contents?.[0]?.contents || typeof window.fetchAPI !== 'function') return flexMsg;
  try {
    const res = await window.fetchAPI('getSocialLikeStats', {
      shareCardId: cardId,
      networkId: networkId || window.currentNetworkId || 'admin'
    }, true);
    const data = res && (res.data || res);
    const count = String(Math.max(0, Number(data?.totalLikes || 0) || 0));
    const likeContents = flexMsg.header.contents[0].contents;
    if (likeContents[1] && likeContents[1].type === 'text') likeContents[1].text = count;
  } catch (e) {
    console.warn('[enrichSharedCardLikeCount] skipped:', e.message || e);
  }
  return flexMsg;
}

window.shareCardFromLink = async function(card, options = {}) {
  if (!card || window.__autoSharingCardFromLink) return false;
  window.__autoSharingCardFromLink = true;
  const referrerId = options.referrerId || window.currentUserProfile?.userId || '';
  const networkId = options.networkId || window.currentNetworkId || 'admin';

  try {
    const flexMsg = await buildFlexForCardLink(card, { referrerId, networkId });
    const shared = await window.triggerFlexSharing(flexMsg, card['姓名'] || '數位名片');
    if (shared === false) {
      window.showToast?.('此環境無法開啟 LINE 通訊錄，請在 LINE 內重新開啟', true);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[shareCardFromLink] flex share failed:', e);
    window.showToast?.(e.message || '名片分享失敗，請稍後再試', true);
    return false;
  } finally {
    removeAutoShareParamsFromUrl();
    window.__autoSharingCardFromLink = false;
  }
};

async function sendCardToCurrentChat(card, options = {}) {
  const flexMsg = await buildFlexForCardLink(card, options);
  if (typeof liff === 'undefined' || !liff || typeof liff.sendMessages !== 'function') {
    throw new Error('此網址必須在 LINE 聊天室內開啟才能傳送');
  }
  if (liff.permission && typeof liff.permission.query === 'function') {
    let permissionState = '';
    try {
      const permission = await liff.permission.query('chat_message.write');
      permissionState = permission && permission.state;
      if (permissionState !== 'granted' && typeof liff.permission.requestAll === 'function') {
        await liff.permission.requestAll();
        const nextPermission = await liff.permission.query('chat_message.write');
        permissionState = nextPermission && nextPermission.state;
      }
    } catch (permissionError) {
      console.warn('[sendCardToCurrentChat] chat_message.write permission check failed:', permissionError);
    }
    if (permissionState && permissionState !== 'granted') {
      throw new Error('LIFF 尚未開啟聊天室傳送權限 chat_message.write，請先到 LINE Developers 補上權限');
    }
  }
  await liff.sendMessages([{
    type: 'flex',
    altText: (card?.['姓名'] || card?.name || '數位名片') + ' 的電子名片',
    contents: flexMsg
  }]);
  window.showToast?.('已傳送到目前聊天室');
  return true;
}

async function handleAutoShareCardEntry(shareCardId, refId, netId) {
  if (!shareCardId) return false;
  const loadingText = document.getElementById('loading-text');
  if (loadingText) loadingText.innerText = '正在開啟 LINE 分享...';

  try {
    const sc = await loadCardByPublicId(shareCardId);
    if (!sc) throw new Error('找不到要分享的名片');

    const shared = await window.shareCardFromLink(sc, {
      referrerId: window.currentUserProfile?.userId || refId || '',
      networkId: netId || 'admin'
    });
    if (shared && typeof window.closeActmasterLiffOrHome === 'function') {
      window.closeActmasterLiffOrHome(600);
    }
    return true;
  } catch (e) {
    console.warn('[handleAutoShareCardEntry] failed:', e);
    window.showToast?.(e.message || '分享名片失敗，請稍後再試', true);
    return false;
  } finally {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.classList.add('hidden');
  }
}

async function handleAutoSendCardEntry(shareCardId, refId, netId) {
  if (!shareCardId) return false;
  const loadingText = document.getElementById('loading-text');
  if (loadingText) loadingText.innerText = '正在傳送名片到聊天室...';

  try {
    const sc = await loadCardByPublicId(shareCardId);
    if (!sc) throw new Error('找不到要傳送的名片');
    const sent = await sendCardToCurrentChat(sc, {
      referrerId: window.currentUserProfile?.userId || refId || '',
      networkId: netId || 'admin'
    });
    if (sent && typeof window.closeActmasterLiffOrHome === 'function') {
      window.closeActmasterLiffOrHome(600);
    }
    return true;
  } catch (e) {
    console.warn('[handleAutoSendCardEntry] failed:', e);
    const message = String(e && (e.message || e) || '');
    if (message.includes('permission is not in LIFF app scope')) {
      window.showToast?.('LIFF 缺少 chat_message.write 權限，無法直接傳送到聊天室', true);
    } else {
      window.showToast?.(message || '傳送名片失敗，請稍後再試', true);
    }
    return false;
  } finally {
    removeAutoShareParamsFromUrl();
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) loadingScreen.classList.add('hidden');
  }
}

function cardTextValue(card, keys, fallback = '') {
  for (const key of keys) {
    const value = card && card[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function cardButtonUrlForWeb(url) {
  const value = String(url || '').trim();
  if (!value) return '#';
  if (/^tel:/i.test(value) || /^mailto:/i.test(value) || /^https?:\/\//i.test(value) || /^line:\/\//i.test(value)) return value;
  if (/^09\d{8}$/.test(value.replace(/[\s-]/g, ''))) return 'tel:' + value.replace(/[\s-]/g, '');
  return value;
}

async function renderStandaloneWebCardPage(webCardId, refId, netId) {
  const app = document.getElementById('app') || document.body;
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.classList.add('hidden');
  document.body.classList.remove('home-page');
  app.innerHTML = '<main class="min-h-screen bg-[#eef2f7] px-4 py-4"><div class="max-w-[320px] mx-auto rounded-3xl bg-white p-5 text-center font-black text-slate-500 shadow-sm">名片載入中...</div></main>';

  try {
    const card = await loadCardByPublicId(webCardId);
    if (!card) throw new Error('找不到這張名片');

    const cfg = buildCardShareConfig(card);
    const layout = cfg.layoutStyle || 'landscape';
    const ratio = String(
      layout === 'portrait' ? (cfg.imgRatioPortrait || '400:600') :
      layout === 'square' ? (cfg.imgRatioSquare || '1:1') :
      (cfg.imgRatioLandscape || '20:13')
    ).replace(':', '/');
    const imgUrl = layout === 'portrait'
      ? (cfg.imgUrlPortrait || cfg.imgUrl || card['名片圖檔'] || '')
      : layout === 'square'
        ? (cfg.imgUrlSquare || cfg.imgUrl || card['名片圖檔'] || '')
        : (cfg.imgUrl || card['名片圖檔'] || '');
    const name = cardTextValue(card, ['姓名', 'name', 'displayName'], '數位名片');
    const company = cardTextValue(card, ['公司名稱', 'companyName', 'company'], '');
    const title = cardTextValue(card, ['職稱', 'title', 'industry'], '');
    const desc = String(cfg.desc || cardTextValue(card, ['服務項目', 'services', 'description'], '')).trim();
    const cardId = card.rowId || card.cardRowId || card.id || '';
    const shareUrl = appendCardAutoShareMode(buildPlainCardViewUrl(card, refId || '', netId || 'admin'));
    const buttons = Array.isArray(cfg.buttons) ? cfg.buttons : [];
    const buttonHtml = buttons.map(button => {
      const label = window.escapeHTML(button.l || button.label || '連結');
      const url = cardButtonUrlForWeb(button.u || button.url || '');
      const color = /^#[0-9a-f]{6}$/i.test(button.c || '') ? button.c : '#1e293b';
      return '<a href="' + window.escapeHTML(url) + '" target="_blank" rel="noopener" class="block w-full rounded-xl px-3 py-2 text-center text-white text-[14px] font-black shadow-sm" style="background:' + color + '">' + label + '</a>';
    }).join('');

    app.innerHTML =
      '<main class="min-h-screen bg-[#eef2f7] px-4 py-4">' +
        '<section class="max-w-[320px] mx-auto overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-md">' +
          '<div class="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-100 bg-white">' +
            '<button type="button" data-social-like-button class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[12px] font-black text-slate-600 active:scale-95 transition-transform">' +
              '<span class="material-symbols-outlined text-[16px] text-amber-500">thumb_up</span>' +
              '<span data-social-like-count>0</span>' +
            '</button>' +
            '<a href="' + window.escapeHTML(shareUrl) + '" class="rounded-full bg-red-500 px-3.5 py-1 text-[12px] font-black text-white shadow-sm">分享</a>' +
          '</div>' +
          '<div class="relative border-b border-slate-100">' +
            '<img src="' + window.escapeHTML(imgUrl || 'https://placehold.co/800x520?text=Card') + '" class="block w-full object-contain bg-slate-100" style="aspect-ratio:' + window.escapeHTML(ratio) + ';" onerror="this.src=\'https://placehold.co/800x520?text=Card\';">' +
          '</div>' +
          '<div class="px-4 py-4 text-center">' +
            '<h1 class="text-[22px] font-black text-slate-900 leading-tight">' + window.escapeHTML(name) + '</h1>' +
            '<p class="mt-1.5 text-[12px] font-bold text-slate-500">' + window.escapeHTML([company, title].filter(Boolean).join(' / ')) + '</p>' +
            (desc ? '<div class="mt-3 rounded-2xl bg-slate-50 px-3.5 py-3.5 text-[13px] font-bold leading-6 whitespace-pre-wrap" style="color:' + window.escapeHTML(cfg.descColor || '#475569') + ';text-align:' + window.escapeHTML(cfg.descAlign || 'center') + ';">' + window.escapeHTML(desc) + '</div>' : '') +
            (buttonHtml ? '<div class="mt-4 space-y-1.5">' + buttonHtml + '</div>' : '') +
          '</div>' +
        '</section>' +
      '</main>';
    setTimeout(() => window.initSocialLikeWidget?.(cardId, netId || 'admin'), 0);
    return true;
  } catch (e) {
    app.innerHTML = '<main class="min-h-screen bg-[#eef2f7] px-4 py-4"><div class="max-w-[320px] mx-auto rounded-3xl bg-white p-5 text-center font-black text-red-500 shadow-sm">' + window.escapeHTML(e.message || '名片載入失敗') + '</div></main>';
    return false;
  }
}

window.submitRegistration = async function() {
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  if (!name || !phone) return window.showToast('姓名與手機為必填', true);

  const btn = document.getElementById('btn-register');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 註冊中...';
  btn.disabled = true;

  try {
    const urlParams = typeof window.readActmasterInitialParams === 'function'
      ? window.readActmasterInitialParams()
      : new URLSearchParams(window.location.search);
    const refId = urlParams.get('ref') || '';
    const netId = urlParams.get('net') || 'admin';
    const referral = resolveReferralForRegistration(refId, netId);

    const payload = {
      userId: window.currentUserProfile.userId,
      name: name,
      phone: phone,
      industry: document.getElementById('reg-industry').value.trim(),
      birthday: document.getElementById('reg-birthday').value,
      '推薦人': refId,
      referrerId: referral.referrerId,
      networkId: referral.networkId
    };

    const res = await window.fetchAPI('registerUser', payload, true);
    const d1Info = res?.info || res?.user || res?.data?.info || (res?.isRegistered ? payload : null);
    if (res && (res.rowId || res.userId || res.isRegistered || d1Info)) {
      const nextInfo = { ...payload, ...(d1Info || {}) };
      window.applyRegisteredUserSession(nextInfo);
      try {
        localStorage.setItem('ACTMASTER_USER_' + payload.userId, JSON.stringify({ info: nextInfo, savedAt: Date.now() }));
      } catch (e) {}
      window.showToast('會員資料已建立');
      setTimeout(() => window.location.reload(), 800);
      return;
    }
    if (res && res.rowId) {
      window.showToast('✅ 註冊成功！');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      throw new Error('註冊失敗');
    }
  } catch(e) {
    window.showToast('系統錯誤:' + e.message, true);
    btn.innerHTML = '開始使用 <span class="material-symbols-outlined">arrow_forward</span>';
    btn.disabled = false;
  }
};

window.saveProfileRegistration = async function(event) {
  const btn = event?.currentTarget || document.getElementById('btn-save-profile-registration');
  const userId = window.getSocialLikeActorId();
  const name = (document.getElementById('profile-name')?.value || '').trim();
  const phone = (document.getElementById('profile-phone')?.value || '').trim();
  const industry = (document.getElementById('profile-industry')?.value || '').trim();
  const birthday = document.getElementById('profile-birthday')?.value || '';

  if (!userId) return window.showToast('請先重新登入後再補完資料', true);
  if (!name || !phone) return window.showToast('真實姓名與手機號碼必填', true);

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  }

  try {
    const urlParams = typeof window.readActmasterInitialParams === 'function'
      ? window.readActmasterInitialParams()
      : new URLSearchParams(window.location.search);
    const referral = resolveReferralForRegistration(urlParams.get('ref') || '', urlParams.get('net') || window.currentNetworkId || 'admin');
    const payload = {
      userId,
      name,
      phone,
      industry,
      birthday,
      referrerId: window.currentUser?.referrerId || referral.referrerId || '',
      networkId: window.currentUser?.networkId || referral.networkId || window.currentNetworkId || 'admin'
    };

    const check = await window.fetchAPI('checkUser', { userId }, true);
    const action = check && check.isRegistered ? 'updateUserProfile' : 'registerUser';
    const saved = await window.fetchAPI(action, payload, true);
    if (!saved || saved.error) throw new Error(saved?.error || '儲存失敗');

    const refreshed = await window.fetchAPI('checkUser', { userId }, true);
    const info = refreshed && refreshed.isRegistered && refreshed.info
      ? refreshed.info
      : { ...(window.currentUser || {}), ...payload, role: window.userRole || 'user' };
    window.applyRegisteredUserSession(info);
    try {
      localStorage.setItem('ACTMASTER_USER_' + userId, JSON.stringify({ info, savedAt: Date.now() }));
    } catch (e) {}
    window.showToast(action === 'registerUser' ? '會員資料已建立' : '會員資料已更新');
  } catch (e) {
    window.showToast(e.message || '會員資料儲存失敗', true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml || '<span class="material-symbols-outlined text-[18px]">save</span> 建立 / 儲存會員資料';
    }
  }
};

window.submitClaimRegistration = async function() {
  const name = document.getElementById('claim-name').value.trim();
  const phone = document.getElementById('claim-phone').value.trim();
  if (!name || !phone) return window.showToast('姓名與手機為必填', true);

  const btn = document.getElementById('btn-claim-register');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 處理綁定中...';
  btn.disabled = true;

  try {
    const rowId = document.getElementById('claim-row-id').value;
    const referral = resolveReferralForRegistration(
      document.getElementById('claim-ref-id').value || '',
      document.getElementById('claim-net-id').value || 'admin'
    );
    const payload = {
      userId: window.currentUserProfile.userId,
      claimRowId: rowId,
      '姓名': name,
      '手機號碼': phone,
      '公司名稱': document.getElementById('claim-company').value.trim(),
      '職稱': document.getElementById('claim-title').value.trim(),
      referrerId: referral.referrerId,
      networkId: referral.networkId
    };

    const res = await window.fetchAPI('claimCardAndRegister', payload, true);
    if (res) {
      await window.ensureClaimedCardUserProfile(payload);
      window.showToast('✅ 名片認領並註冊成功！');
      await window.loadAllData();
      window.goPage('admin-settings');
      if (typeof window.focusMyECardSection === 'function') window.focusMyECardSection();
    }
  } catch(e) {
    window.showToast('綁定失敗:' + e.message, true);
    btn.innerHTML = '確認認領並啟用名片 <span class="material-symbols-outlined">how_to_reg</span>';
    btn.disabled = false;
  }
};

window.buildUserProfileFromClaimCard = function(card, fallback = {}) {
  card = card || {};
  fallback = fallback || {};
  const name = fallback.name || fallback['姓名'] || card['姓名'] || window.currentUserProfile?.displayName || '';
  const phone = fallback.phone || fallback['手機號碼'] || card['手機號碼'] || card['公司電話'] || '';
  const company = fallback.company || fallback['公司名稱'] || card['公司名稱'] || '';
  const title = fallback.title || fallback['職稱'] || card['職稱'] || '';

  return {
    userId: window.currentUserProfile?.userId || fallback.userId || '',
    name: name,
    phone: phone,
    industry: title || company,
    birthday: fallback.birthday || '',
    '推薦人': fallback.referrerId || fallback['推薦人'] || '',
    networkId: fallback.networkId || card['歸屬網'] || 'admin',
    claimedCardRowId: fallback.claimRowId || card.rowId || '',
    companyName: company,
    title: title
  };
};

window.ensureClaimedCardUserProfile = async function(source) {
  const profile = window.buildUserProfileFromClaimCard(source, source);
  if (!profile.userId || !profile.name || !profile.phone) return null;

  const check = await window.fetchAPI('checkUser', { userId: profile.userId }, true);
  const action = (check && check.isRegistered) ? 'updateUserProfile' : 'registerUser';
  const res = await window.fetchAPI(action, profile, true);

  if (res && !res.error) {
    const refreshed = await window.fetchAPI('checkUser', { userId: profile.userId }, true);
    if (refreshed && refreshed.isRegistered && refreshed.info) {
      window.applyRegisteredUserSession(refreshed.info);
      try {
        localStorage.setItem('ACTMASTER_USER_' + profile.userId, JSON.stringify({ info: refreshed.info, savedAt: Date.now() }));
      } catch (e) {}
    }
  }

  return res;
};

window.autoClaimCardFromLink = async function(claimCardId, refId, netId) {
  if (!claimCardId || !window.currentUserProfile?.userId) throw new Error('Missing claim context');

  const cardForClaim = await window.fetchAPI('getCardForClaim', { claimRowId: claimCardId }, true);
  if (!cardForClaim || cardForClaim.error) throw new Error((cardForClaim && cardForClaim.error) || '找不到名片');

  const referral = resolveReferralForRegistration(refId || '', netId || cardForClaim.networkId || cardForClaim['歸屬網'] || 'admin');
  const payload = {
    claimRowId: claimCardId,
    userId: window.currentUserProfile.userId,
    name: cardForClaim.name || cardForClaim['姓名'] || window.currentUserProfile.displayName || '',
    phone: cardForClaim.mobile || cardForClaim.phone || cardForClaim['手機號碼'] || cardForClaim.officePhone || cardForClaim['公司電話'] || '',
    companyName: cardForClaim.companyName || cardForClaim['公司名稱'] || '',
    title: cardForClaim.title || cardForClaim['職稱'] || '',
    referrerId: referral.referrerId,
    networkId: referral.networkId
  };

  const claimRes = await window.fetchAPI('claimCardAndRegister', payload, true);
  if (!claimRes || claimRes.error) throw new Error((claimRes && claimRes.error) || '名片綁定失敗');

  const profileSource = window.buildUserProfileFromClaimCard(cardForClaim, {
    ...payload,
    referrerId: referral.referrerId,
    networkId: referral.networkId
  });
  await window.ensureClaimedCardUserProfile(profileSource);

  const refreshed = await window.fetchAPI('checkUser', { userId: window.currentUserProfile.userId }, true);
  if (refreshed && refreshed.isRegistered && refreshed.info) {
    window.applyRegisteredUserSession(refreshed.info);
    try {
      localStorage.setItem('ACTMASTER_USER_' + window.currentUserProfile.userId, JSON.stringify({ info: refreshed.info, savedAt: Date.now() }));
    } catch (e) {}
  }

  return { claimRes, cardForClaim };
};

window.recoverRegisteredUserFromBoundCard = async function(userId) {
  userId = userId || window.currentUserProfile?.userId || '';
  if (!userId) return null;

  try {
    const cardsRes = await window.fetchAPI('getCardContacts', { networkId: 'admin', role: 'admin', userId: '' }, true);
    const cards = Array.isArray(cardsRes) ? cardsRes : (cardsRes && (cardsRes.data || cardsRes.cards)) || [];
    const boundCard = cards.find(card => {
      const lineId = String(card['LINE ID'] || card.lineId || card.userId || card['User ID'] || '').trim();
      return lineId && lineId === userId;
    });
    if (!boundCard) return null;

    const profile = window.buildUserProfileFromClaimCard(boundCard, {
      userId: userId,
      claimRowId: boundCard.rowId || boundCard['rowId'] || boundCard['Row ID'] || '',
      networkId: boundCard['歸屬網'] || boundCard.networkId || 'admin'
    });

    const res = await window.fetchAPI('registerUser', {
      ...profile,
      profileStatus: profile.phone ? 'active' : 'bound_card',
      source: 'bound_card'
    }, true);
    if (res && res.error) throw new Error(res.error);

    const refreshed = await window.fetchAPI('checkUser', { userId: userId }, true);
    const info = (refreshed && refreshed.isRegistered && refreshed.info) ? refreshed.info : profile;
    window.applyRegisteredUserSession(info);
    try {
      localStorage.setItem('ACTMASTER_USER_' + userId, JSON.stringify({ info: info, savedAt: Date.now() }));
    } catch (e) {}
    return info;
  } catch (e) {
    console.warn('Bound-card registration recovery failed:', e);
    return null;
  }
};

window.findCachedLegacyUser = function(currentUserId) {
  try {
    const candidates = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('ACTMASTER_USER_')) continue;
      const oldUserId = key.replace('ACTMASTER_USER_', '');
      if (!oldUserId || oldUserId === currentUserId) continue;
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (!cached || !cached.info) continue;
      candidates.push({
        oldUserId,
        info: cached.info,
        savedAt: Number(cached.savedAt || 0)
      });
    }
    candidates.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return candidates[0] || null;
  } catch (e) {
    return null;
  }
};

window.recoverRegisteredUserFromLegacyCache = async function(userId) {
  userId = userId || window.currentUserProfile?.userId || '';
  if (!userId || typeof window.fetchAPI !== 'function') return null;
  const cached = window.findCachedLegacyUser(userId);
  if (!cached || !cached.oldUserId || !cached.info) return null;

  try {
    const res = await window.fetchAPI('linkUserIdentity', {
      oldUserId: cached.oldUserId,
      name: cached.info.name || '',
      phone: cached.info.phone || ''
    }, true);
    const info = res && (res.info || res.data?.info);
    if (!info) return null;

    window.applyRegisteredUserSession(info);
    try {
      localStorage.setItem('ACTMASTER_USER_' + userId, JSON.stringify({ info, savedAt: Date.now() }));
      localStorage.removeItem('ACTMASTER_USER_' + cached.oldUserId);
    } catch (e) {}
    return info;
  } catch (e) {
    console.warn('Legacy identity recovery failed:', e);
    return null;
  }
};

window.recordShareCardVisitOnce = async function(params) {
  if (!params || !params.shareCardId || !window.currentUserProfile?.userId) return null;

  const visitorId = window.currentUserProfile.userId;
  const referrerId = params.referrerId || '';
  if (referrerId && referrerId === visitorId) return null;

  const localKey = 'ACTMASTER_SHARE_VISIT_' + visitorId;
  try {
    if (localStorage.getItem(localKey)) return null;
  } catch (e) {}

  try {
    const res = await window.fetchAPI('recordShareCardVisit', {
      visitorId: visitorId,
      shareCardId: params.shareCardId,
      referrerId: referrerId,
      networkId: params.networkId || 'admin',
      firstTouchOnly: true
    }, true);

    if (res && !res.error) {
      try {
        localStorage.setItem(localKey, JSON.stringify({
          shareCardId: params.shareCardId,
          referrerId: referrerId,
          networkId: params.networkId || 'admin',
          savedAt: Date.now()
        }));
      } catch (e) {}
    }
    return res;
  } catch (e) {
    console.warn('[recordShareCardVisitOnce] skipped:', e.message || e);
    return null;
  }
};

window.showSocialLikeThanks = function(message) {
  let box = document.getElementById('social-like-thanks-pop');
  if (!box) {
    box = document.createElement('div');
    box.id = 'social-like-thanks-pop';
    box.className = 'fixed inset-x-0 top-[42%] z-[12000] mx-auto w-fit max-w-[210px] rounded-2xl bg-slate-900 px-4 py-2.5 text-center text-white text-[14px] font-black shadow-xl transition-opacity duration-200';
    document.body.appendChild(box);
  }
  box.textContent = message || '感謝您的支持';
  box.style.opacity = '1';
  box.classList.remove('hidden');
  clearTimeout(window.__socialLikeThanksTimer);
  window.__socialLikeThanksTimer = setTimeout(() => {
    box.style.opacity = '0';
    setTimeout(() => box.classList.add('hidden'), 220);
  }, 2000);
};

window.updateSocialLikeWidget = function(data) {
  const total = Number(data && (data.totalLikes ?? data.count ?? data.likes) || 0);
  document.querySelectorAll('[data-social-like-count]').forEach(el => {
    el.textContent = String(total);
  });
  document.querySelectorAll('[data-social-like-button]').forEach(btn => {
    const liked = !!(data && (data.likedToday || data.alreadyLikedToday));
    btn.dataset.likedToday = liked ? '1' : '0';
    btn.classList.toggle('bg-blue-50', liked);
    btn.classList.toggle('text-blue-600', liked);
    btn.classList.toggle('border-blue-100', liked);
  });
};

window.loadSocialLikeStats = async function(cardId, networkId) {
  if (!cardId || typeof window.fetchAPI !== 'function') return null;
  try {
    const res = await window.fetchAPI('getSocialLikeStats', {
      shareCardId: cardId,
      networkId: networkId || 'admin',
      userId: window.currentUserProfile?.userId || window.currentUser?.userId || ''
    }, true);
    const data = res && (res.data || res);
    if (data) window.updateSocialLikeWidget(data);
    return data;
  } catch (e) {
    console.warn('[loadSocialLikeStats] failed:', e.message || e);
    return null;
  }
};

window.getSocialLikeActorId = function() {
  const lineId = String(window.currentUserProfile?.userId || window.currentUser?.userId || '').trim();
  if (lineId) return lineId;
  try {
    const key = 'ACTMASTER_SOCIAL_LIKER_ID';
    let id = localStorage.getItem(key);
    if (!id) {
      id = 'anon_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(key, id);
    }
    return id;
  } catch (e) {
    return 'anon_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }
};

window.recordSocialLike = async function(cardId, networkId) {
  const userId = window.getSocialLikeActorId();
  if (!cardId) return;
  if (!userId) {
    window.showToast?.('請先登入 LINE 後再按讚', true);
    return;
  }
  const buttons = document.querySelectorAll('[data-social-like-button]');
  buttons.forEach(btn => { btn.disabled = true; btn.classList.add('opacity-70'); });
  try {
    const res = await window.fetchAPI('recordSocialLike', {
      shareCardId: cardId,
      likerUserId: userId,
      networkId: networkId || 'admin'
    }, false);
    const data = res && (res.data || res);
    if (data) window.updateSocialLikeWidget(data);
    window.showSocialLikeThanks(data && data.alreadyLikedToday ? '今天已經收到您的支持' : '感謝您的支持');
  } catch (e) {
    console.warn('[recordSocialLike] failed:', e.message || e);
    window.showToast?.(e.message || '按讚失敗，請稍後再試', true);
  } finally {
    buttons.forEach(btn => { btn.disabled = false; btn.classList.remove('opacity-70'); });
  }
};

window.initSocialLikeWidget = function(cardId, networkId) {
  if (!cardId) return;
  document.querySelectorAll('[data-social-like-button]').forEach(btn => {
    btn.dataset.cardId = cardId;
    btn.onclick = function(evt) {
      evt.preventDefault();
      evt.stopPropagation();
      window.recordSocialLike(cardId, networkId || 'admin');
    };
  });
  window.loadSocialLikeStats(cardId, networkId || 'admin');
};

window.handleAutoSocialLikeEntry = async function(cardId, networkId) {
  if (!cardId) return false;
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.classList.add('hidden');
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML =
      '<main class="min-h-screen bg-[#eef2f7] flex items-center justify-center px-6">' +
        '<section class="w-full max-w-[320px] rounded-3xl bg-white p-6 text-center shadow-xl">' +
          '<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-[28px]">👍</div>' +
          '<h1 class="text-[20px] font-black text-slate-900">感謝您的支持</h1>' +
          '<p class="mt-2 text-[13px] font-bold text-slate-500">正在為這張名片加上支持紀錄</p>' +
        '</section>' +
      '</main>';
  }
  await window.recordSocialLike(cardId, networkId || 'admin');
  return true;
};

window.showSocialLikeThanks = function(message) {
  let box = document.getElementById('social-like-thanks-pop');
  if (!box) {
    box = document.createElement('div');
    box.id = 'social-like-thanks-pop';
    document.body.appendChild(box);
  }
  box.className = 'fixed inset-x-0 top-[42%] z-[12000] mx-auto w-fit max-w-[210px] rounded-2xl bg-slate-900 px-4 py-2.5 text-center text-white text-[14px] font-black shadow-xl transition-opacity duration-200';
  const text = String(message || '').includes('今天') ? '今天已收到支持' : '感謝您的支持';
  box.textContent = text;
  box.style.opacity = '1';
  box.classList.remove('hidden');
  clearTimeout(window.__socialLikeThanksTimer);
  window.__socialLikeThanksTimer = setTimeout(() => {
    box.style.opacity = '0';
    setTimeout(() => box.classList.add('hidden'), 220);
  }, 2000);
};

window.showSocialLikeThanks = function() {
  let box = document.getElementById('social-like-thanks-pop');
  if (!box) {
    box = document.createElement('div');
    box.id = 'social-like-thanks-pop';
    document.body.appendChild(box);
  }
  if (!document.getElementById('social-like-pop-style')) {
    const style = document.createElement('style');
    style.id = 'social-like-pop-style';
    style.textContent = '@keyframes socialLikePop{0%{opacity:0;transform:scale(.72) translateY(10px)}18%{opacity:1;transform:scale(1.05) translateY(0)}32%,82%{opacity:1;transform:scale(1) translateY(0)}100%{opacity:0;transform:scale(.96) translateY(-4px)}}#social-like-thanks-pop img{background:transparent!important;border:0!important;box-shadow:none!important;animation:socialLikePop 2s ease-out both}';
    document.head.appendChild(style);
  }
  box.className = 'fixed inset-x-0 top-[22%] z-[12000] mx-auto w-[270px] max-w-[82vw] pointer-events-none transition-opacity duration-200';
  box.innerHTML = '<img src="https://s3.us-west-1.wasabisys.com/aitw/2026/06/6d0759e75079125c1b9d76165099d7d8.png" alt="感謝支持" class="block w-full h-auto">';
  box.style.opacity = '1';
  box.classList.remove('hidden');
  clearTimeout(window.__socialLikeThanksTimer);
  window.__socialLikeThanksTimer = setTimeout(() => {
    box.style.opacity = '0';
    setTimeout(() => box.classList.add('hidden'), 220);
  }, 2000);
};

window.handleAutoSocialLikeEntry = async function(cardId, networkId) {
  if (!cardId) return false;
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.classList.add('hidden');
  await window.recordSocialLike(cardId, networkId || 'admin');
  setTimeout(() => {
    try {
      if (typeof liff !== 'undefined' && liff && typeof liff.closeWindow === 'function') liff.closeWindow();
    } catch (e) {}
  }, 1800);
  return true;
};

window.handleInstantSocialLikeEntry = function(cardId, networkId) {
  if (!cardId) return false;
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.classList.add('hidden');
  window.showSocialLikeThanks();

  const workerUrl = window.Config?.WORKER_URL || 'https://line-engine.fangwl591021.workers.dev';
  const likerUserId = typeof window.getSocialLikeActorId === 'function'
    ? window.getSocialLikeActorId()
    : ('anon_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10));

  fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'recordSocialLike',
      payload: {
        shareCardId: cardId,
        likerUserId,
        networkId: networkId || 'admin'
      }
    })
  }).then(res => res.json())
    .then(res => {
      const data = res && (res.data || res);
      if (data && typeof window.updateSocialLikeWidget === 'function') window.updateSocialLikeWidget(data);
    })
    .catch(e => console.warn('[handleInstantSocialLikeEntry] failed:', e.message || e));

  setTimeout(() => {
    try {
      if (typeof liff !== 'undefined' && liff && typeof liff.closeWindow === 'function') liff.closeWindow();
    } catch (e) {}
  }, 1900);
  return true;
};

window.applyRegisteredUserSession = function(info) {
  if (!info) return;

  window.currentUser = { ...info };
  if (typeof window.isHardAdminUser === 'function' && window.isHardAdminUser(window.currentUserProfile?.userId || window.currentUser.userId, window.currentUser)) {
    window.currentUser.role = 'admin';
    window.currentUser.networkId = window.currentUser.networkId || 'admin';
  }
  window.userRole = window.currentUser.role || 'user';
  const normalizedRole = String(window.userRole || '').toLowerCase();
  const sessionUserId = String(
    window.currentUser.userId ||
    window.currentUser.lineId ||
    window.currentUserProfile?.userId ||
    ''
  ).trim();
  if (normalizedRole === 'admin') {
    window.currentNetworkId = 'admin';
  } else if (normalizedRole === 'store' || normalizedRole === 'tenant') {
    window.currentNetworkId = sessionUserId || window.currentUser.networkId || 'admin';
  } else {
    window.currentNetworkId = window.currentUser.networkId || window.currentUser.referrerId || window.currentUser.referrer_id || 'admin';
  }
  window.currentStoreId = window.currentUser.storeid || window.currentUser.storeId || ((normalizedRole === 'store' || normalizedRole === 'tenant') ? window.currentNetworkId : '');

  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.classList.remove('hidden');
  window.applyUserPermissions();
  if (typeof window.refreshInboxBadge === 'function') window.refreshInboxBadge();

  const profileName = document.getElementById('profile-name');
  const profilePhone = document.getElementById('profile-phone');
  const profileIndustry = document.getElementById('profile-industry');
  const profileBirthday = document.getElementById('profile-birthday');
  if (profileName) setInputValueUnlessTouched('profile-name', window.currentUser.name || '');
  if (profilePhone) setInputValueUnlessTouched('profile-phone', window.currentUser.phone || '');
  if (profileIndustry) setInputValueUnlessTouched('profile-industry', window.currentUser.industry || '');
  if (profileBirthday) setInputValueUnlessTouched('profile-birthday', window.currentUser.birthday || '');

  window.userSocials = [];
  const socialsList = document.getElementById('user-socials-list');
  if (socialsList) socialsList.innerHTML = '';

  if (window.currentUser.socials) {
    try {
      const arr = JSON.parse(window.currentUser.socials);
      if (Array.isArray(arr)) arr.forEach(s => {
        if (s && String(s.t || '').toUpperCase() !== 'PROFILE_AVATAR') window.addUserSocial(s.t, s.u);
      });
    } catch(e){}
  } else {
    window.addUserSocial('LINE', '');
  }

  const tgToken = document.getElementById('setting-tg-token');
  const tgChatId = document.getElementById('setting-tg-chatid');
  if (tgToken && window.currentUser.tgToken) tgToken.value = window.currentUser.tgToken;
  if (tgChatId && window.currentUser.tgChatId) tgChatId.value = window.currentUser.tgChatId;
  if (typeof window.refreshHomeProfileCard === 'function') window.refreshHomeProfileCard();
  window.updateStorePointCashierVisibility?.();
};

window.setPointWalletStatus = function(status, data = {}) {
  window.pointWalletStatus = status || 'idle';
  if (status === 'ready') {
    const balance = Number(data.balance ?? data.latestBalance ?? data.typedBalance);
    if (!Number.isFinite(balance)) return;
    window.pointWalletData = {
      ...(window.pointWalletData || {}),
      ...data,
      status: 'ready',
      source: data.source || 'mother',
      balance,
      list: Array.isArray(data.list) ? data.list : (Array.isArray(window.pointWalletData?.list) ? window.pointWalletData.list : []),
      loadedAt: Date.now(),
      updatedAt: data.updatedAt || new Date().toISOString()
    };
  } else if (status === 'loading') {
    if (!window.pointWalletData || window.pointWalletData.status !== 'ready') window.pointWalletData = null;
  } else if (status === 'error') {
    window.pointWalletError = data.error || data.message || 'Point balance unavailable';
  }
};

window.renderPointBalanceState = function(status, data = {}) {
  const resolvedStatus = status || window.pointWalletStatus || (window.pointWalletData?.status === 'ready' ? 'ready' : 'idle');
  const balance = data.balance ?? window.pointWalletData?.balance;
  const isReady = resolvedStatus === 'ready' && balance !== null && balance !== undefined && Number.isFinite(Number(balance));
  const text = isReady ? Number(balance).toLocaleString('zh-TW') : (resolvedStatus === 'error' ? '無法讀取' : '讀取中');

  document.querySelectorAll('#home-profile-points').forEach(el => {
    el.textContent = text;
    el.classList.toggle('text-slate-400', !isReady);
    el.classList.toggle('text-pink-500', isReady);
  });

  const walletBalance = document.getElementById('points-wallet-balance');
  if (walletBalance) walletBalance.textContent = text;

  const badge = document.getElementById('point-balance-badge');
  if (badge) {
    badge.textContent = isReady ? `${Number(balance).toLocaleString('zh-TW')} 點` : text;
    badge.classList.remove('hidden');
    badge.classList.toggle('text-red-600', resolvedStatus === 'error');
    badge.classList.toggle('text-emerald-700', resolvedStatus !== 'error');
  }
};

window.refreshPointBalanceBadge = async function() {
  const badge = document.getElementById('point-balance-badge');
  const userId = window.currentUserProfile?.userId || '';
  if (!badge || !userId || typeof window.fetchAPI !== 'function') return;

  try {
    window.setPointWalletStatus('loading');
    window.renderPointBalanceState('loading');
    const data = await window.fetchPointWalletData_();
    if (!data) {
      window.setPointWalletStatus('error', { error: 'Point balance unavailable' });
      window.renderPointBalanceState('error');
      return;
    }
    window.renderPointBalanceState('ready', data);
    if (typeof window.refreshHomeProfileCard === 'function') window.refreshHomeProfileCard();
  } catch (e) {
    window.setPointWalletStatus('error', { error: e.message || String(e) });
    window.renderPointBalanceState('error');
    console.warn('[points] query skipped:', e.message || e);
  }
};

window.fetchPointWalletData_ = async function(force = false) {
  const userId = window.currentUserProfile?.userId || '';
  if (!userId || typeof window.fetchAPI !== 'function') return null;
  if (!force && window.pointWalletData && Date.now() - (window.pointWalletData.loadedAt || 0) < 60000) {
    return window.pointWalletData;
  }
  const pointUserId = window.resolvePointUserIdForCurrentProfile?.(userId) || userId;
  const res = await window.fetchAPI(force ? 'queryUserPoints' : 'queryPointBalanceFast', {
    userId,
    pointUserId,
    pt_uid: pointUserId,
    page: 1,
    per_page: force ? 100 : 20,
    point_type: 'gift_money'
  }, true);
  if (!res || res.error) return null;
  const data = res.data || res;
  const balance = Number(data.balance ?? data.latestBalance ?? data.typedBalance);
  if (!Number.isFinite(balance)) return null;
  window.pointWalletData = {
    ...data,
    status: 'ready',
    source: data.source || 'mother',
    balance,
    list: Array.isArray(data.list) ? data.list : [],
    queriedLineUserId: data.queriedLineUserId || pointUserId,
    balanceByType: data.balanceByType || null,
    loadedAt: Date.now(),
    updatedAt: data.updatedAt || new Date().toISOString()
  };
  window.pointWalletStatus = 'ready';
  return window.pointWalletData;
};

window.openPointsWallet = function() {
  if (typeof window.goPage === 'function') window.goPage('points-wallet');
};

window.loadPointsWallet = async function(force = false) {
  const balanceEl = document.getElementById('points-wallet-balance');
  const listEl = document.getElementById('points-wallet-list');
  if (!balanceEl || !listEl) return;

  window.updateStorePointCashierVisibility?.();

  if (force) window.pointWalletData = null;
  window.setPointWalletStatus('loading');
  window.renderPointBalanceState('loading');
  listEl.innerHTML = '<div class="py-10 text-center text-slate-400 text-sm font-bold">載入點數紀錄中...</div>';

  const data = await window.fetchPointWalletData_(force);
  if (!data) {
    window.setPointWalletStatus('error', { error: 'Point wallet unavailable' });
    window.renderPointBalanceState('error');
    listEl.innerHTML = '<div class="py-10 text-center text-red-400 text-sm font-bold">暫時無法取得點數紀錄</div>';
    return;
  }

  window.renderPointBalanceState('ready', data);
  const rows = (Array.isArray(data.list) ? data.list : []).slice(0, 30);
  if (!rows.length) {
    listEl.innerHTML = '<div class="py-10 text-center text-slate-400 text-sm font-bold">目前沒有點數異動紀錄</div>';
    return;
  }

  const formatTime = (value) => {
    if (typeof window.formatDisplayTime === 'function') return window.formatDisplayTime(value);
    return String(value || '').replace('T', ' ').slice(0, 16);
  };
  const getAmount = (row) => Number(row.get_point ?? row.point ?? row.amount ?? row.points ?? 0) || 0;
  const getTitle = (row) => String(row.event_name || row.eventName || row.title || row.name || '點數異動').trim();
  const getTime = (row) => row.created_at || row.createdAt || row.time || row.date || '';
  const getSourceDetail = (row) => {
    const content = String(row.event_content || row.eventContent || row.content || '').trim();
    const shopName = String(row.child_shop_name || row.childShopName || row.shop_name || row.shopName || '').trim();
    const remark = String(row.shop_remark || row.shopRemark || '').trim();
    const sourceFromRemark = (remark.match(/(?:^|[;\s])source=([^;]+)/) || [])[1] || '';
    const source = shopName || sourceFromRemark.trim();
    if (content && content.includes('來源：')) return content;
    if (source && content) return `來源：${source}｜${content}`;
    if (source) return `來源：${source}`;
    return content;
  };

  listEl.innerHTML = rows.map(row => {
    const amount = getAmount(row);
    const positive = amount >= 0;
    const amountText = (positive ? '+' : '') + Number(amount).toLocaleString('zh-TW');
    const detail = getSourceDetail(row);
    return `
      <div class="flex items-center justify-between gap-4 px-5 py-5 border-b border-slate-100 last:border-b-0">
        <div class="min-w-0">
          <div class="text-[16px] font-black text-slate-900 leading-snug">${window.escapeHTML(getTitle(row))}</div>
          ${detail ? `<div class="text-[12px] text-slate-500 font-bold mt-1 leading-snug">${window.escapeHTML(detail)}</div>` : ''}
          <div class="text-[13px] text-slate-400 font-medium mt-2">${window.escapeHTML(formatTime(getTime(row)))}</div>
        </div>
        <div class="shrink-0 text-[22px] font-black ${positive ? 'text-[#06C755]' : 'text-slate-400'}">${window.escapeHTML(amountText)}</div>
      </div>
    `;
  }).join('');

  window.renderPointBalanceState('ready', data);
};

window.canUseStorePointCashier = function() {
  const rawRole = String(window.userRole || window.currentUser?.role || '').trim();
  const role = rawRole.toLowerCase();
  return window.hasAdminRights === true
    || role === 'admin'
    || role === 'store'
    || role === 'tenant'
    || rawRole === '總管'
    || rawRole === '店長'
    || rawRole === '租戶';
};

window.updateStorePointCashierVisibility = function() {
  const panel = document.getElementById('store-point-cashier');
  if (!panel) return;
  const canUse = window.canUseStorePointCashier();
  panel.classList.toggle('hidden', !canUse);
  if (canUse) window.loadStorePointCashierLogs?.();
  window.updateStorePointPreview?.();
};

window.toggleStorePointCashier = function() {
  const body = document.getElementById('store-point-cashier-body');
  const icon = document.getElementById('store-point-cashier-icon');
  if (!body) return;
  const willOpen = body.classList.contains('hidden');
  body.classList.toggle('hidden', !willOpen);
  if (icon) icon.textContent = willOpen ? 'expand_less' : 'expand_more';
  if (willOpen) window.loadStorePointCashierLogs?.();
};

window.loadStorePointCashierLogs = async function(force = false) {
  const listEl = document.getElementById('store-point-cashier-log-list');
  if (!listEl || !window.canUseStorePointCashier() || typeof window.fetchAPI !== 'function') return;
  if (!force && window.storePointCashierLogsCache && Date.now() - (window.storePointCashierLogsCache.loadedAt || 0) < 30000) {
    renderStorePointCashierLogs(window.storePointCashierLogsCache.list || []);
    return;
  }

  listEl.innerHTML = '<div class="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-[13px] text-slate-400 font-bold text-center">載入收銀紀錄中...</div>';
  try {
    const res = await window.fetchAPI('listStorePointCashierLogs', {
      userId: window.currentUserProfile?.userId || '',
      limit: 10
    }, true);
    if (!res || res.error) throw new Error(res?.error || '收銀紀錄讀取失敗');
    const data = res.data || res;
    if (data.needsSelection && Array.isArray(data.candidates)) {
      window.renderStorePointCustomer(null);
      window.renderStorePointCustomerCandidates(data.candidates);
      window.showToast?.('找到多筆客戶，請先選擇正確對象', false);
      return data;
    }
    const rows = Array.isArray(data.list) ? data.list : [];
    window.storePointCashierLogsCache = { list: rows, loadedAt: Date.now() };
    renderStorePointCashierLogs(rows);
  } catch (e) {
    listEl.innerHTML = `<div class="rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-[13px] text-red-500 font-bold text-center">${window.escapeHTML(e.message || '收銀紀錄讀取失敗')}</div>`;
  }
};

function renderStorePointCashierLogs(rows) {
  const listEl = document.getElementById('store-point-cashier-log-list');
  if (!listEl) return;
  if (!Array.isArray(rows) || !rows.length) {
    listEl.innerHTML = '<div class="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-[13px] text-slate-400 font-bold text-center">目前沒有店家收銀紀錄</div>';
    return;
  }
  const formatTime = (value) => {
    if (typeof window.formatDisplayTime === 'function') return window.formatDisplayTime(value);
    return String(value || '').replace('T', ' ').slice(0, 16);
  };
  listEl.innerHTML = rows.map(row => {
    const mode = row.mode === 'reward' ? '消費贈點' : '消費折抵';
    const positive = row.mode === 'reward';
    const pointText = (positive ? '+' : '-') + Number(Math.abs(row.points || row.changedPoints || 0)).toLocaleString('zh-TW') + ' 點';
    const customer = row.customerName || row.customerPhone || row.customerPointUserId || '客戶';
    const amount = Number(row.amount || 0).toLocaleString('zh-TW');
    const payable = Number(row.payableAmount || row.payable_amount || 0).toLocaleString('zh-TW');
    return `
      <div class="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[14px] font-black text-slate-900 truncate">${window.escapeHTML(customer)}</div>
            <div class="text-[12px] font-bold text-slate-500 mt-1">${window.escapeHTML(mode)}｜消費 NT$${window.escapeHTML(amount)}${positive ? '' : `｜應收 NT$${window.escapeHTML(payable)}`}</div>
            <div class="text-[11px] font-bold text-slate-400 mt-1">${window.escapeHTML(formatTime(row.createdAt || row.created_at))}</div>
          </div>
          <div class="shrink-0 text-[15px] font-black ${positive ? 'text-[#06C755]' : 'text-blue-600'}">${window.escapeHTML(pointText)}</div>
        </div>
      </div>
    `;
  }).join('');
}

window.getStorePointMode = function() {
  return document.querySelector('input[name="store-point-mode"]:checked')?.value || 'redeem';
};

window.readPointUidFromParams = function(params) {
  const source = params || (typeof window.readActmasterInitialParams === 'function'
    ? window.readActmasterInitialParams()
    : new URLSearchParams(window.location.search || ''));
  const keys = ['pt_uid', 'wallet_uid', 'pointUserId', 'LINE_user_id', 'lineUserId', 'uid'];
  for (const key of keys) {
    const found = String(source.get(key) || '').trim();
    if (found) return found;
  }
  return '';
};

window.storePointUidBridge = function(userId, pointUid) {
  const localUserId = String(userId || '').trim();
  const uid = String(pointUid || '').trim();
  if (!localUserId || !uid) return '';
  try {
    localStorage.setItem('ACTMASTER_POINT_UID_' + localUserId, uid);
  } catch (e) {}
  return uid;
};

window.resolvePointUserIdForCurrentProfile = function(userId, params) {
  const localUserId = String(userId || window.currentUserProfile?.userId || '').trim();
  if (!localUserId) return '';
  let cached = '';
  try {
    cached = String(localStorage.getItem('ACTMASTER_POINT_UID_' + localUserId) || '').trim();
  } catch (e) {}
  const fromParams = window.readPointUidFromParams?.(params) || '';
  if (fromParams) return window.storePointUidBridge(localUserId, fromParams);
  return cached || localUserId;
};

window.extractPointCustomerId = function(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw, window.location.origin);
    const keys = ['pt_uid', 'wallet_uid', 'pointUserId', 'LINE_user_id', 'lineUserId', 'userId', 'uid', 'ref'];
    for (const key of keys) {
      const found = String(url.searchParams.get(key) || '').trim();
      if (found) return found;
    }
  } catch (e) {}

  const match = raw.match(/\bU[0-9a-fA-F]{20,64}\b/);
  return match ? match[0] : raw;
};

window.loadQrDecoder = function() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (window.__jsQrLoading) return window.__jsQrLoading;
  window.__jsQrLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    script.async = true;
    script.onload = () => resolve(window.jsQR);
    script.onerror = () => reject(new Error('QR 解碼器載入失敗'));
    document.head.appendChild(script);
  });
  return window.__jsQrLoading;
};

window.decodeStorePointQrFile = async function(file) {
  if (!file) return '';

  if ('BarcodeDetector' in window) {
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const image = await createImageBitmap(file);
      const codes = await detector.detect(image);
      const raw = codes?.[0]?.rawValue || '';
      if (raw) return raw;
    } catch (e) {
      console.warn('[storePointQr] BarcodeDetector failed, fallback to jsQR:', e);
    }
  }

  const jsQR = await window.loadQrDecoder();
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const maxSize = 1400;
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
  return code?.data || '';
};

window.fillStorePointCustomerFromQr = function(raw) {
  const customerId = window.extractPointCustomerId(raw);
  const target = document.getElementById('store-point-customer');
  if (target) {
    target.value = customerId;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
  window.lookupStorePointCustomer?.();
  return customerId;
};

window.closeStorePointScanner = function() {
  window.__storePointScannerActive = false;
  if (window.__storePointScannerStream) {
    window.__storePointScannerStream.getTracks().forEach(track => track.stop());
    window.__storePointScannerStream = null;
  }
  const video = document.getElementById('store-point-scanner-video');
  if (video) video.srcObject = null;
  document.getElementById('store-point-scanner-modal')?.classList.add('hidden');
};

window.openStorePointScanner = async function() {
  const modal = document.getElementById('store-point-scanner-modal');
  const video = document.getElementById('store-point-scanner-video');
  const status = document.getElementById('store-point-scanner-status');
  const canvas = document.getElementById('store-point-scanner-canvas');
  if (!modal || !video || !canvas) return window.showToast?.('掃描器尚未載入', true);

  modal.classList.remove('hidden');
  if (status) status.textContent = '正在開啟相機...';

  try {
    const jsQR = await window.loadQrDecoder();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 1280 }
      },
      audio: false
    });
    window.__storePointScannerStream = stream;
    window.__storePointScannerActive = true;
    video.srcObject = stream;
    await video.play();
    if (status) status.textContent = '請將客戶 QR 放入框內。';

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const scanFrame = () => {
      if (!window.__storePointScannerActive) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth && video.videoHeight) {
        const size = Math.min(video.videoWidth, video.videoHeight);
        const sx = Math.max(0, Math.floor((video.videoWidth - size) / 2));
        const sy = Math.max(0, Math.floor((video.videoHeight - size) / 2));
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code?.data) {
          const customerId = window.fillStorePointCustomerFromQr(code.data);
          window.closeStorePointScanner();
          window.showToast?.('已讀取客戶帳號：' + customerId.slice(0, 10) + '...', false);
          return;
        }
      }
      requestAnimationFrame(scanFrame);
    };
    requestAnimationFrame(scanFrame);
  } catch (e) {
    const msg = e?.name === 'NotAllowedError'
      ? '相機權限被拒絕，請允許相機或改用相簿辨識。'
      : (e.message || '無法開啟掃描器，請改用相簿辨識或貼上 UID。');
    if (status) status.textContent = msg;
    window.showToast?.(msg, true);
  }
};

window.updateStorePointPreview = function() {
  const preview = document.getElementById('store-point-preview');
  const amountInput = document.getElementById('store-point-amount');
  const deductWrap = document.getElementById('store-point-deduct-wrap');
  const deductInput = document.getElementById('store-point-deduct');
  if (!preview || !amountInput) return;

  const amount = Math.floor(Number(amountInput.value || 0));
  const mode = window.getStorePointMode();
  const canAutoBindReward = !!(window.storePointCustomer && window.storePointCustomer.canAutoBindPointAccount && mode === 'reward');
  if (window.storePointCustomer && window.storePointCustomer.canAdjust === false) {
    if (window.storePointCustomer.canAutoBindPointAccount && mode === 'reward') {
      preview.className = 'rounded-2xl bg-amber-50 border border-amber-200 p-4 text-[14px] text-amber-800 font-bold leading-relaxed';
      preview.textContent = '\u6bcd\u7ad9\u5c1a\u672a\u627e\u5230\u9019\u500b\u9ede\u6578\u6703\u54e1\uff0c\u8acb\u5148\u6383\u63cf\u5ba2\u6236\u9ede\u6578 QR \u6216\u5b8c\u6210\u9ede\u6578\u901a\u7d81\u5b9a\u3002';
      if (deductWrap) deductWrap.classList.add('hidden');
      return;
    }
    return window.showToast?.(window.storePointCustomer.message || '此客戶尚未綁定點數會員，不能直接扣點', true);
  }
  if (deductWrap) deductWrap.classList.toggle('hidden', mode === 'reward');
  if (!amount || amount <= 0) {
    preview.className = 'rounded-2xl bg-blue-50 border border-blue-100 p-4 text-[14px] text-slate-700 font-bold leading-relaxed';
    preview.textContent = '請先輸入消費金額。';
    return;
  }

  if (mode === 'reward') {
    preview.className = 'rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-[14px] text-slate-700 font-bold leading-relaxed';
    preview.innerHTML = `消費金額 NT$${amount.toLocaleString('zh-TW')}，將贈送客戶 <b class="text-[#06C755]">${amount.toLocaleString('zh-TW')} 點</b>；店家操作扣 10 點。`;
    return;
  }

  const requestedDeduct = Math.max(0, Math.floor(Number(deductInput?.value || 0)));
  const customerBalance = Number(window.storePointCustomer?.balance || 0);
  const actualDeduct = requestedDeduct;
  const payable = amount - actualDeduct;
  preview.className = 'rounded-2xl bg-blue-50 border border-blue-100 p-4 text-[14px] text-slate-700 font-bold leading-relaxed';
  preview.innerHTML = actualDeduct > 0
    ? `本次折抵 <b class="text-blue-600">${actualDeduct.toLocaleString('zh-TW')} 點</b>${customerBalance ? `，目前可用 ${customerBalance.toLocaleString('zh-TW')} 點` : ''}，預估應收 NT$${Math.max(0, payable).toLocaleString('zh-TW')}，店家操作扣 10 點。`
    : `請手動輸入本次要折抵的點數${customerBalance ? `，目前可用 ${customerBalance.toLocaleString('zh-TW')} 點` : ''}。店家操作扣 10 點。`;
};

window.renderStorePointCustomerCandidates = function(candidates) {
  const listEl = document.getElementById('store-point-customer-candidates');
  if (!listEl) return;
  const rows = Array.isArray(candidates) ? candidates : [];
  window.storePointCustomerCandidates = rows;
  if (!rows.length) {
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }
  listEl.classList.remove('hidden');
  listEl.innerHTML = rows.map((item, index) => {
    const name = item.name || '未命名';
    const meta = [item.phone, item.industry, item.needsBinding ? '尚未綁定點數會員' : '可查點數'].filter(Boolean).join(' / ');
    const disabled = item.needsBinding || !item.customerPointUserId;
    return `
      <button type="button" onclick="window.selectStorePointCustomerCandidate(${index})" class="w-full rounded-2xl border ${disabled ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white'} px-4 py-3 text-left active:scale-[0.99] transition-transform">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-[14px] font-black text-slate-900 truncate">${window.escapeHTML ? window.escapeHTML(name) : name}</div>
            <div class="text-[12px] font-bold ${disabled ? 'text-amber-700' : 'text-slate-500'} mt-1 truncate">${window.escapeHTML ? window.escapeHTML(meta || '-') : (meta || '-')}</div>
          </div>
          <span class="material-symbols-outlined text-[20px] ${disabled ? 'text-amber-500' : 'text-blue-500'}">${disabled ? 'info' : 'chevron_right'}</span>
        </div>
      </button>
    `;
  }).join('');
};

window.selectStorePointCustomerCandidate = async function(index) {
  const item = Array.isArray(window.storePointCustomerCandidates) ? window.storePointCustomerCandidates[index] : null;
  if (!item) return;
  if (item.needsBinding || !item.customerPointUserId) {
    window.renderStorePointCustomer({
      ...item,
      customerUserId: '',
      customerPointUserId: '',
      balance: null,
      canAdjust: false,
      message: '此候選尚未綁定點數會員，請請客戶先用 LINE 授權或掃客戶點數 QR。'
    });
    window.showToast?.('此候選尚未綁定點數會員，不能直接扣點', true);
    return;
  }
  const input = document.getElementById('store-point-customer');
  if (input) input.value = item.customerPointUserId;
  window.renderStorePointCustomerCandidates([]);
  await window.lookupStorePointCustomer();
};

window.renderStorePointCustomer = function(customer) {
  const card = document.getElementById('store-point-customer-card');
  const avatar = document.getElementById('store-point-customer-avatar');
  const name = document.getElementById('store-point-customer-name');
  const meta = document.getElementById('store-point-customer-meta');
  const balance = document.getElementById('store-point-customer-balance');
  const bindHint = document.getElementById('store-point-bind-hint');
  if (!card) return;
  if (!customer) {
    window.storePointCustomer = null;
    card.classList.add('hidden');
    if (bindHint) {
      bindHint.classList.add('hidden');
      bindHint.textContent = '';
    }
    window.renderStorePointCustomerCandidates?.([]);
    return;
  }
  window.storePointCustomer = customer;
  if (avatar) {
    avatar.src = customer.avatarUrl || customer.card?.imageUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(customer.name || 'U') + '&background=E2E8F0&color=334155';
  }
  if (name) name.textContent = customer.name || '未命名用戶';
  if (meta) {
    const metaParts = [customer.phone, customer.industry].filter(Boolean);
    meta.textContent = customer.needsBinding
      ? (metaParts.length ? metaParts.join(' / ') + ' / 尚未綁定點數會員' : '尚未綁定點數會員')
      : (metaParts.length ? metaParts.join(' / ') : (customer.customerPointUserId || '-'));
  }
  if (balance) {
    const hasBalance = customer.balance !== null && customer.balance !== undefined && Number.isFinite(Number(customer.balance));
    balance.textContent = customer.needsBinding
      ? '尚未綁定'
      : (hasBalance ? Number(customer.balance).toLocaleString('zh-TW') + ' 點' : '無法讀取');
  }
  if (bindHint) {
    if (customer.needsBinding && customer.canAutoBindPointAccount) {
      bindHint.classList.remove('hidden');
      bindHint.textContent = '\u5df2\u627e\u5230\u672c\u5730\u5ba2\u6236\uff0c\u4f46\u6bcd\u7ad9\u5c1a\u672a\u627e\u5230\u9ede\u6578\u6703\u54e1\u3002\u8acb\u6383\u63cf\u5ba2\u6236\u9ede\u6578 QR \u6216\u8acb\u5ba2\u6236\u5148\u5b8c\u6210\u9ede\u6578\u901a\u7d81\u5b9a\u3002';
    } else {
      bindHint.classList.add('hidden');
      bindHint.textContent = '';
    }
  }
  card.classList.remove('hidden');
  window.updateStorePointPreview?.();
};

window.lookupStorePointCustomer = async function() {
  if (!window.canUseStorePointCashier()) return null;
  const input = document.getElementById('store-point-customer');
  const customerUserId = window.extractPointCustomerId(input?.value || '');
  if (!customerUserId) {
    window.renderStorePointCustomer(null);
    return null;
  }
  if (input && input.value !== customerUserId) input.value = customerUserId;
  try {
    const res = await window.fetchAPI('getStorePointCustomer', { customerUserId }, true);
    if (!res || res.error) throw new Error(res?.error || '查無客戶資料');
    const data = res.data || res;
    if (data.needsSelection && Array.isArray(data.candidates)) {
      window.renderStorePointCustomer(null);
      window.renderStorePointCustomerCandidates(data.candidates);
      window.showToast?.('找到多筆客戶，請先選擇正確對象', false);
      return data;
    }
    if (input && data.customerPointUserId && !data.needsBinding && input.value !== data.customerPointUserId) {
      input.value = data.customerPointUserId;
    }
    window.renderStorePointCustomer(data);
    if (data.needsBinding) window.showToast?.(data.message || '找到名片，但尚未綁定點數會員', true);
    return data;
  } catch (e) {
    window.renderStorePointCustomer(null);
    window.showToast?.('客戶資料查詢失敗：' + (e.message || e), true);
    return null;
  }
};

window.resetStorePointCashier = function() {
  const body = document.getElementById('store-point-cashier-body');
  const icon = document.getElementById('store-point-cashier-icon');
  const customerInput = document.getElementById('store-point-customer');
  const amountInput = document.getElementById('store-point-amount');
  const deductInput = document.getElementById('store-point-deduct');
  const preview = document.getElementById('store-point-preview');
  if (body) body.classList.add('hidden');
  if (icon) icon.textContent = 'expand_more';
  if (customerInput) customerInput.value = '';
  if (amountInput) amountInput.value = '';
  if (deductInput) deductInput.value = '';
  window.renderStorePointCustomer(null);
  if (preview) {
    preview.className = 'rounded-2xl bg-blue-50 border border-blue-100 p-4 text-[14px] text-slate-700 font-bold leading-relaxed';
    preview.textContent = '請先輸入消費金額。';
  }
};

window.scanStorePointQr = async function(input) {
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const raw = await window.decodeStorePointQrFile(file);
    if (!raw) throw new Error('沒有讀到 QR 內容');
    const customerId = window.fillStorePointCustomerFromQr(raw);
    window.closeStorePointScanner?.();
    window.showToast?.('已讀取客戶帳號：' + customerId.slice(0, 10) + '...', false);
  } catch (e) {
    window.showToast?.((e.message || 'QR 讀取失敗') + '，可改用貼上客戶 UID。', true);
  } finally {
    if (input) input.value = '';
  }
};

window.submitStorePointCashier = async function(btn) {
  if (!window.canUseStorePointCashier()) {
    return window.showToast?.('只有店長或總管可以使用店家點數收銀', true);
  }
  const customerInput = document.getElementById('store-point-customer');
  const amountInput = document.getElementById('store-point-amount');
  const deductInput = document.getElementById('store-point-deduct');
  const preview = document.getElementById('store-point-preview');
  const customerUserId = window.storePointCustomer?.customerPointUserId
    || window.storePointCustomer?.bindCustomerUserId
    || window.extractPointCustomerId(customerInput?.value || '');
  const amount = Math.floor(Number(amountInput?.value || 0));
  const deductPoints = Math.floor(Number(deductInput?.value || 0));
  const mode = window.getStorePointMode();
  const canAutoBindReward = !!(window.storePointCustomer && window.storePointCustomer.canAutoBindPointAccount && mode === 'reward');

  if (!customerUserId) return window.showToast?.('請先掃描或輸入客戶帳號', true);
  if (!amount || amount <= 0) return window.showToast?.('請輸入正確消費金額', true);

  if (mode !== 'reward' && (!deductPoints || deductPoints <= 0)) return window.showToast?.('請輸入本次折抵點數。', true);

  if (window.storePointCustomer && window.storePointCustomer.canAdjust === false && !canAutoBindReward) {
    return window.showToast?.(window.storePointCustomer.message || '此客戶尚未綁定點數會員，不能直接扣點', true);
  }

  const oldText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = '處理中...';
    btn.classList.add('opacity-70');
  }

  try {
    const res = await window.fetchAPI('storeAdjustCustomerPoints', {
      customerUserId,
      amount,
      deductPoints,
      mode,
      autoBindPointAccount: canAutoBindReward
    }, true);
    if (!res || res.error) throw new Error(res?.error || '點數處理失敗');
    const data = res.data || res;
    const changed = Number(data.changedPoints || Math.abs(data.points || 0)).toLocaleString('zh-TW');
    const payable = Number(data.payableAmount || 0).toLocaleString('zh-TW');
    const message = data.mode === 'reward'
      ? `已完成消費贈點：${changed} 點，店家已扣 10 點`
      : `已完成折抵：${changed} 點，應收 NT$${payable}，店家已扣 10 點`;
    if (preview) {
      preview.className = 'rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-[14px] text-slate-700 font-bold leading-relaxed';
      preview.textContent = message;
    }
    window.showToast?.(message, false);
    window.pointWalletData = null;
    await window.refreshPointBalanceBadge?.();
    window.storePointCashierLogsCache = null;
    await window.loadStorePointCashierLogs?.(true);
    window.resetStorePointCashier?.();
  } catch (e) {
    const msg = e.message || e || '點數處理失敗';
    if (preview) {
      preview.className = 'rounded-2xl bg-red-50 border border-red-100 p-4 text-[14px] text-red-600 font-bold leading-relaxed';
      preview.textContent = msg;
    }
    window.showToast?.('點數處理失敗：' + msg, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText || '確認送出';
      btn.classList.remove('opacity-70');
    }
  }
};

window.claimDailyPointCheckin = async function(btn) {
  if (!window.currentUserProfile?.userId || typeof window.fetchAPI !== 'function') {
    return window.showToast?.('請先登入後再簽到', true);
  }
  const statusEl = document.getElementById('daily-checkin-status');
  const oldHtml = btn ? btn.innerHTML : '';
  let keepDisabled = false;
  if (btn) {
    btn.disabled = true;
    const label = btn.querySelector?.('.home-quick-label');
    if (label) label.textContent = '\u8655\u7406\u4e2d';
    else btn.textContent = '\u8655\u7406\u4e2d';
    btn.classList.add('opacity-70');
  }
  try {
    const userId = window.currentUserProfile.userId;
    let pointUserId = '';
    try {
      const params = typeof window.readActmasterInitialParams === 'function'
        ? window.readActmasterInitialParams()
        : new URLSearchParams(window.location.search || '');
      pointUserId = window.resolvePointUserIdForCurrentProfile?.(userId, params) || userId;
    } catch (e) {
      pointUserId = userId;
    }
    const res = await window.fetchAPI('dailyPointCheckin', { userId, pointUserId, pt_uid: pointUserId }, true);
    if (!res || res.success === false || res.error) {
      throw new Error(res?.error || '每日簽到失敗');
    }
    const data = res && (res.data || res);
    const awardedPoints = Number(data?.points || data?.awardedPoints || data?.changedPoints || 10);
    const message = data?.alreadyChecked
      ? '\u4eca\u5929\u5df2\u9818\u53d6\u904e\u8d08\u9ede'
      : `\u5df2\u8d08\u9001 ${Number.isFinite(awardedPoints) ? awardedPoints : 10} \u9ede`;
    keepDisabled = false;
    if (statusEl) statusEl.textContent = data?.alreadyChecked ? '\u4eca\u5929\u5df2\u9818\u53d6\u904e\u8d08\u9ede\u3002' : message;
    if (typeof window.showPointAwardCelebration === 'function' && data?.awarded) window.showPointAwardCelebration(Number.isFinite(awardedPoints) ? awardedPoints : 10);
    else window.showToast?.(message, false);
    window.pointWalletData = null;
    if (data?.balance !== undefined) {
      window.pointWalletData = {
        balance: Number(data.balance || 0),
        list: [],
        loadedAt: Date.now()
      };
    }
    if (data?.awarded) await new Promise(resolve => setTimeout(resolve, 1000));
    await window.loadPointsWallet(true);
    await window.refreshPointBalanceBadge?.();
  } catch (e) {
    const msg = e.message || e || '每日簽到失敗';
    if (statusEl) statusEl.textContent = String(msg);
    window.showToast?.('每日簽到失敗：' + msg, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      if (oldHtml) btn.innerHTML = oldHtml;
      else btn.textContent = '\u7c3d\u5230\u8d08\u9ede';
      btn.classList.remove('opacity-70');
    }
  }
};

window.renderCardCoolReviewPage = async function(jobId, cardId = '') {
  const app = document.getElementById('app') || document.body;
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.classList.add('hidden');
  document.body.classList.remove('home-page');

  const fieldDefs = [
    ['name', '姓名'],
    ['englishName', '英文姓名'],
    ['companyName', '公司名稱'],
    ['title', '職稱'],
    ['department', '部門'],
    ['mobile', '手機'],
    ['officePhone', '公司電話'],
    ['email', 'Email'],
    ['website', '網站'],
    ['address', '地址'],
    ['tags', '標籤']
  ];

  const renderShell = (inner) => {
    app.innerHTML = `
      <main class="min-h-screen bg-[#f8fafc] px-4 py-5 overflow-y-auto">
        <section class="max-w-md mx-auto bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100">
            <div class="text-[12px] font-black text-blue-600 mb-1">AI名片夾 OCR</div>
            <h1 class="text-[22px] font-black text-slate-900">核對名片資料</h1>
            <p class="text-[13px] font-bold text-slate-500 mt-1">請確認掃描結果，必要時修改後再儲存或發送到聊天室測試。</p>
          </div>
          <div id="cardcool-review-body" class="p-5">${inner}</div>
        </section>
      </main>
    `;
  };

  renderShell('<div class="py-12 text-center"><span class="material-symbols-outlined animate-spin text-4xl text-blue-600">autorenew</span><div class="mt-3 text-sm font-black text-slate-500">讀取名片資料...</div></div>');

  try {
    const draft = await window.fetchAPI('getCardCoolDraft', { jobId: String(jobId || ''), cardId: String(cardId || '') }, true);
    const card = draft.card || {};
    const scannerName = draft.scanner && (draft.scanner.name || draft.scanner.userId) ? (draft.scanner.name || draft.scanner.userId) : '';
    const inputHtml = fieldDefs.map(([key, label]) => `
      <label class="block mb-4">
        <span class="block text-[12px] font-black text-slate-500 mb-1">${label}</span>
        <input data-cardcool-field="${key}" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] font-bold text-slate-900 outline-none focus:border-blue-500 focus:bg-white" value="${window.escapeHTML ? window.escapeHTML(card[key] || '') : String(card[key] || '')}">
      </label>
    `).join('');
    renderShell(`
      ${scannerName ? `<div class="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] font-black text-blue-700">掃描者：${window.escapeHTML ? window.escapeHTML(scannerName) : scannerName}</div>` : ''}
      ${inputHtml}
      <label class="block mb-5">
        <span class="block text-[12px] font-black text-slate-500 mb-1">名片說明</span>
        <textarea data-cardcool-field="services" rows="8" class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] font-bold leading-7 text-slate-900 outline-none focus:border-blue-500 focus:bg-white">${window.escapeHTML ? window.escapeHTML(card.services || '') : String(card.services || '')}</textarea>
      </label>
      <button id="btn-cardcool-confirm" class="w-full rounded-2xl bg-blue-600 py-4 text-white text-[16px] font-black shadow-lg shadow-blue-600/20 active:scale-[0.99]">儲存並發送到聊天室</button>
      <button id="btn-cardcool-save-only" class="mt-3 w-full rounded-2xl bg-slate-900 py-4 text-white text-[16px] font-black active:scale-[0.99]">只儲存修改</button>
      <button id="btn-cardcool-close" class="mt-3 w-full rounded-2xl bg-slate-100 py-3 text-slate-600 text-[14px] font-black active:scale-[0.99]">返回聊天室</button>
    `);

    const closeBtn = document.getElementById('btn-cardcool-close');
    if (closeBtn) closeBtn.onclick = () => window.closeActmasterLiffOrHome?.(80);
    const saveDraft = async (pushToChat, confirmBtn) => {
      const oldText = confirmBtn ? confirmBtn.textContent : '';
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = pushToChat ? '儲存並發送中...' : '儲存中...';
      }
      try {
        const reviewed = {};
        document.querySelectorAll('[data-cardcool-field]').forEach(el => {
          reviewed[el.getAttribute('data-cardcool-field')] = el.value || '';
        });
        await window.fetchAPI('confirmCardCoolDraft', {
          jobId: String(jobId || ''),
          cardId: String(cardId || ''),
          card: reviewed,
          pushToChat
        }, true);
        renderShell(`
          <div class="py-10 text-center">
            <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <span class="material-symbols-outlined text-3xl">check_circle</span>
            </div>
            <h2 class="text-xl font-black text-slate-900">名片已儲存</h2>
            <p class="mt-2 text-sm font-bold text-slate-500">${pushToChat ? '已推送到 LINE 聊天室。' : '修改已保存，未推送聊天室。'}</p>
            <button id="btn-cardcool-done-close" class="mt-6 w-full rounded-2xl bg-blue-600 py-4 text-white text-[16px] font-black">返回聊天室</button>
          </div>
        `);
        const doneClose = document.getElementById('btn-cardcool-done-close');
        if (doneClose) doneClose.onclick = () => window.closeActmasterLiffOrHome?.(80);
        if (pushToChat) window.closeActmasterLiffOrHome?.(1600);
      } catch (e) {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = oldText || (pushToChat ? '儲存並發送到聊天室' : '只儲存修改');
        }
        window.showToast?.(e.message || '名片儲存失敗', true);
      }
    };
    const confirmBtn = document.getElementById('btn-cardcool-confirm');
    const saveOnlyBtn = document.getElementById('btn-cardcool-save-only');
    if (confirmBtn) confirmBtn.onclick = () => saveDraft(true, confirmBtn);
    if (saveOnlyBtn) saveOnlyBtn.onclick = () => saveDraft(false, saveOnlyBtn);
  } catch (e) {
    renderShell(`<div class="rounded-2xl bg-red-50 border border-red-100 px-4 py-5 text-center text-sm font-black text-red-600">${window.escapeHTML ? window.escapeHTML(e.message || '讀取失敗') : '讀取失敗'}</div>`);
  }
};

window.applyUnregisteredHomeSession = function(options = {}) {
  const profile = window.currentUserProfile || {};
  const userId = String(profile.userId || options.userId || '').trim();
  if (!userId) return false;

  const info = {
    userId,
    lineId: userId,
    name: profile.displayName || options.name || '',
    pictureUrl: profile.pictureUrl || '',
    role: 'user',
    networkId: options.networkId || options.referrerId || 'admin',
    referrerId: options.referrerId || '',
    points: Number(options.points || 0),
    isRegistered: false,
    needsMyCardSetup: true
  };

  window.applyRegisteredUserSession(info);
  try {
    window.currentUser.needsMyCardSetup = true;
  } catch (e) {}
  window.goPage('home');
  setTimeout(() => {
    if (typeof window.updateMyCardReminder === 'function') window.updateMyCardReminder();
    if (typeof window.loadHomeData === 'function') window.loadHomeData();
  }, 40);
  return true;
};

window.reorderSettingsSections = function() {
  const page = document.getElementById('page-admin-settings');
  if (!page) return;

  const inviteButton = page.querySelector('button[onclick="window.showInviteLink()"]');
  const myCard = document.getElementById('details-my-ecard');
  const tenantPlan = document.getElementById('tenant-upgrade-card');
  const performance = document.getElementById('details-dealer-performance');

  if (inviteButton && myCard && myCard.previousElementSibling !== inviteButton) {
    inviteButton.insertAdjacentElement('afterend', myCard);
  }
  if (tenantPlan && tenantPlan.parentElement === page) page.appendChild(tenantPlan);
  if (performance && performance.parentElement === page) page.appendChild(performance);
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (window.__ACTMASTER_INSTANT_LIKE_HANDLED) return;
    if (typeof window.prepareRegistrationInputs === 'function') window.prepareRegistrationInputs();
    window.reorderSettingsSections();
    const initialUrlParams = typeof window.readActmasterInitialParams === 'function'
      ? window.readActmasterInitialParams()
      : new URLSearchParams(window.location.search);
    const instantLikeCardId = initialUrlParams.get('likeCardId');
    if (instantLikeCardId) {
      window.handleInstantSocialLikeEntry?.(instantLikeCardId, initialUrlParams.get('net') || 'admin');
      return;
    }
    const webCardId = initialUrlParams.get('webCardId') || (
      initialUrlParams.get('web') === '1' ? initialUrlParams.get('shareCardId') : ''
    );
    if (webCardId) {
      await renderStandaloneWebCardPage(
        webCardId,
        initialUrlParams.get('ref') || '',
        initialUrlParams.get('net') || 'admin'
      );
      return;
    }
    if (typeof window.initActmasterLiff === 'function') {
      await window.initActmasterLiff(LIFF_ID);
    } else {
      await liff.init({ liffId: LIFF_ID });
    }

    if (!liff.isLoggedIn()) {
      if (typeof window.ensureActmasterLiffLogin === 'function') {
        window.ensureActmasterLiffLogin({ redirectUri: window.location.href });
      } else {
        liff.login({ redirectUri: window.location.href });
      }
      return;
    }

    window.currentUserProfile = await liff.getProfile();

    // 🟢 【關鍵修復】在此處攔截 window.fetchAPI，自動為所有 API 請求注入 lineAccessToken 以通過 workerbackup.js 嚴格驗證
    if (typeof window.fetchAPI === 'function' && !window.__fetchApiEnhanced) {
      const originalFetch = window.fetchAPI;
      window.fetchAPI = async function(action, payload, showLoading) {
        const enhancedPayload = payload ? { ...payload } : {};
        if (typeof liff !== 'undefined' && liff.isLoggedIn && liff.isLoggedIn()) {
          try {
            enhancedPayload.lineAccessToken = liff.getAccessToken();
            // 確保有 userId，避免某些舊 Payload 遺漏導致後端配對錯誤
            if (!enhancedPayload.userId && window.currentUserProfile?.userId) {
              enhancedPayload.userId = window.currentUserProfile.userId;
            }
          } catch(e) {}
        }
        return originalFetch.call(this, action, enhancedPayload, showLoading);
      };
      window.__fetchApiEnhanced = true;
    }

    const avatarImg = document.getElementById('avatar');
    if (avatarImg && window.currentUserProfile.pictureUrl) {
      avatarImg.src = window.currentUserProfile.pictureUrl;
      avatarImg.classList.remove('hidden');
    }
    if (typeof window.refreshHomeProfileCard === 'function') window.refreshHomeProfileCard();
    setTimeout(() => window.refreshPointBalanceBadge?.(), 300);

    const urlParams = typeof window.readActmasterInitialParams === 'function'
      ? window.readActmasterInitialParams()
      : new URLSearchParams(window.location.search);
    const wantsCardCoolList = urlParams.get('mode') === 'cardcool-list';
    if (urlParams.get('mode') === 'cardcool-review') {
      await window.renderCardCoolReviewPage(urlParams.get('jobId') || '', urlParams.get('cardId') || urlParams.get('rowId') || '');
      return;
    }
    const wantsLineOAMonitor = (
      urlParams.get('open') === 'monitor' ||
      urlParams.get('monitor') === '1' ||
      urlParams.get('lineoaMonitor') === '1'
    );
    if (wantsLineOAMonitor) {
      let accessToken = '';
      try {
        if (typeof liff !== 'undefined' && liff.isLoggedIn && liff.isLoggedIn()) {
          accessToken = liff.getAccessToken();
        }
      } catch (e) {}
      const monitorUid = String(
        urlParams.get('pt_uid') ||
        urlParams.get('uid') ||
        urlParams.get('userId') ||
        urlParams.get('LINE_user_id') ||
        urlParams.get('lineUserId') ||
        urlParams.get('pointUserId') ||
        urlParams.get('wallet_uid') ||
        window.currentUserProfile?.userId ||
        ''
      ).trim();
      const query = monitorUid ? '?pt_uid=' + encodeURIComponent(monitorUid) : '';
      const hash = accessToken ? '#lineoa_token=' + encodeURIComponent(accessToken) : '';
      window.location.replace('https://line-engine.fangwl591021.workers.dev/monitor' + query + hash);
      return;
    }
    if (urlParams.get('admin') === '1' || urlParams.get('adminPage') === '1') {
      window.location.replace('admin.html?from_liff=1&t=' + Date.now());
      return;
    }
    const shareCardId = urlParams.get('shareCardId');
    const likeCardId = urlParams.get('likeCardId');
    const shouldSendCardToChat = shareCardId && (
      urlParams.get('send') === '1' ||
      urlParams.get('action') === 'send'
    );
    const shouldAutoShareCard = shareCardId && (
      urlParams.get('share') === '1' ||
      urlParams.get('autoShare') === '1' ||
      urlParams.get('action') === 'share'
    );
    const claimCardId = urlParams.get('claim');
    const refId = urlParams.get('ref') || '';
    const netId = urlParams.get('net') || 'admin';

    if (likeCardId) {
      await window.handleAutoSocialLikeEntry?.(likeCardId, netId);
      return;
    }

    if (shouldSendCardToChat) {
      await handleAutoSendCardEntry(shareCardId, refId, netId);
      return;
    }

    if (shouldAutoShareCard) {
      await handleAutoShareCardEntry(shareCardId, refId, netId);
      return;
    }

    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      window.goPage('home', true);
      loadingScreen.classList.add('hidden');
    }
    const pointUid = window.readPointUidFromParams?.(urlParams) || '';
    if (pointUid) {
      try {
        window.storePointUidBridge?.(window.currentUserProfile.userId, pointUid);
      } catch (e) {}
      setTimeout(() => window.refreshPointBalanceBadge?.(), 200);
    }
    if (refId) writeFirstReferral(window.currentUserProfile.userId, refId, netId);
    const authCacheKey = 'ACTMASTER_USER_' + window.currentUserProfile.userId;
    let usedCachedUser = false;
    let cachedUserInfo = null;

    if (!shareCardId && !claimCardId) {
      try {
        const cached = JSON.parse(localStorage.getItem(authCacheKey) || 'null');
        const isFresh = cached && cached.info && cached.savedAt && (Date.now() - cached.savedAt < 6 * 60 * 60 * 1000);
        if (isFresh) {
          cachedUserInfo = cached.info;
          window.applyRegisteredUserSession(cachedUserInfo);
          window.goPage(wantsCardCoolList ? 'card' : 'home');
          setTimeout(() => {
            if (wantsCardCoolList && typeof window.loadCardData === 'function') {
              window.loadCardData({ render: true, harvest: true, force: true });
            } else if (typeof window.loadHomeData === 'function') {
              window.loadHomeData();
            }
          }, 40);
          usedCachedUser = true;
        }
      } catch (e) {}
    }

    const checkRes = await window.fetchAPI('checkUser', { userId: window.currentUserProfile.userId }, true);

    if (shareCardId && typeof window.recordShareCardVisitOnce === 'function') {
      window.recordShareCardVisitOnce({
        shareCardId: shareCardId,
        referrerId: refId,
        networkId: netId
      });
    }

    document.getElementById('loading-screen').classList.add('hidden');

    // 🔒 未註冊用戶邏輯
    if (!checkRes || checkRes.error || !checkRes.isRegistered) {
      if (usedCachedUser && cachedUserInfo && !shareCardId && !claimCardId) {
        console.warn('Auth check did not confirm membership; keeping cached session:', checkRes && (checkRes.error || checkRes.source || 'not_registered'));
        return;
      }
      if (checkRes && checkRes.error) {
        console.error("Auth check failed:", checkRes.error);
        const recovered = await window.recoverRegisteredUserFromBoundCard(window.currentUserProfile.userId);
        if (recovered) {
          window.goPage('home');
          if (typeof window.loadHomeData === 'function') window.loadHomeData();
          return;
        }
        window.showToast("連線異常，請重新整理", true);
        return;
      }

      if (!claimCardId) {
        const recovered = await window.recoverRegisteredUserFromLegacyCache(window.currentUserProfile.userId)
          || await window.recoverRegisteredUserFromBoundCard(window.currentUserProfile.userId);
        if (recovered) {
          window.goPage('home');
          if (typeof window.loadHomeData === 'function') window.loadHomeData();
          return;
        }
      }

      if (claimCardId) {
        try {
          await window.autoClaimCardFromLink(claimCardId, refId, netId);
          window.showToast('名片已綁定，資料之後可再補');
          window.goPage('admin-settings');
          if (typeof window.focusMyECardSection === 'function') window.focusMyECardSection();
          return;
        } catch(e) {
          window.showToast(e.message || '名片綁定失敗', true);
          window.applyUnregisteredHomeSession?.({ referrerId: refId, networkId: netId });
        }
      } else {
        window.applyUnregisteredHomeSession?.({ referrerId: refId, networkId: netId });
      }

      if (shareCardId) {
        try {
          const cData = await window.fetchAPI('getCardContacts', { networkId: 'admin', role: 'admin', userId: '' }, true);
          if (cData && Array.isArray(cData)) {
            const sc = cData.find(c => String(c.rowId) === String(shareCardId));
            if (sc) {
              if (shouldAutoShareCard) {
                await window.shareCardFromLink(sc, { referrerId: window.currentUserProfile?.userId || refId, networkId: netId });
                return;
              }
              window.roCardData = sc;
              let cfg = {};
              try { cfg = JSON.parse(sc['自訂名片設定'] || '{}'); } catch(e){}
              let cfgParams = {
                imgUrl: cfg.imgUrl || sc['名片圖檔'] || '',
                imgRatio: cfg.imgRatioLandscape || '20:13',
                buttons: cfg.buttons || [],
                descAlign: cfg.descAlign || 'center',
                descColor: cfg.descColor || '#666666',
                layoutStyle: cfg.layoutStyle || 'landscape'
              };
              document.getElementById('ro-card-container').innerHTML = window.getPreviewHTML(sc, 'ro', cfgParams);
              document.getElementById('readonly-card-modal').classList.remove('hidden');
            }
          }
        } catch(e){}
      }
      return;
    }

    // 🔓 已註冊用戶邏輯
    window.applyRegisteredUserSession(checkRes.info);
    try {
      localStorage.setItem(authCacheKey, JSON.stringify({ info: checkRes.info, savedAt: Date.now() }));
    } catch (e) {}

    // ✅ 先顯示首頁，不等資料載入
    if (!shareCardId && !claimCardId && !usedCachedUser) {
      window.goPage(wantsCardCoolList ? 'card' : 'home');
    }

    // ✅ 背景非同步載入，不阻塞首頁第一幀；一般首頁只載活動，不碰名片庫圖片。
    const startBackgroundDataLoad = () => {
      const dataLoad = (wantsCardCoolList && typeof window.loadCardData === 'function')
        ? window.loadCardData({ render: true, harvest: true, force: true })
        : (shareCardId || claimCardId)
          ? window.loadAllData()
          : window.loadHomeData();

      dataLoad.then(() => {
      if (shareCardId) {
        const sc = window.allCards.find(c => String(c.rowId) === String(shareCardId));
        if (sc) {
          if (shouldAutoShareCard) {
            window.shareCardFromLink(sc, { referrerId: window.currentUserProfile?.userId || refId, networkId: netId })
              .catch(e => window.showToast?.(e.message || '分享失敗，請稍後再試', true));
          } else {
            window.openCardDetail(sc);
          }
        } else {
          window.showToast('找不到該名片', true);
          window.goPage('home');
        }
      } else if (claimCardId) {
        window.fetchAPI('getCardForClaim', { claimRowId: claimCardId }, true).then(cardForClaim => {
          if (cardForClaim && cardForClaim.error) throw new Error(cardForClaim.error);
          const claimReferral = resolveReferralForRegistration(refId, netId || cardForClaim?.['歸屬網'] || 'admin');
          return window.fetchAPI('claimCardAndRegister', {
            claimRowId: claimCardId,
            userId: window.currentUserProfile.userId,
            '姓名': cardForClaim?.['姓名'] || window.currentUser?.name || window.currentUserProfile.displayName || '',
            '手機號碼': cardForClaim?.['手機號碼'] || cardForClaim?.['公司電話'] || window.currentUser?.phone || '',
            '公司名稱': cardForClaim?.['公司名稱'] || '',
            '職稱': cardForClaim?.['職稱'] || '',
            referrerId: claimReferral.referrerId,
            networkId: claimReferral.networkId
          }, true).then(claimRes => ({ claimRes, cardForClaim }));
        }).then(({ claimRes, cardForClaim }) => {
          if (claimRes && claimRes.error) {
            window.showToast('認領失敗: ' + claimRes.error, true);
            window.goPage('home');
          } else if (claimRes) {
            window.ensureClaimedCardUserProfile(window.buildUserProfileFromClaimCard(cardForClaim, {
              userId: window.currentUserProfile.userId,
              claimRowId: claimCardId,
              referrerId: resolveReferralForRegistration(refId, netId || cardForClaim?.['歸屬網'] || 'admin').referrerId,
              networkId: resolveReferralForRegistration(refId, netId || cardForClaim?.['歸屬網'] || 'admin').networkId
            })).then(() => window.loadAllData()).then(() => {
              window.showToast('✅ 成功認領名片並同步會員資料！');
              window.goPage('admin-settings');
              if (typeof window.focusMyECardSection === 'function') window.focusMyECardSection();
            });
          }
        }).catch(e => {
          window.showToast(e.message || '該名片已被認領或無法存取', true);
          window.goPage('home');
        });
      }
      });
    };

    if (!usedCachedUser || shareCardId || claimCardId) {
      setTimeout(startBackgroundDataLoad, (shareCardId || claimCardId) ? 0 : 120);
    }

  } catch (err) {
    document.getElementById('loading-text').innerText = "系統連線失敗";
    console.error(err);
  }
});
