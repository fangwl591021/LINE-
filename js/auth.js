// ... existing code ...
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

        // 🚀 新增：極速更新首頁 Banner 與名稱，消除開啟時的延遲跳動
        if (typeof window.updateHomeBanner === 'function') {
          window.updateHomeBanner();
        }

        document.getElementById('loading-screen').classList.add('opacity-0');
        setTimeout(() => document.getElementById('loading-screen').classList.add('hidden'), 300);

        window.goPage('home', true);
        window.loadUserActivities();

        needAwaitFetch = false;
      } catch(e) {}
    }

    // 2. 呼叫 GAS 背景驗證
    const checkPromise = window.fetchAPI('checkUser', { userId: profile.userId }, true).then(checkRes => {
// ... existing code ...
