/* ==================== 認證與初始化 ==================== */

// 註冊新用戶
window.submitRegistration = async function() {
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const industry = document.getElementById('reg-industry').value.trim();
  const birthday = document.getElementById('reg-birthday').value.trim();

  if (!name || !phone) return window.showToast('請填寫真實姓名與手機', true);

  const btn = document.getElementById('btn-register');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> 註冊中...';
  btn.disabled = true;

  try {
    const profile = await liff.getProfile();
    const generatedStoreId = 'S' + profile.userId.substring(1, 9).toUpperCase();

    const payloadData = {
      '姓名': name,
      '手機': phone,
      '業種': industry,
      '生日': birthday,
      '權限': 'user',
      'storeid': generatedStoreId,
      '推薦人': window.urlRef,
      'networkId': window.urlNet || 'admin',
      'inviteVia': window.urlVia || ''
    };
    const res = await window.fetchAPI('registerUser', {
      userId: profile.userId,
      ...payloadData
    }, true);

    if (res && !res.error) {
      window.showToast('✅ 註冊成功,歡迎加入！');
      currentUser = { name, industry, phone, birthday, role: 'user', networkId: payloadData.networkId };
      userRole = 'user';
      currentNetworkId = currentUser.networkId;
      hasAdminRights = false;
      currentViewMode = 'user';

      const elUserName = document.getElementById('user-name');
      if (elUserName) elUserName.textContent = '歡迎 ' + name;
      const elUserStatus = document.getElementById('user-status');
      if (elUserStatus) elUserStatus.textContent = industry || '已註冊用戶';

      document.getElementById('profile-name').value = name;
      document.getElementById('profile-phone').value = phone;
      document.getElementById('profile-industry').value = industry;
      document.getElementById('profile-birthday').value = birthday;

      window.loadAllData();
      window.loadUserActivities();
      window.goPage('home');
    } else {
      throw new Error(res.error || '註冊失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
  } finally {
    btn.innerHTML = '開始使用 <span class="material-symbols-outlined">arrow_forward</span>';
    btn.disabled = false;
  }
};

// 更新個人基本資料
window.updateUserProfile = async function(event) {
  const btn = event.currentTarget;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  btn.disabled = true;

  const name = document.getElementById('profile-name').value.trim();
  const phone = document.getElementById('profile-phone').value.trim();
  const industry = document.getElementById('profile-industry').value.trim();
  const birthday = document.getElementById('profile-birthday').value.trim();

  try {
    const profile = await liff.getProfile();
    const payloadData = {
      '姓名': name,
      '手機': phone,
      '業種': industry,
      '生日': birthday
    };
    const res = await window.fetchAPI('updateUserProfile', {
      userId: profile.userId,
      data: payloadData
    }, true);

    if (res && !res.error) {
      window.showToast('✅ 基本資料已更新！');
      currentUser = { ...currentUser, name, phone, industry, birthday };
      const elUserName = document.getElementById('user-name');
      if (elUserName) elUserName.textContent = '歡迎回來,' + name;
      const elUserStatus = document.getElementById('user-status');
      if (elUserStatus) elUserStatus.textContent = industry || '已註冊用戶';
      window.updateMyECardPreview();
    } else {
      throw new Error(res.error || '更新失敗');
    }
  } catch(e) {
    window.showToast('⚠️ ' + e.message, true);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
};

// 系統初始化(LIFF + 權限驗證)
async function init() {
  try {
    await liff.init({ liffId: LIFF_ID });

    const urlParams = new URLSearchParams(window.location.search);
    window.urlRef = urlParams.get('ref') || '';
    window.urlNet = urlParams.get('net') || '';
    window.urlVia = urlParams.get('via') || '';

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }

    const profile = await liff.getProfile();
    currentUserProfile = profile;
    document.getElementById('avatar').src = profile.pictureUrl || '';
    document.getElementById('avatar').classList.remove('hidden');

    const cacheKey = 'actmaster_user_' + profile.userId;
    const cachedData = localStorage.getItem(cacheKey);

    let needAwaitFetch = true;

    // 1. 若有快取,進行極速渲染
    if (cachedData) {
      try {
        currentUser = JSON.parse(cachedData);
        userRole = currentUser.role || 'user';

        if (userRole === 'store' || userRole === 'admin') {
          currentNetworkId = profile.userId;
        } else {
          currentNetworkId = currentUser.networkId || 'admin';
        }

        window.applyUserPermissions();

        document.getElementById('loading-screen').classList.add('opacity-0');
        setTimeout(() => document.getElementById('loading-screen').classList.add('hidden'), 300);

        window.goPage('home', true);
        window.loadUserActivities();

        needAwaitFetch = false;
      } catch(e) {}
    }

    // 2. 呼叫 GAS 背景驗證
    const checkPromise = window.fetchAPI('checkUser', { userId: profile.userId }, true).then(checkRes => {
      if (checkRes && checkRes.isRegistered) {
        const newRole = checkRes.info.role || 'user';
        const roleChanged = (newRole !== userRole);

        currentUser = checkRes.info;
        userRole = newRole;

        if (userRole === 'store' || userRole === 'admin') {
          currentNetworkId = profile.userId;
        } else {
          currentNetworkId = currentUser.networkId || 'admin';
        }

        localStorage.setItem(cacheKey, JSON.stringify(currentUser));
        window.applyUserPermissions();

        if (needAwaitFetch) {
          document.getElementById('loading-screen').classList.add('opacity-0');
          setTimeout(() => document.getElementById('loading-screen').classList.add('hidden'), 300);
          window.goPage('home', true);
          window.loadUserActivities();
        } else if (roleChanged) {
          window.loadUserActivities();
        }

        const elUserName = document.getElementById('user-name');
        if (elUserName) elUserName.textContent = '歡迎回來,' + currentUser.name;
        const elUserStatus = document.getElementById('user-status');
        if (elUserStatus) elUserStatus.textContent = currentUser.industry || '一般會員';
        document.getElementById('profile-name').value = currentUser.name || '';
        document.getElementById('profile-phone').value = String(currentUser.phone || '').replaceAll(String.fromCharCode(8203), '').replaceAll("'", "");
        document.getElementById('profile-industry').value = currentUser.industry || '';
        document.getElementById('profile-birthday').value = currentUser.birthday || '';

        window.loadAllData().then(() => {
          let isMyCardPrivate = false;
          currentUserCard = allCards.find(c =>
            String(c['LINE ID']).trim() === profile.userId ||
            String(c.userId).trim() === profile.userId
          );

          // 自動綁定未認領的名片
          if (!currentUserCard && currentUser && currentUser.phone && currentUser.name) {
            const myPhoneClean = String(currentUser.phone).replace(/[^0-9]/g, '');
            const myName = String(currentUser.name).trim();
            if (myPhoneClean && myName) {
              const matchedCard = allCards.find(c => {
                const cardName = String(c['姓名'] || '').trim();
                const cardPhone1 = String(c['手機號碼'] || '').replace(/[^0-9]/g, '');
                const cardPhone2 = String(c['公司電話'] || '').replace(/[^0-9]/g, '');
                const cardUid = String(c['LINE ID'] || '').trim();
                const isUnbound = cardUid === '' || cardUid === 'undefined';
                return isUnbound && cardName === myName &&
                  (cardPhone1 === myPhoneClean || cardPhone2 === myPhoneClean);
              });
              if (matchedCard) {
                currentUserCard = matchedCard;
                matchedCard['LINE ID'] = profile.userId;
                window.fetchAPI('updateCard', {
                  rowId: matchedCard.rowId,
                  data: { 'LINE ID': profile.userId }
                }, true);
              }
            }
          }

          if (currentUserCard && currentUserCard['自訂名片設定']) {
            try {
              isMyCardPrivate = JSON.parse(currentUserCard['自訂名片設定']).isPrivate === true;
            } catch(e) {}
          }

          window.initMyECard();

          const matchmakerUi = document.getElementById('matchmaker-ui');
          const privacyLock = document.getElementById('privacy-lock-container');
          const privacyToggle = document.getElementById('fate-privacy-toggle');
          if (privacyToggle) privacyToggle.checked = !isMyCardPrivate;
          if (isMyCardPrivate && !hasAdminRights) {
            if (matchmakerUi) matchmakerUi.classList.add('hidden');
            if (privacyLock) privacyLock.classList.remove('hidden');
          } else {
            if (matchmakerUi) matchmakerUi.classList.remove('hidden');
            if (privacyLock) privacyLock.classList.add('hidden');
          }
          window.checkDatabaseStatus();

          // 處理分享連結
          const shareId = urlParams.get('shareCardId') || urlParams.get('claim');
          if (shareId) {
            const sharedCard = allCards.find(c => String(c.rowId) === String(shareId));
            if (sharedCard) {
              window.roCardData = sharedCard;
              let cfg = {};
              try { cfg = JSON.parse(sharedCard['自訂名片設定'] || '{}'); } catch(e){}
              document.getElementById('ro-card-container').innerHTML = window.getPreviewHTML(sharedCard, 'v1', {
                imgUrl: cfg.imgUrl || sharedCard['名片圖檔'],
                buttons: cfg.buttons || [],
                descAlign: cfg.descAlign || 'center',
                descColor: cfg.descColor || '#666666'
              });
              document.getElementById('readonly-card-modal').classList.remove('hidden');
            } else {
              window.showToast('⚠️ 找不到該名片,或無權限查看', true);
            }
          }
        });

      } else {
        // 尚未註冊
        document.getElementById('loading-screen').classList.add('hidden');
        window.goPage('register');
      }
    }).catch(err => {
      console.error("Auth check failed", err);
    });

    if (needAwaitFetch) {
      await checkPromise;
    }

  } catch (err) {
    console.error("Init failed", err);
    document.getElementById('loading-screen').classList.add('hidden');
    if (err.message && err.message.includes("channel not found")) {
      window.showToast("⚠️ LIFF 初始化失敗:找不到 Channel。請確認 LIFF ID 是否正確。", true);
    } else {
      window.showToast('⚠️ 系統初始化失敗:' + err.message, true);
    }
  }
}

window.addEventListener('DOMContentLoaded', init);
