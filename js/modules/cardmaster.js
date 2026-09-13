// js/modules/cardmaster.js
// AI card review and copy assistant.
(function() {
  'use strict';

  var CONFIG_FIELD = '自訂名片設定';
  var CONFIG_FIELDS = [CONFIG_FIELD, '電子名片設定', 'customConfig', 'custom_config', 'cardConfig', 'ecardConfig', '自訂版面', '名片設定', 'config'];
  var latestReviewFeedback = new WeakMap();
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

  function getCardRowId(card) {
    return card && (
      card.rowId ||
      card['rowId'] ||
      card['Row ID'] ||
      card['列號'] ||
      card._rowNumber ||
      card.id ||
      card.cardId ||
      ''
    );
  }

  function parseConfig(card) {
    for (var i = 0; i < CONFIG_FIELDS.length; i++) {
      var raw = card && card[CONFIG_FIELDS[i]];
      if (!raw) continue;
      try {
        var cfg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) return Object.assign({}, cfg);
      } catch (e) { /* Try legacy aliases when the canonical value is malformed. */ }
    }
    return {};
  }

  function stringifyConfig(card, cfg) {
    var value = JSON.stringify(cfg || {});
    card[CONFIG_FIELD] = value;
    CONFIG_FIELDS.slice(1).forEach(function(key) {
      if (card[key] !== undefined) card[key] = value;
    });
    return value;
  }

  function collectCard(card) {
    var cfg = parseConfig(card);
    return {
      rowId: getCardRowId(card),
      name: getField(card, ['姓名', '英文名', 'Name']),
      company: getField(card, ['公司名稱', 'Company']),
      title: cfg.title || getField(card, ['姓名', 'Name']) || getField(card, ['職稱', 'Title']),
      phone: getField(card, ['手機號碼', '手機', 'Mobile']),
      email: getField(card, ['電子郵件', 'Email']),
      website: getField(card, ['公司網址', 'Website']),
      service: cfg.desc || getField(card, [SERVICE_FIELD, '服務內容', 'Service']) || '',
      imageUrl: cfg.imgUrl || cfg.imgUrlLandscape || cfg.imgUrlPortrait || cfg.imgUrlSquare || getField(card, [IMAGE_FIELD, 'imageUrl']),
      buttons: Array.isArray(cfg.buttons) ? cfg.buttons : []
    };
  }

  function hasTemplateContent(card) {
    var cfg = parseConfig(card);
    var service = String(cfg.desc || getField(card, [SERVICE_FIELD, '服務內容', 'Service']) || '').trim();
    return service === TEMPLATE_DESC || !!cfg.templateDraft;
  }

  function isPlaceholderImage(url) {
    var text = String(url || '').trim().toLowerCase();
    if (!text) return true;
    return text.indexOf('assets/rental-template-cover.png') >= 0 ||
      text.indexOf('images.unsplash.com/photo-1616628188550-808682f3926d') >= 0;
  }

  function isValidPublicButton(button) {
    if (!button) return false;
    var label = String(button.l || button.label || button.text || '').trim();
    var url = String(button.u || button.url || button.uri || '').trim();
    if (!label || !url) return false;
    return /^(https?:\/\/|line:\/\/|tel:|mailto:)/i.test(url);
  }

  function validateCardPublicReadiness(card) {
    var cfg = parseConfig(card);
    var title = String(cfg.title || getField(card, ['姓名', 'Name']) || getField(card, ['職稱', 'Title']) || '').trim();
    var desc = String(cfg.desc || getField(card, [SERVICE_FIELD, '服務內容', 'Service']) || '').trim();
    var imageUrl = String(cfg.imgUrl || cfg.imgUrlLandscape || cfg.imgUrlPortrait || cfg.imgUrlSquare || getField(card, [IMAGE_FIELD, 'imageUrl']) || '').trim();
    var buttons = Array.isArray(cfg.buttons) ? cfg.buttons : [];
    var missing = [];
    var issues = [];

    if (isPlaceholderImage(imageUrl)) missing.push('圖片');
    if (title.length < 2) missing.push('標題');
    if (desc.length < 8 || hasTemplateContent(card)) missing.push('說明');
    if (!buttons.length || buttons.some(function(button) { return !isValidPublicButton(button); })) missing.push('按鈕');

    if (missing.indexOf('圖片') >= 0) issues.push({ field: '圖片', evidence: imageUrl ? '目前使用預設範本圖片' : '尚未設定圖片', reason: '公開名片需要可辨識的正式圖片，預設範本不列入。', suggestion: '到名片設定上傳本人、公司或服務的正式圖片，再儲存。' });
    if (missing.indexOf('標題') >= 0) issues.push({ field: '標題', evidence: title || '尚未填寫標題', reason: '標題只有 ' + title.length + ' 字，至少需要 2 字。', suggestion: '填寫至少 2 字的姓名、店名或服務名稱。' });
    if (missing.indexOf('說明') >= 0) issues.push({ field: '說明', evidence: hasTemplateContent(card) ? '仍是範本／草稿內容' : '目前說明共 ' + desc.length + ' 字', reason: hasTemplateContent(card) ? '尚未完成正式服務介紹，不能以範本提示文字公開。' : '說明不足 8 字，無法了解提供的服務。', suggestion: '填入至少 8 字的實際服務介紹，取代範本文字並儲存名片。' });
    if (!buttons.length) issues.push({ field: '按鈕', evidence: '尚未設定聯絡按鈕', reason: '至少需要 1 個有名稱與有效連結的按鈕。', suggestion: '新增聯絡、官網或電話按鈕，填寫名稱與連結後儲存。' });
    buttons.forEach(function(button, index) {
      if (isValidPublicButton(button)) return;
      var label = String(button && (button.l || button.label || button.text) || '').trim();
      var url = String(button && (button.u || button.url || button.uri) || '').trim();
      issues.push({ field: '按鈕 ' + (index + 1), evidence: (label || '未填名稱') + '／' + (url || '未填連結'), reason: !label ? '按鈕沒有顯示名稱。' : !url ? '按鈕沒有連結。' : '連結格式不支援。', suggestion: '補上按鈕名稱；連結請使用 https://、http://、line://、tel: 或 mailto: 開頭。' });
    });

    return {
      pass: missing.length === 0,
      missing: missing,
      status: missing.length ? 'readiness' : 'passed',
      reasons: issues.map(function(issue) { return issue.field + '：' + issue.reason; }),
      suggestions: issues.map(function(issue) { return issue.suggestion; }),
      issues: issues,
      imageUrl: imageUrl,
      title: title,
      desc: desc,
      buttons: buttons
    };
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

    var ok = review.pass === true;
    box.className = 'rounded-2xl p-4 border text-[13px] leading-relaxed ' +
      (ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700');
    box.innerHTML = renderCardSafetyFeedbackHtml(review);
    box.classList.remove('hidden');
  }

  function textList(value) {
    return (Array.isArray(value) ? value : typeof value === 'string' ? [value] : [])
      .filter(function(item) { return typeof item === 'string' && item.trim(); })
      .slice(0, 12).map(function(item) { return item.trim().slice(0, 600); });
  }

  function reviewIssues(value) {
    return (Array.isArray(value) ? value : []).slice(0, 12).filter(function(item) {
      return item && typeof item === 'object' && typeof item.reason === 'string';
    }).map(function(item) {
      var issue = {};
      ['field', 'evidence', 'reason', 'suggestion'].forEach(function(key) {
        issue[key] = typeof item[key] === 'string' ? item[key].trim().slice(0, 600) : '';
      });
      return issue;
    });
  }

  function reviewError(code, partial) {
    var details = {
      AI_REVIEW_INVALID_RESPONSE: ['AI 回覆格式不完整，未能取得有效判定；這不代表內容違規。', '請重新體檢；若持續發生，請通知管理員檢查服務。'],
      AI_REVIEW_INVALID_INPUT: ['名片資料不足或圖片網址格式不正確，檢查尚未執行。', '請確認名片文字與可公開讀取的圖片網址，儲存後再試。'],
      AI_REVIEW_INCOMPLETE: ['AI 未提供可核對的完整判定與修改建議，這次不能判定通過或不合格。', '請重新執行 AI 體檢；不需依照不完整結果刪改內容。'],
      AI_REVIEW_IMAGE_INCOMPLETE: ['這次未完成圖片檢查，尚無完整的 AI 體檢結果。', '請確認圖片可正常開啟，稍後重試完整 AI 體檢。'],
      REVIEW_SAVE_FAILED: ['體檢結果未能儲存，本次尚未完成公開確認。', '請確認網路連線，再重新執行體檢並儲存。'],
      CARD_CHANGED: ['檢查期間名片或登入身分已變更，舊結果未套用。', '請針對目前已儲存的名片重新體檢。'],
      REVIEW_QUOTA: ['今日 AI 名片體檢額度已用完，本次尚未執行檢查。', '請明日再試。'],
      AI_REVIEW_UNAVAILABLE: ['AI 服務或網路暫時無法完成檢查，這不代表名片內容不合格。', '請稍後重新執行；既有公開／私人設定不會因此變更。']
    };
    var known = Object.prototype.hasOwnProperty.call(details, code);
    var detail = known ? details[code] : details.AI_REVIEW_UNAVAILABLE;
    var report = { pass: false, status: 'error', errorCode: known ? code : 'AI_REVIEW_UNAVAILABLE', reasons: [detail[0]], suggestions: [detail[1]], issues: [] };
    // The dedicated endpoint can include incomplete AI observations, not raw provider exceptions.
    if (code === 'AI_REVIEW_INCOMPLETE' && partial && partial.status === 'error') {
      report.reasons = report.reasons.concat(textList(partial.reasons));
      report.suggestions = report.suggestions.concat(textList(partial.suggestions));
    }
    return report;
  }

  function normalizedReview(review) {
    if (!review || typeof review.pass !== 'boolean' || review.basicFallback || review.mode === 'basic') return reviewError('AI_REVIEW_INCOMPLETE');
    if (review.status === 'error') return reviewError(review.errorCode, review);
    if (review.status && review.status !== (review.pass ? 'passed' : 'failed')) return reviewError('AI_REVIEW_INCOMPLETE');
    var reasons = textList(review.reasons);
    var suggestions = textList(review.suggestions);
    var issues = reviewIssues(review.issues);
    if (!review.pass && (!reasons.length || !suggestions.length) && !issues.some(function(issue) { return issue.field && issue.evidence && issue.reason && issue.suggestion; })) return reviewError('AI_REVIEW_INCOMPLETE');
    return { pass: review.pass, status: review.pass ? 'passed' : 'failed', riskLevel: typeof review.riskLevel === 'string' ? review.riskLevel.slice(0, 24) : 'unknown', reasons: reasons, suggestions: suggestions, issues: issues, reviewedAt: review.reviewedAt || '' };
  }

  function getCardSafetyFeedback(card) {
    var latest = card && latestReviewFeedback.get(card);
    if (latest && latest.actor === getUserId() && latest.snapshot === JSON.stringify(collectCard(card))) return latest.review;
    var readiness = validateCardPublicReadiness(card);
    if (!readiness.pass) return readiness;
    var review = parseConfig(card).safetyReview;
    if (!review) return { pass: false, status: 'pending', reasons: ['尚未完成 AI 體檢，並非已判定不合格。'], suggestions: ['按「執行 AI 體檢並公開」，確認結果後再公開。'], issues: [] };
    var feedback = normalizedReview(review);
    // Old failed reports may contain reasons but no saved advice. Show the original reasons, never invent evidence.
    if (review.pass === false && !review.status && !review.basicFallback && review.mode !== 'basic' && textList(review.reasons).length) {
      feedback = { pass: false, status: 'failed', reasons: textList(review.reasons), suggestions: textList(review.suggestions), issues: reviewIssues(review.issues), reviewedAt: review.reviewedAt || '' };
      if (!feedback.suggestions.length) feedback.suggestions = ['舊版未儲存具體修改建議，請重新體檢取得完整說明。'];
    }
    return feedback;
  }

  function renderCardSafetyFeedbackHtml(feedback, options) {
    feedback = feedback || reviewError('AI_REVIEW_INCOMPLETE');
    var titles = { readiness: '名片資料尚未完整，AI 體檢尚未執行', pending: '公開交流池需要先通過 AI 體檢', failed: 'AI 體檢未通過：原因與修改建議', error: 'AI 體檢未完成', passed: 'AI 體檢通過，可公開搜尋' };
    var issues = reviewIssues(feedback.issues);
    var fieldLabels = { name: '姓名', company: '公司／店名', title: '標題', service: '服務說明', phone: '電話', email: '電子郵件', website: '網站', buttons: '按鈕', image: '圖片' };
    var html = options && options.heading === false ? '' : '<div class="font-black mb-3">' + escapeHTML(titles[feedback.status] || titles.error) + '</div>';
    if (feedback.reviewedAt && !isNaN(Date.parse(feedback.reviewedAt))) html += '<div class="text-xs mb-3">上次檢查：' + escapeHTML(new Date(feedback.reviewedAt).toLocaleString('zh-TW')) + '</div>';
    if (feedback.status === 'error' && issues.length) html += '<p class="mb-3">' + textList(feedback.reasons).map(escapeHTML).join('；') + '</p><p class="mb-3">' + textList(feedback.suggestions).map(escapeHTML).join('；') + '</p><p class="font-bold mb-2">本次尚未儲存的檢查內容：</p>';
    if (issues.length) html += '<ol class="space-y-3 list-decimal pl-5" style="overflow-wrap:anywhere">' + issues.map(function(issue) {
      var field = Object.prototype.hasOwnProperty.call(fieldLabels, issue.field) ? fieldLabels[issue.field] : issue.field;
      return '<li><strong>' + escapeHTML(field || '名片內容') + '</strong>' + (issue.evidence ? '<div>檢查內容：' + escapeHTML(issue.evidence) + '</div>' : '') + '<div>原因：' + escapeHTML(issue.reason) + '</div>' + (issue.suggestion ? '<div class="font-bold">怎麼修改：' + escapeHTML(issue.suggestion) + '</div>' : '') + '</li>';
    }).join('') + '</ol>';
    else {
      html += '<ul class="list-disc pl-5 mb-2" style="overflow-wrap:anywhere">' + textList(feedback.reasons).map(function(reason) { return '<li>' + escapeHTML(reason) + '</li>'; }).join('') + '</ul>';
      var tips = textList(feedback.suggestions);
      if (tips.length) html += '<div class="font-bold mt-2">下一步：</div><ul class="list-disc pl-5">' + tips.map(function(tip) { return '<li>' + escapeHTML(tip) + '</li>'; }).join('') + '</ul>';
    }
    return html;
  }

  function showReviewFeedback(review, card, render) {
    if (card) latestReviewFeedback.set(card, { actor: getUserId(), snapshot: JSON.stringify(collectCard(card)), review: review });
    if (render !== false) renderResult(review);
    if (typeof window.renderMatchmakeSafetyFeedback === 'function') window.renderMatchmakeSafetyFeedback(review, card);
    return review;
  }

  function renderNotice(message, isError) {
    var box = $('cardmaster-result');
    if (!box) return;
    box.className = 'rounded-2xl p-4 border text-[14px] font-bold leading-relaxed ' +
      (isError ? 'bg-red-50 border-red-100 text-red-700' : 'bg-blue-50 border-blue-100 text-blue-700');
    box.innerHTML = escapeHTML(message);
    box.classList.remove('hidden');
  }

  function buildLocalCopy(card, brief) {
    var payload = collectCard(card);
    var company = payload.company || payload.name || '專業服務';
    var title = payload.title ? payload.title + '服務' : '專人服務';
    var userBrief = String(brief || '').replace(/\s+/g, ' ').trim();
    var base = userBrief || payload.service || TEMPLATE_DESC;
    var parts = base
      .split(/[，,。.\n]/)
      .map(function(s) { return s.trim(); })
      .filter(Boolean)
      .slice(0, 3);

    var lines = [
      company,
      title,
      parts[0] || '提供清楚完整的諮詢',
      parts[1] || '協助媒合適合資源',
      parts[2] || '歡迎加入好友了解'
    ];

    return lines.map(function(line) {
      return String(line).slice(0, 18);
    }).join('\n');
  }

  async function updateCardConfig(card, cfg, extraData) {
    var data = Object.assign({}, extraData || {});
    data[CONFIG_FIELD] = JSON.stringify(cfg || {});
    var result = await window.fetchAPI('updateCard', {
      rowId: getCardRowId(card),
      userId: getUserId(),
      data: data
    }, true);
    if (!result || result.success !== true) throw new Error('名片設定未能儲存');
    stringifyConfig(card, cfg);
    return result;
  }

  async function reviewCard(card, options) {
    options = options || {};
    if (!card) throw new Error('尚未建立名片');
    var readiness = validateCardPublicReadiness(card);
    if (!readiness.pass) return showReviewFeedback(readiness, card, options.render);
    if (!assertQuota()) return showReviewFeedback(reviewError('REVIEW_QUOTA'), card, options.render);

    var payload = collectCard(card);
    var actorId = getUserId();
    var snapshot = JSON.stringify(payload);
    var review;
    try {
      var res = await window.fetchAPI('reviewCardSafety', { card: payload }, true);
      review = res && res.success === false
        ? reviewError(res.errorCode || (res.data && res.data.errorCode), res.data)
        : normalizedReview(res && res.data ? res.data : res);
    } catch (e) {
      review = reviewError('AI_REVIEW_UNAVAILABLE');
    }

    if (actorId !== getUserId() || snapshot !== JSON.stringify(collectCard(card))) return showReviewFeedback(reviewError('CARD_CHANGED'), card, options.render);
    if (review.status === 'error') return showReviewFeedback(review, card, options.render);
    bumpUsage();
    var cfg = parseConfig(card);
    review.reviewedAt = new Date().toISOString();
    cfg.safetyReview = Object.assign({}, review, { mode: 'ai' });
    if (!review.pass) {
      cfg.isPrivate = true;
      if (Object.prototype.hasOwnProperty.call(cfg, 'private')) cfg.private = true;
      if (Object.prototype.hasOwnProperty.call(cfg, 'visibility')) cfg.visibility = 'private';
    }
    try {
      await updateCardConfig(card, cfg);
    } catch (e) {
      var saveError = reviewError('REVIEW_SAVE_FAILED');
      saveError.issues = review.issues;
      return showReviewFeedback(saveError, card, options.render);
    }
    return showReviewFeedback(review, card, options.render);
  }

  window.ensureCardCanGoPublic = async function(card) {
    if (!card) {
      if (window.showToast) window.showToast('請先建立名片，再公開搜尋。', true);
      return false;
    }

    var readiness = validateCardPublicReadiness(card);
    if (!readiness.pass) {
      var missingText = readiness.missing.join('、');
      if (window.showToast) window.showToast('公開交流池需要先通過 AI 體檢：請補齊有效' + missingText + '。', true);
      showReviewFeedback(readiness, card);
      return false;
    }

    try {
      var review = await reviewCard(card, { render: true });
      if (!review.pass) {
        if (window.showToast) window.showToast(review.status === 'error' ? 'AI 體檢未完成，請查看下方原因與下一步。' : 'AI 體檢未通過，請依下方逐項說明修改後再試。', true);
        return false;
      }
      if (window.showToast) window.showToast('AI 健檢通過，允許公開搜尋。');
      return true;
    } catch (e) {
      showReviewFeedback(reviewError('AI_REVIEW_UNAVAILABLE'), card);
      if (window.showToast) window.showToast('AI 體檢未完成，請查看原因後重試。', true);
      return false;
    }
  };

  window.validateCardPublicReadiness = validateCardPublicReadiness;
  window.getCardSafetyConfig = parseConfig;
  window.getCardSafetyFeedback = getCardSafetyFeedback;
  window.renderCardSafetyFeedbackHtml = renderCardSafetyFeedbackHtml;

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
    if (!brief && hasTemplateContent(window.currentUserCard)) {
      renderNotice('請先輸入你的服務對象、特色或優惠，名片大師才知道要往哪個方向整理。', true);
      return window.showToast('請先輸入一點方向，例如服務對象、特色或優惠。', true);
    }
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
      if (res && res.success === false) throw new Error(res.error || 'AI 代寫服務暫時無法使用');
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
      try {
        var fallbackText = buildLocalCopy(window.currentUserCard, brief);
        var fallbackCfg = parseConfig(window.currentUserCard);
        fallbackCfg.desc = fallbackText;
        fallbackCfg.templateDraft = false;
        fallbackCfg.safetyReview = null;
        setField(window.currentUserCard, [SERVICE_FIELD, '服務內容', 'Service'], fallbackText);
        await updateCardConfig(window.currentUserCard, fallbackCfg, { [SERVICE_FIELD]: fallbackText });
        if (typeof window.initMyECard === 'function') window.initMyECard();
        renderNotice('AI 暫時無法完成代寫，已先套用本機整理版文案；公開前請再按 AI 健檢。');
        if (window.showToast) window.showToast('已先套用整理版文案，AI 服務稍後再試。');
      } catch (fallbackError) {
        renderNotice('AI 代寫失敗：' + (e.message || fallbackError.message || '請稍後再試'), true);
        if (window.showToast) window.showToast('AI 代寫失敗：' + (e.message || '請稍後再試'), true);
      }
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
