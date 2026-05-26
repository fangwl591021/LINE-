/* ==================== 圖片裁切共用模組 ==================== */

function createSafeCropper(imgElement, ratio) {
  if (!imgElement) return null;

  const parent = imgElement.parentElement;
  if (parent) {
    parent.classList.remove('flex', 'items-center', 'justify-center', 'p-4');
    parent.style.display = 'block';
    parent.style.width = '100%';
    parent.style.height = '100%';
    parent.style.position = 'relative';
  }

  imgElement.style.display = 'block';
  imgElement.style.maxWidth = '100%';
  imgElement.style.maxHeight = '100%';

  const freeRatio = ratio === null || ratio === undefined || Number.isNaN(Number(ratio));

  return new Cropper(imgElement, {
    aspectRatio: freeRatio ? NaN : ratio,
    viewMode: 1,
    dragMode: 'move',
    autoCropArea: 0.92,
    cropBoxMovable: true,
    cropBoxResizable: true,
    toggleDragModeOnDblclick: true,
    zoomable: true,
    zoomOnTouch: true,
    zoomOnWheel: true,
    wheelZoomRatio: 0.08,
    movable: true,
    scalable: true,
    responsive: true,
    restore: false,
    guides: true,
    center: true,
    highlight: false,
    background: false
  });
}

function getCropperByScope(scope) {
  return scope === 'active' ? activeCropperInstance : cropperInstance;
}

window.zoomCropper = function(delta, scope) {
  const instance = getCropperByScope(scope);
  if (!instance) return;
  try {
    instance.zoom(Number(delta) || 0);
  } catch (e) {
    console.warn('[zoomCropper] failed:', e);
  }
};

window.resetCropperView = function(scope) {
  const instance = getCropperByScope(scope);
  if (!instance) return;
  try {
    instance.reset();
  } catch (e) {
    console.warn('[resetCropperView] failed:', e);
  }
};

window.cancelCrop = function() {
  const modal = document.getElementById('cropper-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  const img = document.getElementById('cropper-image');
  if (img) img.src = '';
};

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    return value;
  }
}

function pickFirstValue(source, keys) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function unwrapOcrCardData(ocrRes) {
  const candidates = [
    ocrRes?.data?.cardData,
    ocrRes?.data?.card,
    ocrRes?.data,
    ocrRes?.cardData,
    ocrRes?.card,
    ocrRes?.result,
    ocrRes
  ];

  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }
  return {};
}

function normalizeOcrCardData(ocrRes) {
  const source = unwrapOcrCardData(ocrRes);
  const normalized = {};
  const fieldMap = {
    '姓名': ['姓名', 'name', 'Name', 'fullName', 'full_name'],
    '英文名': ['英文名', 'englishName', 'english_name', 'EnglishName'],
    '職稱': ['職稱', 'title', 'Title', 'jobTitle', 'job_title'],
    '部門': ['部門', 'department', 'Department'],
    '公司名稱': ['公司名稱', 'companyName', 'company_name', 'company', 'Company', 'organization'],
    '統一編號': ['統一編號', 'taxId', 'tax_id', 'vatNumber'],
    '手機號碼': ['手機號碼', '手機', 'mobile', 'mobilePhone', 'phone', 'Phone'],
    '公司電話': ['公司電話', '電話', 'officePhone', 'office_phone', 'tel', 'telephone'],
    '分機': ['分機', 'extension', 'ext'],
    '傳真': ['傳真', 'fax', 'Fax'],
    '電子郵件': ['電子郵件', 'email', 'Email', 'mail'],
    '公司網址': ['公司網址', 'website', 'Website', 'url', 'companyUrl'],
    '社群帳號': ['社群帳號', 'socials', 'social', 'socialMedia'],
    '公司地址': ['公司地址', 'address', 'Address', 'companyAddress'],
    '生日': ['生日', 'birthday', 'Birthday'],
    '服務項目': ['服務項目', 'services', 'service', 'description', 'desc'],
    '名片圖檔': ['名片圖檔', 'imageUrl', 'image_url', 'uploadedImgUrl', 'imgUrl'],
    '自訂名片設定': ['自訂名片設定', 'customConfig', 'custom_config', 'config']
  };

  Object.entries(fieldMap).forEach(([target, aliases]) => {
    let value = pickFirstValue(source, aliases);
    if (target === '名片圖檔' && !value) value = pickFirstValue(ocrRes, aliases);
    if (target === '自訂名片設定' && value && typeof value === 'object') value = JSON.stringify(value);
    if (value !== undefined && value !== null && String(value).trim() !== '') normalized[target] = value;
  });

  Object.entries(source).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '' && normalized[key] === undefined) {
      normalized[key] = value;
    }
  });

  return normalized;
}

