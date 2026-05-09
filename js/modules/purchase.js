/* Tenant purchase flow: frontend order creation, backend payment confirmation handles activation. */
(function() {
  const TENANT_FEE = 6300;
  const TENANT_BV = 3000;
  const POLICY_TYPE = 'left_right_independent_split';
  let lastTenantOrderNotice = '';

  function getUser() {
    return window.currentUser || window.currentUserProfile || {};
  }

  function getUserId(user) {
    return user.userId || user.memberId || user.lineId || '';
  }

  function getSponsorId(user) {
    return user.sponsorId || user.recruiterId || user.referrerId || user.recommenderId || user.inviterId || user.parentSponsorId || '';
  }

  function getPlacementParentId(user) {
    return user.placementParentId || user.placementOwnerId || user.parentId || user.uplineId || getSponsorId(user) || '';
  }

  function getPlacementSide(user) {
    const side = String(user.placementSide || user.qualificationSide || user.side || '').toLowerCase();
    if (side === 'left' || side === 'l' || side === '左') return 'left';
    if (side === 'right' || side === 'r' || side === '右') return 'right';
    return '';
  }

  function isTenantRole(role) {
    role = String(role || '').toLowerCase();
    return role === 'store' || role === 'tenant' || role === 'admin';
  }

  function setButtonLoading(btn, loading, text) {
    if (!btn) return;
    btn.disabled = !!loading;
    btn.classList.toggle('opacity-60', !!loading);
    btn.innerHTML = loading
      ? '<span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> 建立訂單中...'
      : text;
  }

  window.refreshTenantUpgradeCard = function() {
    const user = getUser();
    const role = user.role || window.userRole || 'user';
    const isTenant = isTenantRole(role);
    const card = document.getElementById('tenant-upgrade-card');
    const status = document.getElementById('tenant-upgrade-status');
    const badge = document.getElementById('tenant-role-badge');
    if (!card) return;

    if (badge) {
      badge.textContent = isTenant ? '已開通' : '一般';
      badge.className = isTenant
        ? 'px-3 py-1.5 rounded-full bg-blue-600 text-white text-[12px] font-black shrink-0'
        : 'px-3 py-1.5 rounded-full bg-white text-slate-900 text-[12px] font-black shrink-0';
    }
    if (status) {
      status.textContent = isTenant
        ? '你已具備租戶資格，可使用活動管理、名片收集、首頁佈置與較高額度 AI 工具。'
        : '開通後可使用活動管理、名片收集、版面設定與較高額度的 AI 工具。';
    }
  };

  window.initTenantUpgradePage = function() {
    const user = getUser();
    const buyer = document.getElementById('tenant-order-buyer');
    const result = document.getElementById('tenant-order-result');
    if (buyer) buyer.textContent = `${user.name || '未命名'} / ${user.phone || getUserId(user) || '-'}`;
    if (result) result.classList.add('hidden');
  };

  window.createTenantUpgradeOrder = async function(event) {
    const btn = event?.currentTarget || document.getElementById('btn-create-tenant-order');
    const btnText = '<span class="material-symbols-outlined text-[20px]">add_card</span> 建立 NT$6,300 租戶年費訂單';
    const user = getUser();
    const buyerId = getUserId(user);
    if (!buyerId) return window.showToast('找不到會員 ID，請重新登入後再試', true);
    if (isTenantRole(user.role || window.userRole)) return window.showToast('你已經是租戶資格，不需要重複購買', true);
    if (!window.confirm('確認建立 NT$6,300 租戶年費訂單？\n\n建立後請依管理方提供帳號匯款，後台確認收款後才會開通資格。')) return;

    setButtonLoading(btn, true, btnText);
    try {
      const now = new Date().toISOString();
      const res = await window.fetchAPI('mlmCreateOrder', {
        buyerId,
        buyerName: user.name || user.displayName || buyerId,
        tenantId: buyerId,
        tenantName: user.name || user.displayName || buyerId,
        networkId: user.networkId || window.currentNetworkId || 'admin',
        orderType: 'tenant_annual_fee',
        productCode: 'TENANT_ANNUAL',
        productName: '租戶年費',
        grossAmount: TENANT_FEE,
        amount: TENANT_FEE,
        fee: TENANT_FEE,
        bv: TENANT_BV,
        taxIncluded: true,
        taxRate: 5,
        paymentStatus: 'pending_payment',
        status: 'pending_payment',
        paymentProvider: 'bank_transfer',
        paymentMethod: 'bank_transfer',
        paymentLabel: '匯款付款',
        notifyAdmin: true,
        notificationType: 'tenant_annual_fee_order_created',
        purchaseSource: 'frontend',
        bonusPolicyType: POLICY_TYPE,
        sponsorId: getSponsorId(user),
        recruiterId: getSponsorId(user),
        placementParentId: getPlacementParentId(user),
        placementSide: getPlacementSide(user),
        qualificationSide: getPlacementSide(user),
        createdAt: now
      });

      if (!res || res.error) throw new Error(res?.error || '建立訂單失敗');
      const orderId = res.orderId || res.id || res.rowId || res.data?.orderId || '';
      lastTenantOrderNotice = [
        '租戶年費匯款通知',
        `訂單編號：${orderId || '系統已建立'}`,
        `姓名：${user.name || user.displayName || '未命名'}`,
        `電話：${user.phone || '-'}`,
        '金額：NT$ 6,300',
        '付款方式：匯款付款',
        '我已完成匯款，請協助確認收款並開通租戶功能。'
      ].join('\n');
      const result = document.getElementById('tenant-order-result');
      if (result) {
        result.classList.remove('hidden');
        result.innerHTML = `
          <div class="font-black text-slate-900 mb-1">訂單已建立，等待後台確認收款</div>
          <div>訂單編號：<span class="font-mono">${window.escapeHTML(orderId || '系統已建立')}</span></div>
          <div>金額：NT$ 6,300</div>
          <div>付款方式：匯款付款</div>
          <div class="mt-2 text-slate-600">匯款完成後，請提供訂單編號與匯款後五碼或截圖，管理方確認後會開通功能。</div>
          <button type="button" onclick="window.copyTenantPaymentNotice()" class="mt-3 w-full bg-slate-900 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-[18px]">content_copy</span> 複製付款通知
          </button>`;
      }
      window.showToast('租戶年費訂單已建立');
    } catch (e) {
      window.showToast(e.message || '建立訂單失敗', true);
    } finally {
      setButtonLoading(btn, false, btnText);
    }
  };

  window.copyTenantPaymentNotice = async function() {
    if (!lastTenantOrderNotice) return window.showToast('目前沒有可複製的付款通知', true);
    try {
      await navigator.clipboard.writeText(lastTenantOrderNotice);
      window.showToast('付款通知已複製');
    } catch (e) {
      window.prompt('請複製付款通知', lastTenantOrderNotice);
    }
  };

  document.addEventListener('DOMContentLoaded', function() {
    window.refreshTenantUpgradeCard();
  });
})();
