/* ==================== 圖片裁切共用模組 ==================== */

// 🚀 輔助函式：安全初始化 Cropper，徹底移除會干擾高度計算的 Flexbox，回歸原生 Block 排版
function createSafeCropper(imgElement, ratio) {
  if (!imgElement) return null;
  
  // 清除父容器的 Tailwind flex 屬性，改為 block，讓 Cropper.js 完美讀取畫布邊界
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

  return new Cropper(imgElement, {
    aspectRatio: ratio,
    viewMode: 1, // 關鍵：嚴格限制裁切框絕對不能超出圖片實體範圍
    dragMode: 'move',
    autoCropArea: 0.95,
    cropBoxMovable: true,
    cropBoxResizable: true,
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

// ==========================================
// 1. 一般客戶名片 (CRM 名片庫掃描) - 自由裁切
// ==========================================
window.openCropper = function(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
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
      
      // 給予 DOM 渲染時間後，啟動安全裁切器 (NaN 代表自由拉伸)
      setTimeout(() => {
        cropperInstance = createSafeCropper(img, NaN);
      }, 150);
    };
    img.src = e.target.result;
    input.value = "";
  };
  reader.readAsDataURL(file);
};

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

  window.cancelCrop();
  window.showToast('🤖 AI 正在辨識客戶名片...');

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
      window.showToast('✅ 客戶名片建立成功！');
      if (typeof window.loadAllData === 'function') await window.loadAllData();
      if (typeof window.goPage === 'function') window.goPage('card'); 
    } else {
      throw new Error('儲存失敗');
    }
  } catch (err) {
    window.showToast('⚠️ ' + err.message, true);
  }
};

// ==========================================
// 2. 我的專屬名片掃描 - 自由裁切
// ==========================================
window.openMyCardCropper = function(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
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
        cropperInstance = createSafeCropper(img, NaN);
      }, 150);
    };
    img.src = e.target.result;
    input.value = "";
  };
  reader.readAsDataURL(file);
};

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

  window.cancelCrop();
  window.showToast('🤖 AI 正在辨識專屬名片...');

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
      window.showToast('✅ 專屬名片覆蓋成功！');
      cardPayload.rowId = saveRes.rowId;
      allCards.unshift(cardPayload);
      currentUserCard = cardPayload;
      if (typeof window.initMyECard === 'function') window.initMyECard();
      if (typeof window.renderCardList === 'function') window.renderCardList(allCards);
    } else {
      throw new Error('儲存失敗');
    }
  } catch (err) {
    window.showToast('⚠️ ' + err.message, true);
  }
};

// ==========================================
// 3. 上傳封面圖片 (版型背景圖) - 🚀 智慧解除比例鎖定
// ==========================================
window.uploadCustomImageToR2 = function(inputEl, targetInputId, forcedRatio = null) {
  const file = inputEl.files[0];
  if (!file) return;

  window.currentUploadTargetId = targetInputId;

  // 🚀 關鍵邏輯：依據版型自動判斷是否要鎖定比例
  let uploadRatio = NaN; // 預設滿版與正方為「完全自由拉伸 (NaN)」
  
  if (forcedRatio !== null) {
    uploadRatio = forcedRatio;
  } else if (targetInputId === 'my-v1-img-url') {
    const layoutRadio = document.querySelector('input[name="my-ecard-layout"]:checked');
    if (layoutRadio && layoutRadio.value === 'landscape') uploadRatio = 20 / 13; // 僅標準版鎖定
  } else if (targetInputId === 'v1-img-url') {
    const layoutRadio = document.querySelector('input[name="ecard-layout"]:checked');
    if (layoutRadio && layoutRadio.value === 'landscape') uploadRatio = 20 / 13; // 僅標準版鎖定
  } else if (targetInputId === 'input-store-banner') {
    uploadRatio = 16 / 9; 
  }

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
    imageSmoothingQuality: 'high',
  });
  
  // 記錄使用者裁切出的真實比例，交給預覽引擎渲染
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
    window.showToast('⚠️ ' + err.message, true);
  } finally {
    targetInput.disabled = false;
  }
};

// ==========================================
// 4. 活動宣傳圖掃描
// ==========================================
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
    input.value = "";
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
