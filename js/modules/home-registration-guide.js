(function () {
  const homeEntryParams = new Set([
    'ref', 'net', 'friend_referral_challenge',
    'code', 'state', 'liff.state', 'liffClientId', 'liffRedirectUri',
    'friendship_status_changed'
  ]);
  const displayed = new Set();

  function isCurrentHomeMember(userId) {
    return Boolean(userId) &&
      window.liff?.isLoggedIn?.() === true &&
      window.currentUserProfile?.userId === userId &&
      window.currentUser?.isRegistered === false &&
      window.currentPage === 'home';
  }

  window.showFirstHomeRegistrationGuide = function (userId, params) {
    if (!isCurrentHomeMember(userId) || window.location.hash ||
        !params || [...params.keys()].some(key => !homeEntryParams.has(key)) ||
        typeof window.openProfileRegistrationPanel !== 'function' || displayed.has(userId)) return;

    const dialog = document.getElementById('home-registration-guide');
    if (!dialog?.showModal || dialog.open) return;
    const storageKey = 'pointspass:home-registration-guide:v1:' + userId;
    try {
      if (localStorage.getItem(storageKey) === 'shown') return;
    } catch {}

    dialog.returnValue = '';
    dialog.showModal();
    displayed.add(userId);
    try {
      localStorage.setItem(storageKey, 'shown');
    } catch {}

    dialog.addEventListener('close', () => {
      if (dialog.returnValue === 'register' && isCurrentHomeMember(userId)) {
        window.openProfileRegistrationPanel();
      }
    }, { once: true });
  };
})();