function hasOcrContent(cardData) {
  return ['姓名', '英文名', '公司名稱', '職稱', '手機號碼', '公司電話', '電子郵件', '公司地址', '服務項目']
    .some((key) => String(cardData?.[key] || '').trim() !== '');
}

function describeCardSaveResult(saveRes, baseMessage) {
  const award = saveRes && saveRes.pointAward ? saveRes.pointAward : null;
  const points = Number((saveRes && saveRes.awardedPoints) || (award && award.awarded ? award.points : 0) || 0);
  let message = baseMessage || '名片已儲存';
  if (points > 0) {
    message += '，已贈送 ' + points + ' 點';
  } else if (award && award.reason === 'already_awarded') {
    message += '，此名片已領過贈點';
  } else if (award && award.error) {
    message += '，贈點暫未完成';
  }
  return message;
}

function refreshPointsAfterCardSave() {
  if (typeof window.refreshPointBalanceBadge === 'function') {
    setTimeout(() => window.refreshPointBalanceBadge(), 500);
    setTimeout(() => window.refreshPointBalanceBadge(), 1800);
  }
}

function getCardAwardedPoints(saveRes) {
  const award = saveRes && saveRes.pointAward ? saveRes.pointAward : null;
  return Number((saveRes && saveRes.awardedPoints) || (award && award.awarded ? award.points : 0) || 0);
}

