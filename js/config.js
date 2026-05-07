/* ==================== 全域設定 ==================== */

const LIFF_ID = "2009886448-2UHnJgyT";
const WORKER_URL = "https://line-engine.fangwl591021.workers.dev/";

// 用量限制(依角色權限)
// 邏輯: 名片無限制(Infinity), 加入 AI每日配對限制(matchmake)
window.LIMITS = {
  admin: { activities: Infinity, cards: Infinity, matchmake: Infinity },
  store: { activities: 10, cards: Infinity, matchmake: 50 },
  user:  { activities: 1, cards: Infinity, matchmake: 5 }
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

window.getActmasterUrlParams = function() {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('liff.state');

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

  return params;
};

(function installNfcCheckinFallback() {
  function getNfcActivityId() {
    const params = window.getActmasterUrlParams();
    return params.get('nfcAct') || params.get('nfcCheckin') || '';
  }

  async function waitForAppReady() {
    for (let i = 0; i < 80; i++) {
      if (window.fetchAPI && window.currentUserProfile && window.showToast && window.goPage) return true;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return false;
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
      setTimeout(() => window.location.replace(window.location.pathname), 1800);
    } catch (e) {
      window.showToast('NFC 簽到失敗：' + (e.message || '請洽工作人員'), true);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (getNfcActivityId()) setTimeout(runNfcCheckin, 900);
  });
})();
