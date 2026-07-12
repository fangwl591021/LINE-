/* ==================== 全域設定 ==================== */

const DEFAULT_LIFF_ID = "1660923784-vViMTZ1y";
const NFC_LIFF_ID = "1660923784-cOH9Hvsv";
const POINT_LIFF_ID = "1660923784-vViMTZ1y";
const SOCIAL_LIKE_LIFF_ID = "1660923784-NVioaXK7";
const POINT_OA_URL = "https://lin.ee/sDW7u4T";
const HARD_ADMIN_ACCOUNTS = [
  {
    label: "REDACTED_ADMIN_NAME_A",
    ids: ["REDACTED_PLATFORM_ADMIN_UID_A", "REDACTED_PLATFORM_ADMIN_UID_B"],
    phones: ["REDACTED_PHONE_A"],
    names: ["REDACTED_ADMIN_NAME_A", "REDACTED_ADMIN_NAME_B"]
  },
  {
    label: "REDACTED_ADMIN_NAME_C",
    ids: ["REDACTED_PLATFORM_ADMIN_UID_C", "REDACTED_PLATFORM_ADMIN_UID_D"],
    phones: ["REDACTED_PHONE_B"],
    names: ["REDACTED_ADMIN_NAME_C"]
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

window.__actmasterLiffInit = window.__actmasterLiffInit || { liffId: '', promise: null };

window.initActmasterLiff = async function(liffId, options = {}) {
  const id = String(liffId || window.LIFF_ID || '').trim();
  if (!id) throw new Error('Missing LIFF ID');
  if (!window.liff) throw new Error('LINE LIFF SDK 尚未載入');

  if (window.__actmasterLiffInit.promise && window.__actmasterLiffInit.liffId === id) {
    return window.__actmasterLiffInit.promise;
  }

  window.__actmasterLiffInit.liffId = id;
  window.__actmasterLiffInit.promise = window.liff.init({
    liffId: id,
    withLoginOnExternalBrowser: options.withLoginOnExternalBrowser === true
  });
  try {
    await window.__actmasterLiffInit.promise;
    return true;
  } catch (err) {
    window.__actmasterLiffInit = { liffId: '', promise: null };
    throw err;
  }
};

window.ensureActmasterLiffLogin = function(options = {}) {
  if (!window.liff || typeof window.liff.isLoggedIn !== 'function') return false;
  if (window.liff.isLoggedIn()) return true;
  const redirectUri = options.redirectUri || window.location.href;
  if (typeof window.liff.login === 'function') window.liff.login({ redirectUri });
  return false;
};

window.actmasterShareTargetPicker = async function(messages) {
  if (!window.liff || typeof window.liff.isLoggedIn !== 'function' || !window.liff.isLoggedIn()) return { ok: false, reason: 'not_logged_in' };
  if (typeof window.liff.isApiAvailable !== 'function' || !window.liff.isApiAvailable('shareTargetPicker')) return { ok: false, reason: 'share_unavailable' };
  const result = await window.liff.shareTargetPicker(messages);
  if (!result) return { ok: false, reason: 'cancelled_or_not_opened' };
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

window.MOTHER_MEMBER_SHARE_URL = window.MOTHER_MEMBER_SHARE_URL || 'https://aiwe.cc/index.php/short_url/963';
window.buildMemberInviteUrl = function() {
  return String(window.MOTHER_MEMBER_SHARE_URL || '').trim();
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
