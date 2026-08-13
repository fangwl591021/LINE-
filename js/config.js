/* ==================== 全域設定 ==================== */

const DEFAULT_LIFF_ID = "1660923784-vViMTZ1y";
const NFC_LIFF_ID = "1660923784-cOH9Hvsv";
const POINT_LIFF_ID = "1660923784-vViMTZ1y";
const SOCIAL_LIKE_LIFF_ID = "1660923784-NVioaXK7";
const POINT_OA_URL = "https://lin.ee/sDW7u4T";
const HARD_ADMIN_ACCOUNTS = [
  {
    label: "方萬隆",
    ids: ["Uf729764dbb5b652a5a90a467320bea29", "U050397a077bef628b317b0bbedeb2187"],
    phones: ["0927136847"],
    names: ["方萬隆", "Tonyfang"]
  },
  {
    label: "楊滄棋",
    ids: ["U58eb5c1a747450140ce1335af709ae55", "Ue9a59cf9b2969ec78b6bfdc2a4cfca08"],
    phones: ["0986919171"],
    names: ["楊滄棋"]
  }
];
const HARD_ADMIN_IDS = HARD_ADMIN_ACCOUNTS.flatMap(account => account.ids);

function readActmasterInitialParams() {
  const params = new URLSearchParams(window.location.search || '');
  const state = params.get('liff.state') || params.get('state') || '';

  if (state) {
    try {
      const stateText = decodeURIComponent(state);
      const queryText = stateText.includes('?')
        ? stateText.split('?').slice(1).join('?')
        : stateText.replace(/^\?/, '');
      const stateParams = new URLSearchParams(queryText);
      stateParams.forEach((value, key) => {
        if (!params.has(key)) params.set(key, value);
      });
    } catch (e) {
      console.warn('Unable to parse LIFF state:', e);
    }
  }

  const aliases = {
    a: 'activityId',
    r: 'ref',
    n: 'net',
    v: 'via',
    c: 'claim',
    s: 'shareCardId'
  };
  Object.keys(aliases).forEach(shortKey => {
    const fullKey = aliases[shortKey];
    if (!params.has(fullKey) && params.has(shortKey)) params.set(fullKey, params.get(shortKey));
  });

  return params;
}

function hasNfcCheckinParams(params) {
  return !!(params.get('checkin') || params.get('nfcAct') || params.get('nfcCheckin'));
}

function resolveActiveLiffId() {
  try {
    const params = readActmasterInitialParams();
    if (hasNfcCheckinParams(params)) return NFC_LIFF_ID;
    const explicitLiffId = params.get('liffId') || '';
    if (explicitLiffId && explicitLiffId.includes('-')) return explicitLiffId;
  } catch (e) {}
  return DEFAULT_LIFF_ID;
}
const LIFF_ID = resolveActiveLiffId();
const WORKER_URL = "https://line-engine.fangwl591021.workers.dev/";

