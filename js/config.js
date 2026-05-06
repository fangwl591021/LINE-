/* ==================== 全域設定 ==================== */

const LIFF_ID = "2009886448-2UHnJgyT";
const WORKER_URL = "https://line-engine.fangwl591021.workers.dev/";

// 讓其他模組可用 window 方式讀取，避免跨檔案 const 無法被 window.LIFF_ID 讀到
window.LIFF_ID = LIFF_ID;
window.WORKER_URL = WORKER_URL;

// 用量限制(依角色權限)
// 邏輯: 名片無限制(Infinity), 加入 AI每日配對限制(matchmake)
window.LIMITS = {
  admin: { activities: Infinity, cards: Infinity, matchmake: Infinity },
  store: { activities: 10, cards: Infinity, matchmake: 50 },
  user:  { activities: 1, cards: Infinity, matchmake: 5 }
};

/* ==================== SaaS 功能開關設定 ====================
 * aiMatch：AI 配對 / 命理標籤補算
 * cardScanner：掃描名片 / AI OCR 建檔
 * activityBuilder：活動製作 / 活動管理 / 活動報名顯示
========================================================= */
window.SAAS_FEATURE_DEFAULTS = {
  aiMatch: true,
  cardScanner: true,
  activityBuilder: true
};

window.SAAS_FEATURE_LABELS = {
  aiMatch: "AI 智能配對",
  cardScanner: "掃描名片建檔",
  activityBuilder: "活動製作管理"
};

window.SAAS_FEATURE_ACTION_MAP = {
  matchmakeContacts: "aiMatch",
  calculateFateTags: "aiMatch",
  recognizeCardWithGPT4o: "cardScanner",
  bulkAddRegistrants: "activityBuilder",
  updateActivity: "activityBuilder",
  removeAct: "activityBuilder",
  getPublicActivities: "activityBuilder",
  joinActivity: "activityBuilder",
  getActivityRegistrants: "activityBuilder",
  toggleCheckin: "activityBuilder",
  confirmPayment: "activityBuilder"
};

window.currentSaasFeatures = { ...window.SAAS_FEATURE_DEFAULTS };
window._saasFeatureLoaded = false;
window._saasGoPageGuardInstalled = false;

window.parseSaasBool = function(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (["false", "0", "off", "no", "否", "關", "停用", "disabled"].includes(s)) return false;
  if (["true", "1", "on", "yes", "是", "開", "啟用", "enabled"].includes(s)) return true;
  return fallback;
};

window.normalizeSaasFeatures = function(raw) {
  const d = (raw && raw.data && typeof raw.data === "object") ? raw.data : (raw || {});
  return {
    aiMatch: window.parseSaasBool(
      d.aiMatch ?? d.aiMatchEnabled ?? d.enable_ai_match ?? d.feature_ai_match ?? d["AI配對開關"],
      window.SAAS_FEATURE_DEFAULTS.aiMatch
    ),
    cardScanner: window.parseSaasBool(
      d.cardScanner ?? d.cardScannerEnabled ?? d.enable_card_scanner ?? d.feature_card_scanner ?? d["掃描名片開關"],
      window.SAAS_FEATURE_DEFAULTS.cardScanner
    ),
    activityBuilder: window.parseSaasBool(
      d.activityBuilder ?? d.activityBuilderEnabled ?? d.enable_activity_builder ?? d.feature_activity_builder ?? d["活動製作開關"],
      window.SAAS_FEATURE_DEFAULTS.activityBuilder
    )
  };
};

window.getSaasFeatureCacheKey = function(networkId) {
  return "LINE_SAAS_FEATURES_" + String(networkId || window.currentNetworkId || "admin");
};

