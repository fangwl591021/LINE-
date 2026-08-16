/* ==================== 名片收藏額度設定 ==================== */
(function () {
  'use strict';

  var FIELD_IDS = {
    freeDaily: 'input-card-quota-free-daily',
    freeTotal: 'input-card-quota-free-total',
    paidDaily: 'input-card-quota-paid-daily',
    paidTotal: 'input-card-quota-paid-total'
  };

  var STORAGE_KEY = 'line_engine_card_quota_settings_v1';
  var wrapped = false;

  function numberOrBlank(value) {
    if (value === null || value === undefined || value === '') return '';
    var n = Number(value);
    return Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : '';
  }

  function readInputs() {
    return {
      cardQuotaFreeDailyLimit: numberOrBlank(document.getElementById(FIELD_IDS.freeDaily)?.value),
      cardQuotaFreeTotalLimit: numberOrBlank(document.getElementById(FIELD_IDS.freeTotal)?.value),
      cardQuotaPaidDailyLimit: numberOrBlank(document.getElementById(FIELD_IDS.paidDaily)?.value),
      cardQuotaPaidTotalLimit: numberOrBlank(document.getElementById(FIELD_IDS.paidTotal)?.value)
    };
  }

  function writeInputs(settings) {
    settings = settings || {};
    var mapping = [
      [FIELD_IDS.freeDaily, settings.cardQuotaFreeDailyLimit],
      [FIELD_IDS.freeTotal, settings.cardQuotaFreeTotalLimit],
      [FIELD_IDS.paidDaily, settings.cardQuotaPaidDailyLimit],
      [FIELD_IDS.paidTotal, settings.cardQuotaPaidTotalLimit]
    ];
    mapping.forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el) el.value = numberOrBlank(pair[1]);
    });
  }

  function saveLocal(settings) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings || {})); } catch (e) {}
  }

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function setStatus(text, error) {
    var el = document.getElementById('card-quota-settings-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'mt-3 text-[12px] font-bold ' + (error ? 'text-red-600' : 'text-slate-500');
  }

  function quotaInput(id, label, suffix, disabled) {
    return '<label class="block">' +
      '<span class="block text-[12px] font-black text-slate-600 mb-2">' + label + '</span>' +
      '<div class="flex items-center gap-2">' +
        '<input id="' + id + '" type="number" min="0" step="1" inputmode="numeric" placeholder="留空＝不限制" ' + (disabled ? 'disabled ' : '') +
          'class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-bold outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400">' +
        '<span class="text-[12px] font-bold text-slate-400 whitespace-nowrap">' + suffix + '</span>' +
      '</div>' +
    '</label>';
  }

  function buildCard() {
    var box = document.createElement('section');
    box.id = 'card-quota-settings-panel';
    box.className = 'mt-5 rounded-2xl border border-slate-200 bg-white p-5';
    box.innerHTML =
      '<div class="flex items-start gap-3 mb-4">' +
        '<div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">' +
          '<span class="material-symbols-outlined">style</span>' +
        '</div>' +
        '<div>' +
          '<h3 class="text-[15px] font-black text-slate-800">名片收藏額度</h3>' +
          '<p class="mt-1 text-[12px] leading-relaxed text-slate-500">免費方案可設定每日上限與個人總上限；留空代表不限制。收費方案先保留欄位，尚未啟用。</p>' +
        '</div>' +
      '</div>' +
      '<div class="rounded-2xl bg-slate-50 p-4">' +
        '<div class="text-[13px] font-black text-slate-700 mb-3">免費方案</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          quotaInput(FIELD_IDS.freeDaily, '每日上限', '張／日', false) +
          quotaInput(FIELD_IDS.freeTotal, '個人總上限', '張', false) +
        '</div>' +
      '</div>' +
      '<div class="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4">' +
        '<div class="flex items-center justify-between gap-3 mb-3">' +
          '<div class="text-[13px] font-black text-slate-500">收費方案</div>' +
          '<span class="px-2 py-1 rounded-full bg-slate-200 text-[10px] font-black text-slate-500">預留・未啟用</span>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
          quotaInput(FIELD_IDS.paidDaily, '每日上限', '張／日', true) +
          quotaInput(FIELD_IDS.paidTotal, '個人總上限', '張', true) +
        '</div>' +
      '</div>' +
      '<div id="card-quota-settings-status" class="mt-3 text-[12px] font-bold text-slate-500">尚未設定時維持目前既有行為。</div>';
    return box;
  }

  function injectPanel() {
    if (document.getElementById('card-quota-settings-panel')) return true;
    var saveBtn = document.getElementById('btn-save-store-banner');
    var siteInput = document.getElementById('input-site-name');
    if (!saveBtn && !siteInput) return false;

    var panel = buildCard();
    if (saveBtn) {
      var target = saveBtn.parentElement || saveBtn;
      target.parentElement.insertBefore(panel, target);
    } else {
      var container = siteInput.closest('form') || siteInput.closest('section') || siteInput.parentElement;
      container.appendChild(panel);
    }
    writeInputs(readLocal());
    return true;
  }

  async function loadCloudQuota() {
    injectPanel();
    if (typeof window.fetchAPI !== 'function') {
      writeInputs(readLocal());
      return;
    }
    try {
      var res = await window.fetchAPI('getStoreSettings', { networkId: window.currentNetworkId || 'admin' });
      var raw = (res && res.data && typeof res.data === 'object') ? res.data : (res || {});
      var local = readLocal();
      var merged = Object.assign({}, local, raw);
      writeInputs(merged);
      saveLocal(readInputs());
      setStatus('額度欄位已載入。留空代表不限制。', false);
    } catch (e) {
      writeInputs(readLocal());
      setStatus('雲端額度設定讀取失敗，已顯示本機暫存值。', true);
    }
  }

  async function saveCloudQuota() {
    injectPanel();
    var quota = readInputs();
    saveLocal(quota);
    if (typeof window.fetchAPI !== 'function') return quota;

    var res = await window.fetchAPI('getStoreSettings', { networkId: window.currentNetworkId || 'admin' });
    var raw = (res && res.data && typeof res.data === 'object') ? res.data : (res || {});
    var payload = Object.assign({}, raw, quota, { networkId: window.currentNetworkId || 'admin' });
    var saved = await window.fetchAPI('saveStoreSettings', payload);
    if (saved && saved.success === false) throw new Error(saved.error || '額度設定儲存失敗');
    setStatus('名片收藏額度已同步至雲端。', false);
    return quota;
  }

  function wrapExistingSettings() {
    if (wrapped) return;
    if (typeof window.saveStoreBanner !== 'function' || typeof window.loadStoreBannerSettings !== 'function') return;
    wrapped = true;

    var originalSave = window.saveStoreBanner;
    window.saveStoreBanner = async function (e) {
      await originalSave.call(this, e);
      try {
        await saveCloudQuota();
      } catch (error) {
        setStatus('額度設定儲存失敗：' + (error.message || error), true);
        if (window.showToast) window.showToast('名片額度設定儲存失敗', true);
      }
    };

    var originalLoad = window.loadStoreBannerSettings;
    window.loadStoreBannerSettings = async function () {
      var result = await originalLoad.apply(this, arguments);
      await loadCloudQuota();
      return result;
    };
  }

  function boot() {
    injectPanel();
    wrapExistingSettings();
    var tries = 0;
    var timer = setInterval(function () {
      injectPanel();
      wrapExistingSettings();
      tries += 1;
      if ((wrapped && document.getElementById('card-quota-settings-panel')) || tries > 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