window.LIFF_ID = LIFF_ID;
window.DEFAULT_LIFF_ID = DEFAULT_LIFF_ID;
window.NFC_LIFF_ID = window.NFC_LIFF_ID || NFC_LIFF_ID;
window.POINT_LIFF_ID = window.POINT_LIFF_ID || POINT_LIFF_ID;
window.SOCIAL_LIKE_LIFF_ID = window.SOCIAL_LIKE_LIFF_ID || SOCIAL_LIKE_LIFF_ID;
window.LIKE_LIFF_ID = window.LIKE_LIFF_ID || window.SOCIAL_LIKE_LIFF_ID;
window.POINT_OA_URL = window.POINT_OA_URL || POINT_OA_URL;
window.HARD_ADMIN_ACCOUNTS = window.HARD_ADMIN_ACCOUNTS || HARD_ADMIN_ACCOUNTS;
window.HARD_ADMIN_IDS = window.HARD_ADMIN_IDS || HARD_ADMIN_IDS;
window.isHardAdminUser = function(userId, profile = {}) {
  const ids = [
    userId,
    profile.userId,
    profile.lineId,
    profile.legacyLineId,
    profile.pointLineId,
    profile.legacy_line_id,
    profile.point_line_id,
    profile.identityLink && profile.identityLink.oldLineId,
    profile.identityLink && profile.identityLink.newLineId
  ].map(value => String(value || '').trim()).filter(Boolean);
  const name = String(profile.name || profile.displayName || profile.userName || '').trim();
  const phone = String(profile.phone || profile.mobile || '').replace(/\D/g, '');
  return (window.HARD_ADMIN_ACCOUNTS || []).some(account => {
    const idMatch = ids.some(id => (account.ids || []).includes(id));
    const phoneMatch = !!phone && (account.phones || []).includes(phone);
    const nameMatch = !!name && (account.names || []).some(allowed => name.includes(allowed));
    if (idMatch) return phoneMatch || nameMatch;
    return phoneMatch && nameMatch;
  });
};
window.WORKER_URL = WORKER_URL;
window.Config = {
  LIFF_ID,
  DEFAULT_LIFF_ID,
  NFC_LIFF_ID: window.NFC_LIFF_ID,
  POINT_LIFF_ID: window.POINT_LIFF_ID,
  SOCIAL_LIKE_LIFF_ID: window.SOCIAL_LIKE_LIFF_ID,
  POINT_OA_URL: window.POINT_OA_URL,
  HARD_ADMIN_IDS: window.HARD_ADMIN_IDS,
  HARD_ADMIN_ACCOUNTS: window.HARD_ADMIN_ACCOUNTS,
  WORKER_URL,
  API_URL: WORKER_URL.replace(/\/$/, '')
};

window.__actmasterLiffInit = window.__actmasterLiffInit || { liffId: '', promise: null, ready: false };

window.buildActmasterCleanLiffUrl = function() {
  const params = typeof window.readActmasterInitialParams === 'function'
    ? window.readActmasterInitialParams()
    : new URLSearchParams(window.location.search || '');
  [
    'code', 'state', 'liff.state', 'liffClientId', 'liffRedirectUri',
    'error', 'error_description'
  ].forEach(key => params.delete(key));
  const query = params.toString();
  return window.location.origin + window.location.pathname + (query ? '?' + query : '');
};

window.recoverActmasterInvalidLiffAuthorization = function(error) {
  const details = [error?.code, error?.message, error?.cause?.code, error?.cause?.message]
    .map(value => String(value || '').toLowerCase())
    .join(' ');
  if (!details.includes('invalid authorization code')) return false;

  const recoveryKey = 'ACTMASTER_LIFF_INVALID_CODE_RECOVERY_V1';
  const currentUrl = window.location.href;
  try {
    if (sessionStorage.getItem(recoveryKey) === currentUrl) return false;
    sessionStorage.setItem(recoveryKey, currentUrl);
  } catch (e) {}

  window.location.replace(window.buildActmasterCleanLiffUrl());
  return true;
};

window.initActmasterLiff = async function(liffId, options = {}) {
  const id = String(liffId || window.LIFF_ID || '').trim();
  if (!id) throw new Error('Missing LIFF ID');
  if (!window.liff) throw new Error('LINE LIFF SDK 尚未載入');

  if (window.__actmasterLiffInit.promise && window.__actmasterLiffInit.liffId === id) {
    return window.__actmasterLiffInit.promise;
  }

  window.__actmasterLiffInit.liffId = id;
  window.__actmasterLiffInit.ready = false;
  window.__actmasterLiffInit.promise = window.liff.init({
    liffId: id,
    withLoginOnExternalBrowser: options.withLoginOnExternalBrowser === true
  });
  try {
    await window.__actmasterLiffInit.promise;
    window.__actmasterLiffInit.ready = true;
    try { sessionStorage.removeItem('ACTMASTER_LIFF_INVALID_CODE_RECOVERY_V1'); } catch (e) {}
    return true;
  } catch (err) {
    window.__actmasterLiffInit = { liffId: '', promise: null, ready: false };
    throw err;
  }
};

