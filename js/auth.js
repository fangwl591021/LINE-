/* ==================== 系統啟動與權限驗證 ==================== */

window.submitRegistration = async function() {
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  if (!name || !phone) return window.showToast('姓名與手機為必填', true);

  const btn = document.getElementById('btn-register');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 註冊中...';
  btn.disabled = true;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const refId = urlParams.get('ref') || '';
    const netId = urlParams.get('net') || 'admin';

    const payload = {
      userId: window.currentUserProfile.userId,
      name: name,
      phone: phone,
      industry: document.getElementById('reg-industry').value.trim(),
      birthday: document.getElementById('reg-birthday').value,
      '推薦人': refId,
      networkId: netId
    };

    const res = await window.fetchAPI('registerUser', payload, true);
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

window.submitClaimRegistration = async function() {
  const name = document.getElementById('claim-name').value.trim();
  const phone = document.getElementById('claim-phone').value.trim();
  if (!name || !phone) return window.showToast('姓名與手機為必填', true);

  const btn = document.getElementById('btn-claim-register');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 處理綁定中...';
  btn.disabled = true;

  try {
    const rowId = document.getElementById('claim-row-id').value;
    const payload = {
      userId: window.currentUserProfile.userId,
      claimRowId: rowId,
      '姓名': name,
      '手機號碼': phone,
      '公司名稱': document.getElementById('claim-company').value.trim(),
      '職稱': document.getElementById('claim-title').value.trim(),
      referrerId: document.getElementById('claim-ref-id').value || '',
      networkId: document.getElementById('claim-net-id').value || 'admin'
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

  window.currentUser = info;
  window.userRole = window.currentUser.role || 'user';
  window.currentNetworkId = window.currentUser.networkId || 'admin';
  window.currentStoreId = window.currentUser.storeid || '';

  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.classList.remove('hidden');
  window.applyUserPermissions();

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
      arr.forEach(s => window.addUserSocial(s.t, s.u));
    } catch(e){}
  } else {
    window.addUserSocial('LINE', '');
  }

  const tgToken = document.getElementById('setting-tg-token');
  const tgChatId = document.getElementById('setting-tg-chatid');
  if (tgToken && window.currentUser.tgToken) tgToken.value = window.currentUser.tgToken;
  if (tgChatId && window.currentUser.tgChatId) tgChatId.value = window.currentUser.tgChatId;
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }

    window.currentUserProfile = await liff.getProfile();

    const avatarImg = document.getElementById('avatar');
    if (avatarImg && window.currentUserProfile.pictureUrl) {
      avatarImg.src = window.currentUserProfile.pictureUrl;
      avatarImg.classList.remove('hidden');
    }

    // 先把首頁框架顯示出來，後續身分與資料用背景載入補上。
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      window.goPage('home', true);
      loadingScreen.classList.add('hidden');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const shareCardId = urlParams.get('shareCardId');
    const claimCardId = urlParams.get('claim');
    const refId = urlParams.get('ref') || '';
    const netId = urlParams.get('net') || 'admin';
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
        window.showToast("連線異常，請重新整理", true);
        return;
      }

      if (claimCardId) {
        try {
          const claimRes = await window.fetchAPI('getCardForClaim', { claimRowId: claimCardId }, true);

          if (claimRes && claimRes.error) {
            window.showToast('後端拒絕: ' + claimRes.error, true);
            window.goPage('register');
            return;
          }

          if (claimRes && claimRes['姓名']) {
            document.getElementById('claim-row-id').value = claimCardId;
            document.getElementById('claim-ref-id').value = refId;
            document.getElementById('claim-net-id').value = netId;
            document.getElementById('claim-name').value = claimRes['姓名'] || '';
            document.getElementById('claim-phone').value = claimRes['手機號碼'] || claimRes['公司電話'] || '';
            document.getElementById('claim-company').value = claimRes['公司名稱'] || '';
            document.getElementById('claim-title').value = claimRes['職稱'] || '';
            window.goPage('claim-register');
            return;
          } else {
            window.showToast('無效的名片資料格式', true);
            window.goPage('register');
          }
        } catch(e) {
          window.showToast(e.message || '該名片無法認領', true);
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
          window.openCardDetail(sc);
        } else {
          window.showToast('找不到該名片', true);
          window.goPage('home');
        }
      } else if (claimCardId) {
        window.fetchAPI('getCardForClaim', { claimRowId: claimCardId }, true).then(cardForClaim => {
          if (cardForClaim && cardForClaim.error) throw new Error(cardForClaim.error);
          return window.fetchAPI('claimCardAndRegister', {
            claimRowId: claimCardId,
            userId: window.currentUserProfile.userId,
            '姓名': cardForClaim?.['姓名'] || window.currentUser?.name || window.currentUserProfile.displayName || '',
            '手機號碼': cardForClaim?.['手機號碼'] || cardForClaim?.['公司電話'] || window.currentUser?.phone || '',
            '公司名稱': cardForClaim?.['公司名稱'] || '',
            '職稱': cardForClaim?.['職稱'] || '',
            referrerId: refId,
            networkId: netId || cardForClaim?.['歸屬網'] || 'admin'
          }, true).then(claimRes => ({ claimRes, cardForClaim }));
        }).then(({ claimRes, cardForClaim }) => {
          if (claimRes && claimRes.error) {
            window.showToast('認領失敗: ' + claimRes.error, true);
            window.goPage('home');
          } else if (claimRes) {
            window.ensureClaimedCardUserProfile(window.buildUserProfileFromClaimCard(cardForClaim, {
              userId: window.currentUserProfile.userId,
              claimRowId: claimCardId,
              referrerId: refId,
              networkId: netId || cardForClaim?.['歸屬網'] || 'admin'
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
