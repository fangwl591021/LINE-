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
      window.showToast('✅ 名片認領並註冊成功！');
      setTimeout(() => window.location.replace(window.location.pathname), 1500);
    }
  } catch(e) {
    window.showToast('綁定失敗:' + e.message, true);
    btn.innerHTML = '確認認領並啟用名片 <span class="material-symbols-outlined">how_to_reg</span>';
    btn.disabled = false;
  }
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

    const checkRes = await window.fetchAPI('checkUser', { userId: window.currentUserProfile.userId }, true);

    const urlParams = new URLSearchParams(window.location.search);
    const shareCardId = urlParams.get('shareCardId');
    const claimCardId = urlParams.get('claim');
    const refId = urlParams.get('ref') || '';
    const netId = urlParams.get('net') || 'admin';

    document.getElementById('loading-screen').classList.add('hidden');

    // 🔒 未註冊用戶邏輯
    if (!checkRes || checkRes.error || !checkRes.isRegistered) {

      if (checkRes && checkRes.error) {
        console.error("Auth check failed:", checkRes.error);
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
    window.currentUser = checkRes.info;
    window.userRole = window.currentUser.role || 'user';
    window.currentNetworkId = window.currentUser.networkId || 'admin';
    window.currentStoreId = window.currentUser.storeid || '';

    document.getElementById('bottom-nav').classList.remove('hidden');
    window.applyUserPermissions();

    document.getElementById('profile-name').value = window.currentUser.name || '';
    document.getElementById('profile-phone').value = window.currentUser.phone || '';
    document.getElementById('profile-industry').value = window.currentUser.industry || '';
    document.getElementById('profile-birthday').value = window.currentUser.birthday || '';

    if (window.currentUser.socials) {
      try {
        const arr = JSON.parse(window.currentUser.socials);
        arr.forEach(s => window.addUserSocial(s.t, s.u));
      } catch(e){}
    } else {
      window.addUserSocial('LINE', '');
    }

    if (window.currentUser.tgToken) document.getElementById('setting-tg-token').value = window.currentUser.tgToken;
    if (window.currentUser.tgChatId) document.getElementById('setting-tg-chatid').value = window.currentUser.tgChatId;

    // ✅ 先顯示首頁，不等資料載入
    if (!shareCardId && !claimCardId) {
      window.goPage('home');
    }

    // ✅ 背景非同步載入，不阻塞畫面
    window.loadAllData().then(() => {
      if (shareCardId) {
        const sc = window.allCards.find(c => String(c.rowId) === String(shareCardId));
        if (sc) {
          window.openCardDetail(sc);
        } else {
          window.showToast('找不到該名片', true);
          window.goPage('home');
        }
      } else if (claimCardId) {
        window.fetchAPI('claimCardAndRegister', {
          claimRowId: claimCardId,
          userId: window.currentUserProfile.userId
        }, true).then(claimRes => {
          if (claimRes && claimRes.error) {
            window.showToast('認領失敗: ' + claimRes.error, true);
            window.goPage('home');
          } else if (claimRes) {
            window.showToast('✅ 成功認領名片並綁定您的帳號！');
            setTimeout(() => window.location.replace(window.location.pathname), 1500);
          }
        }).catch(e => {
          window.showToast(e.message || '該名片已被認領或無法存取', true);
          window.goPage('home');
        });
      }
    });

  } catch (err) {
    document.getElementById('loading-text').innerText = "系統連線失敗";
    console.error(err);
  }
});