window.ensureActmasterLiffLogin = function(options = {}) {
  if (!window.liff || typeof window.liff.isLoggedIn !== 'function') return false;
  if (window.liff.isLoggedIn()) return true;
  const requestedRedirectUri = String(options.redirectUri || window.location.href);
  const hasOAuthParams = /[?&](?:code|state|liff\.state|liffClientId|liffRedirectUri|error|error_description)=/i.test(requestedRedirectUri);
  const redirectUri = hasOAuthParams && typeof window.buildActmasterCleanLiffUrl === 'function'
    ? window.buildActmasterCleanLiffUrl()
    : requestedRedirectUri;
  if (typeof window.liff.login === 'function') window.liff.login({ redirectUri });
  return false;
};

window.isActmasterMainLiffClient = function() {
  try {
    return Boolean(
      window.liff &&
      typeof window.liff.isInClient === 'function' &&
      window.liff.isInClient()
    );
  } catch (e) {
    return false;
  }
};

window.readActmasterPointFriendship = async function() {
  if (!window.isActmasterMainLiffClient()) return { required: false, friendFlag: true };
  if (!window.liff || typeof window.liff.getFriendship !== 'function') {
    return { required: true, friendFlag: false, unavailable: true };
  }
  try {
    const result = await window.liff.getFriendship();
    return { required: true, friendFlag: Boolean(result && result.friendFlag) };
  } catch (error) {
    console.warn('[friendship] unable to read friendship', error);
    return { required: true, friendFlag: false, error };
  }
};

window.showActmasterPointFriendshipGate = function(message) {
  const modal = document.getElementById('point-friendship-modal');
  const status = document.getElementById('point-friendship-status');
  const addLink = document.getElementById('point-friendship-add-link');
  if (status && message) status.textContent = String(message);
  if (addLink) addLink.href = window.POINT_OA_URL || POINT_OA_URL;
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
};

window.ensureActmasterPointFriendship = async function() {
  const current = await window.readActmasterPointFriendship();
  if (!current.required || current.friendFlag) return true;

  if (!current.unavailable && window.liff && typeof window.liff.requestFriendship === 'function') {
    try {
      await window.liff.requestFriendship();
      const latest = await window.readActmasterPointFriendship();
      if (latest.friendFlag) return true;
    } catch (error) {
      console.warn('[friendship] requestFriendship did not complete', error);
    }
  }

  window.showActmasterPointFriendshipGate('加入官方帳號後，按「已加入，繼續進入」。');
  return false;
};

window.recheckActmasterPointFriendship = async function() {
  const button = document.getElementById('point-friendship-continue');
  const status = document.getElementById('point-friendship-status');
  if (button) button.disabled = true;
  if (status) status.textContent = '正在確認好友狀態…';
  try {
    const latest = await window.readActmasterPointFriendship();
    if (latest.friendFlag) {
      const url = new URL(window.location.href);
      url.searchParams.set('point_friend', '1');
      window.location.replace(url.toString());
      return;
    }
    if (status) status.textContent = '尚未確認加入，請先加入官方帳號後再按一次。';
  } finally {
    if (button) button.disabled = false;
  }
};

window.actmasterShareTargetPicker = async function(messages) {
  if (!window.liff || typeof window.liff.isLoggedIn !== 'function' || !window.liff.isLoggedIn()) return { ok: false, reason: 'not_logged_in' };
  if (typeof window.liff.isApiAvailable !== 'function' || !window.liff.isApiAvailable('shareTargetPicker')) return { ok: false, reason: 'share_unavailable' };
  const result = await window.liff.shareTargetPicker(messages);
  // LINE may resolve the Promise without a value after a successful share.
  // Only an explicit false is treated as cancellation.
  if (result === false) return { ok: false, reason: 'cancelled_or_not_opened' };
  return { ok: true, result };
};

window.closeActmasterLiffOrHome = function(delayMs = 1800) {
  setTimeout(() => {
    try {
      if (
        window.liff &&
        typeof window.liff.isInClient === 'function' &&
        window.liff.isInClient() &&
        typeof window.liff.closeWindow === 'function'
      ) {
        window.liff.closeWindow();
        return;
      }
    } catch (e) {}
    window.location.replace(window.location.pathname);
  }, delayMs);
};