function parsePointBalanceText(text) {
  const num = Number(String(text || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? num : null;
}

function readCurrentPointBalance() {
  const badge = document.getElementById('point-balance-badge');
  return badge ? parsePointBalanceText(badge.textContent) : null;
}

async function queryCurrentPointBalance() {
  const badge = document.getElementById('point-balance-badge');
  const userId = window.currentUserProfile?.userId || '';
  if (!userId || typeof window.fetchAPI !== 'function') return null;

  const pointUserId = window.resolvePointUserIdForCurrentProfile?.(userId) || userId;
  const res = await window.fetchAPI('queryUserPoints', {
    userId,
    pointUserId,
    pt_uid: pointUserId,
    page: 1,
    per_page: 100
  }, true);
  const data = res && (res.data || res);
  const balance = Number(data && data.balance);
  if (!Number.isFinite(balance)) return null;
  if (badge) {
    badge.textContent = balance.toLocaleString('zh-TW') + ' \u9ede';
    badge.classList.remove('hidden');
  }
  return balance;
}

function showAwardFromBalanceChange(beforeBalance) {
  if (beforeBalance === null || beforeBalance === undefined) return;
  setTimeout(async () => {
    try {
      const afterBalance = await queryCurrentPointBalance();
      if (afterBalance === null) return;
      const diff = Math.round(afterBalance - Number(beforeBalance));
      if (diff >= 10) showPointAwardCelebration(10);
    } catch (err) {
      console.warn('[showAwardFromBalanceChange] point check skipped:', err);
    }
  }, 700);
}

function showPointAwardCelebration(points) {
  const amount = Number(points) || 0;
  if (amount <= 0) return;

  const oldPopup = document.getElementById('point-award-celebration');
  if (oldPopup) oldPopup.remove();

  const popup = document.createElement('div');
  popup.id = 'point-award-celebration';
  popup.className = 'fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm px-6';
  popup.innerHTML = `
    <div class="w-full max-w-[340px] rounded-[28px] bg-white p-6 text-center shadow-2xl border border-emerald-100">
      <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <span class="material-symbols-outlined text-[34px]">redeem</span>
      </div>
      <div class="text-[24px] font-black text-slate-900">${'\u606d\u559c\u7372\u5f97 ' + amount + ' \u9ede'}</div>
      <div class="mt-2 text-[14px] font-bold leading-6 text-slate-500">${'\u65b0\u589e\u4e0d\u91cd\u8907\u540d\u7247\u6210\u529f'}</div>
      <button id="point-award-close" type="button" class="mt-5 w-full rounded-2xl bg-emerald-600 py-3 text-[16px] font-black text-white shadow-lg active:scale-[0.98] transition-transform">
        ${'\u592a\u597d\u4e86'}
      </button>
    </div>
  `;

  const closePopup = () => {
    clearTimeout(timer);
    popup.remove();
  };
  const timer = setTimeout(closePopup, 3200);
  popup.addEventListener('click', (event) => {
    if (event.target === popup) closePopup();
  });
  document.body.appendChild(popup);
  const closeBtn = document.getElementById('point-award-close');
  if (closeBtn) closeBtn.addEventListener('click', closePopup);
}

function normalizeSavedCard(saveRes, cardPayload) {
  const merged = {
    ...(cardPayload && typeof cardPayload === 'object' ? cardPayload : {}),
    ...(saveRes && typeof saveRes === 'object' ? saveRes : {})
  };
  if (saveRes && saveRes.data && typeof saveRes.data === 'object') Object.assign(merged, saveRes.data);

  const rowId = merged.rowId || merged.row_id || merged["rowId"] || (cardPayload && (cardPayload.rowId || cardPayload["rowId"]));
  if (rowId) {
    merged.rowId = rowId;
    merged["rowId"] = rowId;
  }
  if (!merged.updated_at && !merged.created_at && !merged.updatedAt) merged.updatedAt = new Date().toISOString();
  return merged;
}

function putSavedCardOnTop(saveRes, cardPayload) {
  const savedCard = normalizeSavedCard(saveRes, cardPayload);
  const rowId = savedCard.rowId || savedCard["rowId"];
  if (!rowId) return savedCard;

  if (!Array.isArray(window.allCards)) window.allCards = [];
  window.allCards = window.allCards.filter(card => String(card && (card.rowId || card["rowId"])) !== String(rowId));
  window.allCards.unshift(savedCard);
  if (typeof allCards !== 'undefined') allCards = window.allCards;
  if (typeof window.renderCardList === 'function') window.renderCardList(window.allCards);
  return savedCard;
}

function refreshCardsAfterSave(savedCard) {
  if (typeof window.loadCardData !== 'function') return;
  window.loadCardData({ force: true, render: false })
    .then(() => putSavedCardOnTop(savedCard, savedCard))
    .catch(err => console.warn('[refreshCardsAfterSave] refresh skipped:', err));
}

let cardOcrProgressTimer = null;
let cardOcrProgressValue = 0;
let cardOcrProgressCap = 92;

function ensureCardOcrProgressPopup() {
  let popup = document.getElementById('card-ocr-progress-popup');
  if (popup) return popup;

  popup = document.createElement('div');
  popup.id = 'card-ocr-progress-popup';
  popup.className = 'fixed inset-0 z-[9999] hidden items-center justify-center bg-slate-950/55 backdrop-blur-sm px-6';
  popup.innerHTML = `
    <div class="w-full max-w-[360px] rounded-[28px] bg-white shadow-2xl p-6 text-center border border-slate-100">
      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <span class="material-symbols-outlined animate-spin text-[28px]">progress_activity</span>
      </div>
      <div id="card-ocr-progress-title" class="text-[18px] font-black text-slate-900">名片辨識中</div>
      <div id="card-ocr-progress-message" class="mt-2 text-[13px] font-bold text-slate-500">正在準備圖片...</div>
      <div class="mt-5 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div id="card-ocr-progress-bar" class="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out" style="width: 0%"></div>
      </div>
      <div id="card-ocr-progress-percent" class="mt-3 text-[28px] font-black tabular-nums text-slate-900">0%</div>
      <div class="mt-2 text-[12px] font-bold text-slate-400">請勿重複上傳或關閉頁面</div>
    </div>
  `;
  document.body.appendChild(popup);
  return popup;
}

function updateCardOcrProgress(percent, message, title) {
  const popup = ensureCardOcrProgressPopup();
  cardOcrProgressValue = Math.max(cardOcrProgressValue, Math.min(100, Math.round(percent)));
  popup.classList.remove('hidden');
  popup.classList.add('flex');

  const titleEl = document.getElementById('card-ocr-progress-title');
  const messageEl = document.getElementById('card-ocr-progress-message');
  const barEl = document.getElementById('card-ocr-progress-bar');
  const percentEl = document.getElementById('card-ocr-progress-percent');

  if (titleEl && title) titleEl.textContent = title;
  if (messageEl && message) messageEl.textContent = message;
  if (barEl) barEl.style.width = cardOcrProgressValue + '%';
  if (percentEl) percentEl.textContent = cardOcrProgressValue + '%';
}

function showCardOcrProgress(title) {
  clearInterval(cardOcrProgressTimer);
  cardOcrProgressValue = 3;
  cardOcrProgressCap = 92;
  updateCardOcrProgress(3, '正在壓縮並上傳名片照片...', title || '名片辨識中');

  cardOcrProgressTimer = setInterval(() => {
    if (cardOcrProgressValue < cardOcrProgressCap) {
      const step = cardOcrProgressValue < 45 ? 3 : 1;
      updateCardOcrProgress(cardOcrProgressValue + step);
    }
  }, 900);
}

function setCardOcrProgressStage(percent, message) {
  updateCardOcrProgress(percent, message);
}

function hideCardOcrProgress(doneMessage) {
  clearInterval(cardOcrProgressTimer);
  cardOcrProgressTimer = null;

  if (doneMessage) updateCardOcrProgress(100, doneMessage);

  setTimeout(() => {
    const popup = document.getElementById('card-ocr-progress-popup');
    if (popup) {
      popup.classList.add('hidden');
      popup.classList.remove('flex');
    }
  }, doneMessage ? 500 : 0);
}

window.openCropper = function(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    window.lastCardUploadImage = e.target.result;
    const modal = document.getElementById('cropper-modal');
    const img = document.getElementById('cropper-image');

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    img.onload = () => {
      const confirmBtn = document.getElementById('btn-confirm-crop');
      if (confirmBtn) {
        confirmBtn.setAttribute('onclick', 'window.confirmCrop()');
        confirmBtn.innerHTML = '確認裁切';
        confirmBtn.disabled = false;
      }

      if (cropperInstance) cropperInstance.destroy();
      setTimeout(() => {
        try {
          cropperInstance = createSafeCropper(img, NaN);
        } catch (err) {
          console.error('[openCropper] Cropper init failed:', err);
          cropperInstance = null;
          window.showToast('裁切器載入失敗，可直接按確認進行辨識', true);
        }
      }, 150);
    };

    img.src = e.target.result;
    input.value = '';
  };
  reader.readAsDataURL(file);
};

window.recognizeCard = function(input) {
  return window.openCropper(input);
};

window.confirmCrop = async function() {
  const btn = document.getElementById('btn-confirm-crop');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px] align-middle">refresh</span> 處理中...';
  btn.disabled = true;

  let base64Image = window.lastCardUploadImage || '';

  if (cropperInstance) {
    let size = 1000;
    let quality = 0.8;
    base64Image = cropperInstance.getCroppedCanvas({
      maxWidth: size,
      maxHeight: size,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    }).toDataURL('image/jpeg', quality);

    while (base64Image.length > 660000 && quality > 0.3) {
      quality -= 0.15;
      base64Image = cropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);
    }
  }

  if (!base64Image) {
    btn.innerHTML = '確認裁切';
    btn.disabled = false;
    return window.showToast('找不到可辨識的圖片，請重新選擇照片', true);
  }

  window.cancelCrop();
  showCardOcrProgress('客戶名片建立中');
  window.showToast('AI 正在辨識客戶名片...');

  try {
    setCardOcrProgressStage(18, '正在上傳照片並送入 OCR...');
    const ocrRes = await window.fetchAPI('recognizeCardWithGPT4o', { base64Image }, true);
    if (!ocrRes || ocrRes.error) throw new Error(ocrRes?.error || 'AI 辨識失敗');
    console.log('[confirmCrop] OCR result:', ocrRes);
    setCardOcrProgressStage(72, 'OCR 完成，正在整理名片欄位...');

    const cardData = normalizeOcrCardData(ocrRes);
    if (!hasOcrContent(cardData)) {
      console.warn('[confirmCrop] OCR returned no usable card fields:', ocrRes);
      throw new Error('AI 有回應，但沒有辨識到姓名、公司或聯絡資料，請換一張更清楚的名片照片');
    }

    const cardPayload = {
      ...cardData,
      userId: '',
      creatorId: window.currentUserProfile?.userId || '',
      '建檔者ID': window.currentUserProfile?.userId || '',
      '建檔人/備註': '掃描建立 by ' + (currentUser?.name || '')
    };

    setCardOcrProgressStage(86, '正在產生名片並寫入資料庫...');
    const pointBalanceBeforeSave = readCurrentPointBalance();
    const saveRes = await window.fetchAPI('saveCard', cardPayload, true);
    if (saveRes && saveRes.rowId) {
      const savedCard = putSavedCardOnTop(saveRes, cardPayload);
      const awardedPoints = getCardAwardedPoints(saveRes);
      hideCardOcrProgress('名片建立完成');
      window.showToast(describeCardSaveResult(saveRes, '客戶名片建立成功'));
      if (awardedPoints > 0) showPointAwardCelebration(awardedPoints);
      else showAwardFromBalanceChange(pointBalanceBeforeSave);
      refreshPointsAfterCardSave();
      if (typeof window.goPage === 'function') window.goPage('card');
      refreshCardsAfterSave(savedCard);
    } else {
      throw new Error('儲存失敗');
    }
  } catch (err) {
    hideCardOcrProgress();
    window.showToast(err.message, true);
  }
};

