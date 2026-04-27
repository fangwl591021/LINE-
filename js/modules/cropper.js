/* ==================== 圖片裁切共用模組 ==================== */

// 取消裁切 (修正：確保關閉時重置按鈕狀態，避免第二次開啟時卡住)
window.cancelCrop = function() {
  document.getElementById('cropper-modal').classList.add('hidden');
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  const confirmBtn = document.getElementById('btn-confirm-crop');
  if (confirmBtn) {
    confirmBtn.setAttribute('onclick', 'window.confirmCrop()');
    // 確保重置按鈕為可用狀態與預設文字
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '確認裁切';
  }
};

// 一般名片庫掃描的確認裁切 + OCR
window.confirmCrop = async function() {
  if (!cropperInstance) return;
  const btn = document.getElementById('btn-confirm-crop');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px] align-middle">refresh</span> 處理中...';
  btn.disabled = true;

  let size = 1200;
  let quality = 0.85;
  let base64Image = cropperInstance.getCroppedCanvas({
    maxWidth: size,
    maxHeight: size,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  }).toDataURL('image/jpeg', quality);

  while (base64Image.length > 800000 && quality > 0.3) {
    quality -= 0.1;
    base64Image = cropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);
  }

  window.cancelCrop();
  window.showToast('🤖 AI 正在辨識名片,請稍候 8-15 秒...');

  try {
    const ocrRes = await window.fetchAPI('recognizeCardWithGPT4o', {
      base64Image: base64Image
    }, true);

    if (!ocrRes || ocrRes.error) throw new Error(ocrRes?.error || 'AI 辨識失敗');

    const cardPayload = {
      ...ocrRes,
      userId: '',
      '建檔人/備註': '掃描建立 by ' + (currentUser?.name || '')
    };

    const saveRes = await window.fetchAPI('saveCard', cardPayload, true);
    if (saveRes && saveRes.rowId) {
      window.showToast('✅ 名片建立成功！');
      await window.loadAllData();
    } else {
      throw new Error('儲存失敗');
    }
  } catch (err) {
    window.showToast('⚠️ ' + err.message, true);
  }
};

// 我的專屬名片掃描的確認裁切(綁定到自己的 userId)
window.confirmMyCardCrop = async function() {
  if (!cropperInstance) return;
  const btn = document.getElementById('btn-confirm-crop');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px] align-middle">refresh</span> 處理中...';
  btn.disabled = true;

  let size = 1200;
  let quality = 0.85;
  let base64Image = cropperInstance.getCroppedCanvas({
    maxWidth: size,
    maxHeight: size,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  }).toDataURL('image/jpeg', quality);

  while (base64Image.length > 800000 && quality > 0.3) {
    quality -= 0.1;
    base64Image = cropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);
  }

  window.cancelCrop();
  window.showToast('🤖 AI 正在辨識名片,請稍候 8-15 秒...');

  try {
    const ocrRes = await window.fetchAPI('recognizeCardWithGPT4o', {
      base64Image: base64Image
    }, true);

    if (!ocrRes || ocrRes.error) throw new Error(ocrRes?.error || 'AI 辨識失敗');

    const cardPayload = {
      ...ocrRes,
      userId: currentUserProfile.userId,
      '建檔人/備註': '我的專屬名片'
    };

    const saveRes = await window.fetchAPI('saveCard', cardPayload, true);
    if (saveRes && saveRes.rowId) {
      window.showToast('✅ 專屬名片建立成功！');
      cardPayload.rowId = saveRes.rowId;
      allCards.unshift(cardPayload);
      currentUserCard = cardPayload;
      window.initMyECard();
      window.renderCardList(allCards);
    } else {
      throw new Error('儲存失敗');
    }
  } catch (err) {
    window.showToast('⚠️ ' + err.message, true);
  }
};

// 上傳自訂圖片到 R2
window.uploadCustomImageToR2 = function(inputEl, targetInputId) {
  const file = inputEl.files[0];
  if (!file) return;

  window.currentUploadTargetId = targetInputId;

  const reader = new FileReader();
  reader.onload = (e) => {
    const cropperModal = document.getElementById('cropper-modal');
    const cropperImage = document.getElementById('cropper-image');
    cropperImage.src = e.target.result;
    cropperModal.classList.remove('hidden');

    const confirmBtn = document.getElementById('btn-confirm-crop');
    if (confirmBtn) confirmBtn.setAttribute('onclick', 'window.confirmCustomImageCrop()');

    if (cropperInstance) cropperInstance.destroy();

    cropperInstance = new Cropper(cropperImage, {
      aspectRatio: NaN,
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 0.9,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
    });
  };
  reader.readAsDataURL(file);
  inputEl.value = '';
};

