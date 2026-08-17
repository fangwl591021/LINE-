(() => {
  const state = { installed: false, page: null };

  function getBannerParts() {
    const banner = document.getElementById('home-profile-card');
    if (!banner) return null;
    const points = banner.querySelector('[data-home-top-action="points"]');
    const checkin = banner.querySelector('[data-home-top-action="checkin"]');
    if (!points || !checkin) return null;
    return {
      banner,
      points,
      checkin,
      pointsIcon: points.querySelector('.material-symbols-outlined'),
      pointsLabel: points.querySelector('.home-top-shortcut-label'),
      pointsValue: points.querySelector('.home-top-shortcut-value'),
      checkinIcon: checkin.querySelector('.material-symbols-outlined'),
      checkinLabel: checkin.querySelector('.home-top-shortcut-label'),
      checkinValue: checkin.querySelector('.home-top-shortcut-value'),
    };
  }

  function setCardPageBanner(isCardPage) {
    const p = getBannerParts();
    if (!p) return;
    if (isCardPage) {
      p.points.setAttribute('data-card-page-override', 'cards');
      p.points.setAttribute('onclick', "window.goPage('card')");
      p.points.setAttribute('aria-label', '開啟收藏名片');
      if (p.pointsIcon) p.pointsIcon.textContent = 'contact_page';
      if (p.pointsLabel) p.pointsLabel.textContent = '收藏名片';
      if (p.pointsValue) p.pointsValue.classList.add('hidden');

      p.checkin.setAttribute('data-card-page-override', 'customers');
      p.checkin.setAttribute('onclick', "window.goPage('customers')");
      p.checkin.setAttribute('aria-label', '開啟我的客戶');
      if (p.checkinIcon) p.checkinIcon.textContent = 'groups';
      if (p.checkinLabel) p.checkinLabel.textContent = '我的客戶';
      if (p.checkinValue) p.checkinValue.classList.add('hidden');
      return;
    }

    if (p.points.getAttribute('data-card-page-override') === 'cards') {
      p.points.removeAttribute('data-card-page-override');
      p.points.setAttribute('onclick', 'window.openPointsWallet()');
      p.points.removeAttribute('aria-label');
      if (p.pointsIcon) p.pointsIcon.textContent = 'account_balance_wallet';
      if (p.pointsLabel) p.pointsLabel.textContent = '購物金';
      if (p.pointsValue) p.pointsValue.classList.remove('hidden');
    }
    if (p.checkin.getAttribute('data-card-page-override') === 'customers') {
      p.checkin.removeAttribute('data-card-page-override');
      p.checkin.setAttribute('onclick', 'window.claimDailyPointCheckin(this)');
      p.checkin.removeAttribute('aria-label');
      if (p.checkinIcon) p.checkinIcon.textContent = 'redeem';
      if (p.checkinLabel) p.checkinLabel.textContent = '簽到贈點';
      if (p.checkinValue) p.checkinValue.classList.remove('hidden');
    }
  }

  function syncFromVisiblePage() {
    const cardPage = document.getElementById('page-card');
    const isCardPage = !!cardPage && !cardPage.classList.contains('hidden');
    setCardPageBanner(isCardPage);
  }

  function install() {
    if (state.installed) return;
    if (typeof window.goPage !== 'function') {
      setTimeout(install, 50);
      return;
    }
    state.installed = true;
    const originalGoPage = window.goPage;
    window.goPage = function cardPageAwareGoPage(page, ...args) {
      const result = originalGoPage.call(this, page, ...args);
      setCardPageBanner(page === 'card');
      return result;
    };
    syncFromVisiblePage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