window.buildPointLiffUrl = function(params) {
  const targetParams = new URLSearchParams();
  Object.keys(params || {}).forEach(key => {
    const value = params[key];
    if (value !== undefined && value !== null && String(value) !== '') {
      targetParams.set(key, String(value));
    }
  });
  targetParams.set('from', targetParams.get('from') || 'business-engine');
  return 'https://liff.line.me/' + encodeURIComponent(window.POINT_LIFF_ID || POINT_LIFF_ID) + '?' + targetParams.toString();
};

window.buildMemberInviteUrl = function(params) {
  return window.buildPointLiffUrl ? window.buildPointLiffUrl(params || {}) : '';
};

// 舊版模組大量使用 $/jQuery；若頁面未事先載入，於 parser 階段同步補上。
if (!window.jQuery && !window.$) {
  if (document.readyState === 'loading') {
    document.write('<script src="https://code.jquery.com/jquery-3.7.1.min.js"><\/script>');
  } else {
    const jq = document.createElement('script');
    jq.src = 'https://code.jquery.com/jquery-3.7.1.min.js';
    document.head.appendChild(jq);
  }
}

// 用量限制(依角色權限)
// 邏輯: 名片無限制(Infinity), 加入 AI每日配對限制(matchmake)
window.LIMITS = {
  admin: { activities: Infinity, cards: Infinity, matchmake: Infinity, cardmaster: Infinity },
  tenant:{ activities: 10, cards: Infinity, matchmake: 50, cardmaster: 50 },
  store: { activities: 10, cards: Infinity, matchmake: 50, cardmaster: 50 },
  user:  { activities: 1, cards: Infinity, matchmake: 5, cardmaster: 5 }
};

// 全域狀態變數
window.urlRef = '';
window.urlNet = '';
window.cropTarget = 'general';
window.currentDescAlign = 'center';
window.currentUploadTargetId = null;

// 共用狀態(原本散落在 script 區的全域變數)
var currentNetworkId = '';
var allSystemUsers = [];
var currentUser = null;
var currentUserProfile = null;
var allCards = [];
var currentCard = null;
var currentUserCard = null;
var isProcessing = false;
var cropperInstance = null;
var activeCropperInstance = null;
var currentActiveCropTarget = '';
var activeBatchCount = 0;

var userRole = 'user';
var hasAdminRights = false;
var currentViewMode = 'user';

var currentECardStyle = 'v1';
var v1Buttons = [];
var myV1Buttons = [];
window.userSocials = [];
window.myActivitiesData = [];

window.recognizeCard = function(input) {
  if (typeof window.openCropper === 'function') return window.openCropper(input);
  window.showToast?.('圖片裁切模組尚未載入，請重新整理後再試', true);
};

window.recognizeMyCard = function(input) {
  if (typeof window.openMyCardCropper === 'function') return window.openMyCardCropper(input);
  window.showToast?.('圖片裁切模組尚未載入，請重新整理後再試', true);
};

window.getActmasterUrlParams = function() {
  return readActmasterInitialParams();
};