window.readCachedSaasFeatures = function(networkId) {
  try {
    const raw = localStorage.getItem(window.getSaasFeatureCacheKey(networkId));
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
};

window.writeCachedSaasFeatures = function(features, networkId) {
  try {
    localStorage.setItem(
      window.getSaasFeatureCacheKey(networkId),
      JSON.stringify(window.normalizeSaasFeatures(features))
    );
  } catch(e) {}
};

window.setSaasFeatureStateFromSettings = function(settings, networkId) {
  window.currentSaasFeatures = window.normalizeSaasFeatures(settings);
  window._saasFeatureLoaded = true;
  window.writeCachedSaasFeatures(window.currentSaasFeatures, networkId || window.currentNetworkId);
  window.refreshSaasFeatureToggles();
  window.applySaasFeatureUI();
  return window.currentSaasFeatures;
};

window.getSaasFeatureSettingsPayload = function(features = window.currentSaasFeatures) {
  const f = window.normalizeSaasFeatures(features);
  return {
    aiMatchEnabled: f.aiMatch,
    cardScannerEnabled: f.cardScanner,
    activityBuilderEnabled: f.activityBuilder,
    enable_ai_match: f.aiMatch,
    enable_card_scanner: f.cardScanner,
    enable_activity_builder: f.activityBuilder,
    "AI配對開關": f.aiMatch,
    "掃描名片開關": f.cardScanner,
    "活動製作開關": f.activityBuilder
  };
};

window.isSaasFeatureEnabled = function(featureKey) {
  if (!featureKey) return true;
  const f = window.currentSaasFeatures || window.SAAS_FEATURE_DEFAULTS;
  return window.parseSaasBool(f[featureKey], window.SAAS_FEATURE_DEFAULTS[featureKey] !== false);
};

window.requireSaasFeature = function(featureKey, silent = false) {
  const enabled = window.isSaasFeatureEnabled(featureKey);
  if (!enabled && !silent) {
    const label = window.SAAS_FEATURE_LABELS[featureKey] || "此功能";
    window.showToast(`此 SaaS 方案尚未啟用「${label}」`, true);
  }
  return enabled;
};

window.getFeatureByAction = function(action) {
  return window.SAAS_FEATURE_ACTION_MAP[action] || "";
};

window.loadSaasFeatures = async function(force = false) {
  const networkId = window.currentNetworkId || "admin";
  const cached = window.readCachedSaasFeatures(networkId);
  if (cached && !force) {
    window.setSaasFeatureStateFromSettings(cached, networkId);
  }

  if (typeof window.fetchAPI !== "function") return window.currentSaasFeatures;

  try {
    const res = await window.fetchAPI("getStoreSettings", { networkId }, true);
    if (res && !res.error) {
      return window.setSaasFeatureStateFromSettings(res, networkId);
    }
  } catch(e) {
    console.warn("SaaS 功能開關讀取失敗，使用本機快取或預設值", e);
  }

  if (!cached) {
    window.setSaasFeatureStateFromSettings(window.SAAS_FEATURE_DEFAULTS, networkId);
  }
  return window.currentSaasFeatures;
};

window.saveSaasFeatureSettings = async function(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById("btn-save-saas-features");
  const oriHtml = btn ? btn.innerHTML : "";

  const features = {
    aiMatch: !!document.getElementById("toggle-feature-ai-match")?.checked,
    cardScanner: !!document.getElementById("toggle-feature-card-scanner")?.checked,
    activityBuilder: !!document.getElementById("toggle-feature-activity-builder")?.checked
  };

  window.setSaasFeatureStateFromSettings(features, window.currentNetworkId);

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  }

  try {
    const payload = {
      networkId: window.currentNetworkId || "admin",
      siteName: document.getElementById("input-site-name")?.value?.trim() || "",
      bannerUrl: document.getElementById("input-store-banner")?.value?.trim() || "",
      showBanner: document.getElementById("toggle-show-banner") ? document.getElementById("toggle-show-banner").checked : true,
      youtubeUrl: document.getElementById("input-store-youtube")?.value?.trim() || "",
      showYoutube: document.getElementById("toggle-show-youtube") ? document.getElementById("toggle-show-youtube").checked : true,
      ...window.getSaasFeatureSettingsPayload(features)
    };

    const res = await window.fetchAPI("saveStoreSettings", payload, true);
    if (res && res.success !== false && !res.error) {
      window.writeCachedSaasFeatures(features, window.currentNetworkId);
      window.showToast("✅ SaaS 功能開關已儲存");
    } else {
      throw new Error(res?.error || "雲端儲存失敗");
    }
  } catch(err) {
    window.showToast("雲端儲存失敗，已先保留在本機：" + err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oriHtml || '<span class="material-symbols-outlined text-[18px]">save</span> 儲存功能開關';
    }
  }
};

