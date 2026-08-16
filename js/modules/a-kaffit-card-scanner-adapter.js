import { processBusinessCardImage } from './a-kaffit-card-scanner/card-scanner-v2-gate.js';

function installManualCropStyles() {
  if (document.getElementById('a-kaffit-card-scanner-styles')) return;
  const style = document.createElement('style');
  style.id = 'a-kaffit-card-scanner-styles';
  style.textContent = `
    .card-cropper-modal{display:none;position:fixed;inset:0;z-index:12000;background:rgba(2,6,23,.72);backdrop-filter:blur(5px);padding:16px;align-items:center;justify-content:center}
    .card-cropper-modal.open{display:flex}
    .card-cropper-sheet{width:min(100%,520px);max-height:92vh;overflow:auto;background:#fff;border-radius:24px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.32)}
    .card-cropper-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;font-size:18px;font-weight:900;color:#0f172a}
    .card-cropper-head button{border:0;background:#f1f5f9;border-radius:999px;width:38px;height:38px;font-size:24px;line-height:1;color:#334155}
    .card-cropper-stage{height:min(58vh,560px);background:#0f172a;border-radius:16px;overflow:hidden}
    .card-cropper-stage img{display:block;max-width:100%;max-height:100%}
    .card-cropper-tools,.card-cropper-actions{display:grid;gap:8px;margin-top:12px}
    .card-cropper-tools{grid-template-columns:repeat(4,minmax(0,1fr))}
    .card-cropper-actions{grid-template-columns:1fr 2fr}
    .card-cropper-tools button,.card-cropper-actions button{min-height:46px;border:0;border-radius:14px;font-weight:900}
    .card-cropper-tools button{background:#f1f5f9;color:#0f172a}
    .card-cropper-actions .btn{background:#06c755;color:#fff}
    .card-cropper-actions .btn.alt{background:#e2e8f0;color:#0f172a}
  `;
  document.head.appendChild(style);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('名片圖片讀取失敗'));
    reader.readAsDataURL(file);
  });
}

function globalFn(name) {
  const fn = window[name];
  if (typeof fn !== 'function') throw new Error(`缺少名片流程函式：${name}`);
  return fn;
}

installManualCropStyles();
window.__A_KAFFIT_CARD_SCANNER_PORT__ = true;
window.__A_KAFFIT_PROCESS_BUSINESS_CARD_IMAGE__ = processBusinessCardImage;

window.recognizeCard = async function recognizeCardWithAkaffitScanner(input) {
  const file = input?.files?.[0];
  if (!file) return;
  input.value = '';

  const showProgress = globalFn('showCardOcrProgress');
  const stage = globalFn('setCardOcrProgressStage');
  const hideProgress = globalFn('hideCardOcrProgress');

  showProgress('A-kaffit 名片智慧建立中');
  try {
    stage(8, '正在使用 A-kaffit 掃描器檢查名片四邊與畫質...');

    const processed = await processBusinessCardImage(file);
    if (!processed?.file) throw new Error('A-kaffit 名片掃描未產生可用圖片');

    stage(38, processed?.metadata?.processing?.manualCorrection
      ? '人工裁切完成，準備進行一次 OCR...'
      : 'A-kaffit 已完成名片分離與透視校正，準備進行一次 OCR...');

    const processedDataUrl = await fileToDataUrl(processed.file);
    window.lastCardUploadImage = processedDataUrl;

    const ocrRes = await window.fetchAPI('recognizeCardWithGPT4o', {
      base64Image: processedDataUrl,
      deferImageUpload: true
    }, true);
    if (!ocrRes || ocrRes.error) throw new Error(ocrRes?.error || 'AI 辨識失敗');

    const cardData = globalFn('normalizeOcrCardData')(ocrRes);
    if (!globalFn('hasOcrContent')(cardData)) {
      throw new Error('AI 沒有辨識到可用的名片資料，請換一張更清楚的照片');
    }

    stage(76, 'OCR 完成，正在儲存 A-kaffit 裁切後的名片圖片...');
    await globalFn('saveCollectedCardFromOcr')(
      ocrRes,
      processedDataUrl,
      processed?.metadata?.processing?.manualCorrection ? 'manual' : 'auto'
    );
  } catch (error) {
    hideProgress();
    window.showToast?.(error?.message || '名片建立失敗', true);
  }
};
