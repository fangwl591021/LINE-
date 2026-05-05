/* ==================== 圖片裁切共用模組 ==================== */

// 🚀 注入全域 CSS 修復：徹底解決 Flexbox 容器被長圖片撐破、導致裁切框超出螢幕的 Bug
(function injectCropperFix() {
  if (!document.getElementById('cropper-fix-style')) {
    const style = document.createElement('style');
    style.id = 'cropper-fix-style';
    style.innerHTML = `
      /* 強制 Modal 絕對貼齊螢幕邊界，使用 100dvh 適應手機網址列縮放 */
      #cropper-modal, #section-image-cropper {
        position: fixed !important;
        inset: 0 !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
      }
      /* 鎖死圖片父容器高度： flex: 1 1 0% 加上 height: 0 強制其向內收縮，絕對不允許被圖片撐破 */
      #cropper-modal > div:nth-child(1), 
      #section-image-cropper > div:nth-child(2) {
        flex: 1 1 0% !important;
        min-height: 0 !important;
        height: 0 !important;
        position: relative !important;
      }
      /* 限制圖片本身渲染尺寸 */
      #cropper-modal img, #section-image-cropper img {
        display: block !important;
        max-width: 100% !important;
        max-height: 100% !important;
      }
    `;
    document.head.appendChild(style);
  }
})();

// 取消裁切
window.cancelCrop = function() {
  document.getElementById('cropper-modal').classList.add('hidden');
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  const confirmBtn = document.getElementById('btn-confirm-crop');
  if (confirmBtn) {
    confirmBtn.setAttribute('onclick', 'window.confirmCrop()');
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

  let size = 1000;
  let quality = 0.8;
  let base64Image = cropperInstance.getCroppedCanvas({
    maxWidth: size,
    maxHeight: size,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  }).toDataURL('image/jpeg', quality);

  while (base64Image.length > 660000 && quality > 0.3) {
    quality -= 0.15;
    base64Image = cropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);
  }
  if (base64Image.length > 660000) {
    size = 800;
    base64Image = cropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', 0.5);
  }

  window.cancelCrop();
  window.showToast('🤖 AI 正在辨識名片,請稍候 8-15 秒...');

  try {
    const ocrRes = await window.fetchAPI('recognizeCardWithGPT4o', { base64Image: base64Image }, true);
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

// 我的專屬名片掃描的確認裁切
window.confirmMyCardCrop = async function() {
  if (!cropperInstance) return;
  const btn = document.getElementById('btn-confirm-crop');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px] align-middle">refresh</span> 處理中...';
  btn.disabled = true;

  let size = 1000;
  let quality = 0.8;
  let base64Image = cropperInstance.getCroppedCanvas({
    maxWidth: size,
    maxHeight: size,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  }).toDataURL('image/jpeg', quality);

  while (base64Image.length > 660000 && quality > 0.3) {
    quality -= 0.15;
    base64Image = cropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);
  }
  if (base64Image.length > 660000) {
    size = 800;
    base64Image = cropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', 0.5);
  }

  window.cancelCrop();
  window.showToast('🤖 AI 正在辨識名片,請稍候 8-15 秒...');

  try {
    const ocrRes = await window.fetchAPI('recognizeCardWithGPT4o', { base64Image: base64Image }, true);
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

// 上傳自訂圖片到 R2 (含 Flexbox 溢出防護)
window.uploadCustomImageToR2 = function(inputEl, targetInputId, forcedRatio = null) {
  const file = inputEl.files[0];
  if (!file) return;

  window.currentUploadTargetId = targetInputId;

  let ratio = NaN; 
  if (forcedRatio !== null) {
    ratio = forcedRatio;
  } else if (targetInputId === 'input-store-banner') {
    ratio = 16 / 9; 
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const cropperModal = document.getElementById('cropper-modal');
    const cropperImage = document.getElementById('cropper-image');
    
    if (cropperImage.parentElement) {
      cropperImage.parentElement.style.minHeight = '0';
    }
    cropperImage.style.display = 'block';
    cropperImage.style.maxWidth = '100%';
    cropperImage.style.maxHeight = '100%';

    cropperModal.classList.remove('hidden');

    cropperImage.onload = () => {
      const confirmBtn = document.getElementById('btn-confirm-crop');
      if (confirmBtn) confirmBtn.setAttribute('onclick', 'window.confirmCustomImageCrop()');

      if (cropperInstance) cropperInstance.destroy();

      setTimeout(() => {
        cropperInstance = new Cropper(cropperImage, {
          aspectRatio: ratio,
          viewMode: 1, // 嚴格限制裁切框不准超出畫布
          dragMode: 'move',
          autoCropArea: 0.95, // 不要 100% 貼邊，預留 5% 邊距讓操作更順手
          restore: false,
          guides: true,
          center: true,
          highlight: false,
          cropBoxMovable: true,
          cropBoxResizable: true,
          toggleDragModeOnDblclick: false,
        });
      }, 150);
    };
    
    cropperImage.src = e.target.result;
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

  let size = 800; 
  let quality = 0.8;
  
  // 取得裁切後的真實畫布
  const canvas = cropperInstance.getCroppedCanvas({
    maxWidth: size,
    maxHeight: size,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  });
  
  // 計算出這張圖的真實寬高比 (交給後端 Flex 渲染用)
  const imgRatio = canvas.width + ':' + canvas.height;

  let base64Image = canvas.toDataURL('image/jpeg', quality);

  while (base64Image.length > 660000 && quality > 0.3) {
    quality -= 0.15;
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

      // 將真實比例 (imgRatio) 傳遞給前端設定
      if (targetInputId === 'my-v1-img-url') {
        if (typeof window.setMyUploadImage === 'function') window.setMyUploadImage(res.url, imgRatio);
      } else if (targetInputId === 'v1-img-url') {
        if (typeof window.setOtherUploadImage === 'function') window.setOtherUploadImage(res.url, imgRatio);
      } else if (targetInputId === 'input-store-banner') {
        document.getElementById('setting-preview-banner').src = res.url;
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

// 建立活動專用裁切器 (含 Flexbox 溢出防護)
window.openActiveCropper = function(input, targetMode) {
  const file = input.files[0];
  if (!file) return;
  currentActiveCropTarget = targetMode;

  const reader = new FileReader();
  reader.onload = (e) => {
    const modal = document.getElementById('section-image-cropper');
    const img = document.getElementById('active-cropper-image');
    if (!img || !modal) return;

    // 🚀 強制約束
    if (img.parentElement) {
      img.parentElement.style.minHeight = '0';
    }
    img.style.display = 'block';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';

    modal.classList.remove('hidden');

    img.onload = () => {
      if (activeCropperInstance) activeCropperInstance.destroy();

      setTimeout(() => {
        activeCropperInstance = new Cropper(img, {
          aspectRatio: NaN,
          viewMode: 1,
          dragMode: 'move', // 改為 move 更適合手機
          autoCropArea: 0.95,  // 最大化裁切框
          guides: true,
          center: true,
          highlight: false
        });
        img.style.opacity = '1';
      }, 150);
    };
    
    img.src = e.target.result;
    img.style.opacity = '0'; // 避免閃爍
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
  let quality = 0.8;
  let base64 = activeCropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);

  while (base64.length > 660000 && quality > 0.3) {
    quality -= 0.15;
    base64 = activeCropperInstance.getCroppedCanvas({ maxWidth: size, maxHeight: size }).toDataURL('image/jpeg', quality);
  }
  if (base64.length > 800000) {
    window.cancelActiveCrop();
    return window.showToast("⚠️ 圖片檔案過大無法壓縮,請選擇其他圖片", true);
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