window.refreshSaasFeatureToggles = function() {
  const f = window.currentSaasFeatures || window.SAAS_FEATURE_DEFAULTS;
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  };
  setChecked("toggle-feature-ai-match", f.aiMatch);
  setChecked("toggle-feature-card-scanner", f.cardScanner);
  setChecked("toggle-feature-activity-builder", f.activityBuilder);
};

window.toggleFeatureElements = function(selectors, enabled) {
  (selectors || []).forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (enabled) {
        el.classList.remove("hidden");
        el.removeAttribute("data-feature-hidden");
      } else {
        el.classList.add("hidden");
        el.setAttribute("data-feature-hidden", "true");
      }
    });
  });
};

window.applySaasFeatureUI = function() {
  const aiOn = window.isSaasFeatureEnabled("aiMatch");
  const scannerOn = window.isSaasFeatureEnabled("cardScanner");
  const activityOn = window.isSaasFeatureEnabled("activityBuilder");

  window.toggleFeatureElements([
    "#matchmaker-ui",
    "#privacy-lock-container",
    "#page-match",
    "#page-matchmake",
    "button[onclick*=\"startMatchmaking\"]",
    "button[onclick*=\"syncOldTags\"]",
    "button[onclick*=\"match\"]",
    "button[onclick*=\"Match\"]"
  ], aiOn);

  window.toggleFeatureElements([
    "button[onclick*=\"myCameraInput\"]",
    "button[onclick*=\"myGalleryInput\"]",
    "button[onclick*=\"recognize\"]",
    "input[onchange*=\"recognizeMyCard\"]"
  ], scannerOn);

  window.toggleFeatureElements([
    "#page-active",
    "#page-admin-activities",
    "#page-admin-checkin",
    "#user-activities-list",
    "#home-activity-filters",
    "button[onclick*=\"submitActivityForm\"]",
    "button[onclick*=\"openEditActivity\"]",
    "button[onclick*=\"joinPublicActivity\"]",
    "button[onclick*=\"admin-activities\"]",
    "button[onclick*=\"active\"]"
  ], activityOn);

  const panel = document.getElementById("details-saas-features");
  if (panel) {
    const canManage = window.userRole === "admin" || window.userRole === "store";
    panel.classList.toggle("hidden", !canManage);
  }
};

window.initSaasFeaturePanel = function() {
  if (document.getElementById("details-saas-features")) return;

  const anchor = document.getElementById("details-store-banner") || document.getElementById("details-my-ecard");
  if (!anchor || !anchor.parentElement) return;

  const html = `
    <details id="details-saas-features" class="hidden bg-white rounded-3xl shadow-sm border border-slate-100 mb-4 group">
      <summary class="font-bold text-slate-800 p-5 flex items-center justify-between cursor-pointer list-none outline-none">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-indigo-500 icon-filled">tune</span>
          SaaS 功能開關
          <span class="bg-indigo-100 text-indigo-600 text-[10px] px-1.5 py-0.5 rounded-md font-bold tracking-tighter">PLAN</span>
        </div>
        <span class="material-symbols-outlined text-slate-400 group-open:rotate-180 transition-transform">expand_more</span>
      </summary>
      <div class="p-5 pt-0 border-t border-slate-50 space-y-4">
        <p class="text-[12px] text-slate-400 font-medium leading-relaxed mt-3">用於不同 SaaS 專案版本，可控制是否開放 AI 配對、掃描名片與活動製作模組。</p>

        <label class="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
          <div>
            <div class="font-black text-[14px] text-slate-800">AI 配對</div>
            <div class="text-[11px] text-slate-400 font-bold">控制智能配對與命理標籤補算</div>
          </div>
          <input type="checkbox" id="toggle-feature-ai-match" class="sr-only peer">
          <div class="relative w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-[#06C755] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
        </label>

        <label class="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
          <div>
            <div class="font-black text-[14px] text-slate-800">掃描名片</div>
            <div class="text-[11px] text-slate-400 font-bold">控制拍照 / 相簿上傳後的 AI OCR 建檔</div>
          </div>
          <input type="checkbox" id="toggle-feature-card-scanner" class="sr-only peer">
          <div class="relative w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-[#06C755] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
        </label>

        <label class="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
          <div>
            <div class="font-black text-[14px] text-slate-800">活動製作</div>
            <div class="text-[11px] text-slate-400 font-bold">控制活動建立、報名、核銷與活動列表</div>
          </div>
          <input type="checkbox" id="toggle-feature-activity-builder" class="sr-only peer">
          <div class="relative w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-[#06C755] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
        </label>

        <button id="btn-save-saas-features" onclick="window.saveSaasFeatureSettings(event)" class="w-full bg-[#06C755] text-white py-3.5 rounded-xl font-bold shadow-md active:scale-95 transition-transform flex justify-center items-center gap-1">
          <span class="material-symbols-outlined text-[18px]">save</span> 儲存功能開關
        </button>
      </div>
    </details>`;

  anchor.insertAdjacentHTML("afterend", html);
  window.refreshSaasFeatureToggles();
  window.applySaasFeatureUI();
};

