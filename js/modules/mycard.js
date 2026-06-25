// js/modules/mycard.js
// Classic-script safe digital card module.
(function() {
  'use strict';

  var moduleConfig = window.Config || {
    LIFF_ID: window.LIFF_ID || '',
    WORKER_URL: window.WORKER_URL || '',
    API_URL: (window.WORKER_URL || '').replace(/\/$/, '')
  };

  var moduleCore = window.Core || {
    showLoading: function(show) {
      var loader = document.getElementById('global-loader');
      if (!loader) return;
      loader.classList.toggle('hidden', !show);
      loader.classList.toggle('flex', !!show);
    }
  };

  var moduleAuth = window.Auth || {
    getUserId: function() { return (window.currentUserProfile && window.currentUserProfile.userId) || (window.currentUser && window.currentUser.userId) || ''; },
    getUserProfile: function() { return window.currentUserProfile || null; }
  };

  var currentCardData = null;
  var myEcardButtons = [];
  var myEcardStateLoaded = false;
  var myEcardImgs = { landscape: '', portrait: '', square: '' };
  var myEcardRatios = { landscape: '20:13', portrait: '400:600', square: '1:1' };
  var wysiwygState = { cfg: null, field: '', buttonIndex: -1 };
  var myVideoDraftApplied = false;
  var myVideoDraftCache = null;
  var myVideoModeRequested = false;
  var myVideoModeSuppressed = false;
  var introTemplate = '請填寫公司/店家介紹\n請填寫公司/店家服務項目\n請填寫公司/店家特色\n請填寫優惠資訊\n建議 4-5 行，每行 16 字內';
  var templateCoverUrl = 'assets/rental-template-cover.png';
  var templateAddressUrl = 'https://www.google.com/maps';


  function firstPhoneForTel(value) {
    var raw = String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/＋/g, '+').trim();
    if (!raw) return '';
    var candidates = raw.match(/(?:\+?886|00886)?[\s().-]*0?9(?:[\s().-]*\d){8}|\+?\d(?:[\s().-]*\d){6,14}/g) || [];
    for (var i = 0; i < candidates.length; i++) {
      var phone = candidates[i].replace(/[^0-9+]/g, '');
      if (phone.indexOf('00886') === 0) phone = '+886' + phone.slice(5);
      if (/^\+?\d{7,16}$/.test(phone)) return phone;
    }
    var compact = raw.replace(/[^0-9+]/g, '');
    if (/^09\d{18,}$/.test(compact)) return compact.slice(0, 10);
    if (/^\+?\d{7,16}$/.test(compact)) return compact;
    return '';
  }
  function getTemplateButtons(phone) {
    var cleanPhone = firstPhoneForTel(phone);
    return [
      { l: '加LINE好友', u: 'https://lin.ee/y7h8BUF', c: '#06C755' },
      { l: '行動電話', u: cleanPhone ? 'tel:' + cleanPhone : 'tel:XXXXXXXXXX', c: '#3b82f6' },
      { l: '店家地址', u: templateAddressUrl, c: '#1e293b' }
    ];
  }

  function $(selector) {
    return document.querySelector(selector);
  }

  function placeMyECardSectionAfterSocials() {
    var socials = document.getElementById('details-user-socials');
    var myCard = document.getElementById('details-my-ecard');
    if (!socials || !myCard || socials.nextElementSibling === myCard) return;
    socials.insertAdjacentElement('afterend', myCard);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', placeMyECardSectionAfterSocials);
  } else {
    placeMyECardSectionAfterSocials();
  }

  function $all(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function escapeHTML(value) {
    return String(value || '').replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function escapeAttr(value) {
    return escapeHTML(value).replace(/`/g, '&#96;');
  }

  function safeCssColor(value, fallback) {
    var raw = String(value || '').trim();
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw) ? raw : (fallback || '#06C755');
  }

  function normalizeMyCardActionUriForSave(value) {
    var raw = String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!raw) return { value: '', error: '請輸入按鈕連結。' };

    if (/^mailto:/i.test(raw)) {
      var mailtoEmail = raw.replace(/^mailto:/i, '').trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailtoEmail)) return { value: 'mailto:' + mailtoEmail };
      return { value: '', error: 'Email 格式錯誤，請確認 @ 與網域。' };
    }

    if (/^tel:/i.test(raw)) {
      var telPhone = firstPhoneForTel(raw.replace(/^tel:/i, ''));
      if (telPhone) return { value: 'tel:' + telPhone };
      return { value: '', error: '電話格式錯誤，請輸入 7 到 16 碼電話。' };
    }

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return { value: 'mailto:' + raw };
    }

    var compactPhone = firstPhoneForTel(raw);
    if (compactPhone) {
      return { value: 'tel:' + compactPhone };
    }

    if (/^(https?:\/\/|line:\/\/)/i.test(raw)) {
      if (/\s/.test(raw)) return { value: '', error: '網址不能包含空白。' };
      return { value: raw };
    }

    if (/^(line\.me|lin\.ee|lihi\d?\.me|maps\.app\.goo\.gl|www\.)/i.test(raw) ||
        /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(raw)) {
      if (/\s/.test(raw)) return { value: '', error: '網址不能包含空白。' };
      return { value: 'https://' + raw };
    }

    return { value: '', error: '連結格式錯誤，請輸入網址、電話或 Email。' };
  }

  function normalizeMyCardButtons(buttons) {
    if (!Array.isArray(buttons)) return [];
    return buttons
      .map(function(button) {
        if (!button || typeof button !== 'object') return null;
        return {
          l: String(button.l || button.label || button.text || button.title || '').trim(),
          u: String(button.u || button.url || button.uri || button.link || '').trim(),
          c: safeCssColor(button.c || button.color || button.backgroundColor || button.bgColor, '#06C755')
        };
      })
      .filter(function(button) { return !!(button && (button.l || button.u)); })
      .slice(0, 4);
  }

  function normalizeMyCardButtonsForSave(buttons) {
    return normalizeMyCardButtons(buttons).map(function(button, index) {
      if (!button.l) throw new Error('第 ' + (index + 1) + ' 顆按鈕缺少文字。');
      var normalized = normalizeMyCardActionUriForSave(button.u);
      if (normalized.error) throw new Error('第 ' + (index + 1) + ' 顆按鈕「' + button.l + '」' + normalized.error);
      return {
        l: button.l,
        u: normalized.value,
        c: safeCssColor(button.c, '#06C755')
      };
    });
  }

  function normalizeId(value) {
    return String(value || '').trim();
  }

  function getCurrentUserIdCandidates() {
    var values = [
      moduleAuth.getUserId && moduleAuth.getUserId(),
      getDirectLineUserId(),
      window.currentUserProfile && window.currentUserProfile.userId,
      window.currentUserProfile && window.currentUserProfile.lineId,
      window.currentUserProfile && window.currentUserProfile.sub,
      window.currentUser && window.currentUser.userId,
      window.currentUser && window.currentUser.lineId,
      window.currentUser && window.currentUser.line_id,
      window.currentUser && window.currentUser.pointLineId,
      window.currentUser && window.currentUser.point_line_id
    ];
    var seen = {};
    return values.map(normalizeId).filter(function(value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function getCardSourceType(card) {
    return normalizeId(
      card && (card.sourceType || card.source_type || card['名片來源'])
    );
  }

  function getCurrentOwnerUserId() {
  return getCurrentUserIdCandidates()[0] ||
    (window.currentUserProfile && window.currentUserProfile.userId) ||
    (window.currentUser && window.currentUser.userId) ||
    '';
}

  function isEditableOwnCard(card, version) {
    if (!card) return false;
    var userId = getCurrentOwnerUserId();
    if (!userId) return false;
    var sourceType = getCardSourceType(card);
    if (sourceType === 'private_import' || sourceType === 'referral_placeholder') return false;
    var lineId = normalizeId(card.lineId || card.line_id || card['LINE ID']);
    var ownerId = normalizeId(card.ownerUserId || card.owner_user_id || card.ownerId);
    var profileId = normalizeId(card.profileUserId || card.profile_user_id || card.profileId);
    var creatorId = normalizeId(card.creatorId || card.creator_id);
    var belongsToUser = lineId === userId || ownerId === userId || profileId === userId;
    if (!belongsToUser && !lineId && !ownerId && !profileId && sourceType === 'self_profile') {
      belongsToUser = creatorId === userId;
    }
    if (!belongsToUser) return false;
    var targetVersion = normalizeCardVersion(version || getTargetCardVersion());
    if (targetVersion === 'video') return sourceType === 'video_profile' || isCardVersion(card, 'video');
    if (sourceType === 'video_profile') return false;
    return sourceType === 'self_profile' || sourceType === '';
  }

  function parseMyCardSocials(raw) {
    var value = raw;
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch (e) {
        return [{ t: 'LINE', u: value }];
      }
    }
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      return Object.keys(value).map(function(key) {
        var item = value[key];
        if (item && typeof item === 'object') return Object.assign({ t: key }, item);
        return { t: key, u: item };
      });
    }
    return [];
  }

  function lineUrlFromMyCard(card) {
    var socials = parseMyCardSocials(readCardValue(card, ['socials', 'socials_json', '\u793e\u7fa4\u5e33\u865f']));
    for (var i = 0; i < socials.length; i++) {
      var item = socials[i] || {};
      var type = String(item.t || item.type || item.platform || item.name || '').toLowerCase();
      var url = String(item.u || item.url || item.uri || item.value || item.link || '').trim();
      if (!url) continue;
      if (type.indexOf('line') >= 0 || /^https?:\/\/(line\.me|lin\.ee)\//i.test(url) || /^line:\/\//i.test(url)) return url;
    }
    var website = String(readCardValue(card, ['website', 'companyUrl', '\u516c\u53f8\u7db2\u5740']) || '').trim();
    if (/^https?:\/\/(line\.me|lin\.ee)\//i.test(website) || /^line:\/\//i.test(website)) return website;
    return '';
  }

  function mapUrlFromMyCardAddress(address) {
    var value = String(address || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(value);
  }

  function autoMyCardButtons(card) {
    var buttons = [];
    var lineUrl = lineUrlFromMyCard(card);
    var phone = firstPhoneForTel(readCardValue(card, ['mobile', 'phone', 'officePhone', 'office_phone', '\u624b\u6a5f\u865f\u78bc', '\u624b\u6a5f']));
    var addressUrl = mapUrlFromMyCardAddress(readCardValue(card, ['address', '\u5730\u5740']));
    if (lineUrl) buttons.push({ l: '\u52a0LINE\u597d\u53cb', u: lineUrl, c: '#06C755' });
    if (phone) buttons.push({ l: '\u884c\u52d5\u96fb\u8a71', u: 'tel:' + phone, c: '#3B82F6' });
    if (addressUrl) buttons.push({ l: '\u5e97\u5bb6\u5730\u5740', u: addressUrl, c: '#1E293B' });
    return buttons.slice(0, 4);
  }

  function readCardValue(card, keys) {
    var source = card || {};
    for (var i = 0; i < keys.length; i++) {
      var value = source[keys[i]];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return '';
  }

  function fallbackMyCardDescription(card) {
    return readCardValue(card, [
      'desc',
      'description',
      'services',
      'service',
      'serviceItems',
      '服務項目',
      '服務內容',
      '名片服務說明',
      '自我介紹',
      '介紹',
      '職稱',
      '公司名稱'
    ]);
  }

  function show(el, visible) {
    if (el) el.classList.toggle('hidden', !visible);
  }

  function getLayout() {
    var checked = $('input[name="my-ecard-layout"]:checked');
    return checked ? checked.value : 'landscape';
  }

  function getActiveMyCardLayout() {
    if (wysiwygState && wysiwygState.cfg && wysiwygState.cfg.layoutStyle) {
      return normalizeWysiwygLayout(wysiwygState.cfg.layoutStyle);
    }
    return getLayout();
  }

  function layoutFromImageRatio(ratio, fallback) {
    var text = String(ratio || '').trim();
    var parts = text.match(/^(\d+(?:\.\d+)?)[/:](\d+(?:\.\d+)?)$/);
    var value = parts ? Number(parts[1]) / Number(parts[2]) : Number(text);
    if (text === '1:1' || text === '1/1' || (Number.isFinite(value) && Math.abs(value - 1) < 0.01)) return 'square';
    if (text === '400:600' || text === '400/600' || text === '2:3' || text === '2/3' || (Number.isFinite(value) && Math.abs(value - (400 / 600)) < 0.01)) return 'portrait';
    if (text === '20:13' || text === '20/13' || (Number.isFinite(value) && Math.abs(value - (20 / 13)) < 0.01)) return 'landscape';
    return fallback || getLayout();
  }

  function selectMyECardLayout(layout) {
    var target = $('input[name="my-ecard-layout"][value="' + layout + '"]');
    if (target) target.checked = true;
  }

  function syncCurrentImageInput() {
    var imgInput = $('#my-v1-img-url');
    if (!imgInput) return;
    var layout = getActiveMyCardLayout();
    myEcardImgs[layout] = imgInput.value || '';
  }

  function getVideoUrlInput() {
    var input = $('#my-v1-video-url');
    return input ? String(input.value || '').trim() : '';
  }

  function isVideoModeEnabled() {
    var toggle = $('#my-v1-video-enabled');
    return !!(toggle && toggle.checked);
  }
  function isMyCardVideoEditingMode() {
    if (myVideoModeSuppressed) return false;
    if (myVideoModeRequested) return true;
    try {
      var params = new URLSearchParams(window.location.search || '');
      return params.get('videoCard') === '1' || params.get('video') === '1' || params.get('cardVersion') === 'video' || params.get('version') === 'video';
    } catch (e) {
      return false;
    }
  }

  function syncMyCardVideoPanelVisibility() {
    var allowed = canUseMyCardVideoFlow();
    var editingVideo = isMyCardVideoEditingMode();
    var section = $('#my-video-card-settings');
    if (section) {
      section.classList.toggle('hidden', !editingVideo);
      section.classList.toggle('opacity-45', !allowed);
    }
    var toggle = $('#my-v1-video-enabled');
    var input = $('#my-v1-video-url');
    if (toggle) {
      toggle.disabled = !allowed || !editingVideo;
      if (!allowed) toggle.checked = false;
    }
    if (input) input.disabled = !allowed || !editingVideo;
  }

  function applyVideoConfigToFields(cfg) {
    var videoInput = $('#my-v1-video-url');
    var videoToggle = $('#my-v1-video-enabled');
    var videoUrl = cfg && cfg.videoUrl ? String(cfg.videoUrl) : '';
    if (videoInput) videoInput.value = videoUrl;
    if (videoToggle) videoToggle.checked = !!(cfg && cfg.cardType === 'video' && videoUrl);
  }

  function syncVideoFieldsFromConfig(cfg) {
    applyVideoConfigToFields(cfg);
    syncMyCardVideoPanelVisibility();
  }
  function syncVideoConfig(cfg) {
    cfg = cfg || {};
    var videoInput = $('#my-v1-video-url');
    var videoToggle = $('#my-v1-video-enabled');
    if (!videoInput && !videoToggle) {
      return cfg;
    }
    var editingVideo = isMyCardVideoEditingMode();
    var videoUrl = getVideoUrlInput() || (editingVideo && cfg.videoUrl ? String(cfg.videoUrl).trim() : '');
    if (editingVideo && videoUrl) {
      cfg.cardType = 'video';
      cfg.cardVersion = 'video';
      cfg.videoUrl = videoUrl;
    } else if (!videoToggle && cfg.cardType === 'video' && cfg.videoUrl) {
      return cfg;
    } else {
      if (cfg.cardType === 'video') cfg.cardType = 'v1';
      delete cfg.videoUrl;
    }
    return cfg;
  }

  function normalizeCardVersion(value) {
    var text = String(value || '').trim().toLowerCase();
    if (text === 'video' || text === 'video_card' || text === 'movie') return 'video';
    if (text === 'poster' || text === 'portrait' || text === 'giga' || text === '400:600') return 'poster';
    if (text === 'square' || text === '1:1') return 'square';
    return 'standard';
  }

  function layoutToCardVersion(layout) {
    if (layout === 'portrait') return 'poster';
    if (layout === 'square') return 'square';
    return 'standard';
  }

  function versionToLayout(version) {
    if (version === 'poster') return 'portrait';
    if (version === 'square') return 'square';
    return 'landscape';
  }

  function isMyCardVideoContext() {
    if (myVideoModeRequested) return true;
    try {
      var params = new URLSearchParams(window.location.search || '');
      if (params.get('videoCard') === '1' || params.get('video') === '1') return true;
      if (params.get('cardVersion') === 'video' || params.get('version') === 'video') return true;
    } catch (e) {}
    return !!getMyVideoDraftId();
  }

  function getTargetCardVersion() {
    return isMyCardVideoContext() ? 'video' : layoutToCardVersion(getActiveMyCardLayout());
  }

  function cardVersionFromCard(card) {
    if (!card) return '';
    var rowId = String(getCardRowId(card) || '').toUpperCase();
    var cfg = parseCardConfig(card);
    if (rowId.indexOf('CARD_VIDEO_') === 0) return 'video';
    if (rowId.indexOf('CARD_POSTER_') === 0) return 'poster';
    if (rowId.indexOf('CARD_SQUARE_') === 0) return 'square';
    if (rowId.indexOf('CARD_STD_') === 0) return 'standard';
    if (cfg.cardVersion || cfg.card_version) return normalizeCardVersion(cfg.cardVersion || cfg.card_version);
    if (cfg.videoCard === true || cfg.videoStorageKind === 'dedicated_video_card' || String(cfg.cardVariant || '').toLowerCase() === 'video_card') return 'video';
    return normalizeCardVersion(cfg.layoutStyle || cfg.layout || 'standard');
  }

  function isCardVersion(card, version) {
    return cardVersionFromCard(card) === normalizeCardVersion(version);
  }

  function findLoadedMyCardByVersion(version) {
    var target = normalizeCardVersion(version);
    var pools = [];
    if (Array.isArray(window.allCards)) pools = pools.concat(window.allCards);
    if (Array.isArray(window.myCards)) pools = pools.concat(window.myCards);
    if (window.currentUserCard) pools.push(window.currentUserCard);
    if (target === 'video') {
      for (var k = 0; k < pools.length; k += 1) {
        var videoRowId = String(getCardRowId(pools[k]) || '').toUpperCase();
        if (videoRowId.indexOf('CARD_VIDEO_') === 0 && isEditableOwnCard(pools[k], target)) return pools[k];
      }
    }
    for (var i = 0; i < pools.length; i += 1) {
      if (pools[i] && isCardVersion(pools[i], target) && isEditableOwnCard(pools[i], target)) return pools[i];
    }
    return null;
  }

  function findLoadedOwnedNonVideoCard() {
    var pools = [];
    if (Array.isArray(window.allCards)) pools = pools.concat(window.allCards);
    if (Array.isArray(window.myCards)) pools = pools.concat(window.myCards);
    if (window.currentUserCard) pools.push(window.currentUserCard);
    for (var i = 0; i < pools.length; i += 1) {
      var card = pools[i];
      if (card && cardVersionFromCard(card) !== 'video' && isEditableOwnCard(card, 'standard')) return card;
    }
    return null;
  }

  function addLoadedMyCard(card) {
    if (!card) return;
    var rowId = getCardRowId(card);
    if (Array.isArray(window.allCards) && rowId && !findLoadedMyCardByRowId(rowId)) window.allCards.unshift(card);
  }

  function setActiveMyCard(card) {
    if (!card) return null;
    currentCardData = card;
    window.currentUserCard = card;
    addLoadedMyCard(card);
    return card;
  }

  async function resolveMyCardVersion(version, createIfMissing) {
    if (typeof window.fetchAPI !== 'function') return null;
    var userIds = getCurrentUserIdCandidates();
    if (!userIds.length) return null;
    var normalizedVersion = normalizeCardVersion(version);
    for (var i = 0; i < userIds.length; i += 1) {
      var userId = userIds[i];
      var res = await window.fetchAPI('resolveMyCardVersion', {
        userId: userId,
        lineUserId: userId,
        version: normalizedVersion,
        layout: versionToLayout(normalizedVersion),
        createIfMissing: !!createIfMissing
      }, true);
      var data = res && (res.data || res);
      var card = data && data.card;
      if (card && !card.error) {
        addLoadedMyCard(card);
        return card;
      }
    }
    return null;
  }

  function parseCardConfig(card) {
    var source = card || {};
    var candidates = [
      source.customConfig,
      source.custom_config,
      source.ecardConfig,
      source['\u81ea\u8a02\u540d\u7247\u8a2d\u5b9a'],
      source['\u96fb\u5b50\u540d\u7247\u8a2d\u5b9a'],
      source['\u81ea\u8a02\u7248\u9762'],
      source['\u540d\u7247\u8a2d\u5b9a']
    ];
    for (var i = 0; i < candidates.length; i++) {
      var raw = candidates[i];
      if (!raw) continue;
      if (typeof raw === 'object') return raw;
      try {
        var parsed = JSON.parse(String(raw));
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (e) {}
    }
    var keys = Object.keys(source);
    for (var j = 0; j < keys.length; j++) {
      var value = source[keys[j]];
      if (typeof value !== 'string' || value.indexOf('{') < 0) continue;
      try {
        var inferred = JSON.parse(value);
        if (inferred && typeof inferred === 'object' && (
          Array.isArray(inferred.buttons) ||
          Array.isArray(inferred.footerBtns) ||
          inferred.imgUrl ||
          inferred.imgUrlPortrait ||
          inferred.layoutStyle ||
          inferred.cardType ||
          inferred.title ||
          inferred.desc
        )) {
          return inferred;
        }
      } catch (e) {}
    }
    return {};
  }

  function getMyCardRoleText() {
    var profile = (moduleAuth && typeof moduleAuth.getUserProfile === 'function' && moduleAuth.getUserProfile()) || window.currentUserProfile || {};
    var current = window.currentUser || {};
    var candidates = [
      window.userRole,
      window.currentUserRole,
      profile.role,
      profile.userRole,
      profile.accountRole,
      profile.memberRole,
      profile.type,
      profile.identity,
      profile.permission,
      profile.roleLabel,
      profile.roleName,
      profile.title,
      current.role,
      current.userRole,
      current.accountRole,
      current.memberRole,
      current.type,
      current.identity,
      current.permission,
      current.roleLabel,
      current.roleName,
      current.title,
      profile.isTenant ? 'tenant' : '',
      current.isTenant ? 'tenant' : '',
      profile.isStoreManager ? 'store manager' : '',
      current.isStoreManager ? 'store manager' : '',
      profile.isStoreOwner ? 'store owner' : '',
      current.isStoreOwner ? 'store owner' : ''
    ];
    var roleBadge = document.querySelector('.role-badge, #role-badge, [data-role-badge], #tenant-role-badge');
    if (roleBadge) candidates.push(roleBadge.textContent || '');
    var adminBadge = Array.prototype.slice.call(document.querySelectorAll('span, div, button'))
      .map(function(el) { return String(el.textContent || '').trim(); })
      .filter(function(text) { return text === 'ADMIN' || text === '總管' || text === '店長' || text === '租戶'; })
      .slice(0, 3)
      .join(' ');
    if (adminBadge) candidates.push(adminBadge);
    return candidates.filter(function(value) { return value !== null && value !== undefined && value !== ''; }).join(' ').toLowerCase();
  }

  function canUseMyCardVideoFlow() {
    var text = getMyCardRoleText();
    if (!text) return false;
    return /admin|administrator|superadmin|tenant|store|shop|manager|merchant|vendor|dealer|owner|總管|管理員|租戶|店長|店家|商家|經銷商/.test(text);
  }

  function updateMyCardVideoButtonState() {
    var allowed = canUseMyCardVideoFlow();
    var btn = $('#btn-open-my-video-card');
    if (btn) {
      btn.disabled = !allowed;
      btn.setAttribute('aria-disabled', allowed ? 'false' : 'true');
      btn.title = allowed ? '開啟影音名片' : '影音名片僅 admin 或租戶店長可使用';
      btn.className = allowed
        ? 'flex-1 py-2 rounded-lg bg-white text-blue-600 shadow-sm font-bold text-[12px] tracking-tight flex items-center justify-center gap-1 active:scale-95 transition-all'
        : 'flex-1 py-2 rounded-lg bg-slate-200 text-slate-400 font-bold text-[12px] tracking-tight flex items-center justify-center gap-1 cursor-not-allowed opacity-70 transition-all';
    }
    syncMyCardVideoPanelVisibility();
    if (!allowed && typeof updatePreview === 'function') updatePreview();
  }
  function init() {
    bindOnce(document, 'change', 'input[name="my-ecard-layout"]', handleLayoutChange);
    bindOnce(document, 'click', '#btn-add-v1-button', addV1Button);
    bindOnce(document, 'click', '#btn-share-my-card', function(evt) { shareMyCard(evt.currentTarget); });
    bindOnce(document, 'click', '#btn-open-my-wysiwyg-card', function(evt) { openMyCardWysiwyg(evt); });
    bindOnce(document, 'click', '#btn-show-qrcode', showMyQRCode);
    bindOnce(document, 'click', '#edit-card-image-btn', function() {
      var input = $('#edit-card-image-input');
      if (input) input.click();
    });
    bindOnce(document, 'change', '#edit-card-image-input', function(evt) {
      if (typeof window.openMyCardCropper === 'function') {
        window.openMyCardCropper(evt.currentTarget);
      } else if (window.showToast) {
        window.showToast('圖片裁切模組尚未載入', true);
      }
    });
    injectWysiwygButton();
    updateMyCardVideoButtonState();
    setTimeout(updateMyCardVideoButtonState, 300);
    setTimeout(updateMyCardVideoButtonState, 1000);
  }

  function bindOnce(root, eventName, selector, handler) {
    var key = 'mycardBound_' + eventName + '_' + selector;
    if (root[key]) return;
    root[key] = true;
    root.addEventListener(eventName, function(evt) {
      var target = evt.target && evt.target.closest(selector);
      if (target) handler.call(target, evt);
    });
  }

  async function resolveCurrentUserCard(force) {
    var targetVersion = getTargetCardVersion();
    var videoDraft = null;
    if (isWysiwygMyCardRequest() && getMyVideoDraftId()) {
      try {
        videoDraft = await loadMyVideoDraftForDirectEdit();
      } catch (e) {
        console.warn('[mycard] video draft preload failed:', e);
      }
    }

    if (typeof window.loadCardData === 'function') {
      try {
        await window.loadCardData({ render: false, force: !!force, initPanels: false });
      } catch (e) {
        console.warn('[mycard] loadCardData failed:', e);
      }
    }

    if (typeof window.syncUserCardMatch === 'function') {
      window.syncUserCardMatch();
    }

    var requestedRowId = getRequestedMyCardRowId();
    if (!requestedRowId && videoDraft && videoDraft.rowId) requestedRowId = String(videoDraft.rowId || '').trim();
    if (requestedRowId) {
      var requestedCard = findLoadedMyCardByRowId(requestedRowId);
      if (requestedCard) {
        if (isEditableOwnCard(requestedCard, targetVersion) && (!wysiwygState.cfg || isCardVersion(requestedCard, targetVersion))) {
          return setActiveMyCard(requestedCard);
        }
      }
      if (typeof window.fetchAPI === 'function') {
        try {
          var cardRes = await window.fetchAPI('getPublicCardById', { rowId: requestedRowId }, true);
          var card = cardRes && (cardRes.card || cardRes.data || cardRes);
          if (card && !card.error) {
            if (isEditableOwnCard(card, targetVersion) && (!wysiwygState.cfg || isCardVersion(card, targetVersion))) {
              return setActiveMyCard(card);
            }
          }
        } catch (e) {
          console.warn('[mycard] requested card fallback failed:', e);
        }
      }
      if (videoDraft && videoDraft.card) {
        var draftCardRowId = getCardRowId(videoDraft.card);
        if (!draftCardRowId || draftCardRowId === requestedRowId) {
          return setActiveMyCard(videoDraft.card);
        }
      }
    }

    var versionCard = await resolveMyCardVersion(targetVersion, false);
    if (isEditableOwnCard(versionCard, targetVersion)) {
      return setActiveMyCard(versionCard);
    }
    versionCard = findLoadedMyCardByVersion(targetVersion);
    if (isEditableOwnCard(versionCard, targetVersion)) {
      return setActiveMyCard(versionCard);
    }
    if (targetVersion !== 'video') {
      var legacyCard = findLoadedOwnedNonVideoCard();
      if (legacyCard) return setActiveMyCard(legacyCard);
    }
    return null;
  }

  async function load() {
    updateMyCardVideoButtonState();
    moduleCore.showLoading(true);

    var emptyState = $('#my-ecard-empty-state');
    var editState = $('#my-ecard-edit-state');

    myVideoModeRequested = isMyCardVideoContext();
    currentCardData = await resolveCurrentUserCard(true);
    if (cardVersionFromCard(currentCardData) !== 'video') myVideoModeRequested = false;

    if (!currentCardData) {
      show(emptyState, true);
      show(editState, false);
      moduleCore.showLoading(false);
      return;
    }

    show(emptyState, false);
    show(editState, true);

    var cfg = parseCardConfig(currentCardData);
    myEcardImgs = {
      landscape: cfg.imgUrl || currentCardData['名片圖檔'] || '',
      portrait: cfg.imgUrlPortrait || '',
      square: cfg.imgUrlSquare || ''
    };
    myEcardRatios = {
      landscape: cfg.imgRatioLandscape || '20:13',
      portrait: cfg.imgRatioPortrait || '400:600',
      square: cfg.imgRatioSquare || '1:1'
    };
    myEcardButtons = normalizeMyCardButtons(Array.isArray(cfg.buttons) ? cfg.buttons : cfg.footerBtns);
    myEcardStateLoaded = true;

    var layout = cfg.layoutStyle || 'landscape';
    var radio = $('input[name="my-ecard-layout"][value="' + layout + '"]');
    if (radio) radio.checked = true;

    var imgInput = $('#my-v1-img-url');
    if (imgInput) imgInput.value = myEcardImgs[getLayout()] || '';
    applyVideoConfigToFields(cfg);

    renderButtons();
    updatePreview();
    moduleCore.showLoading(false);
  }

  function hydrateMyECardStateFromCurrentCard() {
    if (!currentCardData) return;
    var cfg = parseCardConfig(currentCardData);
    myEcardImgs = {
      landscape: cfg.imgUrl || currentCardData['????'] || '',
      portrait: cfg.imgUrlPortrait || '',
      square: cfg.imgUrlSquare || ''
    };
    myEcardRatios = {
      landscape: cfg.imgRatioLandscape || '20:13',
      portrait: cfg.imgRatioPortrait || '400:600',
      square: cfg.imgRatioSquare || '1:1'
    };
    myEcardButtons = normalizeMyCardButtons(Array.isArray(cfg.buttons) ? cfg.buttons : cfg.footerBtns);
    myEcardStateLoaded = true;
    var layout = cfg.layoutStyle || 'landscape';
    var radio = $('input[name="my-ecard-layout"][value="' + layout + '"]');
    if (radio) radio.checked = true;
    var imgInput = $('#my-v1-img-url');
    if (imgInput) imgInput.value = myEcardImgs[getLayout()] || '';
    applyVideoConfigToFields(cfg);
  }

  async function handleLayoutChange() {
    myVideoModeRequested = false;
    myVideoModeSuppressed = true;
    syncCurrentImageInput();
    var version = layoutToCardVersion(getLayout());
    var card = await resolveMyCardVersion(version, false);
    if (!isEditableOwnCard(card, version)) card = findLoadedMyCardByVersion(version);
    if (isEditableOwnCard(card, version) && cardVersionFromCard(card) !== 'video') {
      setActiveMyCard(card);
      hydrateMyECardStateFromCurrentCard();
    }
    var imgInput = $('#my-v1-img-url');
    if (imgInput) imgInput.value = myEcardImgs[getLayout()] || '';
    updateMyCardVideoButtonState();
    updatePreview();
  }

  function focusMyECardSection() {
    var details = document.getElementById('details-my-ecard');
    if (details) {
      details.open = true;
      setTimeout(function() {
        details.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }

  function isQuicklyMyCardRequest() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return params.get('quickly') === '1' || params.get('mode') === 'my-card';
    } catch (e) {
      return false;
    }
  }

  function isWysiwygMyCardRequest() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return params.get('mode') === 'wysiwyg-card' || params.get('edit') === 'wysiwyg-card';
    } catch (e) {
      return false;
    }
  }

  function getRequestedMyCardRowId() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return String(params.get('rowId') || params.get('cardId') || '').trim();
    } catch (e) {
      return '';
    }
  }

  function findLoadedMyCardByRowId(rowId) {
    var target = String(rowId || '').trim();
    if (!target) return null;
    var pools = [];
    if (Array.isArray(window.allCards)) pools = pools.concat(window.allCards);
    if (Array.isArray(window.myCards)) pools = pools.concat(window.myCards);
    if (window.currentUserCard) pools.push(window.currentUserCard);
    for (var i = 0; i < pools.length; i += 1) {
      var card = pools[i];
      if (card && getCardRowId(card) === target) return card;
    }
    return null;
  }

  function injectWysiwygButton() {
    var editState = document.getElementById('my-ecard-edit-state');
    if (!editState || document.getElementById('btn-open-my-wysiwyg-card')) return;
    var preview = document.getElementById('my-ecard-preview-area');
    var button = document.createElement('button');
    button.id = 'btn-open-my-wysiwyg-card';
    button.type = 'button';
    button.className = 'w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-[13px] shadow-sm active:scale-95 transition-transform flex justify-center items-center gap-2';
    button.innerHTML = '<span class="material-symbols-outlined text-[18px]">touch_app</span> 所見即所得編輯';
    if (preview && preview.parentNode) preview.parentNode.insertBefore(button, preview);
    else editState.insertBefore(button, editState.firstChild);
  }

  function ensureQuicklyPanel() {
    var details = document.getElementById('details-my-ecard');
    if (!details) return null;
    var content = details.querySelector('div.p-5');
    if (!content) return null;
    var panel = document.getElementById('my-ecard-quickly-panel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'my-ecard-quickly-panel';
    panel.className = 'rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] text-blue-800 font-bold leading-relaxed';
    panel.innerHTML =
      '<div class="flex items-start gap-2">' +
        '<span class="material-symbols-outlined text-blue-600 text-[20px] shrink-0">bolt</span>' +
        '<div class="min-w-0">' +
          '<div class="text-blue-900 font-black">quickly 快速編輯</div>' +
          '<div class="mt-1">先補封面圖、介紹文字與按鈕連結；儲存後就沿用原本電子名片分享流程。</div>' +
        '</div>' +
      '</div>';
    content.insertBefore(panel, content.firstChild);
    return panel;
  }

  function openQuicklyMyCard() {
    if (typeof window.goPage === 'function') window.goPage('admin-settings');
    ensureQuicklyPanel();
    focusMyECardSection();
    if (typeof window.initMyECard === 'function') {
      window.initMyECard().then(function() {
        ensureQuicklyPanel();
        focusMyECardSection();
      }).catch(function(e) {
        console.warn('[openQuicklyMyCard] init failed:', e);
      });
    }
  }

  function scheduleQuicklyMyCardOpen() {
    if (!isQuicklyMyCardRequest() && !isWysiwygMyCardRequest()) return;
    if (isWysiwygMyCardRequest() && typeof window.goPage === 'function') {
      try {
        window.goPage('admin-settings');
      } catch (e) {
        console.warn('[mycard] direct wysiwyg goPage failed:', e);
      }
    }
    if (isWysiwygMyCardRequest()) {
      var modal = ensureWysiwygModal();
      modal.classList.remove('hidden');
      var preview = document.getElementById('my-card-wysiwyg-preview');
      if (preview) {
        preview.innerHTML = '<div class="min-h-[70vh] flex items-center justify-center text-center text-slate-300 font-black">名片編輯器載入中...</div>';
      }
    }
    var tries = 0;
    var timer = setInterval(function() {
      tries += 1;
      if (typeof window.goPage === 'function' && document.getElementById('details-my-ecard')) {
        clearInterval(timer);
        if (isWysiwygMyCardRequest()) {
          openMyCardWysiwyg();
        } else {
          openQuicklyMyCard();
        }
      } else if (tries > 30) {
        clearInterval(timer);
        if (isWysiwygMyCardRequest()) {
          openMyCardWysiwyg();
        }
      }
    }, 300);
  }

  function applyMyVideoCardMedia(videoUrl, thumbnailUrl) {
    var cleanVideoUrl = String(videoUrl || '').trim();
    var cleanThumbnailUrl = String(thumbnailUrl || '').trim();
    if (!cleanVideoUrl) {
      if (window.showToast) window.showToast('沒有可套用的影片網址', true);
      return false;
    }

    focusMyECardSection();

    var videoInput = $('#my-v1-video-url');
    var videoToggle = $('#my-v1-video-enabled');
    var imgInput = $('#my-v1-img-url');
    var layout = getLayout();

    if (videoInput) videoInput.value = cleanVideoUrl;
    if (videoToggle) videoToggle.checked = true;
    if (cleanThumbnailUrl) {
      myEcardImgs[layout] = cleanThumbnailUrl;
      if (imgInput) imgInput.value = cleanThumbnailUrl;
    }

    updatePreview();
    if (window.showToast) window.showToast('已套用到影音名片區，請按儲存');
    return true;
  }

  function getMyVideoDraftId() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return String(params.get('videoDraft') || params.get('myVideoDraft') || '').trim();
    } catch (e) {
      return '';
    }
  }

  function getDirectLineUserId() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return String(params.get('lineUserId') || params.get('pt_uid') || params.get('userId') || '').trim();
    } catch (e) {
      return '';
    }
  }

  async function loadMyVideoDraftForDirectEdit() {
    var jobId = getMyVideoDraftId();
    if (!jobId || myVideoDraftCache || typeof window.fetchAPI !== 'function') return myVideoDraftCache;
    var userId = moduleAuth.getUserId() || getDirectLineUserId() || (window.currentUserProfile && window.currentUserProfile.userId) || '';
    var res = await window.fetchAPI('getMyVideoDraft', {
      jobId: jobId,
      userId: userId,
      lineUserId: userId
    }, true);
    var draft = res && (res.data || res);
    if (!draft || res.error || res.success === false) throw new Error((res && res.error) || '影片草稿讀取失敗');
    myVideoDraftCache = draft;
    return draft;
  }

  async function applyMyVideoDraftToWysiwyg(cfg) {
    var jobId = getMyVideoDraftId();
    if (!jobId || myVideoDraftApplied || !cfg) return cfg;
    myVideoDraftApplied = true;
    if (typeof window.fetchAPI !== 'function') return cfg;
    try {
      var draft = await loadMyVideoDraftForDirectEdit();
      var videoUrl = String(draft.videoUrl || '').trim();
      var thumbnailUrl = String(draft.thumbnailUrl || '').trim();
      if (!videoUrl) throw new Error('影片草稿缺少影片網址');
      cfg.cardType = 'video';
      cfg.videoUrl = videoUrl;
      var layout = cfg.layoutStyle || getLayout();
      if (thumbnailUrl) {
        if (layout === 'portrait') cfg.imgUrlPortrait = thumbnailUrl;
        else if (layout === 'square') cfg.imgUrlSquare = thumbnailUrl;
        else cfg.imgUrl = thumbnailUrl;
        myEcardImgs[layout] = thumbnailUrl;
        var imgInput = $('#my-v1-img-url');
        if (imgInput) imgInput.value = thumbnailUrl;
      }
      applyVideoConfigToFields(cfg);
      if (window.showToast) window.showToast('已套入影片與縮圖，請編輯下半部內容後儲存。');
    } catch (e) {
      console.warn('[mycard] video draft apply failed:', e);
      if (window.showToast) window.showToast('影片草稿讀取失敗：' + (e.message || '請重新輸入我的影片'), true);
    }
    return cfg;
  }

  async function openMyCardDetail(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    moduleCore.showLoading(true);
    try {
      currentCardData = await resolveCurrentUserCard(true);
      if (!currentCardData) {
        if (window.showToast) window.showToast('找不到您的名片資料，請先重新整理或建立名片。', true);
        return;
      }
      if (typeof window.openCardDetail === 'function') {
        window.openCardDetail(currentCardData);
      }
    } finally {
      moduleCore.showLoading(false);
    }
  }

  async function openMyCardEntry(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    moduleCore.showLoading(true);
    try {
      currentCardData = await resolveCurrentUserCard(true);
      var details = document.getElementById('details-my-ecard');
      if (currentCardData) {
        if (details) details.open = false;
        if (typeof window.openCardDetail === 'function') {
          window.openCardDetail(currentCardData);
        }
        return;
      }
      if (details) {
        if (typeof window.goPage === 'function') window.goPage('admin-settings');
        focusMyECardSection();
        if (typeof window.initMyECard === 'function') {
          window.initMyECard().then(function() {
            focusMyECardSection();
          }).catch(function(e) {
            console.warn('[openMyCardEntry] init setup failed:', e);
          });
        }
      }
      if (window.showToast) window.showToast('請先建立專屬名片');
    } finally {
      moduleCore.showLoading(false);
    }
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

  async function ensureCurrentCardRowId() {
    var rowId = getCardRowId(currentCardData);
    if (rowId) return rowId;

    if (typeof window.loadCardData === 'function') {
      await window.loadCardData({ render: false, initPanels: false });
      if (typeof window.syncUserCardMatch === 'function') window.syncUserCardMatch();
      currentCardData = window.currentUserCard || currentCardData;
      rowId = getCardRowId(currentCardData);
    }

    return rowId;
  }

  function buildMyCardShareUrl(rowId) {
    var cardId = rowId || getCardRowId(currentCardData);
    var referrerId = moduleAuth.getUserId();
    var networkId = window.currentNetworkId || 'admin';
    if (window.buildPointLiffUrl) {
      return window.buildPointLiffUrl({
        shareCardId: cardId,
        ref: referrerId,
        net: networkId
      });
    }

    var liffId = moduleConfig.POINT_LIFF_ID || window.POINT_LIFF_ID || moduleConfig.LIFF_ID;
    var url = 'https://liff.line.me/' + encodeURIComponent(liffId) + '?shareCardId=' + encodeURIComponent(cardId || '');
    if (referrerId) url += '&ref=' + encodeURIComponent(referrerId);
    if (networkId) url += '&net=' + encodeURIComponent(networkId);
    return url;
  }

  function appendShareMode(url) {
    if (!url) return '';
    try {
      var parsed = new URL(url);
      parsed.searchParams.set('share', '1');
      return parsed.toString();
    } catch (e) {
      return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'share=1';
    }
  }

  function appendSendMode(url) {
    if (!url) return '';
    try {
      var parsed = new URL(url);
      parsed.searchParams.delete('share');
      parsed.searchParams.set('action', 'send');
      return parsed.toString();
    } catch (e) {
      return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'action=send';
    }
  }

  function setUrlParam(url, key, value) {
    if (!url) return '';
    try {
      var parsed = new URL(url);
      if (value === null || value === undefined || value === '') parsed.searchParams.delete(key);
      else parsed.searchParams.set(key, value);
      return parsed.toString();
    } catch (e) {
      var separator = url.indexOf('?') >= 0 ? '&' : '?';
      return url + separator + encodeURIComponent(key) + '=' + encodeURIComponent(value || '');
    }
  }

  function buildMyCardWebUrl(rowId) {
    var cardId = rowId || getCardRowId(currentCardData);
    var referrerId = moduleAuth.getUserId();
    var networkId = window.currentNetworkId || 'admin';
    var url = window.location.origin + window.location.pathname + '?webCardId=' + encodeURIComponent(cardId || '');
    if (referrerId) url += '&ref=' + encodeURIComponent(referrerId);
    if (networkId) url += '&net=' + encodeURIComponent(networkId);
    return url;
  }

  function buildMyCardCopyUrls(rowId) {
    var baseUrl = buildMyCardShareUrl(rowId);
    return {
      buttons: baseUrl,
      send: appendSendMode(baseUrl),
      share: appendShareMode(baseUrl),
      web: buildMyCardWebUrl(rowId)
    };
  }

  function copyTextToClipboard(text, fallbackLabel) {
    if (!text) {
      if (window.showToast) window.showToast('沒有可複製的網址', true);
      return Promise.resolve(false);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function() {
        if (window.showToast) window.showToast((fallbackLabel || '網址') + '已複製');
        return true;
      }).catch(function() {
        window.prompt('請複製' + (fallbackLabel || '網址'), text);
        return true;
      });
    }
    window.prompt('請複製' + (fallbackLabel || '網址'), text);
    return Promise.resolve(true);
  }

  async function copyMyCardUrlVariant(kind) {
    try {
      var rowId = await ensureCurrentCardRowId();
      if (!rowId) throw new Error('找不到名片編號，請先儲存名片');
      var urls = buildMyCardCopyUrls(rowId);
      var labels = {
        buttons: '三按鈕操作網址',
        send: '傳送操作網址',
        share: '分享操作網址',
        web: 'WEB版網址'
      };
      await copyTextToClipboard(urls[kind] || urls.buttons, labels[kind] || '名片網址');
    } catch (e) {
      if (window.showToast) window.showToast(e.message || '複製網址失敗', true);
    }
  }

  function routeFlexHeaderShareToPicker(flexMsg, shareUrl) {
    var actionUrl = appendShareMode(shareUrl);
    if (!flexMsg || !actionUrl) return flexMsg;
    try {
      if (flexMsg.header && Array.isArray(flexMsg.header.contents) && flexMsg.header.contents[0]) {
        var headerItem = flexMsg.header.contents[0];
        var action = headerItem.action || {};
        headerItem.action = headerItem.type === 'button'
          ? { type: 'uri', label: action.label || '分享名片', uri: actionUrl }
          : { type: 'uri', uri: actionUrl };
      }
    } catch (e) {
      console.warn('[routeFlexHeaderShareToPicker] failed:', e);
    }
    return flexMsg;
  }

  async function sharePlainCardLink(shareUrl, cardName) {
    var text = '這是我的數位名片';
    if (cardName) text += '：' + cardName;
    text += '\n' + shareUrl;

    try {
      if (typeof liff !== 'undefined' && liff && liff.isLoggedIn && liff.isLoggedIn() && liff.isApiAvailable && liff.isApiAvailable('shareTargetPicker')) {
        await liff.shareTargetPicker([{ type: 'text', text: text }]);
        if (window.showToast) window.showToast('✅ 已用連結發送名片');
        return true;
      }
    } catch (e) {
      console.warn('[sharePlainCardLink] LIFF text share failed:', e);
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        if (window.showToast) window.showToast('✅ 名片連結已複製');
        return true;
      }
    } catch (e) {
      console.warn('[sharePlainCardLink] Clipboard failed:', e);
    }

    window.prompt('請複製名片連結', shareUrl);
    return true;
  }

  function renderButtons() {
    var list = $('#my-v1-buttons-list');
    if (!list) return;

    if (!myEcardButtons.length) {
      list.innerHTML = '<p class="text-[12px] text-slate-400 pb-2">尚未設定任何按鈕</p>';
      return;
    }

    list.innerHTML = myEcardButtons.map(function(button, index) {
      var colorValue = /^#[0-9a-f]{6}$/i.test(button.c || '') ? button.c : '#06C755';
      return '<div class="border-b border-slate-100 pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0 space-y-3">' +
        '<div class="flex items-center justify-between gap-3">' +
          '<p class="text-[13px] font-black text-slate-700">按鈕 ' + (index + 1) + '</p>' +
          '<button type="button" onclick="window.removeMyV1Button(' + index + ')" class="w-11 h-11 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl shrink-0 transition-colors flex items-center justify-center" aria-label="刪除按鈕">' +
            '<span class="material-symbols-outlined text-[18px]">delete</span>' +
          '</button>' +
        '</div>' +
        '<label class="block">' +
          '<span class="block text-[13px] font-bold text-slate-600 mb-2">按鈕顏色</span>' +
          '<div class="grid grid-cols-[52px_minmax(0,1fr)] gap-3 items-center">' +
            '<input type="color" value="' + escapeHTML(colorValue) + '" class="w-[52px] h-[52px] p-1 cursor-pointer rounded-xl shrink-0 border border-blue-300 bg-white" onchange="window.updateMyV1Button(' + index + ', \'c\', this.value); var next=this.parentElement.querySelector(\'.button-color-text\'); if(next) next.value=this.value;">' +
            '<input type="text" value="' + escapeHTML(button.c || colorValue) + '" placeholder="#06C755" class="button-color-text min-w-0 w-full text-base font-mono bg-white border border-blue-300 outline-none focus:ring-2 focus:ring-blue-500 rounded-xl px-4 py-3" oninput="window.updateMyV1Button(' + index + ', \'c\', this.value)">' +
          '</div>' +
        '</label>' +
        '<label class="block">' +
          '<span class="block text-[13px] font-bold text-slate-600 mb-2">按鈕文字</span>' +
          '<input type="text" value="' + escapeHTML(button.l || '') + '" placeholder="例如：加入LINE好友" class="min-w-0 w-full text-base font-bold bg-white border border-blue-300 outline-none focus:ring-2 focus:ring-blue-500 rounded-xl px-4 py-3" oninput="window.updateMyV1Button(' + index + ', \'l\', this.value)">' +
        '</label>' +
        '<label class="block">' +
          '<span class="block text-[13px] font-bold text-slate-600 mb-2">網址 / 電話 / LINE 連結</span>' +
          '<input type="text" value="' + escapeHTML(button.u || '') + '" placeholder="https://... 或 tel:0927136847" class="min-w-0 w-full text-base font-mono bg-white border border-blue-300 outline-none focus:ring-2 focus:ring-blue-500 rounded-xl px-4 py-3" oninput="window.updateMyV1Button(' + index + ', \'u\', this.value)">' +
        '</label>' +
        '<div class="grid grid-cols-2 gap-2">' +
          '<button type="button" onclick="window.moveMyV1Button(' + index + ', -1)" ' + (index === 0 ? 'disabled' : '') + ' class="h-11 rounded-xl border border-blue-200 bg-white text-slate-600 flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 transition-transform"><span class="material-symbols-outlined text-[20px]">keyboard_arrow_up</span></button>' +
          '<button type="button" onclick="window.moveMyV1Button(' + index + ', 1)" ' + (index === myEcardButtons.length - 1 ? 'disabled' : '') + ' class="h-11 rounded-xl border border-blue-200 bg-white text-slate-600 flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 transition-transform"><span class="material-symbols-outlined text-[20px]">keyboard_arrow_down</span></button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function addV1Button() {
    myEcardButtons.push({ l: '新按鈕', u: '', c: '#06C755' });
    renderButtons();
    updatePreview();
  }

  function updateButton(index, field, value) {
    if (!myEcardButtons[index]) return;
    myEcardButtons[index][field] = value;
    updatePreview();
  }

  function removeButton(index) {
    myEcardButtons.splice(index, 1);
    renderButtons();
    updatePreview();
  }

  function moveButton(index, direction) {
    var nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= myEcardButtons.length) return;
    var moved = myEcardButtons.splice(index, 1)[0];
    myEcardButtons.splice(nextIndex, 0, moved);
    renderButtons();
    updatePreview();
  }

  function updatePreview() {
    var preview = $('#my-ecard-preview-area');
    if (!preview) return;

    show(preview, true);
    syncCurrentImageInput();
    var layout = getLayout();
    var profile = moduleAuth.getUserProfile() || {};
    var imgUrl = myEcardImgs[layout] || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
    var cfg = parseCardConfig(currentCardData);
    var name = cfg.title || (currentCardData && currentCardData['姓名']) || profile.displayName || '姓名';
    var desc = cfg.desc || fallbackMyCardDescription(currentCardData);
    var color = cfg.descColor || '#666666';
    var align = cfg.descAlign || 'center';
    var ratio = layout === 'portrait' ? (myEcardRatios.portrait || '400:600').replace(':', '/') : (layout === 'square' ? '1/1' : '20/13');
    var videoUrl = getVideoUrlInput() || cfg.videoUrl || '';
    var videoEnabled = isMyCardVideoEditingMode() && isVideoModeEnabled() && !!videoUrl;
    var mediaHtml = videoEnabled
      ? '<video class="w-full bg-slate-100 object-cover" style="aspect-ratio:' + ratio + ';" src="' + escapeHTML(videoUrl) + '" poster="' + escapeHTML(imgUrl) + '" controls playsinline muted></video>'
      : '<div class="w-full bg-slate-100 bg-cover bg-center" style="aspect-ratio:' + ratio + ';background-image:url(&quot;' + escapeHTML(imgUrl) + '&quot;);"></div>';
    var buttonHtml = myEcardButtons.map(function(button) {
      return '<div class="block py-3 rounded-xl text-white text-center text-[14px] font-black mb-2.5 shadow-sm" style="background:' + escapeHTML(button.c || '#06C755') + '">' + escapeHTML(button.l || '按鈕') + '</div>';
    }).join('');

    preview.innerHTML =
      '<div class="flex flex-col w-full">' +
      '<div class="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-100 bg-white">' +
        '<button type="button" data-social-like-button class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[12px] font-black text-slate-600 active:scale-95 transition-transform">' +
          '<span class="material-symbols-outlined text-[16px] text-amber-500">thumb_up</span>' +
          '<span data-social-like-count>0</span>' +
        '</button>' +
        '<div class="bg-[#EF4444] text-white text-[12px] font-bold px-4 py-1.5 rounded-full shadow-sm">分享</div>' +
      '</div>' +
      '<div class="relative w-full">' +
        mediaHtml +
      '</div>' +
      '<div class="p-6 text-center">' +
        '<div class="font-black text-[22px] text-slate-800 mb-2">' + escapeHTML(name) + '</div>' +
        '<div class="text-[14px] leading-relaxed" style="color:' + escapeHTML(color) + ';text-align:' + escapeHTML(align) + ';">' + escapeHTML(desc).replace(/\n/g, '<br>') + '</div>' +
      '</div>' +
      (buttonHtml ? '<div class="px-6">' + buttonHtml + '</div>' : '') +
    '</div>';
    initMyCardSocialLikeWidget();
  }

  function initMyCardSocialLikeWidget() {
    var card = window.currentUserCard || currentCardData || {};
    var cardId = String(card.rowId || card.cardRowId || card.id || card['rowId'] || '').trim();
    if (cardId && typeof window.initSocialLikeWidget === 'function') {
      setTimeout(function() {
        window.initSocialLikeWidget(cardId, window.currentNetworkId || 'admin');
      }, 0);
    }
  }

  function setMyUploadImage(url, ratio) {
    var wysiwygOpen = !!(wysiwygState && wysiwygState.cfg && !document.getElementById('my-card-wysiwyg-modal')?.classList.contains('hidden'));
    var layout = wysiwygOpen
      ? normalizeWysiwygLayout(wysiwygState.cfg.layoutStyle || getActiveMyCardLayout())
      : (ratio ? layoutFromImageRatio(ratio, getLayout()) : getLayout());
    var cleanUrl = String(url || '').trim();
    if (!cleanUrl) return;

    selectMyECardLayout(layout);
    myEcardImgs[layout] = cleanUrl;
    if (ratio) myEcardRatios[layout] = String(ratio).replace(':', '/');

    var imgInput = $('#my-v1-img-url');
    if (imgInput) imgInput.value = cleanUrl;
    if (wysiwygOpen) {
      wysiwygState.cfg.layoutStyle = layout;
      if (layout === 'portrait') wysiwygState.cfg.imgUrlPortrait = cleanUrl;
      else if (layout === 'square') wysiwygState.cfg.imgUrlSquare = cleanUrl;
      else wysiwygState.cfg.imgUrl = cleanUrl;
      if (layout === 'portrait') wysiwygState.cfg.imgRatioPortrait = String(ratio || '400:600').replace('/', ':');
      else if (layout === 'square') wysiwygState.cfg.imgRatioSquare = '1:1';
      else wysiwygState.cfg.imgRatioLandscape = '20:13';
      writeCurrentCardConfig(wysiwygState.cfg);
      renderMyCardWysiwyg();
      var wysiwygImageInput = document.getElementById('my-wysiwyg-image-input');
      if (wysiwygImageInput) wysiwygImageInput.value = cleanUrl;
      closeMyCardWysiwygEditor();
    }
    updatePreview();
  }

  function activeImageForCardVersion(cfg, version) {
    cfg = cfg || {};
    if (version === 'poster') return cfg.imgUrlPortrait || cfg.imgUrl || '';
    if (version === 'square') return cfg.imgUrlSquare || cfg.imgUrl || '';
    return cfg.imgUrl || cfg.imgUrlPortrait || cfg.imgUrlSquare || '';
  }

  async function saveMyECardConfig(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    var btn = $('#btn-save-my-ecard');
    if (btn && btn.dataset.myEcardSaving === '1') return;
    var originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.dataset.myEcardSaving = '1';
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> \u5132\u5b58\u4e2d...';
      btn.disabled = true;
    }

    try {
      currentCardData = await resolveCurrentUserCard(true) || currentCardData;
      if (!currentCardData) throw new Error('\u627e\u4e0d\u5230\u53ef\u5132\u5b58\u7684\u5c08\u5c6c\u540d\u7247');

      syncCurrentImageInput();
      var layout = getActiveMyCardLayout();
      selectMyECardLayout(layout);
      var targetVersion = isMyCardVideoContext() ? 'video' : layoutToCardVersion(layout);
      if (!isCardVersion(currentCardData, targetVersion)) {
        var versionCard = await resolveMyCardVersion(targetVersion, true);
        if (versionCard) {
          setActiveMyCard(versionCard);
        }
      }
      var cfg = parseCardConfig(currentCardData);
      cfg.cardVersion = targetVersion;
      cfg.layoutStyle = layout;
      cfg.imgUrl = myEcardImgs.landscape;
      cfg.imgUrlPortrait = myEcardImgs.portrait;
      cfg.imgUrlSquare = myEcardImgs.square;
      cfg.imgRatioLandscape = '20:13';
      cfg.imgRatioPortrait = (myEcardRatios.portrait || '400:600').replace('/', ':');
      cfg.imgRatioSquare = '1:1';
      cfg.buttons = normalizeMyCardButtonsForSave(myEcardButtons);
      myEcardButtons = cfg.buttons.slice();
      syncVideoConfig(cfg);
      if (targetVersion !== 'video') {
        if (cfg.cardType === 'video') cfg.cardType = 'v1';
        delete cfg.cardVariant;
        delete cfg.videoCard;
        delete cfg.videoStorageKind;
        delete cfg.videoUrl;
        delete cfg.videoPosterUrl;
      }

      var rowId = await ensureCurrentCardRowId();
      if (!rowId) throw new Error('找不到名片編號，請重新整理後再試');
      var activeImageUrl = activeImageForCardVersion(cfg, targetVersion);
      var res = await window.fetchAPI('updateCard', {
        rowId: rowId,
        userId: (window.currentUserProfile && window.currentUserProfile.userId) || '',
        data: {
          '名片圖檔': activeImageUrl,
          '自訂名片設定': JSON.stringify(cfg)
        }
      }, true);
      if (res && !res.error) {
        var rawCfg = JSON.stringify(cfg);
        currentCardData['名片圖檔'] = activeImageUrl;
        currentCardData['自訂名片設定'] = rawCfg;
        currentCardData.customConfig = rawCfg;
        currentCardData.custom_config = rawCfg;
        setActiveMyCard(currentCardData);
        if (window.showToast) window.showToast('✅ 專屬名片設定已儲存');
      } else {
        throw new Error((res && res.error) || '儲存失敗');
      }
    } catch (e) {
      if (window.showToast) window.showToast('⚠️ 儲存失敗: ' + e.message, true);
    } finally {
      if (btn) {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        delete btn.dataset.myEcardSaving;
      }
    }
  }

  function buildCurrentShareConfig() {
    var cfg = parseCardConfig(currentCardData);
    if (!myEcardStateLoaded && Array.isArray(cfg.buttons)) {
      myEcardButtons = normalizeMyCardButtons(cfg.buttons);
    }
    var liveLayout = { value: getActiveMyCardLayout() };
    syncCurrentImageInput();
    if (liveLayout) {
      var liveVersion = isMyCardVideoContext() ? 'video' : layoutToCardVersion(liveLayout.value || cfg.layoutStyle || 'landscape');
      cfg.cardVersion = liveVersion;
      cfg.layoutStyle = liveLayout.value || cfg.layoutStyle || 'landscape';
      cfg.imgUrl = myEcardImgs.landscape || cfg.imgUrl || '';
      cfg.imgUrlPortrait = myEcardImgs.portrait || cfg.imgUrlPortrait || '';
      cfg.imgUrlSquare = myEcardImgs.square || cfg.imgUrlSquare || '';
      cfg.imgRatioLandscape = '20:13';
      cfg.imgRatioPortrait = (myEcardRatios.portrait || '400:600').replace('/', ':');
      cfg.imgRatioSquare = '1:1';
      cfg.buttons = normalizeMyCardButtonsForSave(myEcardButtons);
      myEcardButtons = cfg.buttons.slice();
      syncVideoConfig(cfg);
      if (liveVersion !== 'video') {
        if (cfg.cardType === 'video') cfg.cardType = 'v1';
        delete cfg.cardVariant;
        delete cfg.videoCard;
        delete cfg.videoStorageKind;
        delete cfg.videoUrl;
        delete cfg.videoPosterUrl;
      }
    }
    return cfg;
  }

  function writeCurrentCardConfig(cfg) {
    if (!currentCardData || !cfg) return;
    var raw = JSON.stringify(cfg);
    currentCardData.customConfig = raw;
    currentCardData.custom_config = raw;
    currentCardData['自訂名片設定'] = raw;
    window.currentUserCard = currentCardData;
  }

  function getWysiwygConfig() {
    var cfg = buildCurrentShareConfig();
    var profile = moduleAuth.getUserProfile() || {};
    var name = readCardValue(currentCardData, ['name', '姓名', 'displayName']) || profile.displayName || '';
    var desc = fallbackMyCardDescription(currentCardData) || '';
    cfg.title = String(cfg.title || name || '').trim();
    cfg.desc = String(cfg.desc || desc || '').trim();
    cfg.layoutStyle = cfg.layoutStyle || getLayout();
    cfg.imgUrl = cfg.imgUrl || myEcardImgs.landscape || '';
    cfg.imgUrlPortrait = cfg.imgUrlPortrait || myEcardImgs.portrait || '';
    cfg.imgUrlSquare = cfg.imgUrlSquare || myEcardImgs.square || '';
    cfg.imgRatioLandscape = cfg.imgRatioLandscape || '20:13';
    cfg.imgRatioPortrait = cfg.imgRatioPortrait || '400:600';
    cfg.imgRatioSquare = cfg.imgRatioSquare || '1:1';
    cfg.descAlign = cfg.descAlign || 'center';
    cfg.descColor = cfg.descColor || '#666666';
    cfg.buttons = Array.isArray(myEcardButtons) && myEcardButtons.length
      ? normalizeMyCardButtons(myEcardButtons)
      : normalizeMyCardButtons(Array.isArray(cfg.buttons) ? cfg.buttons : cfg.footerBtns);
    if (!cfg.buttons.length) cfg.buttons = autoMyCardButtons(currentCardData);
    myEcardButtons = cfg.buttons.slice();
    return cfg;
  }

  function ensureWysiwygModal() {
    var modal = document.getElementById('my-card-wysiwyg-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'my-card-wysiwyg-modal';
    modal.className = 'hidden fixed inset-0 z-[2100] bg-slate-950/80 backdrop-blur-sm w-full max-w-md mx-auto left-0 right-0';
    modal.innerHTML =
      '<div class="h-full flex flex-col bg-[#eef2f7]">' +
        '<div class="shrink-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">' +
          '<div>' +
            '<div class="text-[12px] font-black text-blue-600">WYSIWYG</div>' +
            '<h3 class="text-lg font-black text-slate-900">所見即所得編輯</h3>' +
          '</div>' +
          '<button type="button" onclick="window.closeMyCardWysiwyg()" class="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center active:scale-95"><span class="material-symbols-outlined">close</span></button>' +
        '</div>' +
        '<div class="flex-1 overflow-y-auto p-4">' +
          '<div id="my-card-wysiwyg-preview"></div>' +
        '</div>' +
        '<div id="my-card-wysiwyg-editor" class="hidden shrink-0 bg-white border-t border-slate-200 p-4"></div>' +
        '<div class="shrink-0 bg-white border-t border-slate-200 p-4 grid grid-cols-2 gap-3">' +
          '<button type="button" onclick="window.closeMyCardWysiwyg()" class="py-3 rounded-2xl bg-slate-100 text-slate-700 font-black active:scale-95">取消</button>' +
          '<button type="button" onclick="window.saveMyCardWysiwyg(this)" class="py-3 rounded-2xl bg-blue-600 text-white font-black active:scale-95">儲存</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    return modal;
  }

  function currentWysiwygImage(cfg) {
    if (currentWysiwygVersion(cfg) === 'video') return cfg.imgUrl || cfg.thumbnailUrl || cfg.videoPosterUrl || myEcardImgs.landscape || '';
    var layout = normalizeWysiwygLayout(cfg.layoutStyle || getLayout());
    if (layout === 'portrait') return cfg.imgUrlPortrait || cfg.imgUrl || myEcardImgs.portrait || '';
    if (layout === 'square') return cfg.imgUrlSquare || cfg.imgUrl || myEcardImgs.square || '';
    return cfg.imgUrl || myEcardImgs.landscape || '';
  }

  function normalizeWysiwygLayout(layout) {
    if (layout === 'portrait' || layout === 'giga') return 'portrait';
    if (layout === 'square' || layout === '1:1') return 'square';
    return 'landscape';
  }

  function wysiwygLayoutRatio(layout, cfg) {
    layout = normalizeWysiwygLayout(layout);
    if (layout === 'portrait') return String((cfg && cfg.imgRatioPortrait) || '400:600').replace(':', '/');
    if (layout === 'square') return '1/1';
    return String((cfg && cfg.imgRatioLandscape) || '20:13').replace(':', '/');
  }

  function currentWysiwygVersion(cfg) {
    if (isMyCardVideoEditingMode() && cfg && (cfg.cardType === 'video' || cfg.videoCard === true || cfg.cardVersion === 'video' || cfg.videoStorageKind === 'dedicated_video_card')) return 'video';
    return layoutToCardVersion(normalizeWysiwygLayout((cfg && cfg.layoutStyle) || getLayout()));
  }

  function renderWysiwygLayoutSelector(cfg, inModal) {
    var current = currentWysiwygVersion(cfg);
    var options = [
      { value: 'landscape', label: '標準' },
      { value: 'portrait', label: '滿版' },
      { value: 'square', label: '正方' },
      { value: 'video', label: '影音' }
    ];
    var wrapClass = inModal ? 'space-y-2' : 'max-w-[390px] mx-auto mb-3';
    var labelClass = inModal ? 'text-[13px] font-black text-slate-600' : 'text-[12px] font-black text-slate-300 mb-2';
    var shellClass = inModal ? 'grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1' : 'grid grid-cols-4 gap-1 rounded-2xl bg-white/10 p-1';
    var html = '<div class="' + wrapClass + '">' +
      '<div class="' + labelClass + '">名片版型</div>' +
      '<div class="' + shellClass + '">';
    html += options.map(function(option) {
      var optionVersion = option.value === 'video' ? 'video' : layoutToCardVersion(option.value);
      var active = optionVersion === current;
      var cls = active
        ? 'bg-white text-blue-600 shadow-sm'
        : (inModal ? 'text-slate-500' : 'text-slate-300');
      return '<button type="button" onclick="window.setMyCardWysiwygLayout(\'' + option.value + '\')" class="min-h-[42px] rounded-xl px-2 text-[12px] font-black active:scale-95 ' + cls + '">' + option.label + '</button>';
    }).join('');
    return html + '</div></div>';
  }
  async function setMyCardWysiwygLayout(layout) {
    var cfg = wysiwygState.cfg;
    if (!cfg) return;
    if (layout === 'video') {
      if (!canUseMyCardVideoFlow()) {
        if (window.showToast) window.showToast('影音名片僅 admin 或租戶店長可使用。', true);
        return;
      }
      myVideoModeRequested = true;
      myVideoModeSuppressed = false;
      var videoCard = await resolveMyCardVersion('video', false) || findLoadedMyCardByVersion('video');
      if (!isEditableOwnCard(videoCard, 'video')) {
        if (window.showToast) window.showToast('尚未找到影音名片', true);
        return;
      }
      setActiveMyCard(videoCard);
      hydrateMyECardStateFromCurrentCard();
      cfg = parseCardConfig(videoCard);
      wysiwygState.cfg = cfg;
      syncVideoFieldsFromConfig(cfg);
      var videoImgInput = $('#my-v1-img-url');
      if (videoImgInput) videoImgInput.value = currentWysiwygImage(cfg);
      updateMyCardVideoButtonState();
      updatePreview();
      renderMyCardWysiwyg();
      if (wysiwygState.field === 'image') renderWysiwygEditor('image', wysiwygState.buttonIndex);
      return;
    }
    myVideoModeRequested = false;
    myVideoModeSuppressed = true;
    layout = normalizeWysiwygLayout(layout);
    var version = layoutToCardVersion(layout);
    var card = await resolveMyCardVersion(version, false);
    if (!isEditableOwnCard(card, version)) card = findLoadedMyCardByVersion(version);
    if (isEditableOwnCard(card, version) && cardVersionFromCard(card) !== 'video') {
      setActiveMyCard(card);
      hydrateMyECardStateFromCurrentCard();
      cfg = parseCardConfig(card);
      wysiwygState.cfg = cfg;
    }
    cfg.layoutStyle = layout;
    cfg.cardVersion = version;
    if (cfg.cardType === 'video') cfg.cardType = 'v1';
    delete cfg.cardVariant;
    delete cfg.videoCard;
    delete cfg.videoStorageKind;
    delete cfg.videoUrl;
    delete cfg.videoPosterUrl;
    if (layout === 'portrait') cfg.imgRatioPortrait = cfg.imgRatioPortrait || '400:600';
    if (layout === 'square') cfg.imgRatioSquare = cfg.imgRatioSquare || '1:1';
    if (layout === 'landscape') cfg.imgRatioLandscape = cfg.imgRatioLandscape || '20:13';
    selectMyECardLayout(layout);
    var imgInput = $('#my-v1-img-url');
    if (imgInput) imgInput.value = currentWysiwygImage(cfg);
    writeCurrentCardConfig(cfg);
    updateMyCardVideoButtonState();
    updatePreview();
    renderMyCardWysiwyg();
    if (wysiwygState.field === 'image') renderWysiwygEditor('image', wysiwygState.buttonIndex);
  }
  function renderMyCardWysiwyg() {
    var preview = document.getElementById('my-card-wysiwyg-preview');
    if (!preview || !wysiwygState.cfg) return;
    var cfg = wysiwygState.cfg;
    var layout = normalizeWysiwygLayout(cfg.layoutStyle || getLayout());
    var ratio = wysiwygLayoutRatio(layout, cfg);
    var imgUrl = currentWysiwygImage(cfg);
    var buttons = Array.isArray(cfg.buttons) ? cfg.buttons : [];
    var displayDesc = cfg.desc || fallbackMyCardDescription(currentCardData);
    var isVideoHero = cfg.cardType === 'video' && cfg.videoUrl;
    var heroMediaHtml = isVideoHero
      ? '<video class="w-full object-cover bg-slate-100" style="aspect-ratio:' + escapeAttr(ratio) + ';" src="' + escapeAttr(cfg.videoUrl) + '" poster="' + escapeAttr(imgUrl || 'https://placehold.co/800x520?text=Cover') + '" controls playsinline muted></video>'
      : '<img src="' + escapeAttr(imgUrl || 'https://placehold.co/800x520?text=Cover') + '" class="w-full object-cover bg-slate-100" style="aspect-ratio:' + escapeAttr(ratio) + ';" onerror="this.src=\'https://placehold.co/800x520?text=Cover\';">';
    var buttonHtml = buttons.map(function(button, index) {
      return '<button type="button" onclick="window.editMyCardWysiwygButton(' + index + ')" class="w-full py-3 rounded-xl text-white text-center text-[15px] font-black mb-2.5 shadow-sm active:scale-95" style="background:' + escapeAttr(safeCssColor(button.c, '#06C755')) + '">' + escapeHTML(button.l || '按鈕') + '</button>';
    }).join('');
    preview.innerHTML =
      '<div class="bg-white rounded-[18px] overflow-hidden shadow-xl border border-slate-200">' +
        '<div class="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-100 bg-white">' +
          '<button type="button" data-social-like-button class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[12px] font-black text-slate-600 active:scale-95 transition-transform">' +
            '<span class="material-symbols-outlined text-[16px] text-amber-500">thumb_up</span>' +
            '<span data-social-like-count>0</span>' +
          '</button>' +
          '<div class="bg-red-500 text-white text-[12px] font-black px-4 py-1.5 rounded-full shadow-sm">分享</div>' +
        '</div>' +
        '<div class="relative bg-slate-100">' +
          '<button type="button" onclick="window.editMyCardWysiwygField(\'image\')" class="block w-full text-left active:opacity-80">' +
            '<div class="w-full bg-slate-100 bg-cover bg-center" style="aspect-ratio:' + escapeAttr(ratio) + ';background-image:url(&quot;' + escapeAttr(imgUrl) + '&quot;);"></div>' +
          '</button>' +
        '</div>' +
        '<div class="px-6 py-5 text-center">' +
          '<button type="button" onclick="window.editMyCardWysiwygField(\'title\')" class="block w-full text-[24px] font-black text-slate-900 active:bg-blue-50 rounded-xl px-2 py-1">' + escapeHTML(cfg.title || '姓名') + '</button>' +
          '<button type="button" onclick="window.editMyCardWysiwygField(\'desc\')" class="block w-full mt-2 text-[15px] leading-relaxed whitespace-pre-wrap rounded-xl px-2 py-2 active:bg-blue-50" style="color:' + escapeAttr(safeCssColor(cfg.descColor, '#666666')) + ';text-align:' + escapeAttr(cfg.descAlign || 'center') + ';">' + escapeHTML(cfg.desc || '點此輸入服務說明').replace(/\n/g, '<br>') + '</button>' +
        '</div>' +
        '<div class="px-5 pb-5">' + buttonHtml +
          '<button type="button" onclick="window.addMyCardWysiwygButton()" class="w-full py-3 rounded-xl border border-dashed border-blue-200 text-blue-600 text-[14px] font-black active:scale-95">+ 新增按鈕</button>' +
        '</div>' +
      '</div>' +
      '<p class="text-center text-[12px] text-slate-500 font-bold mt-3">點圖片、文字或按鈕即可編輯。尚未按儲存前不會寫入資料庫。</p>';
    preview.insertAdjacentHTML('beforeend', renderMyCardCopyUrlPanelHtml());
    initMyCardSocialLikeWidget();
  }

  function renderMyCardCopyUrlPanelHtml() {
    return '<div class="max-w-[390px] mx-auto mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left">' +
      '<div class="text-[12px] font-black text-slate-200 mb-2">網址取用資訊</div>' +
      '<div class="grid grid-cols-2 gap-2">' +
        '<button type="button" onclick="window.copyMyCardUrlVariant(\'buttons\')" class="rounded-xl bg-white/10 px-3 py-2.5 text-[12px] font-black text-white active:scale-95">三按鈕操作</button>' +
        '<button type="button" onclick="window.copyMyCardUrlVariant(\'send\')" class="rounded-xl bg-white/10 px-3 py-2.5 text-[12px] font-black text-white active:scale-95">傳送操作</button>' +
        '<button type="button" onclick="window.copyMyCardUrlVariant(\'share\')" class="rounded-xl bg-white/10 px-3 py-2.5 text-[12px] font-black text-white active:scale-95">分享操作</button>' +
        '<button type="button" onclick="window.copyMyCardUrlVariant(\'web\')" class="rounded-xl bg-white/10 px-3 py-2.5 text-[12px] font-black text-white active:scale-95">WEB版網址</button>' +
      '</div>' +
    '</div>';
  }

  function renderWysiwygEditor(type, index) {
    var panel = document.getElementById('my-card-wysiwyg-editor');
    if (!panel || !wysiwygState.cfg) return;
    var cfg = wysiwygState.cfg;
    wysiwygState.field = type;
    wysiwygState.buttonIndex = typeof index === 'number' ? index : -1;
    panel.classList.remove('hidden');
    if (type === 'image') {
      panel.innerHTML =
        '<div class="space-y-3">' +
          '<label class="block text-[13px] font-black text-slate-600">主圖網址</label>' +
          '<input id="my-wysiwyg-image-input" value="' + escapeAttr(currentWysiwygImage(cfg)) + '" class="w-full rounded-xl border border-blue-300 px-4 py-3 font-mono text-[13px] outline-none focus:ring-2 focus:ring-blue-500">' +
          '<div class="grid grid-cols-2 gap-2">' +
            '<button type="button" onclick="document.getElementById(\'file-my-v1-img\')?.click()" class="py-3 rounded-xl bg-slate-900 text-white font-black active:scale-95">上傳裁切</button>' +
            '<button type="button" onclick="window.applyMyCardWysiwygEditor()" class="py-3 rounded-xl bg-blue-600 text-white font-black active:scale-95">套用</button>' +
          '</div>' +
        '</div>';
    } else if (type === 'title') {
      panel.innerHTML =
        '<div class="space-y-3">' +
          '<label class="block text-[13px] font-black text-slate-600">姓名 / 標題</label>' +
          '<input id="my-wysiwyg-title-input" value="' + escapeAttr(cfg.title || '') + '" class="w-full rounded-xl border border-blue-300 px-4 py-3 text-[16px] font-black outline-none focus:ring-2 focus:ring-blue-500">' +
          '<button type="button" onclick="window.applyMyCardWysiwygEditor()" class="w-full py-3 rounded-xl bg-blue-600 text-white font-black active:scale-95">套用</button>' +
        '</div>';
    } else if (type === 'desc') {
      panel.innerHTML =
        '<div class="space-y-3">' +
          '<label class="block text-[13px] font-black text-slate-600">服務說明</label>' +
          '<textarea id="my-wysiwyg-desc-input" rows="5" class="w-full rounded-xl border border-blue-300 px-4 py-3 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-blue-500">' + escapeHTML(cfg.desc || '') + '</textarea>' +
          '<button type="button" onclick="window.applyMyCardWysiwygEditor()" class="w-full py-3 rounded-xl bg-blue-600 text-white font-black active:scale-95">套用</button>' +
        '</div>';
    } else if (type === 'button') {
      var btn = cfg.buttons[index] || { l: '', u: '', c: '#06C755' };
      panel.innerHTML =
        '<div class="space-y-3">' +
          '<div class="flex items-center justify-between gap-3">' +
            '<label class="text-[13px] font-black text-slate-600">按鈕 ' + (index + 1) + '</label>' +
            '<button type="button" onclick="window.removeMyCardWysiwygButton()" class="px-3 py-2 rounded-xl bg-red-50 text-red-500 text-[12px] font-black">刪除</button>' +
          '</div>' +
          '<input id="my-wysiwyg-button-label" value="' + escapeAttr(btn.l || '') + '" placeholder="按鈕文字" class="w-full rounded-xl border border-blue-300 px-4 py-3 font-black outline-none focus:ring-2 focus:ring-blue-500">' +
          '<input id="my-wysiwyg-button-url" value="' + escapeAttr(btn.u || '') + '" placeholder="網址 / tel: / line://" class="w-full rounded-xl border border-blue-300 px-4 py-3 font-mono text-[13px] outline-none focus:ring-2 focus:ring-blue-500">' +
          '<div class="grid grid-cols-[56px_minmax(0,1fr)] gap-3">' +
            '<input id="my-wysiwyg-button-color" type="color" value="' + escapeAttr(safeCssColor(btn.c, '#06C755')) + '" class="w-14 h-12 rounded-xl border border-blue-300 bg-white p-1">' +
            '<button type="button" onclick="window.applyMyCardWysiwygEditor()" class="py-3 rounded-xl bg-blue-600 text-white font-black active:scale-95">套用</button>' +
          '</div>' +
        '</div>';
    }
  }

  async function openMyCardVideoFlow(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    updateMyCardVideoButtonState();
    if (!canUseMyCardVideoFlow()) {
      if (window.showToast) window.showToast('影音名片僅 admin 或租戶店長可使用。', true);
      return;
    }
    myVideoModeRequested = true;
    myVideoModeSuppressed = false;
    try {
      var videoCard = await resolveMyCardVersion('video', true) || findLoadedMyCardByVersion('video');
      if (videoCard) {
        setActiveMyCard(videoCard);
        myEcardStateLoaded = false;
      }
    } catch (e) {
      console.warn('[mycard] create video card failed:', e);
    }
    return openMyCardWysiwyg(evt);
  }
  async function openMyCardWysiwyg(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    var directWysiwyg = isWysiwygMyCardRequest();
    if (directWysiwyg) ensureWysiwygModal().classList.remove('hidden');
    else moduleCore.showLoading(true);
    try {
      currentCardData = await resolveCurrentUserCard(true);
      if (!currentCardData) {
        var preview = document.getElementById('my-card-wysiwyg-preview');
        if (directWysiwyg && preview) {
          preview.innerHTML = '<div class="min-h-[60vh] flex items-center justify-center p-6 text-center text-red-300 font-black leading-relaxed">找不到可編輯的專屬名片。請先回首頁確認名片存在，再重新點開編輯連結。</div>';
        }
        if (window.showToast) window.showToast('找不到可編輯的專屬名片，請先建立名片', true);
        return;
      }
      if (!myEcardStateLoaded) hydrateMyECardStateFromCurrentCard();
      wysiwygState.cfg = await applyMyVideoDraftToWysiwyg(getWysiwygConfig());
      writeCurrentCardConfig(wysiwygState.cfg);
      ensureWysiwygModal().classList.remove('hidden');
      renderMyCardWysiwyg();
    } catch (e) {
      console.warn('[mycard] open wysiwyg failed:', e);
      var errorPreview = document.getElementById('my-card-wysiwyg-preview');
      if (directWysiwyg && errorPreview) {
        var reason = escapeHTML(e && e.message ? e.message : '未知錯誤');
        errorPreview.innerHTML = '<div class="min-h-[60vh] flex items-center justify-center p-6 text-center text-red-300 font-black leading-relaxed">名片編輯器載入失敗<br><span class="text-[13px] text-red-200">' + reason + '</span></div>';
      }
      if (window.showToast) window.showToast('名片編輯器載入失敗', true);
    } finally {
      if (!directWysiwyg) moduleCore.showLoading(false);
    }
  }

  function closeMyCardWysiwyg() {
    var modal = document.getElementById('my-card-wysiwyg-modal');
    if (modal) modal.classList.add('hidden');
  }

  function editMyCardWysiwygField(field) {
    renderWysiwygEditor(field);
  }

  function editMyCardWysiwygButton(index) {
    renderWysiwygEditor('button', index);
  }

  function setMyCardWysiwygAlign(align) {
    if (!wysiwygState.cfg) return;
    var descInput = document.getElementById('my-wysiwyg-desc-input');
    if (descInput) wysiwygState.cfg.desc = String(descInput.value || '').trim();
    var colorInput = document.getElementById('my-wysiwyg-desc-color');
    if (colorInput) wysiwygState.cfg.descColor = safeCssColor(colorInput.value, '#666666');
    wysiwygState.cfg.descAlign = align === 'left' ? 'start' : (align === 'right' ? 'end' : (align || 'center'));
    renderWysiwygEditor('desc');
  }

  function applyMyCardWysiwygEditor() {
    var cfg = wysiwygState.cfg;
    if (!cfg) return;
    if (wysiwygState.field === 'image') {
      var imgInput = document.getElementById('my-wysiwyg-image-input');
      var url = imgInput ? String(imgInput.value || '').trim() : '';
      var layout = cfg.layoutStyle || getLayout();
      if (layout === 'portrait') cfg.imgUrlPortrait = url;
      else if (layout === 'square') cfg.imgUrlSquare = url;
      else cfg.imgUrl = url;
      myEcardImgs[layout] = url;
      var oldInput = document.getElementById('my-v1-img-url');
      if (oldInput) oldInput.value = url;
    } else if (wysiwygState.field === 'title') {
      var titleInput = document.getElementById('my-wysiwyg-title-input');
      cfg.title = titleInput ? String(titleInput.value || '').trim() : cfg.title;
    } else if (wysiwygState.field === 'desc') {
      var descInput = document.getElementById('my-wysiwyg-desc-input');
      cfg.desc = descInput ? String(descInput.value || '').trim() : cfg.desc;
      var colorInput = document.getElementById('my-wysiwyg-desc-color');
      if (colorInput) cfg.descColor = safeCssColor(colorInput.value, '#666666');
    } else if (wysiwygState.field === 'button') {
      var index = wysiwygState.buttonIndex;
      if (!Array.isArray(cfg.buttons)) cfg.buttons = [];
      if (index >= 0 && cfg.buttons[index]) {
        cfg.buttons[index] = {
          l: (document.getElementById('my-wysiwyg-button-label') || {}).value || '',
          u: (document.getElementById('my-wysiwyg-button-url') || {}).value || '',
          c: (document.getElementById('my-wysiwyg-button-color') || {}).value || '#06C755'
        };
        myEcardButtons = cfg.buttons.slice();
        renderButtons();
      }
    }
    writeCurrentCardConfig(cfg);
    updatePreview();
    renderMyCardWysiwyg();
  }

  function addMyCardWysiwygButton() {
    var cfg = wysiwygState.cfg;
    if (!cfg) return;
    if (!Array.isArray(cfg.buttons)) cfg.buttons = [];
    if (cfg.buttons.length >= 4) {
      if (window.showToast) window.showToast('最多 4 個按鈕', true);
      return;
    }
    cfg.buttons.push({ l: '新增按鈕', u: '', c: '#06C755' });
    myEcardButtons = cfg.buttons.slice();
    writeCurrentCardConfig(cfg);
    renderButtons();
    updatePreview();
    renderMyCardWysiwyg();
    renderWysiwygEditor('button', cfg.buttons.length - 1);
  }

  function removeMyCardWysiwygButton() {
    var cfg = wysiwygState.cfg;
    var index = wysiwygState.buttonIndex;
    if (!cfg || !Array.isArray(cfg.buttons) || index < 0) return;
    cfg.buttons.splice(index, 1);
    myEcardButtons = cfg.buttons.slice();
    writeCurrentCardConfig(cfg);
    renderButtons();
    updatePreview();
    renderMyCardWysiwyg();
    var panel = document.getElementById('my-card-wysiwyg-editor');
    if (panel) panel.classList.add('hidden');
  }

  function ensureWysiwygStyleV2() {
    if (document.getElementById('my-card-wysiwyg-style-v2')) return;
    var style = document.createElement('style');
    style.id = 'my-card-wysiwyg-style-v2';
    style.textContent = [
      '.my-wysiwyg-target{position:relative;border:2px dashed rgba(0,185,0,.55);border-radius:12px;cursor:pointer;transition:background-color .18s,border-color .18s,box-shadow .18s;}',
      '.my-wysiwyg-target:hover,.my-wysiwyg-target:active{background-color:rgba(0,185,0,.10);border-color:#00b900;box-shadow:0 0 0 4px rgba(0,185,0,.08);}',
      '.my-wysiwyg-edit-icon{position:absolute;top:-10px;right:-10px;width:28px;height:28px;border-radius:999px;background:#00b900;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(15,23,42,.22);pointer-events:none;z-index:5;}',
      '.my-wysiwyg-edit-icon .material-symbols-outlined{font-size:17px;line-height:1;}',
      '.my-wysiwyg-card-shell{max-width:390px;margin:0 auto 24px;border-radius:18px;overflow:hidden;background:#fff;border:1px solid #dbe3ef;box-shadow:0 18px 40px rgba(15,23,42,.20);}',
      '.my-wysiwyg-modal-pop{animation:myWysiwygPop .18s ease-out;}',
      '@keyframes myWysiwygPop{from{transform:scale(.96);opacity:.2}to{transform:scale(1);opacity:1}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureWysiwygModal() {
    var modal = document.getElementById('my-card-wysiwyg-modal');
    if (modal) {
      ensureWysiwygStyleV2();
      return modal;
    }
    ensureWysiwygStyleV2();
    modal = document.createElement('div');
    modal.id = 'my-card-wysiwyg-modal';
    modal.className = 'hidden fixed inset-0 z-[2100] bg-[#1A1B1E] text-white';
    modal.innerHTML =
      '<div class="h-full flex flex-col">' +
        '<div class="shrink-0 bg-[#1A1B1E]/95 border-b border-white/10 px-4 py-3 flex items-center justify-between">' +
          '<div>' +
            '<div class="text-[12px] font-black text-green-400">WYSIWYG</div>' +
            '<h3 class="text-lg font-black text-white">所見即所得編輯</h3>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<button type="button" onclick="window.saveMyCardWysiwyg(this)" class="h-10 px-4 rounded-full bg-[#06C755] text-white text-[14px] font-black active:scale-95">儲存</button>' +
            '<button type="button" onclick="window.closeMyCardWysiwyg()" class="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95"><span class="material-symbols-outlined">close</span></button>' +
          '</div>' +
        '</div>' +
        '<div class="flex-1 overflow-y-auto px-3 py-5 bg-[#1A1B1E]">' +
          '<div id="my-card-wysiwyg-preview"></div>' +
        '</div>' +
        '<div class="shrink-0 border-t border-white/10 bg-[#1A1B1E] px-4 py-3 text-center text-[12px] font-bold text-slate-300">點圖片、文字或按鈕即可直接修改。</div>' +
      '</div>' +
      '<div id="my-card-wysiwyg-editor-modal" class="hidden fixed inset-0 z-[2110] bg-black/75 backdrop-blur-sm px-4 py-6 items-center justify-center">' +
        '<div class="my-wysiwyg-modal-pop w-full max-w-sm rounded-[24px] bg-white text-slate-900 p-5 shadow-2xl">' +
          '<div class="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-4">' +
            '<h3 id="my-card-wysiwyg-editor-title" class="text-lg font-black"></h3>' +
            '<button type="button" onclick="window.closeMyCardWysiwygEditor()" class="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center active:scale-95"><span class="material-symbols-outlined">close</span></button>' +
          '</div>' +
          '<div id="my-card-wysiwyg-editor-body"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    return modal;
  }

  function renderMyCardWysiwyg() {
    var preview = document.getElementById('my-card-wysiwyg-preview');
    if (!preview || !wysiwygState.cfg) return;
    var cfg = wysiwygState.cfg;
    var activeVersion = currentWysiwygVersion(cfg);
    var layout = activeVersion === 'video' ? 'landscape' : (cfg.layoutStyle || getLayout());
    var ratio = layout === 'portrait' ? (cfg.imgRatioPortrait || '400/600') : (layout === 'square' ? '1/1' : '20/13');
    ratio = String(ratio).replace(':', '/');
    var imgUrl = currentWysiwygImage(cfg);
    var buttons = Array.isArray(cfg.buttons) ? cfg.buttons : [];
    var displayDesc = cfg.desc || fallbackMyCardDescription(currentCardData);
    var isVideoHero = cfg.cardType === 'video' && cfg.videoUrl;
    var fallbackImg = 'https://placehold.co/800x520?text=Cover';
    var heroMediaHtml = isVideoHero
      ? '<video class="w-full object-cover bg-slate-100" style="aspect-ratio:' + escapeAttr(ratio) + ';" src="' + escapeAttr(cfg.videoUrl) + '" poster="' + escapeAttr(imgUrl || fallbackImg) + '" controls playsinline muted></video>'
      : '<img src="' + escapeAttr(imgUrl || fallbackImg) + '" class="w-full object-cover bg-slate-100" style="aspect-ratio:' + escapeAttr(ratio) + ';" onerror="this.src=\'' + fallbackImg + '\';">';
    var buttonHtml = buttons.map(function(button, index) {
      return '<button type="button" onclick="window.editMyCardWysiwygButton(' + index + ')" class="my-wysiwyg-target w-full py-3 rounded-xl text-white text-center text-[15px] font-black mb-2.5 shadow-sm active:scale-95" style="background:' + escapeAttr(safeCssColor(button.c, '#06C755')) + '">' +
        '<span class="my-wysiwyg-edit-icon"><span class="material-symbols-outlined">link</span></span>' +
        escapeHTML(button.l || '按鈕') +
      '</button>';
    }).join('');
    preview.innerHTML =
      renderWysiwygLayoutSelector(cfg, false) +
      '<div class="my-wysiwyg-card-shell">' +
        '<div class="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-100 bg-white">' +
          '<button type="button" data-social-like-button class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[12px] font-black text-slate-600 active:scale-95 transition-transform">' +
            '<span class="material-symbols-outlined text-[16px] text-amber-500">thumb_up</span>' +
            '<span data-social-like-count>0</span>' +
          '</button>' +
          '<div class="bg-red-500 text-white text-[12px] font-black px-4 py-1.5 rounded-full shadow-sm">分享</div>' +
        '</div>' +
        '<div class="relative bg-slate-100">' +
          '<button type="button" onclick="window.editMyCardWysiwygField(\'image\')" class="my-wysiwyg-target block w-full text-left active:opacity-90 rounded-none border-0">' +
            '<span class="my-wysiwyg-edit-icon" style="top:12px;right:12px;"><span class="material-symbols-outlined">image</span></span>' +
            heroMediaHtml +
          '</button>' +
        '</div>' +
        '<div class="px-6 py-5 text-center">' +
          '<button type="button" onclick="window.editMyCardWysiwygField(\'title\')" class="my-wysiwyg-target block w-full text-[24px] font-black text-slate-900 rounded-xl px-2 py-1">' +
            '<span class="my-wysiwyg-edit-icon"><span class="material-symbols-outlined">edit</span></span>' +
            escapeHTML(cfg.title || '姓名') +
          '</button>' +
          '<button type="button" onclick="window.editMyCardWysiwygField(\'desc\')" class="my-wysiwyg-target block w-full mt-3 text-[15px] leading-relaxed whitespace-pre-wrap rounded-xl px-3 py-3" style="color:' + escapeAttr(safeCssColor(cfg.descColor, '#666666')) + ';text-align:' + escapeAttr(cfg.descAlign || 'center') + ';">' +
            '<span class="my-wysiwyg-edit-icon"><span class="material-symbols-outlined">notes</span></span>' +
            escapeHTML(displayDesc || '點這裡編輯名片說明').replace(/\n/g, '<br>') +
          '</button>' +
        '</div>' +
        '<div class="px-5 pb-5">' + buttonHtml +
          '<button type="button" onclick="window.addMyCardWysiwygButton()" class="w-full py-3 rounded-xl border border-dashed border-blue-300 bg-blue-50 text-blue-600 text-[14px] font-black active:scale-95">+ 新增按鈕</button>' +
        '</div>' +
      '</div>' +
      '<p class="text-center text-[12px] text-slate-300 font-bold mt-3">這是編輯畫布。儲存後才會更新名片設定。</p>';
    preview.insertAdjacentHTML('beforeend', renderMyCardCopyUrlPanelHtml());
    initMyCardSocialLikeWidget();
  }

  function renderWysiwygEditor(type, index) {
    var modal = document.getElementById('my-card-wysiwyg-editor-modal');
    var title = document.getElementById('my-card-wysiwyg-editor-title');
    var panel = document.getElementById('my-card-wysiwyg-editor-body');
    if (!modal || !panel || !wysiwygState.cfg) return;
    var cfg = wysiwygState.cfg;
    wysiwygState.field = type;
    wysiwygState.buttonIndex = typeof index === 'number' ? index : -1;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (type === 'image') {
      if (title) title.textContent = '更換封面圖片';
      panel.innerHTML =
        '<div class="space-y-3">' +
          renderWysiwygLayoutSelector(cfg, true) +
          '<label class="block text-[13px] font-black text-slate-600">圖片網址</label>' +
          '<input id="my-wysiwyg-image-input" value="' + escapeAttr(currentWysiwygImage(cfg)) + '" class="w-full rounded-xl border border-blue-300 px-4 py-3 font-mono text-[13px] outline-none focus:ring-2 focus:ring-blue-500">' +
          '<div class="grid grid-cols-2 gap-2">' +
            '<button type="button" onclick="window.openMyCardWysiwygImageUpload()" class="py-3 rounded-xl bg-slate-900 text-white font-black active:scale-95">上傳裁切</button>' +
            '<button type="button" onclick="window.applyMyCardWysiwygEditor()" class="py-3 rounded-xl bg-blue-600 text-white font-black active:scale-95">套用</button>' +
          '</div>' +
        '</div>';
    } else if (type === 'title') {
      if (title) title.textContent = '修改姓名/標題';
      panel.innerHTML =
        '<div class="space-y-3">' +
          '<label class="block text-[13px] font-black text-slate-600">姓名或標題</label>' +
          '<input id="my-wysiwyg-title-input" value="' + escapeAttr(cfg.title || '') + '" class="w-full rounded-xl border border-blue-300 px-4 py-3 text-[16px] font-black outline-none focus:ring-2 focus:ring-blue-500">' +
          '<button type="button" onclick="window.applyMyCardWysiwygEditor()" class="w-full py-3 rounded-xl bg-blue-600 text-white font-black active:scale-95">套用</button>' +
        '</div>';
    } else if (type === 'desc') {
      if (title) title.textContent = '修改名片說明';
      var descAlign = cfg.descAlign || 'center';
      panel.innerHTML =
        '<div class="space-y-3">' +
          '<label class="block text-[13px] font-black text-slate-600">說明文字</label>' +
          '<textarea id="my-wysiwyg-desc-input" rows="5" class="w-full rounded-xl border border-blue-300 px-4 py-3 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-blue-500">' + escapeHTML(cfg.desc || '') + '</textarea>' +
          '<div class="grid grid-cols-3 gap-2">' +
            '<button type="button" onclick="window.setMyCardWysiwygAlign(\'left\')" class="my-wysiwyg-align-btn py-2.5 rounded-xl border font-black ' + (descAlign === 'left' || descAlign === 'start' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600') + '">靠左</button>' +
            '<button type="button" onclick="window.setMyCardWysiwygAlign(\'center\')" class="my-wysiwyg-align-btn py-2.5 rounded-xl border font-black ' + (descAlign === 'center' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600') + '">置中</button>' +
            '<button type="button" onclick="window.setMyCardWysiwygAlign(\'right\')" class="my-wysiwyg-align-btn py-2.5 rounded-xl border font-black ' + (descAlign === 'right' || descAlign === 'end' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600') + '">靠右</button>' +
          '</div>' +
          '<div class="grid grid-cols-[56px_minmax(0,1fr)] gap-3 items-center">' +
            '<input id="my-wysiwyg-desc-color" type="color" value="' + escapeAttr(safeCssColor(cfg.descColor, '#666666')) + '" class="w-14 h-12 rounded-xl border border-blue-300 bg-white p-1">' +
            '<button type="button" onclick="window.applyMyCardWysiwygEditor()" class="py-3 rounded-xl bg-blue-600 text-white font-black active:scale-95">套用</button>' +
          '</div>' +
        '</div>';
    } else if (type === 'button') {
      var btn = cfg.buttons[index] || { l: '', u: '', c: '#06C755' };
      if (title) title.textContent = '設定按鈕 ' + (index + 1);
      panel.innerHTML =
        '<div class="space-y-3">' +
          '<div class="flex items-center justify-between gap-3">' +
            '<label class="text-[13px] font-black text-slate-600">按鈕 ' + (index + 1) + '</label>' +
            '<button type="button" onclick="window.removeMyCardWysiwygButton()" class="px-3 py-2 rounded-xl bg-red-50 text-red-500 text-[12px] font-black">刪除</button>' +
          '</div>' +
          '<input id="my-wysiwyg-button-label" value="' + escapeAttr(btn.l || '') + '" placeholder="按鈕文字" class="w-full rounded-xl border border-blue-300 px-4 py-3 font-black outline-none focus:ring-2 focus:ring-blue-500">' +
          '<input id="my-wysiwyg-button-url" value="' + escapeAttr(btn.u || '') + '" placeholder="網址 / tel: / line://" class="w-full rounded-xl border border-blue-300 px-4 py-3 font-mono text-[13px] outline-none focus:ring-2 focus:ring-blue-500">' +
          '<div class="grid grid-cols-[56px_minmax(0,1fr)] gap-3">' +
            '<input id="my-wysiwyg-button-color" type="color" value="' + escapeAttr(safeCssColor(btn.c, '#06C755')) + '" class="w-14 h-12 rounded-xl border border-blue-300 bg-white p-1">' +
            '<button type="button" onclick="window.applyMyCardWysiwygEditor()" class="py-3 rounded-xl bg-blue-600 text-white font-black active:scale-95">套用</button>' +
          '</div>' +
        '</div>';
    }
  }

  function closeMyCardWysiwyg() {
    var modal = document.getElementById('my-card-wysiwyg-modal');
    if (modal) modal.classList.add('hidden');
    closeMyCardWysiwygEditor();
    if (isWysiwygMyCardRequest() && typeof liff !== 'undefined' && liff && typeof liff.closeWindow === 'function') {
      try { liff.closeWindow(); } catch (e) {}
    }
  }

  function closeMyCardWysiwygEditor() {
    var modal = document.getElementById('my-card-wysiwyg-editor-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function editMyCardWysiwygField(field) {
    renderWysiwygEditor(field);
  }

  function editMyCardWysiwygButton(index) {
    renderWysiwygEditor('button', index);
  }

  function applyMyCardWysiwygEditor() {
    var cfg = wysiwygState.cfg;
    if (!cfg) return;
    if (wysiwygState.field === 'image') {
      var imgInput = document.getElementById('my-wysiwyg-image-input');
      var url = imgInput ? String(imgInput.value || '').trim() : '';
      var layout = cfg.layoutStyle || getLayout();
      if (layout === 'portrait') cfg.imgUrlPortrait = url;
      else if (layout === 'square') cfg.imgUrlSquare = url;
      else cfg.imgUrl = url;
      myEcardImgs[layout] = url;
      var oldInput = document.getElementById('my-v1-img-url');
      if (oldInput) oldInput.value = url;
    } else if (wysiwygState.field === 'title') {
      var titleInput = document.getElementById('my-wysiwyg-title-input');
      cfg.title = titleInput ? String(titleInput.value || '').trim() : cfg.title;
    } else if (wysiwygState.field === 'desc') {
      var descInput = document.getElementById('my-wysiwyg-desc-input');
      cfg.desc = descInput ? String(descInput.value || '').trim() : cfg.desc;
      var colorInput = document.getElementById('my-wysiwyg-desc-color');
      if (colorInput) cfg.descColor = safeCssColor(colorInput.value, '#666666');
    } else if (wysiwygState.field === 'button') {
      var buttonIndex = wysiwygState.buttonIndex;
      if (!Array.isArray(cfg.buttons)) cfg.buttons = [];
      if (buttonIndex >= 0 && cfg.buttons[buttonIndex]) {
        cfg.buttons[buttonIndex] = {
          l: (document.getElementById('my-wysiwyg-button-label') || {}).value || '',
          u: (document.getElementById('my-wysiwyg-button-url') || {}).value || '',
          c: (document.getElementById('my-wysiwyg-button-color') || {}).value || '#06C755'
        };
        myEcardButtons = normalizeMyCardButtons(cfg.buttons);
        renderButtons();
      }
    }
    writeCurrentCardConfig(cfg);
    updatePreview();
    renderMyCardWysiwyg();
    closeMyCardWysiwygEditor();
  }

  function addMyCardWysiwygButton() {
    var cfg = wysiwygState.cfg;
    if (!cfg) return;
    if (!Array.isArray(cfg.buttons)) cfg.buttons = [];
    if (cfg.buttons.length >= 4) {
      if (window.showToast) window.showToast('最多 4 個按鈕', true);
      return;
    }
    cfg.buttons.push({ l: '新增按鈕', u: '', c: '#06C755' });
    myEcardButtons = normalizeMyCardButtons(cfg.buttons);
    writeCurrentCardConfig(cfg);
    renderButtons();
    updatePreview();
    renderMyCardWysiwyg();
    renderWysiwygEditor('button', cfg.buttons.length - 1);
  }

  function removeMyCardWysiwygButton() {
    var cfg = wysiwygState.cfg;
    var index = wysiwygState.buttonIndex;
    if (!cfg || !Array.isArray(cfg.buttons) || index < 0) return;
    cfg.buttons.splice(index, 1);
    myEcardButtons = normalizeMyCardButtons(cfg.buttons);
    writeCurrentCardConfig(cfg);
    renderButtons();
    updatePreview();
    renderMyCardWysiwyg();
    closeMyCardWysiwygEditor();
  }

  function getMyCardUploadAspectRatio() {
    var layout = normalizeWysiwygLayout((wysiwygState && wysiwygState.cfg && wysiwygState.cfg.layoutStyle) || getLayout());
    if (layout === 'portrait') return 400 / 600;
    if (layout === 'square') return 1;
    return 20 / 13;
  }

  function openMyCardWysiwygImageUpload() {
    var input = document.getElementById('file-my-v1-img');
    if (!input) {
      if (window.showToast) window.showToast('找不到圖片上傳元件', true);
      return;
    }
    closeMyCardWysiwygEditor();
    input.click();
  }

  async function saveMyCardWysiwyg(btn) {
    if (wysiwygState.cfg) {
      writeCurrentCardConfig(wysiwygState.cfg);
      myEcardButtons = normalizeMyCardButtons(wysiwygState.cfg.buttons);
      renderButtons();
      updatePreview();
    }
    var originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '儲存中...';
    }
    try {
      await saveMyECardConfig();
      closeMyCardWysiwyg();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }

  async function generateCardFromProfile(evt) {
    var btn = evt && (evt.currentTarget || evt.target);
    var originalHtml = btn ? btn.innerHTML : '';
    var profile = moduleAuth.getUserProfile() || {};
    var user = window.currentUser || {};
    var userId = moduleAuth.getUserId();
    var name = user.name || profile.displayName || '';
    var phone = user.phone || user.mobile || '';
    var company = user.companyName || user.company || '';
    var title = user.industry || user.title || '';

    if (!userId) {
      if (window.showToast) window.showToast('尚未取得 LINE 登入資料，請重新整理後再試', true);
      return;
    }
    if (!name) {
      if (window.showToast) window.showToast('找不到姓名，請先完成個人資料設定', true);
      return;
    }
    if (!phone) {
      if (window.showToast) window.showToast('找不到手機號碼，請先在個人資料設定填寫手機', true);
      focusMyECardSection();
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 生成中...';
    }

    try {
      var coverUrl = templateCoverUrl;
      var cfg = {
        layoutStyle: 'landscape',
        imgUrl: coverUrl,
        imgUrlPortrait: '',
        imgUrlSquare: '',
        imgRatioLandscape: '20:13',
        imgRatioPortrait: '400:600',
        imgRatioSquare: '1:1',
        desc: introTemplate,
        descAlign: 'start',
        descColor: '#666666',
        buttons: getTemplateButtons(phone),
        isPrivate: true,
        templateDraft: true,
        templateVersion: 'rental-intro-1'
      };
      var cardPayload = {
        '姓名': name,
        '手機號碼': phone,
        '公司名稱': company,
        '職稱': title,
        '服務項目': introTemplate,
        '名片圖檔': coverUrl,
        'LINE ID': userId,
        '歸屬網': window.currentNetworkId || user.networkId || 'admin',
        '建檔者ID': userId,
        '建檔人/備註': '使用 LINE 資料生成',
        '自訂名片設定': JSON.stringify(cfg),
        userId: userId,
        creatorId: userId
      };

      var saveRes = await window.fetchAPI('saveCard', cardPayload, true);
      if (!saveRes || saveRes.error) throw new Error((saveRes && saveRes.error) || '建立名片失敗');

      cardPayload.rowId = saveRes.rowId || saveRes.id || saveRes.RowID || '';
      window.currentUserCard = cardPayload;
      currentCardData = cardPayload;
      myEcardStateLoaded = true;
      if (Array.isArray(window.allCards)) window.allCards.unshift(cardPayload);
      if (window.showToast) window.showToast('✅ 已使用 LINE 資料建立專屬名片');
      if (typeof window.loadAllData === 'function') await window.loadAllData({ render: false });
      await load();
      await openMyCardDetail();
      if (typeof window.renderCardList === 'function') window.renderCardList(window.allCards || []);
    } catch (e) {
      if (window.showToast) window.showToast('生成名片失敗：' + (e.message || '請稍後再試'), true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }

  async function applyMyCardTemplate(evt) {
    if (!currentCardData) {
      if (window.showToast) window.showToast('尚未建立專屬名片', true);
      return;
    }

    var btn = evt && (evt.currentTarget || evt.target);
    var originalHtml = btn ? btn.innerHTML : '';
    var cfg = parseCardConfig(currentCardData);
    cfg.desc = introTemplate;
    cfg.descAlign = 'start';
    cfg.descColor = cfg.descColor || '#666666';
    cfg.imgUrl = templateCoverUrl;
    cfg.buttons = getTemplateButtons(currentCardData['手機號碼'] || (window.currentUser && window.currentUser.phone));
    cfg.isPrivate = true;
    cfg.templateDraft = true;
    cfg.templateVersion = 'rental-intro-1';

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 套用中...';
    }

    try {
      var rowId = await ensureCurrentCardRowId();
      if (!rowId) throw new Error('找不到名片，請重新整理後再試');
      var res = await window.fetchAPI('updateCard', {
        rowId: rowId,
        userId: (window.currentUserProfile && window.currentUserProfile.userId) || '',
        data: {
          '服務項目': introTemplate,
          '名片圖檔': cfg.imgUrl,
          '自訂名片設定': JSON.stringify(cfg)
        }
      }, true);

      if (!res || res.error) throw new Error((res && res.error) || '套用失敗');
      currentCardData['服務項目'] = introTemplate;
      currentCardData['名片圖檔'] = cfg.imgUrl;
      currentCardData['自訂名片設定'] = JSON.stringify(cfg);
      currentCardData.rowId = currentCardData.rowId || rowId;
      window.currentUserCard = currentCardData;
      myEcardImgs.landscape = cfg.imgUrl;
      myEcardButtons = cfg.buttons.slice();
      myEcardStateLoaded = true;
      renderButtons();
      updatePreview();
      if (window.showToast) window.showToast('✅ 已套用介紹模板');
    } catch (e) {
      if (window.showToast) window.showToast('套用模板失敗：' + (e.message || '請稍後再試'), true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }

  async function shareMyCard(btn) {
    currentCardData = await resolveCurrentUserCard(true) || currentCardData;
    if (!currentCardData) {
      if (window.showToast) window.showToast('尚未建立專屬名片', true);
      return;
    }

    var originalHtml = btn ? btn.innerHTML : '';
    if (btn) btn.disabled = true;
    try {
      var rowId = await ensureCurrentCardRowId();
      if (!rowId) throw new Error('找不到名片編號，請重新整理後再試');
      currentCardData.rowId = currentCardData.rowId || rowId;
      var shareUrl = buildMyCardShareUrl(rowId);
      var shareConfig = buildCurrentShareConfig();
      var flexMsg = typeof window.buildLocalECardFlexMessage === 'function'
        ? window.buildLocalECardFlexMessage(currentCardData, shareConfig, shareUrl)
        : await window.fetchAPI('buildFlexMessage', {
          card: currentCardData,
          config: shareConfig,
          referrerId: moduleAuth.getUserId(),
          networkId: window.currentNetworkId,
          liffId: moduleConfig.POINT_LIFF_ID || window.POINT_LIFF_ID || moduleConfig.LIFF_ID
        }, true);
      if (flexMsg && !flexMsg.error) {
        routeFlexHeaderShareToPicker(flexMsg, shareUrl);
        window.__lastMyCardShareMessages = [{
          type: 'flex',
          altText: '\u60a8\u6536\u5230\u4e00\u5f35\u6578\u4f4d\u540d\u7247',
          contents: flexMsg
        }];
        var shared = await window.triggerFlexSharing(flexMsg, currentCardData['姓名'] || '數位名片');
        if (shared === false) return;
      } else {
        throw new Error((flexMsg && flexMsg.error) || '建立分享訊息失敗');
      }
    } catch (e) {
      console.warn('[shareMyCard] Flex share failed:', e);
      if (window.showToast) window.showToast('發送失敗: ' + e.message, true);
    } finally {
      if (btn) {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
    }
  }

  function showMyQRCode() {
    if (!currentCardData) return;
    var modal = $('#qr-modal');
    var img = $('#qr-code-img');
    var loading = $('#qr-loading');
    var title = $('#qr-modal-title');
    var desc = $('#qr-modal-desc');
    var shareBtn = $('#qr-modal-share-btn');
    if (title) title.textContent = '我的專屬行動名片';
    if (desc) desc.innerHTML = '請邀請對方使用 LINE 掃描上方條碼<br>立即互換名片並綁定商機推薦';
    if (shareBtn) shareBtn.classList.remove('hidden');
    if (modal) modal.classList.remove('hidden');
    show(img, false);
    show(loading, true);

    var badgeUrl = buildMyCardShareUrl(currentCardData.rowId || '');
    var qrUrl = 'https://quickchart.io/qr?text=' + encodeURIComponent(badgeUrl) + '&size=300&margin=2';
    if (img) {
      img.onload = function() {
        show(loading, false);
        show(img, true);
      };
      img.src = qrUrl;
    }
  }

  var api = {
    init: init,
    load: load,
    openMyCardEntry: openMyCardEntry,
    openMyCardDetail: openMyCardDetail,
    openQuicklyMyCard: openQuicklyMyCard,
    openMyCardWysiwyg: openMyCardWysiwyg,
    openMyCardVideoFlow: openMyCardVideoFlow,
    shareMyCard: shareMyCard,
    showMyQRCode: showMyQRCode,
    updateButton: updateButton,
    removeButton: removeButton,
    moveButton: moveButton
  };

  window.MyCardModule = api;
  window.initMyECard = function() { api.init(); return api.load(); };
  window.openMyCardEntry = openMyCardEntry;
  window.openMyCardDetail = openMyCardDetail;
  window.openQuicklyMyCard = openQuicklyMyCard;
  window.openMyCardWysiwyg = openMyCardWysiwyg;
  window.openMyCardVideoFlow = openMyCardVideoFlow;
  window.updateMyCardVideoButtonState = updateMyCardVideoButtonState;
  window.closeMyCardWysiwyg = closeMyCardWysiwyg;
  window.closeMyCardWysiwygEditor = closeMyCardWysiwygEditor;
  window.editMyCardWysiwygField = editMyCardWysiwygField;
  window.editMyCardWysiwygButton = editMyCardWysiwygButton;
  window.setMyCardWysiwygLayout = setMyCardWysiwygLayout;
  window.setMyCardWysiwygAlign = setMyCardWysiwygAlign;
  window.applyMyCardWysiwygEditor = applyMyCardWysiwygEditor;
  window.addMyCardWysiwygButton = addMyCardWysiwygButton;
  window.removeMyCardWysiwygButton = removeMyCardWysiwygButton;
  window.copyMyCardUrlVariant = copyMyCardUrlVariant;
  window.openMyCardWysiwygImageUpload = openMyCardWysiwygImageUpload;
  window.getMyCardUploadAspectRatio = getMyCardUploadAspectRatio;
  window.saveMyCardWysiwyg = saveMyCardWysiwyg;
  window.changeMyLayout = handleLayoutChange;
  window.focusMyECardSection = focusMyECardSection;
  window.addMyV1Button = addV1Button;
  window.updateMyV1Button = updateButton;
  window.removeMyV1Button = removeButton;
  window.moveMyV1Button = moveButton;
  window.updateMyECardPreview = updatePreview;
  window.setMyUploadImage = setMyUploadImage;
  window.saveMyECardConfig = saveMyECardConfig;
  window.applyMyVideoCardMedia = applyMyVideoCardMedia;
  window.generateCardFromProfile = generateCardFromProfile;
  window.applyMyCardTemplate = applyMyCardTemplate;
  window.showMyQRCode = showMyQRCode;
  window.shareMyCard = shareMyCard;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleQuicklyMyCardOpen);
  } else {
    scheduleQuicklyMyCardOpen();
  }
})();
