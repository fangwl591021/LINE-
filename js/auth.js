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
  try { cfg = JSON.parse(card?.['自訂名片設定'] || '{}') || {}; } catch (e) {}
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
    if (flexMsg.header && Array.isArray(flexMsg.header.contents) && flexMsg.header.contents[0]) {
      const first = flexMsg.header.contents[0];
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

window.shareCardFromLink = async function(card, options = {}) {
  if (!card || window.__autoSharingCardFromLink) return false;
  window.__autoSharingCardFromLink = true;
  const referrerId = options.referrerId || window.currentUserProfile?.userId || '';
  const networkId = options.networkId || window.currentNetworkId || 'admin';

  try {
    const shareUrl = buildPlainCardViewUrl(card, referrerId, networkId);
    const shareConfig = buildCardShareConfig(card);
    let flexMsg = null;

    // Share contract: card link auto-share must use the same local Flex builder as the personal card area.
    // Do not silently fall back to text URL sharing here; users expect the LINE contact picker with a real card.
    if (typeof window.buildLocalECardFlexMessage === 'function') {
      flexMsg = window.buildLocalECardFlexMessage(card, shareConfig, shareUrl);
    } else {
      flexMsg = await window.fetchAPI('buildFlexMessage', {
        card,
        config: shareConfig,
        referrerId,
        networkId,
        liffId: window.POINT_LIFF_ID || window.DEFAULT_LIFF_ID || window.LIFF_ID
      }, true);
    }

    if (!flexMsg || flexMsg.error) {
      throw new Error(flexMsg?.error || '無法產生 LINE 名片訊息');
    }

    routeSharedCardBadgeToPicker(flexMsg, shareUrl);
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

async function handleAutoShareCardEntry(shareCardId, refId, netId) {
  if (!shareCardId) return false;
  const loadingText = document.getElementById('loading-text');
  if (loadingText) loadingText.innerText = '正在開啟 LINE 分享...';

  try {
    const cData = await window.fetchAPI('getCardContacts', { networkId: 'admin', role: 'admin', userId: '' }, true);
    const cards = Array.isArray(cData) ? cData : (Array.isArray(cData?.data) ? cData.data : []);
    const sc = cards.find(c => String(c.rowId) === String(shareCardId));
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
  const userId = window.currentUserProfile?.userId || window.currentUser?.userId || '';
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
  window.currentStoreId = window.currentUser.storeid || (normalizedRole === 'store' ? window.currentNetworkId : '');

  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.classList.remove('hidden');
  window.applyUserPermissions();
  if (typeof window.refreshInboxBadge === 'function') window.refreshInboxBadge();

  const profileName = document.getElementById('profile-name');
  const profilePhone = document.getElementById('profile-phone');
  const profileIndustry = document.getElementById('profile-industry');
  const profileBirthday = document.getElementById('profile-birthday');
  if (profileName) profileName.value = window.currentUser.name || '';
  if (profilePhone) profilePhone.value = window.currentUser.phone || '';
  if (profileIndustry) profileIndustry.value = window.currentUser.industry || '';
  if (profileBirthday) profileBirthday.value = window.currentUser.birthday || '';

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
};

window.refreshPointBalanceBadge = async function() {
  const badge = document.getElementById('point-balance-badge');
  const userId = window.currentUserProfile?.userId || '';
  if (!badge || !userId || typeof window.fetchAPI !== 'function') return;

  try {
    const data = await window.fetchPointWalletData_();
    if (!data) {
      badge.classList.add('hidden');
      return;
    }
    const balance = Number(data.balance || 0);
    badge.textContent = balance.toLocaleString('zh-TW') + ' 點';
    badge.classList.remove('hidden');
    if (typeof window.refreshHomeProfileCard === 'function') window.refreshHomeProfileCard();
  } catch (e) {
    badge.classList.add('hidden');
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
  const res = await window.fetchAPI('queryUserPoints', {
    userId,
    pointUserId,
    pt_uid: pointUserId,
    page: 1,
    per_page: 100,
    point_type: 'gift_money'
  }, true);
  if (!res || res.error) return null;
  const data = res.data || res;
  window.pointWalletData = {
    ...data,
    balance: Number(data.balance || data.latestBalance || data.typedBalance || 0) || 0,
    list: Array.isArray(data.list) ? data.list : [],
    queriedLineUserId: data.queriedLineUserId || pointUserId,
    balanceByType: data.balanceByType || null,
    loadedAt: Date.now()
  };
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
  listEl.innerHTML = '<div class="py-10 text-center text-slate-400 text-sm font-bold">載入點數紀錄中...</div>';

  const data = await window.fetchPointWalletData_(force);
  if (!data) {
    balanceEl.textContent = '0';
    listEl.innerHTML = '<div class="py-10 text-center text-red-400 text-sm font-bold">暫時無法取得點數紀錄</div>';
    return;
  }

  balanceEl.textContent = Number(data.balance || 0).toLocaleString('zh-TW');
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

  const badge = document.getElementById('point-balance-badge');
  if (badge) {
    badge.textContent = Number(data.balance || 0).toLocaleString('zh-TW') + ' 點';
    badge.classList.remove('hidden');
  }
};

window.canUseStorePointCashier = function() {
  const role = String(window.userRole || window.currentUser?.role || '').toLowerCase();
  return role === 'admin' || role === 'store';
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
  if (!preview || !amountInput) return;

  const amount = Math.floor(Number(amountInput.value || 0));
  const mode = window.getStorePointMode();
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

  const maxDeduct = Math.floor(amount * 0.1);
  const customerBalance = Number(window.storePointCustomer?.balance || 0);
  const actualDeduct = customerBalance > 0 ? Math.min(maxDeduct, Math.floor(customerBalance)) : maxDeduct;
  const payable = amount - actualDeduct;
  preview.className = 'rounded-2xl bg-blue-50 border border-blue-100 p-4 text-[14px] text-slate-700 font-bold leading-relaxed';
  preview.innerHTML = `最多可折抵 <b class="text-blue-600">${maxDeduct.toLocaleString('zh-TW')} 點</b>${customerBalance ? `，目前可用 ${customerBalance.toLocaleString('zh-TW')} 點` : ''}，預估應收 NT$${payable.toLocaleString('zh-TW')}；店家操作扣 10 點。`;
};

window.renderStorePointCustomer = function(customer) {
  const card = document.getElementById('store-point-customer-card');
  const avatar = document.getElementById('store-point-customer-avatar');
  const name = document.getElementById('store-point-customer-name');
  const meta = document.getElementById('store-point-customer-meta');
  const balance = document.getElementById('store-point-customer-balance');
  if (!card) return;
  if (!customer) {
    window.storePointCustomer = null;
    card.classList.add('hidden');
    return;
  }
  window.storePointCustomer = customer;
  if (avatar) {
    avatar.src = customer.avatarUrl || customer.card?.imageUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(customer.name || 'U') + '&background=E2E8F0&color=334155';
  }
  if (name) name.textContent = customer.name || '未命名用戶';
  if (meta) {
    const metaParts = [customer.phone, customer.industry].filter(Boolean);
    meta.textContent = metaParts.length ? metaParts.join(' / ') : (customer.customerPointUserId || '-');
  }
  if (balance) balance.textContent = Number(customer.balance || 0).toLocaleString('zh-TW') + ' 點';
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
    if (input && data.customerPointUserId && input.value !== data.customerPointUserId) {
      input.value = data.customerPointUserId;
    }
    window.renderStorePointCustomer(data);
    return data;
  } catch (e) {
    window.renderStorePointCustomer({
      name: '查無用戶資料',
      phone: '',
      industry: customerUserId,
      customerPointUserId: customerUserId,
      balance: 0
    });
    window.showToast?.('客戶資料查詢失敗：' + (e.message || e), true);
    return null;
  }
};

window.resetStorePointCashier = function() {
  const body = document.getElementById('store-point-cashier-body');
  const icon = document.getElementById('store-point-cashier-icon');
  const customerInput = document.getElementById('store-point-customer');
  const amountInput = document.getElementById('store-point-amount');
  const preview = document.getElementById('store-point-preview');
  if (body) body.classList.add('hidden');
  if (icon) icon.textContent = 'expand_more';
  if (customerInput) customerInput.value = '';
  if (amountInput) amountInput.value = '';
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
  const preview = document.getElementById('store-point-preview');
  const customerUserId = window.storePointCustomer?.customerPointUserId
    || window.extractPointCustomerId(customerInput?.value || '');
  const amount = Math.floor(Number(amountInput?.value || 0));
  const mode = window.getStorePointMode();

  if (!customerUserId) return window.showToast?.('請先掃描或輸入客戶帳號', true);
  if (!amount || amount <= 0) return window.showToast?.('請輸入正確消費金額', true);

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
      mode
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
  const oldText = btn ? btn.textContent : '';
  let keepDisabled = false;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '處理中';
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
    const message = data?.message || (data?.alreadyChecked ? '今天已領取過點數家族簽到獎勵' : '點數家族簽到成功，已獲得 10 點');
    keepDisabled = Boolean(data?.awarded || data?.alreadyChecked);
    if (statusEl) statusEl.textContent = message;
    window.showToast?.(message, false);
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
      btn.disabled = keepDisabled;
      btn.textContent = keepDisabled ? '已簽到' : (oldText || '簽到');
      btn.classList.remove('opacity-70');
    }
  }
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
    window.reorderSettingsSections();
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
      const hash = accessToken ? '#lineoa_token=' + encodeURIComponent(accessToken) : '';
      window.location.replace('https://line-engine.fangwl591021.workers.dev/monitor' + hash);
      return;
    }
    if (urlParams.get('admin') === '1' || urlParams.get('adminPage') === '1') {
      window.location.replace('admin.html?from_liff=1&t=' + Date.now());
      return;
    }
    const shareCardId = urlParams.get('shareCardId');
    const shouldAutoShareCard = shareCardId && (
      urlParams.get('share') === '1' ||
      urlParams.get('autoShare') === '1' ||
      urlParams.get('action') === 'share'
    );
    const claimCardId = urlParams.get('claim');
    const refId = urlParams.get('ref') || '';
    const netId = urlParams.get('net') || 'admin';

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

    if (!shareCardId && !claimCardId) {
      try {
        const cached = JSON.parse(localStorage.getItem(authCacheKey) || 'null');
        const isFresh = cached && cached.info && cached.savedAt && (Date.now() - cached.savedAt < 6 * 60 * 60 * 1000);
        if (isFresh) {
          window.applyRegisteredUserSession(cached.info);
          window.goPage('home');
          setTimeout(() => {
            if (typeof window.loadHomeData === 'function') window.loadHomeData();
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
      if (checkRes && checkRes.error) {
        console.error("Auth check failed:", checkRes.error);
        if (usedCachedUser) return;
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
          window.goPage('register');
        }
      } else {
        window.goPage('register');
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
      window.goPage('home');
    }

    // ✅ 背景非同步載入，不阻塞首頁第一幀；一般首頁只載活動，不碰名片庫圖片。
    const startBackgroundDataLoad = () => {
      const dataLoad = (shareCardId || claimCardId)
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