window.installSaasGoPageGuard = function() {
  if (window._saasGoPageGuardInstalled || typeof window.goPage !== "function") return;
  const originalGoPage = window.goPage;
  const pageFeatureMap = {
    match: "aiMatch",
    matchmake: "aiMatch",
    active: "activityBuilder",
    "admin-activities": "activityBuilder",
    "admin-checkin": "activityBuilder",
    "my-act-detail": "activityBuilder"
  };

  window.goPage = function(pageName, ...args) {
    const feature = pageFeatureMap[pageName];
    if (feature && !window.requireSaasFeature(feature)) {
      return originalGoPage.call(window, "home", ...args);
    }
    return originalGoPage.call(window, pageName, ...args);
  };

  window._saasGoPageGuardInstalled = true;
};

window.ensureCardAfterRegistration = async function(registerPayload, registerResult) {
  try {
    const name = registerPayload.name || window.currentUserProfile?.displayName || "我的名片";
    const phone = registerPayload.phone || "";
    const industry = registerPayload.industry || "";
    const birthday = registerPayload.birthday || "";
    const userId = registerPayload.userId || window.currentUserProfile?.userId || "";
    const networkId = registerPayload.networkId || window.currentNetworkId || "admin";

    const cardConfig = {
      cardType: "v1",
      imgUrl: window.currentUserProfile?.pictureUrl || "",
      title: name,
      desc: industry || "請編輯您的服務項目與個人介紹",
      buttons: phone ? [{ l: "撥打手機", u: "tel:" + String(phone).replace(/[^0-9+]/g, ""), c: "#06C755" }] : [],
      isPrivate: false,
      descAlign: "center",
      descColor: "#666666"
    };

    const cardData = {
      "LINE ID": userId,
      userId: userId,
      "姓名": name,
      "手機號碼": phone,
      "生日": birthday,
      "職稱": industry,
      "服務項目": industry || "請編輯您的服務項目與個人介紹",
      "名片圖檔": window.currentUserProfile?.pictureUrl || "",
      "歸屬網": networkId,
      networkId: networkId,
      "建檔人/備註": "LINE LOGIN 註冊後自動建立",
      "自訂名片設定": JSON.stringify(cardConfig)
    };

    const res = await window.fetchAPI("saveCard", { data: cardData, networkId, userId }, true);
    return res;
  } catch(e) {
    console.warn("註冊後自動建立名片失敗", e);
    return { success: false, error: e.message };
  }
};

window.handleAfterRegisterCardDisplay = function() {
  const flag = localStorage.getItem("SAAS_SHOW_CARD_AFTER_REGISTER");
  if (!flag) return;
  localStorage.removeItem("SAAS_SHOW_CARD_AFTER_REGISTER");

  setTimeout(() => {
    if (window.currentUserCard && typeof window.openCardDetail === "function") {
      window.showToast("✅ 已建立您的專屬名片");
      window.openCardDetail(window.currentUserCard);
      return;
    }

    window.showToast("註冊完成，請先設定您的名片", true);
    if (typeof window.goPage === "function") window.goPage("admin-settings");
    const detailEl = document.getElementById("details-my-ecard");
    if (detailEl) {
      detailEl.open = true;
      setTimeout(() => detailEl.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    }
  }, 300);
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

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    window.initSaasFeaturePanel();
    window.installSaasGoPageGuard();
    window.applySaasFeatureUI();
  }, 900);
});
