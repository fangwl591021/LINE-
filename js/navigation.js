/* ==================== 導航與模式切換 ==================== */

window.goPage = function(page, isInitLoad = false) {
  if (page === 'profile') page = 'admin-settings';

  document.querySelectorAll('[id^="page"]').forEach(el => el.classList.add('hidden'));
  const targetPage = document.getElementById('page-' + page);
  if (targetPage) targetPage.classList.remove('hidden');

  if (!isInitLoad) {
    if (page === 'admin-activities') window.loadAdminActivities();
    else if (page === 'home') window.loadUserActivities();
    else if (page === 'admin-stats') window.loadAdminStats();
    else if (page === 'my-activities') window.loadMyActivities();
    else if (page === 'admin-settings') {
      if (currentUser) {
        const pn = document.getElementById('profile-name');
        if (pn) pn.value = currentUser.name || '';
        const pp = document.getElementById('profile-phone');
        if (pp) pp.value = String(currentUser.phone || '').replaceAll(String.fromCharCode(8203), '').replaceAll("'", "");
        const pi = document.getElementById('profile-industry');
        if (pi) pi.value = currentUser.industry || '';
        const pb = document.getElementById('profile-birthday');
        if (pb) pb.value = currentUser.birthday || '';
      }
      window.userSocials = [];
      try {
        if (currentUser && currentUser.socials) window.userSocials = JSON.parse(currentUser.socials);
      } catch(e){}

      window.applyUserPermissions();

      if (userRole === 'admin' && allSystemUsers.length === 0) window.loadAllUsers();
    }
  }

  const bottomNav = document.getElementById('bottom-nav');
  const bottomNavAdmin = document.getElementById('bottom-nav-admin');

  if (page === 'register' || page === 'admin-stats' || page === 'my-act-detail' || page === 'admin-checkin') {
    if (bottomNav) bottomNav.classList.add('hidden');
    if (bottomNavAdmin) bottomNavAdmin.classList.add('hidden');
  } else {
    if (currentViewMode === 'admin') {
      if (bottomNav) bottomNav.classList.add('hidden');
      if (bottomNavAdmin) bottomNavAdmin.classList.remove('hidden');
    } else {
      if (bottomNav) bottomNav.classList.remove('hidden');
      if (bottomNavAdmin) bottomNavAdmin.classList.add('hidden');
    }
  }

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('nav-active'));
  const stdBtn = document.getElementById('nav-btn-' + page);
  if (stdBtn) stdBtn.classList.add('nav-active');

  const admBtn = document.getElementById('admin-nav-btn-' + page);
  if (admBtn) admBtn.classList.add('nav-active');
};

// 切換管理模式
window.toggleAdminMode = function() {
  if (currentViewMode === 'admin') {
    currentViewMode = 'user';
    window.showToast('已切換至【前台用戶模式】');
    document.getElementById('header-admin-badge').classList.add('hidden');
    window.goPage('home');
  } else {
    currentViewMode = 'admin';
    window.showToast('已切換至【後台管理模式】');
    document.getElementById('header-admin-badge').classList.remove('hidden');
    if (activeBatchCount === 0) window.addBatchRow();
    window.goPage('admin-activities');
  }

  const btnText = document.getElementById('admin-switch-text');
  if (btnText) btnText.textContent = currentViewMode === 'admin' ? '切換至前台 (一般用戶)' : '切換至後台 (管理模式)';

  const adminTools = document.getElementById('admin-tools-container');
  if (currentViewMode === 'admin') {
    if (adminTools) adminTools.classList.remove('hidden');
  } else {
    if (adminTools) adminTools.classList.add('hidden');
  }
};

// 名片詳細頁的 Tab 切換
window.switchTab = function(tab) {
  ['info','edit','ecard'].forEach(t => {
    document.getElementById('tab-content-' + t).classList.toggle('hidden', t !== tab);
    const btn = document.getElementById('tab-' + t);
    if (t === tab) {
      btn.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
      btn.classList.remove('text-slate-400', 'border-transparent');
    } else {
      btn.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
      btn.classList.add('text-slate-400', 'border-transparent');
    }
  });
  if (tab === 'ecard') {
    window.renderECardSettings();
    window.updateECardPreview();
  }
};

// 建立活動的 Tab 切換
window.switchActiveTab = function(tabId) {
  ['quick', 'full', 'series'].forEach(id => {
    document.getElementById('tab-content-' + id).classList.add('hidden');
    const btn = document.getElementById('tab-btn-' + id);
    btn.className = 'flex-1 py-2.5 rounded-xl text-[14px] font-bold text-slate-500 transition-all hover:text-slate-700 bg-transparent';
  });
  document.getElementById('tab-content-' + tabId).classList.remove('hidden');
  document.getElementById('tab-btn-' + tabId).className = 'flex-1 py-2.5 rounded-xl text-[14px] font-bold bg-white text-blue-600 shadow-sm transition-all';
};