window.openMyCardCropper = function(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    window.lastMyCardUploadImage = e.target.result;
    const modal = document.getElementById('cropper-modal');
    const img = document.getElementById('cropper-image');

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    img.onload = () => {
      const confirmBtn = document.getElementById('btn-confirm-crop');
      if (confirmBtn) {
        confirmBtn.setAttribute('onclick', 'window.confirmMyCardCrop()');
        confirmBtn.innerHTML = '確認裁切';
        confirmBtn.disabled = false;
      }

      if (cropperInstance) cropperInstance.destroy();
      setTimeout(() => {
        try {
          cropperInstance = createSafeCropper(img, NaN);
        } catch (err) {
          console.error('[openMyCardCropper] Cropper init failed:', err);
          cropperInstance = null;
          window.showToast('裁切器載入失敗，可直接按確認進行辨識', true);
        }
      }, 150);
    };

    img.src = e.target.result;
    input.value = '';
  };
  reader.readAsDataURL(file);
};

window.recognizeMyCard = function(input) {
  return window.openMyCardCropper(input);
};

window.confirmMyCardCrop = async function() {
  const btn = document.getElementById('btn-confirm-crop');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px] align-middle">refresh</span> 處理中...';
  btn.disabled = true;

  let base64Image = window.lastMyCardUploadImage || '';

  if (cropperInstance) {
    let size = 1000;
    let quality = 0.8;
    base64Image = cropperInstance.getCroppedCanvas({
      maxWidth: size,
      maxHeight: size,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    }).toDataURL('image/jpeg', quality);

    while (base64Image.length > 660000 && quality > 0.3) {
      quality -= 0.15;
      base64Image = cropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);
    }
  }

  if (!base64Image) {
    btn.innerHTML = '確認裁切';
    btn.disabled = false;
    return window.showToast('找不到可辨識的圖片，請重新選擇照片', true);
  }

  window.cancelCrop();
  showCardOcrProgress('專屬名片建立中');
  window.showToast('AI 正在辨識專屬名片...');

  try {
    setCardOcrProgressStage(18, '正在上傳照片並送入 OCR...');
    const ocrRes = await window.fetchAPI('recognizeCardWithGPT4o', { base64Image }, true);
    if (!ocrRes || ocrRes.error) throw new Error(ocrRes?.error || 'AI 辨識失敗');
    console.log('[confirmMyCardCrop] OCR result:', ocrRes);
    setCardOcrProgressStage(72, 'OCR 完成，正在整理名片欄位...');

    const cardData = normalizeOcrCardData(ocrRes);
    if (!hasOcrContent(cardData)) {
      console.warn('[confirmMyCardCrop] OCR returned no usable card fields:', ocrRes);
      throw new Error('AI 有回應，但沒有辨識到姓名、公司或聯絡資料，請換一張更清楚的名片照片');
    }

    const cardPayload = {
      ...cardData,
      userId: currentUserProfile.userId,
      lineId: currentUserProfile.userId,
      'LINE ID': currentUserProfile.userId,
      creatorId: currentUserProfile.userId,
      '建檔者ID': currentUserProfile.userId,
      '建檔人/備註': '我的專屬名片'
    };

    setCardOcrProgressStage(86, '正在產生名片並寫入資料庫...');
    const saveRes = await window.fetchAPI('saveCard', cardPayload, true);
    if (saveRes && saveRes.rowId) {
      const savedCard = putSavedCardOnTop(saveRes, cardPayload);
      hideCardOcrProgress('專屬名片建立完成');
      window.showToast(describeCardSaveResult(saveRes, '專屬名片建立成功'));
      refreshPointsAfterCardSave();
      currentUserCard = savedCard;
      if (typeof window.initMyECard === 'function') window.initMyECard();
      refreshCardsAfterSave(savedCard);
    } else {
      throw new Error('儲存失敗');
    }
  } catch (err) {
    hideCardOcrProgress();
    window.showToast(err.message, true);
  }
};