(function installNfcCheckinFallback() {
  function getNfcActivityId() {
    const params = window.getActmasterUrlParams();
    return params.get('checkin') || params.get('nfcAct') || params.get('nfcCheckin') || '';
  }

  function getVerifyCheckinId() {
    const params = window.getActmasterUrlParams();
    return params.get('verifyCheckin') || params.get('checkinRowId') || params.get('registrationId') || '';
  }

  async function waitForAppReady() {
    for (let i = 0; i < 80; i++) {
      if (window.fetchAPI && window.currentUserProfile && window.showToast && window.goPage) return true;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return false;
  }

  function finishNfcCheckinFlow() {
    if (typeof window.closeActmasterLiffOrHome === 'function') return window.closeActmasterLiffOrHome(1800);
    setTimeout(() => window.location.replace(window.location.pathname), 1800);
  }

  async function runNfcCheckin() {
    const activityId = getNfcActivityId();
    if (!activityId || window.__actmasterNfcStarted) return;
    window.__actmasterNfcStarted = true;

    const ready = await waitForAppReady();
    if (!ready) return;

    try {
      window.goPage('home');
      window.showToast('正在進行 NFC 簽到...');
      const res = await window.fetchAPI('nfcCheckin', { activityId }, true);
      if (res && res.error) throw new Error(res.error);

      const data = res || {};
      const pointText = data.awardedPoints > 0 ? '，獲得 ' + data.awardedPoints + ' 點' : '';
      const statusText = data.alreadyChecked ? '您已完成簽到' : '✅ NFC 簽到成功';
      window.showToast(statusText + pointText);
      finishNfcCheckinFlow();
    } catch (e) {
      window.showToast('NFC 簽到失敗：' + (e.message || '請洽工作人員'), true);
    }
  }

  async function runVerifyCheckin() {
    const rowId = getVerifyCheckinId();
    if (!rowId || window.__actmasterVerifyCheckinStarted) return;
    window.__actmasterVerifyCheckinStarted = true;

    const ready = await waitForAppReady();
    if (!ready) return;

    try {
      window.goPage('home');
      window.showToast('正在核銷活動報名...');
      const res = await window.fetchAPI('toggleCheckin', { rowId }, true);
      if (res && res.error) throw new Error(res.error);
      window.showToast('活動核銷完成');
      finishNfcCheckinFlow();
    } catch (e) {
      window.showToast('活動核銷失敗：' + (e.message || '請洽工作人員'), true);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (getNfcActivityId()) setTimeout(runNfcCheckin, 900);
    if (getVerifyCheckinId()) setTimeout(runVerifyCheckin, 900);
  });
})();

(function installActivityEditHotfixes() {
  async function waitForActivityModules() {
    for (let i = 0; i < 80; i++) {
      if (window.submitActivityForm && window._renderAdminActivities && window.openEditActivity) return true;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return false;
  }

  function patchSubmitActivityForm() {
    if (window.__actmasterSubmitActivityPatched || !window.submitActivityForm) return;
    const originalSubmit = window.submitActivityForm;
    window.submitActivityForm = async function(mode) {
      const isEditing = !!window.currentEditingActId;
      const oldRole = window.currentUser && window.currentUser.role;

      if (isEditing && window.currentUser && oldRole !== 'admin') {
        window.currentUser.role = 'admin';
      }

      try {
        return await originalSubmit.call(this, mode);
      } finally {
        if (isEditing && window.currentUser && oldRole) window.currentUser.role = oldRole;
      }
    };
    window.__actmasterSubmitActivityPatched = true;
  }

  function patchAdminActivityCards() {
    if (window.__actmasterAdminRenderPatched || !window._renderAdminActivities) return;

    const originalBuildUrl = window.buildNfcCheckinUrl;
    window.buildNfcCheckinUrl = function(actId) {
      const liffId = window.NFC_LIFF_ID || '1660923784-cOH9Hvsv';
      return 'https://liff.line.me/' + encodeURIComponent(liffId) + '?checkin=' + encodeURIComponent(actId || '');
    };

    if (!window.copyNfcCheckinUrl) {
      window.copyNfcCheckinUrl = async function(actId) {
        const url = window.buildNfcCheckinUrl(actId);
        try {
          await navigator.clipboard.writeText(url);
          window.showToast('NFC 簽到網址已複製，請寫入 NFC 標籤');
        } catch (e) {
          window.prompt('請複製此網址並寫入 NFC 標籤', url);
        }
      };
    }

    const originalRender = window._renderAdminActivities;
    window._renderAdminActivities = function(res) {
      originalRender.call(this, res);

      const list = document.getElementById('admin-activities-list');
      if (!list || !Array.isArray(res)) return;

      list.querySelectorAll('button').forEach(btn => {
        if (btn.textContent && btn.textContent.trim() === '編輯') btn.classList.remove('hidden');
      });
    };

    window.__actmasterAdminRenderPatched = true;
    if (window._adminActsCache && window._adminActsCache.data) {
      window._renderAdminActivities(window._adminActsCache.data);
    }
    if (typeof originalBuildUrl !== 'function') return;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const ready = await waitForActivityModules();
    if (!ready) return;
    patchSubmitActivityForm();
    patchAdminActivityCards();
  });
})();
