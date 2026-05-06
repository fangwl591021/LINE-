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
