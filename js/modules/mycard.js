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
  var myEcardImgs = { landscape: '', portrait: '', square: '' };
  var myEcardRatios = { landscape: '20:13', portrait: '2:3', square: '1:1' };
  var introTemplate = '請填寫公司/店家介紹\n請填寫公司/店家服務項目\n請填寫公司/店家特色\n請填寫優惠資訊\n建議 4-5 行，每行 16 字內';
  var templateCoverUrl = 'assets/rental-template-cover.png';

  function getTemplateButtons(phone) {
    var cleanPhone = String(phone || '').replace(/[^0-9+]/g, '');
    return [
      { l: '加LINE好友', u: 'https://lin.ee/y7h8BUF', c: '#06C755' },
      { l: '行動電話', u: cleanPhone ? 'tel:' + cleanPhone : 'tel:XXXXXXXXXX', c: '#3b82f6' },
      { l: '數位包租公簡介', u: 'https://lihi2.me/yXhCf', c: '#1e293b' }
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

  function show(el, visible) {
    if (el) el.classList.toggle('hidden', !visible);
  }

  function getLayout() {
    var checked = $('input[name="my-ecard-layout"]:checked');
    return checked ? checked.value : 'landscape';
  }

  function syncCurrentImageInput() {
    var imgInput = $('#my-v1-img-url');
    if (!imgInput) return;
    var layout = getLayout();
    myEcardImgs[layout] = imgInput.value || '';
  }

  function parseCardConfig(card) {
    try {
      return JSON.parse((card && card['自訂名片設定']) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function init() {
    bindOnce(document, 'change', 'input[name="my-ecard-layout"]', handleLayoutChange);
    bindOnce(document, 'click', '#btn-add-v1-button', addV1Button);
    bindOnce(document, 'click', '#btn-save-my-ecard', saveMyECardConfig);
    bindOnce(document, 'click', '#btn-share-my-card', function(evt) { shareMyCard(evt.currentTarget); });
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

  function load() {
    moduleCore.showLoading(true);
    currentCardData = window.currentUserCard || null;

    var emptyState = $('#my-ecard-empty-state');
    var editState = $('#my-ecard-edit-state');

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
      portrait: cfg.imgRatioPortrait || '2:3',
      square: cfg.imgRatioSquare || '1:1'
    };
    myEcardButtons = Array.isArray(cfg.buttons) ? cfg.buttons.slice() : [];

    var layout = cfg.layoutStyle || 'landscape';
    var radio = $('input[name="my-ecard-layout"][value="' + layout + '"]');
    if (radio) radio.checked = true;

    var imgInput = $('#my-v1-img-url');
    if (imgInput) imgInput.value = myEcardImgs[getLayout()] || '';

    renderButtons();
    updatePreview();
    moduleCore.showLoading(false);
  }

  function handleLayoutChange() {
    var imgInput = $('#my-v1-img-url');
    if (imgInput) imgInput.value = myEcardImgs[getLayout()] || '';
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
      await window.loadCardData({ render: false });
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

  function routeFlexHeaderShareToPicker(flexMsg, shareUrl) {
    var actionUrl = appendShareMode(shareUrl);
    if (!flexMsg || !actionUrl) return flexMsg;
    try {
      if (flexMsg.header && Array.isArray(flexMsg.header.contents) && flexMsg.header.contents[0]) {
        flexMsg.header.contents[0].action = { type: 'uri', uri: actionUrl };
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
      return '<div class="flex gap-2 items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-2">' +
        '<input type="color" value="' + escapeHTML(button.c || '#06C755') + '" class="w-10 h-10 p-0 cursor-pointer rounded-lg shrink-0 border border-slate-200" onchange="window.updateMyV1Button(' + index + ', \'c\', this.value)">' +
        '<div class="flex-1 flex flex-col gap-1.5">' +
          '<input type="text" value="' + escapeHTML(button.l || '') + '" placeholder="按鈕顯示文字" class="w-full text-[13px] font-bold bg-white border-none outline-none focus:ring-1 focus:ring-blue-500 rounded px-2.5 py-1.5 shadow-sm" oninput="window.updateMyV1Button(' + index + ', \'l\', this.value)">' +
          '<input type="text" value="' + escapeHTML(button.u || '') + '" placeholder="https://..." class="w-full text-[12px] font-mono bg-white border-none outline-none focus:ring-1 focus:ring-blue-500 rounded px-2.5 py-1.5 shadow-sm" oninput="window.updateMyV1Button(' + index + ', \'u\', this.value)">' +
        '</div>' +
        '<button type="button" onclick="window.removeMyV1Button(' + index + ')" class="text-red-400 bg-red-50 hover:bg-red-100 p-2.5 rounded-lg shrink-0 transition-colors">' +
          '<span class="material-symbols-outlined text-[18px]">delete</span>' +
        '</button>' +
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

  function updatePreview() {
    var preview = $('#my-ecard-preview-area');
    if (!preview) return;

    syncCurrentImageInput();
    var layout = getLayout();
    var profile = moduleAuth.getUserProfile() || {};
    var name = (currentCardData && currentCardData['姓名']) || profile.displayName || '姓名';
    var imgUrl = myEcardImgs[layout] || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
    var desc = currentCardData ? (currentCardData['服務項目'] || currentCardData['職稱'] || currentCardData['公司名稱'] || '') : '';
    var cfg = parseCardConfig(currentCardData);
    var color = cfg.descColor || '#666666';
    var align = cfg.descAlign || 'center';
    var ratio = layout === 'portrait' ? (myEcardRatios.portrait || '2:3').replace(':', '/') : (layout === 'square' ? '1/1' : '20/13');
    var buttonHtml = myEcardButtons.map(function(button) {
      return '<a href="' + escapeHTML(button.u || '#') + '" class="block py-3 rounded-xl text-white text-center text-[14px] font-black mb-2.5 shadow-sm" style="background:' + escapeHTML(button.c || '#06C755') + '">' + escapeHTML(button.l || '按鈕') + '</a>';
    }).join('');

    var imageClass = layout === 'portrait'
      ? 'w-full max-h-[520px] object-contain bg-slate-50 rounded-2xl'
      : 'w-full object-cover bg-slate-50 rounded-2xl';
    var imageStyle = layout === 'portrait'
      ? ''
      : 'aspect-ratio:' + ratio + ';';

    preview.innerHTML =
      '<div class="w-full">' +
      '<img src="' + escapeHTML(imgUrl) + '" alt="名片封面" class="' + imageClass + '" style="' + imageStyle + '">' +
      '<div class="px-4 pt-4 pb-2 text-center">' +
        '<div class="font-black text-[22px] text-slate-800 mb-2">' + escapeHTML(name) + '</div>' +
        '<div class="text-[14px] leading-relaxed" style="color:' + escapeHTML(color) + ';text-align:' + escapeHTML(align) + ';">' + escapeHTML(desc).replace(/\n/g, '<br>') + '</div>' +
      '</div>' +
      (buttonHtml ? '<div class="px-4 pb-2">' + buttonHtml + '</div>' : '') +
    '</div>';
  }

  async function saveMyECardConfig() {
    if (!currentCardData) return;
    var btn = $('#btn-save-my-ecard');
    var originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
      btn.disabled = true;
    }

    syncCurrentImageInput();
    var layout = getLayout();
    var cfg = parseCardConfig(currentCardData);
    cfg.layoutStyle = layout;
    cfg.imgUrl = myEcardImgs.landscape;
    cfg.imgUrlPortrait = myEcardImgs.portrait;
    cfg.imgUrlSquare = myEcardImgs.square;
    cfg.imgRatioLandscape = '20:13';
    cfg.imgRatioPortrait = (myEcardRatios.portrait || '2:3').replace('/', ':');
    cfg.imgRatioSquare = '1:1';
    cfg.buttons = myEcardButtons;

    try {
      var rowId = await ensureCurrentCardRowId();
      if (!rowId) throw new Error('找不到名片編號，請重新整理後再試');
      var res = await window.fetchAPI('updateCard', {
        rowId: rowId,
        userId: (window.currentUserProfile && window.currentUserProfile.userId) || '',
        data: {
          '名片圖檔': cfg.imgUrl,
          '自訂名片設定': JSON.stringify(cfg)
        }
      }, true);
      if (res && !res.error) {
        currentCardData['名片圖檔'] = cfg.imgUrl;
        currentCardData['自訂名片設定'] = JSON.stringify(cfg);
        window.currentUserCard = currentCardData;
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
      }
    }
  }

  function buildCurrentShareConfig() {
    var cfg = parseCardConfig(currentCardData);
    var liveLayout = document.querySelector('input[name="my-ecard-layout"]:checked');
    syncCurrentImageInput();
    if (liveLayout) {
      cfg.layoutStyle = liveLayout.value || cfg.layoutStyle || 'landscape';
      cfg.imgUrl = myEcardImgs.landscape || cfg.imgUrl || '';
      cfg.imgUrlPortrait = myEcardImgs.portrait || cfg.imgUrlPortrait || '';
      cfg.imgUrlSquare = myEcardImgs.square || cfg.imgUrlSquare || '';
      cfg.imgRatioLandscape = '20:13';
      cfg.imgRatioPortrait = (myEcardRatios.portrait || '2:3').replace('/', ':');
      cfg.imgRatioSquare = '1:1';
      cfg.buttons = myEcardButtons.slice();
    }
    return cfg;
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
        imgRatioPortrait: '2:3',
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
      if (Array.isArray(window.allCards)) window.allCards.unshift(cardPayload);
      if (window.showToast) window.showToast('✅ 已使用 LINE 資料建立專屬名片');
      if (typeof window.loadAllData === 'function') await window.loadAllData({ render: false });
      load();
      focusMyECardSection();
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
    if (!currentCardData) {
      if (typeof window.loadCardData === 'function') {
        await window.loadCardData({ render: false });
        if (typeof window.syncUserCardMatch === 'function') window.syncUserCardMatch();
      }
      currentCardData = window.currentUserCard || null;
      if (!currentCardData) {
        if (window.showToast) window.showToast('尚未建立專屬名片', true);
        return;
      }
    }

    var originalHtml = btn ? btn.innerHTML : '';
    if (btn) btn.disabled = true;
    try {
      var rowId = await ensureCurrentCardRowId();
      if (!rowId) throw new Error('找不到名片編號，請重新整理後再試');
      currentCardData.rowId = currentCardData.rowId || rowId;
      var shareUrl = buildMyCardShareUrl(rowId);
      var flexMsg = await window.fetchAPI('buildFlexMessage', {
        card: currentCardData,
        config: buildCurrentShareConfig(),
        referrerId: moduleAuth.getUserId(),
        networkId: window.currentNetworkId,
        liffId: moduleConfig.POINT_LIFF_ID || window.POINT_LIFF_ID || moduleConfig.LIFF_ID
      }, true);
      if (flexMsg && !flexMsg.error) {
        routeFlexHeaderShareToPicker(flexMsg, shareUrl);
        var shared = await window.triggerFlexSharing(flexMsg, currentCardData['姓名'] || '數位名片');
        if (shared === false) await sharePlainCardLink(shareUrl, currentCardData['姓名'] || '');
      } else {
        throw new Error((flexMsg && flexMsg.error) || '建立分享訊息失敗');
      }
    } catch (e) {
      console.warn('[shareMyCard] Flex share failed, fallback to URL:', e);
      var fallbackRowId = getCardRowId(currentCardData) || await ensureCurrentCardRowId();
      if (fallbackRowId) {
        await sharePlainCardLink(buildMyCardShareUrl(fallbackRowId), currentCardData['姓名'] || '');
      } else if (window.showToast) {
        window.showToast('發送失敗: ' + e.message, true);
      }
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
    shareMyCard: shareMyCard,
    showMyQRCode: showMyQRCode,
    updateButton: updateButton,
    removeButton: removeButton
  };

  window.MyCardModule = api;
  window.initMyECard = function() { api.init(); api.load(); };
  window.changeMyLayout = handleLayoutChange;
  window.focusMyECardSection = focusMyECardSection;
  window.addMyV1Button = addV1Button;
  window.updateMyV1Button = updateButton;
  window.removeMyV1Button = removeButton;
  window.saveMyECardConfig = saveMyECardConfig;
  window.generateCardFromProfile = generateCardFromProfile;
  window.applyMyCardTemplate = applyMyCardTemplate;
  window.showMyQRCode = showMyQRCode;
  window.shareMyCard = shareMyCard;
})();