// 確認上傳的自訂圖片裁切
window.confirmCustomImageCrop = async function() {
  if (!cropperInstance) return;
  const btn = document.getElementById('btn-confirm-crop');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px] align-middle">refresh</span> 處理中...';
  btn.disabled = true;

  let size = 1200;
  let quality = 0.85;
  let base64Image = cropperInstance.getCroppedCanvas({
    maxWidth: size,
    maxHeight: size,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  }).toDataURL('image/jpeg', quality);

  while (base64Image.length > 500000 && quality > 0.3) {
    quality -= 0.1;
    base64Image = cropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);
  }

  if (base64Image.length > 800000) {
    window.cancelCrop();
    return window.showToast("⚠️ 圖片檔案過大無法壓縮,請選擇其他圖片", true);
  }

  window.cancelCrop();

  const targetInputId = window.currentUploadTargetId;
  const targetInput = document.getElementById(targetInputId);
  const originalVal = targetInput.value;
  targetInput.value = '圖片上傳中...';
  targetInput.disabled = true;

  window.showToast('⏳ 圖片上傳中...');

  try {
    const res = await window.fetchAPI('uploadImageToR2', { base64Image: base64Image }, true);
    if (res && res.url) {
      targetInput.value = res.url;
      window.showToast('✅ 圖片已成功上傳');

      if (targetInputId === 'my-v1-img-url') {
        if (typeof window.updateMyECardPreview === 'function') window.updateMyECardPreview();
      } else if (targetInputId === 'input-store-banner') {
        document.getElementById('setting-preview-banner').src = res.url;
      } else {
        if (typeof window.updateECardPreview === 'function') window.updateECardPreview();
      }
    } else {
      throw new Error(res.error || '上傳失敗');
    }
  } catch (err) {
    targetInput.value = originalVal;
    window.showToast('⚠️ ' + err.message, true);
  } finally {
    targetInput.disabled = false;
  }
};

// 建立活動專用裁切器
window.openActiveCropper = function(input, targetMode) {
  const file = input.files[0];
  if (!file) return;
  currentActiveCropTarget = targetMode;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('active-cropper-image');
    if (!img) return;

    img.onload = () => {
      document.getElementById('section-image-cropper').classList.remove('hidden');
      if (activeCropperInstance) activeCropperInstance.destroy();
      img.style.opacity = '1';

      activeCropperInstance = new Cropper(img, {
        aspectRatio: NaN,
        viewMode: 1,
        dragMode: 'crop',
        autoCropArea: 0.9,
        guides: true,
        center: true,
        highlight: false
      });
    };
    img.src = e.target.result;
    img.style.opacity = '0';
    input.value = "";
  };
  reader.readAsDataURL(file);
};

window.cancelActiveCrop = function() {
  if (activeCropperInstance) {
    activeCropperInstance.destroy();
    activeCropperInstance = null;
  }
  document.getElementById('section-image-cropper').classList.add('hidden');

  const img = document.getElementById('active-cropper-image');
  if (img) {
    img.removeAttribute('src');
    img.style.opacity = '0';
  }
};

window.confirmActiveCrop = function() {
  if (!activeCropperInstance) return;
  let size = 800;
  let quality = 0.85;
  let base64 = activeCropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);

  while (base64.length > 500000 && quality > 0.3) {
    quality -= 0.1;
    base64 = activeCropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);
  }
  if (base64.length > 800000) {
    window.cancelActiveCrop();
    return alert("⚠️ 圖片檔案過大無法壓縮,請選擇其他圖片");
  }

  window.cancelActiveCrop();

  const modeId = currentActiveCropTarget;
  const previewImg = document.getElementById('image-preview-' + modeId);
  const placeholder = document.getElementById('preview-placeholder-' + modeId);
  const urlInput = document.getElementById('in-image-url-' + modeId);

  if (previewImg && placeholder && urlInput) {
    previewImg.src = base64;
    previewImg.classList.remove('hidden');
    placeholder.classList.add('hidden');
    urlInput.value = base64;
  } else {
    alert('⚠️ 系統找不到對應的預覽區塊 (' + modeId + '),請重新整理');
  }
};
