// ... existing code ...
/* ==================== 我的專屬名片管理 (My E-Card) ==================== */

window.myEcardButtons = [];
window.myEcardImgs = { landscape: '', portrait: '', square: '' };

window.initMyECard = function() {
  const emptyState = document.getElementById('my-ecard-empty-state');
// ... existing code ...
  if (emptyState) emptyState.classList.add('hidden');
  if (editState) editState.classList.remove('hidden');

  let cfg = {};
  try { cfg = JSON.parse(window.currentUserCard['自訂名片設定'] || '{}'); } catch(e){}

  window.myEcardImgs = {
    landscape: cfg.imgUrl || window.currentUserCard['名片圖檔'] || '',
    portrait: cfg.imgUrlPortrait || '',
    square: cfg.imgUrlSquare || ''
  };

  let layoutVal = cfg.layoutStyle || cfg.layout || 'landscape';
  let layoutRadio = document.querySelector(`input[name="my-ecard-layout"][value="${layoutVal}"]`);
  if (layoutRadio) layoutRadio.checked = true;

  const imgInput = document.getElementById('my-v1-img-url');
  if (imgInput) {
    imgInput.value = window.myEcardImgs[layoutVal];
    imgInput.oninput = function() {
       window.myEcardImgs[layoutVal] = this.value;
       window.updateMyECardPreview();
    };
  }

  window.myEcardButtons = Array.isArray(cfg.buttons) ? cfg.buttons : [];
// ... existing code ...
window.addMyV1Button = function() {
  window.myEcardButtons.push({ l: '新按鈕', u: '', c: '#06C755' });
  window.renderMyV1Buttons();
  window.updateMyECardPreview();
};

window.changeMyLayout = function() {
  const layoutStyle = document.querySelector('input[name="my-ecard-layout"]:checked')?.value || 'landscape';
  const imgInput = document.getElementById('my-v1-img-url');
  if (imgInput) {
    imgInput.value = window.myEcardImgs[layoutStyle] || '';
    imgInput.oninput = function() {
       window.myEcardImgs[layoutStyle] = this.value;
       window.updateMyECardPreview();
    };
  }
  window.updateMyECardPreview();
};

window.setMyUploadImage = function(url, ratio) {
    const layoutStyle = document.querySelector('input[name="my-ecard-layout"]:checked')?.value || 'landscape';
    window.myEcardImgs[layoutStyle] = url;
    const imgInput = document.getElementById('my-v1-img-url');
    if (imgInput) imgInput.value = url;
    window.updateMyECardPreview();
};

window.updateMyECardPreview = function() {
  const area = document.getElementById('my-ecard-preview-area');
  if (!area) return;

  const layoutStyle = document.querySelector('input[name="my-ecard-layout"]:checked')?.value || 'landscape';
  const name = window.currentUserCard?.['姓名'] || window.currentUserProfile?.displayName || '姓名';
  const imgUrl = window.myEcardImgs[layoutStyle] || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
  
  let desc = window.currentUserCard ? (window.currentUserCard['服務項目'] || window.currentUserCard['職稱'] || window.currentUserCard['公司名稱'] || '') : '';
// ... existing code ...
  const color = cfg.descColor || '#666666';
  const align = cfg.descAlign || 'center';

  let ratio = '20/13';
  if (layoutStyle === 'portrait') ratio = '2/3';
  if (layoutStyle === 'square') ratio = '1/1';
// ... existing code ...
window.saveMyECardConfig = async function() {
  if (!window.currentUserCard) return;
  const btn = document.getElementById('btn-save-my-ecard');
// ... existing code ...
  const layoutVal = document.querySelector('input[name="my-ecard-layout"]:checked')?.value || 'landscape';
  let cfg = {};
  try { cfg = JSON.parse(window.currentUserCard['自訂名片設定'] || '{}'); } catch(e){}
  
  cfg.layoutStyle = layoutVal;
  cfg.imgUrl = window.myEcardImgs.landscape;
  cfg.imgUrlPortrait = window.myEcardImgs.portrait;
  cfg.imgUrlSquare = window.myEcardImgs.square;
  cfg.buttons = window.myEcardButtons;

  const payloadData = {
    '名片圖檔': cfg.imgUrl,
    '自訂名片設定': JSON.stringify(cfg)
  };
// ... existing code ...
