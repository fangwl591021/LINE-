// ... existing code ...
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
    if (layoutRadio) {
      if (layoutRadio.value === 'landscape') uploadRatio = 20 / 13;
      else if (layoutRadio.value === 'portrait') uploadRatio = NaN; // 滿版改為自由比例
      else if (layoutRadio.value === 'square') uploadRatio = 1 / 1;
    }
  } else if (targetInputId === 'v1-img-url') {
    const layoutRadio = document.querySelector('input[name="ecard-layout"]:checked');
    if (layoutRadio) {
      if (layoutRadio.value === 'landscape') uploadRatio = 20 / 13;
      else if (layoutRadio.value === 'portrait') uploadRatio = NaN; // 滿版改為自由比例
      else if (layoutRadio.value === 'square') uploadRatio = 1 / 1;
    }
  } else if (targetInputId === 'input-store-banner') {
    uploadRatio = 16 / 9; 
  }
// ... existing code ...
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
  
  // 記錄使用者裁切出的真實比例，交給預覽引擎渲染 (保留整數，避免小數點造成問題)
  const imgRatio = Math.round(canvas.width) + ':' + Math.round(canvas.height);

  let base64Image = canvas.toDataURL('image/jpeg', quality);
// ... existing code ...
