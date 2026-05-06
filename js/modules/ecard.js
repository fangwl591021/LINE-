// ... existing code ...
// ✅ 宣告全域變數存放當前編輯的按鈕
window.currentEcardButtons = [];
window.currentEcardImgs = { landscape: '', portrait: '', square: '' };
window.currentEcardRatios = { landscape: '20:13', portrait: '2:3', square: '1:1' };

/**
 * 載入名片設定到 UI (請確保在 cards.js 的 openCardDetail 中呼叫此函數)
 * 範例呼叫: window.initECardSettings(cardData);
 */
window.initECardSettings = function(card) {
// ... existing code ...
  window.currentEcardImgs = {
    landscape: cfg.imgUrl || card['名片圖檔'] || '',
    portrait: cfg.imgUrlPortrait || '',
    square: cfg.imgUrlSquare || ''
  };
  
  window.currentEcardRatios = {
    landscape: cfg.imgRatioLandscape || '20:13',
    portrait: cfg.imgRatioPortrait || '2:3',
    square: cfg.imgRatioSquare || '1:1'
  };

  // 2. 版型設定 (優先取 JSON，預設 landscape)
// ... existing code ...
window.setOtherUploadImage = function(url, ratio) {
    const layoutStyle = document.querySelector('input[name="ecard-layout"]:checked')?.value || 'landscape';
    window.currentEcardImgs[layoutStyle] = url;
    if (ratio) window.currentEcardRatios[layoutStyle] = ratio.replace(':', '/');
    const imgInput = document.getElementById('v1-img-url');
    if (imgInput) imgInput.value = url;
    window.updateECardPreview();
};

/**
 * 渲染預覽畫面 (完全對應 index.html 的欄位)
 */
window.updateECardPreview = function() {
// ... existing code ...
  const layoutStyle = document.querySelector('input[name="ecard-layout"]:checked')?.value || 'landscape';
  let align = 'center';
  
  if (document.getElementById('align-start')?.classList.contains('bg-white')) align = 'left';
  if (document.getElementById('align-end')?.classList.contains('bg-white')) align = 'right';
  if (window.currentDescAlign === 'start') align = 'left';
  if (window.currentDescAlign === 'end') align = 'right';

  let ratio = '20/13';
  if (layoutStyle === 'portrait') ratio = window.currentEcardRatios.portrait.replace(':', '/') || '2/3';
  if (layoutStyle === 'square') ratio = '1/1';
  if (layoutStyle === 'landscape') ratio = '20/13';

  const btnsHtml = window.currentEcardButtons.map(b => 
// ... existing code ...
window.saveECardConfig = async function() {
  if (!window.currentCard) return;
  const btn = document.getElementById('btn-ecard-save');
// ... existing code ...
  const layoutVal = document.querySelector('input[name="ecard-layout"]:checked')?.value || 'landscape';
  
  const cfg = {
    layoutStyle: layoutVal,
    imgUrl: window.currentEcardImgs.landscape,
    imgUrlPortrait: window.currentEcardImgs.portrait,
    imgUrlSquare: window.currentEcardImgs.square,
    imgRatioLandscape: '20:13',
    imgRatioPortrait: window.currentEcardRatios.portrait.replace('/', ':'),
    imgRatioSquare: '1:1',
    desc: document.getElementById('edit-服務項目')?.value || '',
// ... existing code ...
window.shareECardToLine = async function(btnId) {
  if (!window.currentCard) {
// ... existing code ...
  try {
    const layoutVal = document.querySelector('input[name="ecard-layout"]:checked')?.value || 'landscape';
    const cfg = {
      layoutStyle: layoutVal,
      imgUrl: window.currentEcardImgs.landscape || window.currentCard['名片圖檔'] || '',
      imgUrlPortrait: window.currentEcardImgs.portrait,
      imgUrlSquare: window.currentEcardImgs.square,
      imgRatioLandscape: '20:13',
      imgRatioPortrait: window.currentEcardRatios.portrait.replace('/', ':'),
      imgRatioSquare: '1:1',
      desc: document.getElementById('edit-服務項目')?.value || window.currentCard['服務項目'] || '',
// ... existing code ...
