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
let currentNetworkId = '';
let allSystemUsers = [];
let currentUser = null;
let currentUserProfile = null;
let allCards = [];
let currentCard = null;
let currentUserCard = null;
let isProcessing = false;
let cropperInstance = null;
let activeCropperInstance = null;
let currentActiveCropTarget = '';
let activeBatchCount = 0;

let userRole = 'user';
let hasAdminRights = false;
let currentViewMode = 'user';

let currentECardStyle = 'v1';
let v1Buttons = [];
let myV1Buttons = [];
window.userSocials = [];
window.myActivitiesData = [];
