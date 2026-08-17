(() => {
  const state = { installed: false };

  function installCompactStyles() {
    if (document.getElementById('card-section-compact-style')) return;
    const style = document.createElement('style');
    style.id = 'card-section-compact-style';
    style.textContent = `
      body.shared-front-banner-page #page-card,
      body.shared-front-banner-page #page-customers {
        margin-top: 0 !important;
      }
      #page-card > .bg-white {
        padding-top: 0.5rem !important;
        padding-bottom: 0.5rem !important;
      }
      #page-card #collected-card-camera-label,
      #page-card #collected-card-camera-label + button {
        padding-top: 0.5rem !important;
        padding-bottom: 0.5rem !important;
        gap: 0.25rem !important;
        min-height: 58px !important;
      }
      #page-card #collected-card-camera-label > .material-symbols-outlined,
      #page-card #collected-card-camera-label + button > .material-symbols-outlined {
        font-size: 22px !important;
        line-height: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function getBannerParts() {
    const banner = document.getElementById('home-profile-card');
    if (!banner) return null;
    const points = banner.querySelector('[data-home-top-action="points"]');
    const checkin = banner.querySelector('[data-home-top-action="checkin"]');
    if (!points || !checkin) return null;
    return {
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

  function hideValue(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.style.setProperty('display', 'none', 'important');
  }

  function showValue(el) {
    if (!el) return;
    el.classList.remove('hidden');
    el.style.removeProperty('display');
  }

  function setCardSectionBanner(isCardSection) {
    const p = getBannerParts();
    if (!p) return;

    if (isCardSection) {
      p.points.setAttribute('data-card-page-override', 'cards');
      p.points.setAttribute('onclick', "window.goPage('card')");
      p.points.setAttribute('aria-label', '開啟收藏名片');
      if (p.pointsIcon) p.pointsIcon.textContent = 'contact_page';
      if (p.pointsLabel) p.pointsLabel.textContent = '收藏名片';
      hideValue(p.pointsValue);

      p.checkin.setAttribute('data-card-page-override', 'customers');
      p.checkin.setAttribute('onclick', "window.goPage('customers')");
      p.checkin.setAttribute('aria-label', '開啟我的客戶');
      if (p.checkinIcon) p.checkinIcon.textContent = 'groups';
      if (p.checkinLabel) p.checkinLabel.textContent = '我的客戶';
      hideValue(p.checkinValue);
      return;
    }

    if (p.points.getAttribute('data-card-page-override') === 'cards') {
      p.points.removeAttribute('data-card-page-override');
      p.points.setAttribute('onclick', 'window.openPointsWallet()');
      p.points.removeAttribute('aria-label');
      if (p.pointsIcon) p.pointsIcon.textContent = 'account_balance_wallet';
      if (p.pointsLabel) p.pointsLabel.textContent = '購物金';
      showValue(p.pointsValue);
    }
    if (p.checkin.getAttribute('data-card-page-override') === 'customers') {
      p.checkin.removeAttribute('data-card-page-override');
      p.checkin.setAttribute('onclick', 'window.claimDailyPointCheckin(this)');
      p.checkin.removeAttribute('aria-label');
      if (p.checkinIcon) p.checkinIcon.textContent = 'redeem';
      if (p.checkinLabel) p.checkinLabel.textContent = '簽到贈點';
      showValue(p.checkinValue);
    }
  }

  function isCardSectionPage(page) {
    return page === 'card' || page === 'customers';
  }

  function syncFromVisiblePage() {
    const cardPage = document.getElementById('page-card');
    const customerPage = document.getElementById('page-customers');
    const active = (!!cardPage && !cardPage.classList.contains('hidden')) ||
      (!!customerPage && !customerPage.classList.contains('hidden'));
    setCardSectionBanner(active);
  }

  function install() {
    if (state.installed) return;
    installCompactStyles();
    if (typeof window.goPage !== 'function') {
      setTimeout(install, 50);
      return;
    }
    state.installed = true;
    const originalGoPage = window.goPage;
    window.goPage = function cardSectionAwareGoPage(page, ...args) {
      const result = originalGoPage.call(this, page, ...args);
      setCardSectionBanner(isCardSectionPage(page));
      return result;
    };
    syncFromVisiblePage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