window.uploadCustomImageToR2 = function(inputEl, targetInputId, forcedRatio = null) {
  const file = inputEl.files[0];
  if (!file) return;

  window.currentUploadTargetId = targetInputId;

  // 預設不鎖比例，讓 Banner、名片封面、活動圖都能自由拉伸裁切框。
  const uploadRatio = forcedRatio !== null ? forcedRatio : NaN;

  const reader = new FileReader();
  reader.onload = (e) => {
    const modal = document.getElementById('cropper-modal');
    const img = document.getElementById('cropper-image');

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    img.onload = () => {
      const confirmBtn = document.getElementById('btn-confirm-crop');
      if (confirmBtn) {
        confirmBtn.setAttribute('onclick', 'window.confirmCustomImageCrop()');
        confirmBtn.innerHTML = '確認裁切';
        confirmBtn.disabled = false;
      }

      if (cropperInstance) cropperInstance.destroy();
      setTimeout(() => {
        cropperInstance = createSafeCropper(img, uploadRatio);
      }, 150);
    };

    img.src = e.target.result;
    inputEl.value = '';
  };
  reader.readAsDataURL(file);
};

window.confirmCustomImageCrop = async function() {
  if (!cropperInstance) return;
  const btn = document.getElementById('btn-confirm-crop');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px] align-middle">refresh</span> 處理中...';
  btn.disabled = true;

  let size = 800;
  let quality = 0.8;

  const canvas = cropperInstance.getCroppedCanvas({
    maxWidth: size,
    maxHeight: size,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  });

  const imgRatio = Math.round(canvas.width) + ':' + Math.round(canvas.height);
  let base64Image = canvas.toDataURL('image/jpeg', quality);

  while (base64Image.length > 660000 && quality > 0.3) {
    quality -= 0.15;
    base64Image = cropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);
  }

  if (base64Image.length > 800000) {
    window.cancelCrop();
    return window.showToast('圖片檔案過大無法壓縮，請選擇其他圖片', true);
  }

  window.cancelCrop();

  const targetInputId = window.currentUploadTargetId;
  const targetInput = document.getElementById(targetInputId);
  const originalVal = targetInput.value;
  targetInput.value = '圖片上傳中...';
  targetInput.disabled = true;

  window.showToast('圖片上傳中...');

  try {
    const res = await window.fetchAPI('uploadImageToR2', { base64Image }, true);
    if (res && res.url) {
      targetInput.value = res.url;
      window.showToast('圖片已成功上傳');

      if (targetInputId === 'my-v1-img-url') {
        if (typeof window.setMyUploadImage === 'function') window.setMyUploadImage(res.url, imgRatio);
      } else if (targetInputId === 'v1-img-url') {
        if (typeof window.setOtherUploadImage === 'function') window.setOtherUploadImage(res.url, imgRatio);
      } else if (targetInputId === 'input-store-banner') {
        const preview = document.getElementById('setting-preview-banner');
        if (preview) preview.src = res.url;
      } else if (targetInputId === 'home-profile-avatar-url') {
        if (typeof window.setHomeProfileAvatar === 'function') window.setHomeProfileAvatar(res.url);
      }
    } else {
      throw new Error(res.error || '上傳失敗');
    }
  } catch (err) {
    targetInput.value = originalVal;
    window.showToast(err.message, true);
  } finally {
    targetInput.disabled = false;
  }
};

