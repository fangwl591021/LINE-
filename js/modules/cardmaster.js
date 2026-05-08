// js/modules/cardmaster.js
// AI card review and copy assistant.
(function() {
  'use strict';

  var CONFIG_FIELD = '電子名片設定';
  var SERVICE_FIELD = '服務項目';
  var IMAGE_FIELD = '名片圖檔';
  var TEMPLATE_DESC = '請填寫公司/店家介紹\n請填寫公司/店家服務項目\n請填寫公司/店家特色\n請填寫優惠資訊\n建議 4-5 行，每行 16 字內';

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHTML(value) {
    if (window.escapeHTML) return window.escapeHTML(value);
    return String(value || '').replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function getRole() {
    return (window.currentUser && window.currentUser.role) || window.userRole || 'user';
  }

  function getUserId() {
    return (window.currentUserProfile && window.currentUserProfile.userId) ||
      (window.currentUser && window.currentUser.userId) || 'guest';
  }

  function getLimit() {
    var role = getRole();
    var limits = (window.LIMITS && (window.LIMITS[role] || window.LIMITS.user)) || { cardmaster: 5 };
    return limits.cardmaster;
  }

  function getUsageKey() {
    var today = new Date().toLocaleDateString('en-CA');
    return 'cardmaster_usage_' + today + '_' + getUserId();
  }

  function getUsage() {
    return parseInt(localStorage.getItem(getUsageKey()) || '0', 10) || 0;
  }

  function bumpUsage() {
    var limit = getLimit();
    if (limit === Infinity) return;
    localStorage.setItem(getUsageKey(), String(getUsage() + 1));
    renderQuota();
  }

  function assertQuota() {
    var limit = getLimit();
    if (limit === Infinity) return true;
    if (getUsage() >= limit) {
      if (window.showToast) window.showToast('今日名片大師額度已用完，請明日再試。', true);
      return false;
    }
    return true;
  }

  function getField(card, names) {
    for (var i = 0; i < names.length; i++) {
      if (card && card[names[i]] !== undefined && card[names[i]] !== null) return card[names[i]];
    }
    return '';
  }

  function setField(card, names, value) {
    if (!card) return;
    for (var i = 0; i < names.length; i++) {
      if (card[names[i]] !== undefined) {
        card[names[i]] = value;
        return;
      }
    }
    card[names[0]] = value;
  }

  function parseConfig(card) {
    var raw = getField(card, [CONFIG_FIELD, 'cardConfig', 'config']);
    try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
  }

  function stringifyConfig(card, cfg) {
    var value = JSON.stringify(cfg || {});
    setField(card, [CONFIG_FIELD, 'cardConfig', 'config'], value);
    return value;
  }

  function collectCard(card) {
    var cfg = parseConfig(card);
    return {
      rowId: card && card.rowId,
      name: getField(card, ['姓名', '英文名', 'Name']),
      company: getField(card, ['公司名稱', 'Company']),
      title: getField(card, ['職稱', 'Title']),
      phone: getField(card, ['手機號碼', '手機', 'Mobile']),
      email: getField(card, ['電子郵件', 'Email']),
      website: getField(card, ['公司網址', 'Website']),
      service: getField(card, [SERVICE_FIELD, '服務內容', 'Service']) || cfg.desc || '',
      imageUrl: cfg.imgUrl || cfg.imgUrlLandscape || getField(card, [IMAGE_FIELD, 'imageUrl']),
      buttons: Array.isArray(cfg.buttons) ? cfg.buttons : []
    };
  }

  function hasTemplateContent(card) {
    var cfg = parseConfig(card);
    var service = String(getField(card, [SERVICE_FIELD, '服務內容', 'Service']) || cfg.desc || '').trim();
    return service === TEMPLATE_DESC || !!cfg.templateDraft;
  }

  function renderQuota() {
    var el = $('cardmaster-quota');
    if (!el) return;
    var limit = getLimit();
    el.textContent = limit === Infinity ? '今日額度：無限制' : '今日額度：' + (limit - getUsage()) + '/' + limit;
  }

  function renderResult(review) {
    var box = $('cardmaster-result');
    if (!box) return;
    if (!review) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }

    var ok = !!review.pass;
    var reasons = Array.isArray(review.reasons) ? review.reasons : [];
    var tips = Array.isArray(review.suggestions) ? review.suggestions : [];
    box.className = 'rounded-2xl p-4 border text-[13px] leading-relaxed ' +
      (ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700');
    box.innerHTML =
      '<div class="font-black mb-2 flex items-center gap-1">' +
        '<span class="material-symbols-outlined text-[18px]">' + (ok ? 'verified' : 'gpp_bad') + '</span>' +
        (ok ? '健檢通過，可公開搜尋' : '健檢未通過，已維持私人') +
      '</div>' +
      (reasons.length ? '<div class="font-bold">原因：</div><ul class="list-disc pl-5 mb-2">' + reasons.map(function(r) { return '<li>' + escapeHTML(r) + '</li>'; }).join('') + '</ul>' : '') +
      (tips.length ? '<div class="font-bold">建議：</div><ul class="list-disc pl-5">' + tips.map(function(t) { return '<li>' + escapeHTML(t) + '</li>'; }).join('') + '</ul>' : '');
    box.classList.remove('hidden');
  }

  async function updateCardConfig(card, cfg, extraData) {
    var data = extraData || {};
    data[CONFIG_FIELD] = stringifyConfig(card, cfg);
    return window.fetchAPI('updateCard', { rowId: card.rowId, data: data }, true);
  }

  async function reviewCard(card, options) {
    options = options || {};
    if (!card) throw new Error('尚未建立名片');
    if (!assertQuota()) throw new Error('今日額度已用完');

    var payload = collectCard(card);
    var res = await window.fetchAPI('reviewCardSafety', { card: payload }, true);
    var review = res && res.data ? res.data : res;
    if (!review || review.error) throw new Error((review && review.error) || 'AI 健檢失敗');

    bumpUsage();
    var cfg = parseConfig(card);
    cfg.safetyReview = {
      pass: !!review.pass,
      reasons: review.reasons || [],
      reviewedAt: new Date().toISOString()
    };
    if (!review.pass) cfg.isPrivate = true;
    await updateCardConfig(card, cfg);
    if (options.render !== false) renderResult(review);
    return review;
  }

  window.ensureCardCanGoPublic = async function(card) {
    if (!card) {
      if (window.showToast) window.showToast('請先建立名片，再公開搜尋。', true);
      return false;
    }

    if (hasTemplateContent(card)) {
      if (window.showToast) window.showToast('請先修改模板內容，再公開搜尋。', true);
      return false;
    }

    try {
      var review = await reviewCard(card, { render: true });
      if (!review.pass) {
        if (window.showToast) window.showToast('AI 健檢未通過，這張名片只能自己發送，不能公開搜尋。', true);
        return false;
      }
      if (window.showToast) window.showToast('AI 健檢通過，允許公開搜尋。');
      return true;
    } catch (e) {
      if (window.showToast) window.showToast('AI 健檢失敗：' + (e.message || '請稍後再試'), true);
      return false;
    }
  };

  window.runMyCardSafetyReview = async function(evt) {
    var btn = evt && (evt.currentTarget || evt.target);
    var html = btn ? btn.innerHTML : '';
    if (!window.currentUserCard) return window.showToast('請先建立名片。', true);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 健檢中...';
    }
    try {
      await reviewCard(window.currentUserCard);
    } catch (e) {
      if (window.showToast) window.showToast(e.message || '健檢失敗', true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = html;
      }
    }
  };

  window.generateMyCardCopy = async function(evt) {
    var btn = evt && (evt.currentTarget || evt.target);
    var html = btn ? btn.innerHTML : '';
    var briefEl = $('cardmaster-brief');
    var brief = briefEl ? briefEl.value.trim() : '';
    if (!window.currentUserCard) return window.showToast('請先建立名片。', true);
    if (!assertQuota()) return;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 代寫中...';
    }

    try {
      var res = await window.fetchAPI('generateCardCopy', {
        card: collectCard(window.currentUserCard),
        brief: brief
      }, true);
      var data = res && res.data ? res.data : res;
      if (!data || data.error) throw new Error((data && data.error) || 'AI 代寫失敗');

      var text = String(data.service || data.copy || '').trim();
      if (!text) throw new Error('AI 沒有產生可用文案');

      var cfg = parseConfig(window.currentUserCard);
      cfg.desc = text;
      cfg.templateDraft = false;
      cfg.safetyReview = null;
      setField(window.currentUserCard, [SERVICE_FIELD, '服務內容', 'Service'], text);
      await updateCardConfig(window.currentUserCard, cfg, { [SERVICE_FIELD]: text });
      bumpUsage();
      if (typeof window.initMyECard === 'function') window.initMyECard();
      if (window.showToast) window.showToast('名片文案已更新，公開前請再按健檢。');
    } catch (e) {
      if (window.showToast) window.showToast('AI 代寫失敗：' + (e.message || '請稍後再試'), true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = html;
      }
    }
  };

  document.addEventListener('DOMContentLoaded', renderQuota);
  window.refreshCardMasterQuota = renderQuota;
})();
