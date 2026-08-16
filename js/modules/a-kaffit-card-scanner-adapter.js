function installManualCropStyles() {
  if (document.getElementById('a-kaffit-card-scanner-styles')) return;
  const style = document.createElement('style');
  style.id = 'a-kaffit-card-scanner-styles';
  style.textContent = `
    .card-cropper-modal{display:none;position:fixed;inset:0;z-index:12000;background:rgba(2,6,23,.72);backdrop-filter:blur(5px);padding:16px;align-items:center;justify-content:center}
    .card-cropper-modal.open{display:flex}
  `;
  document.head.appendChild(style);
}

function globalFn(name) {
  const fn = window[name];
  if (typeof fn !== 'function') throw new Error(`缺少名片流程函式：${name}`);
  return fn;
}

function extractLocalization(ocrRes) {
  return ocrRes?.localization || ocrRes?.data?.localization || ocrRes?.cardLocalization || ocrRes?.data?.cardLocalization || null;
}

installManualCropStyles();
window.__A_KAFFIT_CARD_SCANNER_PORT__ = true;
window.__A_KAFFIT_VISION_V3_PRIMARY__ = true;

window.recognizeCard = async function recognizeCardWithAkaffitVisionV3(input) {
  const file = input?.files?.[0];
  if (!file) return;
  input.value = '';

  const showProgress = globalFn('showCardOcrProgress');
  const stage = globalFn('setCardOcrProgressStage');
  const hideProgress = globalFn('hideCardOcrProgress');
  const normalizeOcrCardData = globalFn('normalizeOcrCardData');
  const hasOcrContent = globalFn('hasOcrContent');
  const saveCollectedCardFromOcr = globalFn('saveCollectedCardFromOcr');

  showProgress('A-kaffit Vision V3 名片智慧建立中');
  try {
    if (!window.cardVisionCrop || typeof window.cardVisionCrop.normalizeInput !== 'function' || typeof window.cardVisionCrop.cropDataUrl !== 'function') {
      throw new Error('A-kaffit Vision V3 裁切模組尚未載入');
    }

    stage(10, '正在正規化照片解析度...');
    const workingImage = await window.cardVisionCrop.normalizeInput(file, { maxSide: 2200, maxChars: 1800000 });
    window.lastCardUploadImage = workingImage;

    stage(28, 'AI 正在同一次完成 OCR 與名片四角定位...');
    const ocrRes = await window.fetchAPI('recognizeCardWithGPT4o', {
      base64Image: workingImage,
      deferImageUpload: true
    }, true);
    if (!ocrRes || ocrRes.error) throw new Error(ocrRes?.error || 'AI 辨識失敗');

    const cardData = normalizeOcrCardData(ocrRes);
    if (!hasOcrContent(cardData)) {
      throw new Error('AI 沒有辨識到可用的名片資料，請換一張更清楚的照片');
    }

    const localization = window.cardVisionCrop.normalizeLocalization(extractLocalization(ocrRes));
    if (localization.incomplete) {
      const labels = { left: '左側', right: '右側', top: '上方', bottom: '下方' };
      const clipped = (localization.clippedEdges || []).map(edge => labels[edge] || edge).join('、');
      throw new Error('名片未完整入鏡' + (clipped ? `（缺少：${clipped}）` : '') + '，請稍微拉遠重新拍攝');
    }

    stage(68, 'OCR 完成，正在依 AI 四角座標分離並拉正名片...');
    const cropResult = await window.cardVisionCrop.cropDataUrl(workingImage, localization, {
      maxSide: 2200,
      maxChars: 900000
    });

    if (!cropResult) {
      hideProgress();
      globalFn('openCollectedCardCropperFromDataUrl')(workingImage, ocrRes);
      window.showToast?.('AI 已完成文字辨識；外框信心不足，請只微調名片範圍。確認後不會再次 OCR。', true);
      return;
    }

    console.log('[A-kaffit Vision V3] one-pass OCR + crop', cropResult.method, localization.cropConfidence);
    stage(82, '名片已分離，正在儲存裁切後圖片...');
    await saveCollectedCardFromOcr(ocrRes, cropResult.dataUrl, 'auto');
  } catch (error) {
    hideProgress();
    window.showToast?.(error?.message || '名片建立失敗', true);
  }
};