window.openActiveCropper = function(input, targetMode) {
  const file = input.files[0];
  if (!file) return;
  currentActiveCropTarget = targetMode;

  const reader = new FileReader();
  reader.onload = (e) => {
    const modal = document.getElementById('section-image-cropper');
    const img = document.getElementById('active-cropper-image');
    if (!img || !modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    img.onload = () => {
      if (activeCropperInstance) activeCropperInstance.destroy();
      setTimeout(() => {
        activeCropperInstance = createSafeCropper(img, NaN);
        img.style.opacity = '1';
      }, 150);
    };

    img.src = e.target.result;
    img.style.opacity = '0';
    input.value = '';
  };
  reader.readAsDataURL(file);
};

window.cancelActiveCrop = function() {
  if (activeCropperInstance) {
    activeCropperInstance.destroy();
    activeCropperInstance = null;
  }
  const modal = document.getElementById('section-image-cropper');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  const img = document.getElementById('active-cropper-image');
  if (img) {
    img.src = '';
    img.style.opacity = '0';
  }
};

window.confirmActiveCrop = function() {
  if (!activeCropperInstance) return;

  let size = 800;
  let quality = 0.8;
  let canvas = activeCropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size });
  let base64 = canvas.toDataURL('image/jpeg', quality);

  while (base64.length > 660000 && quality > 0.3) {
    quality -= 0.15;
    canvas = activeCropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size });
    base64 = canvas.toDataURL('image/jpeg', quality);
  }

  if (base64.length > 800000) {
    window.cancelActiveCrop();
    return window.showToast('圖片檔案過大無法壓縮，請選擇其他圖片', true);
  }

  window.cancelActiveCrop();

  const modeId = currentActiveCropTarget;
  const ratioModeId = ({ quick: 'q', full: 'f', series: 's' })[modeId] || modeId;
  const previewImg = document.getElementById('image-preview-' + modeId);
  const placeholder = document.getElementById('preview-placeholder-' + modeId);
  const urlInput = document.getElementById('in-image-url-' + modeId);
  let ratioInput = document.getElementById('in-image-ratio-' + ratioModeId);
  if (!ratioInput && urlInput && urlInput.parentElement) {
    ratioInput = document.createElement('input');
    ratioInput.type = 'hidden';
    ratioInput.id = 'in-image-ratio-' + ratioModeId;
    urlInput.parentElement.appendChild(ratioInput);
  }

  if (previewImg && placeholder && urlInput) {
    previewImg.src = base64;
    previewImg.classList.remove('hidden');
    placeholder.classList.add('hidden');
    urlInput.value = base64;
    if (ratioInput && canvas && canvas.width && canvas.height) {
      ratioInput.value = canvas.width + ':' + canvas.height;
    }
  } else {
    alert('系統找不到對應的預覽區塊 (' + modeId + ')，請重新整理');
  }
};
