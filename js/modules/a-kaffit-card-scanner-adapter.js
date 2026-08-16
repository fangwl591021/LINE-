import { processBusinessCardImage } from './a-kaffit-card-scanner/card-scanner-v2-gate.js';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('名片圖片讀取失敗'));
    reader.readAsDataURL(file);
  });
}

function callGlobal(name, ...args) {
  const fn = window[name];
  if (typeof fn !== 'function') throw new Error(`缺少名片流程函式：${name}`);
  return fn(...args);
}

window.__A_KAFFIT_CARD_SCANNER_PORT__ = true;
window.__A_KAFFIT_PROCESS_BUSINESS_CARD_IMAGE__ = processBusinessCardImage;

window.recognizeCard = async function recognizeCardWithAkaffitScanner(input) {
  const file = input?.files?.[0];
  if (!file) return;
  input.value = '';

  try {
    callGlobal('showCardOcrProgress', 'A-kaffit 名片智慧建立中');
    callGlobal('setCardOcrProgressStage', 8, '正在使用 A-kaffit 掃描器檢查名片四邊與畫質...');

    const processed = await processBusinessCardImage(file);
    if (!processed?.file) throw new Error('A-kaffit 名片掃描未產生可用圖片');

    callGlobal('setCardOcrProgressStage', 38, processed?.metadata?.processing?.manualCorrection
      ? '人工裁切完成，準備進行一次 OCR...'
      : 'A-kaffit 已完成名片分離與透視校正，準備進行一次 OCR...');

    const processedDataUrl = await fileToDataUrl(processed.file);
    window.lastCardUploadImage = processedDataUrl;

    const ocrRes = await window.fetchAPI('recognizeCardWithGPT4o', {
      base64Image: processedDataUrl,
      deferImageUpload: true
    }, true);
    if (!ocrRes || ocrRes.error) throw new Error(ocrRes?.error || 'AI 辨識失敗');

    const cardData = callGlobal('normalizeOcrCardData', ocrRes);
    if (!callGlobal('hasOcrContent', cardData)) {
      throw new Error('AI 沒有辨識到可用的名片資料，請換一張更清楚的照片');
    }

    callGlobal('setCardOcrProgressStage', 76, 'OCR 完成，正在儲存 A-kaffit 裁切後的名片圖片...');
    await callGlobal(
      'saveCollectedCardFromOcr',
      ocrRes,
      processedDataUrl,
      processed?.metadata?.processing?.manualCorrection ? 'manual' : 'auto'
    );
  } catch (error) {
    callGlobal('hideCardOcrProgress');
    const message = error?.message || '名片建立失敗';
    window.showToast?.(message, true);
  }
};
