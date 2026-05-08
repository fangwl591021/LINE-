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
    dragMode: 'crop',
    autoCropArea: 0.95,
    cropBoxMovable: true,
    cropBoxResizable: true,
    toggleDragModeOnDblclick: true,
    guides: true,
    center: true,
    highlight: false,
    background: false
  });
}

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
  window.showToast('AI 正在辨識客戶名片...');

  try {
    const ocrRes = await window.fetchAPI('recognizeCardWithGPT4o', { base64Image }, true);
    if (!ocrRes || ocrRes.error) throw new Error(ocrRes?.error || 'AI 辨識失敗');

    const cardPayload = {
      ...ocrRes,
      userId: '',
      creatorId: window.currentUserProfile?.userId || '',
      '建檔者ID': window.currentUserProfile?.userId || '',
      '建檔人/備註': '掃描建立 by ' + (currentUser?.name || '')
    };

    const saveRes = await window.fetchAPI('saveCard', cardPayload, true);
    if (saveRes && saveRes.rowId) {
      window.showToast('客戶名片建立成功！');
      if (typeof window.loadAllData === 'function') await window.loadAllData();
      if (typeof window.goPage === 'function') window.goPage('card');
    } else {
      throw new Error('儲存失敗');
    }
  } catch (err) {
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
  window.showToast('AI 正在辨識專屬名片...');

  try {
    const ocrRes = await window.fetchAPI('recognizeCardWithGPT4o', { base64Image }, true);
    if (!ocrRes || ocrRes.error) throw new Error(ocrRes?.error || 'AI 辨識失敗');

    const cardPayload = {
      ...ocrRes,
      userId: currentUserProfile.userId,
      creatorId: currentUserProfile.userId,
      '建檔者ID': currentUserProfile.userId,
      '建檔人/備註': '我的專屬名片'
    };

    const saveRes = await window.fetchAPI('saveCard', cardPayload, true);
    if (saveRes && saveRes.rowId) {
      window.showToast('專屬名片覆蓋成功！');
      cardPayload.rowId = saveRes.rowId;
      allCards.unshift(cardPayload);
      currentUserCard = cardPayload;
      if (typeof window.initMyECard === 'function') window.initMyECard();
      if (typeof window.renderCardList === 'function') window.renderCardList(allCards);
    } else {
      throw new Error('儲存失敗');
    }
  } catch (err) {
    window.showToast(err.message, true);
  }
};

window.uploadCustomImageToR2 = function(inputEl, targetInputId, forcedRatio = null) {
  const file = inputEl.files[0];
  if (!file) return;

  window.currentUploadTargetId = targetInputId;
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
  let base64 = activeCropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);

  while (base64.length > 660000 && quality > 0.3) {
    quality -= 0.15;
    base64 = activeCropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);
  }

  if (base64.length > 800000) {
    window.cancelActiveCrop();
    return window.showToast('圖片檔案過大無法壓縮，請選擇其他圖片', true);
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
    alert('系統找不到對應的預覽區塊 (' + modeId + ')，請重新整理');
  }
};
