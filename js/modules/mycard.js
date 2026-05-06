/* ==================== 我的專屬名片管理 (My E-Card) ==================== */

window.myEcardButtons = [];

window.initMyECard = function() {
  const emptyState = document.getElementById('my-ecard-empty-state');
  const editState = document.getElementById('my-ecard-edit-state');

  // 確保 currentUserCard 已就緒
  if (!window.currentUserCard) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (editState) editState.classList.add('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  if (editState) editState.classList.remove('hidden');

  let cfg = {};
  try { cfg = JSON.parse(window.currentUserCard['自訂名片設定'] || '{}'); } catch(e){}

  let layoutVal = cfg.layoutStyle || cfg.layout || 'landscape';
  let layoutRadio = document.querySelector(`input[name="my-ecard-layout"][value="${layoutVal}"]`);
  if (layoutRadio) layoutRadio.checked = true;

  const imgInput = document.getElementById('my-v1-img-url');
  if (imgInput) imgInput.value = cfg.imgUrl || window.currentUserCard['名片圖檔'] || '';

  window.myEcardButtons = Array.isArray(cfg.buttons) ? cfg.buttons : [];
  window.renderMyV1Buttons();
  window.updateMyECardPreview();
};

window.renderMyV1Buttons = function() {
  const container = document.getElementById('my-v1-buttons-list');
  if (!container) return;

  if (window.myEcardButtons.length === 0) {
    container.innerHTML = '<p class="text-[12px] text-slate-400 pb-2">尚未設定任何按鈕</p>';
  } else {
    container.innerHTML = window.myEcardButtons.map((b, i) => `
      <div class="flex gap-2 items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
        <input type="color" value="${b.c || '#06C755'}" class="w-10 h-10 p-0 cursor-pointer rounded-lg shrink-0 border border-slate-200" onchange="window.myEcardButtons[${i}].c=this.value; window.updateMyECardPreview()">
        <div class="flex-1 flex flex-col gap-1.5">
          <input type="text" value="${window.escapeHTML(b.l || '')}" placeholder="按鈕顯示文字" class="w-full text-[13px] font-bold bg-white border-none outline-none focus:ring-1 focus:ring-blue-500 rounded px-2.5 py-1.5 shadow-sm" oninput="window.myEcardButtons[${i}].l=this.value; window.updateMyECardPreview()">
          <input type="text" value="${window.escapeHTML(b.u || '')}" placeholder="https://..." class="w-full text-[12px] font-mono bg-white border-none outline-none focus:ring-1 focus:ring-blue-500 rounded px-2.5 py-1.5 shadow-sm" oninput="window.myEcardButtons[${i}].u=this.value">
        </div>
        <button onclick="window.myEcardButtons.splice(${i},1); window.renderMyV1Buttons(); window.updateMyECardPreview()" class="text-red-400 bg-red-50 hover:bg-red-100 p-2.5 rounded-lg shrink-0 transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
      </div>
    `).join('');
  }
};

window.addMyV1Button = function() {
  window.myEcardButtons.push({ l: '新按鈕', u: '', c: '#06C755' });
  window.renderMyV1Buttons();
  window.updateMyECardPreview();
};

window.changeMyLayout = function() {
  window.updateMyECardPreview();
};

window.updateMyECardPreview = function() {
  const area = document.getElementById('my-ecard-preview-area');
  if (!area) return;

  const name = window.currentUserCard?.['姓名'] || window.currentUserProfile?.displayName || '姓名';
  const imgUrl = document.getElementById('my-v1-img-url')?.value || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
  
  let desc = window.currentUserCard ? (window.currentUserCard['服務項目'] || window.currentUserCard['職稱'] || window.currentUserCard['公司名稱'] || '') : '';
  desc = desc.replace(/\n/g, '<br>');
  
  let cfg = {};
  try { cfg = JSON.parse(window.currentUserCard?.['自訂名片設定'] || '{}'); } catch(e){}
  
  const color = cfg.descColor || '#666666';
  const align = cfg.descAlign || 'center';

  const layoutStyle = document.querySelector('input[name="my-ecard-layout"]:checked')?.value || 'landscape';
  let ratio = '20/13';
  if (layoutStyle === 'portrait') ratio = '2/3';
  if (layoutStyle === 'square') ratio = '1/1';

  const btnsHtml = window.myEcardButtons.map(b => 
    `<div class="block py-3 rounded-xl text-white text-center text-[14px] font-black mb-2.5 shadow-sm" style="background:${b.c||'#06C755'}">${window.escapeHTML(b.l||'按鈕')}</div>`
  ).join('');

  area.innerHTML = `
    <div class="flex flex-col w-full bg-white pb-6 rounded-b-[24px]">
      <div class="w-full bg-slate-100 bg-cover bg-center shadow-sm" style="aspect-ratio: ${ratio}; background-image:url('${imgUrl}');"></div>
      <div class="p-6 text-center">
        <div class="font-black text-[22px] text-slate-800 mb-2">${window.escapeHTML(name)}</div>
        <div class="text-[14px] leading-relaxed" style="color: ${color}; text-align: ${align};">${desc}</div>
      </div>
      ${btnsHtml ? `<div class="px-6">${btnsHtml}</div>` : ''}
    </div>
  `;
};

window.saveMyECardConfig = async function() {
  if (!window.currentUserCard) return;
  const btn = document.getElementById('btn-save-my-ecard');
  if (btn) {
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
    btn.disabled = true;
  }

  const layoutVal = document.querySelector('input[name="my-ecard-layout"]:checked')?.value || 'landscape';
  let cfg = {};
  try { cfg = JSON.parse(window.currentUserCard['自訂名片設定'] || '{}'); } catch(e){}
  
  cfg.layoutStyle = layoutVal;
  cfg.imgUrl = document.getElementById('my-v1-img-url')?.value || '';
  cfg.buttons = window.myEcardButtons;

  const payloadData = {
    '名片圖檔': cfg.imgUrl,
    '自訂名片設定': JSON.stringify(cfg)
  };

  try {
    const res = await window.fetchAPI('updateCard', { rowId: window.currentUserCard.rowId, data: payloadData }, false);
    if (res) {
      window.showToast('✅ 專屬名片設定已儲存');
      window.currentUserCard['自訂名片設定'] = payloadData['自訂名片設定'];
      window.currentUserCard['名片圖檔'] = payloadData['名片圖檔'];
      
      if (window.allCards) {
        const match = window.allCards.find(c => String(c.rowId) === String(window.currentUserCard.rowId));
        if (match) {
           match['自訂名片設定'] = payloadData['自訂名片設定'];
           match['名片圖檔'] = payloadData['名片圖檔'];
        }
      }
    }
  } catch(e) {
    window.showToast('⚠️ 儲存失敗: ' + e.message, true);
  } finally {
    if (btn) {
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> 儲存名片設定';
      btn.disabled = false;
    }
  }
};

window.shareMyCard = async function(btn) {
  if (!window.currentUserCard) {
    window.showToast('尚未建立專屬名片，為您導向設定頁面', true);
    window.goPage('admin-settings');
    const detailEl = document.getElementById('details-my-ecard');
    if (detailEl) detailEl.open = true;
    setTimeout(() => detailEl?.scrollIntoView({behavior: 'smooth'}), 300);
    return;
  }
  const oriHtml = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-4xl text-[#06C755]">refresh</span><span class="font-bold text-slate-700">準備中...</span>';
  btn.disabled = true;
  try {
    let config = {};
    try { config = JSON.parse(window.currentUserCard['自訂名片設定']); } catch(e){}
    const flexMsg = await window.fetchAPI('buildFlexMessage', {
      card: window.currentUserCard,
      config: config,
      referrerId: window.currentUserProfile.userId,
      networkId: window.currentNetworkId,
      liffId: window.LIFF_ID
    }, true);
    if (flexMsg) {
      await window.triggerFlexSharing(flexMsg, "您收到一張數位名片");
    }
  } catch(e) {
    window.showToast('發送失敗: ' + e.message, true);
  } finally {
    if (btn) { btn.innerHTML = oriHtml; btn.disabled = false; }
  }
};

window.showMyQRCode = function() {
  if (!window.currentUserCard) {
    window.showToast('請先建立專屬名片', true);
    return;
  }
  const modal = document.getElementById('qr-modal');
  const img = document.getElementById('qr-code-img');
  const loading = document.getElementById('qr-loading');

  modal.classList.remove('hidden');
  img.classList.add('hidden');
  loading.classList.remove('hidden');

  let badgeUrl = 'https://liff.line.me/' + window.LIFF_ID + '?shareCardId=' + window.currentUserCard.rowId;
  badgeUrl += '&ref=' + window.currentUserProfile.userId;
  badgeUrl += '&net=' + window.currentNetworkId;

  const qrUrl = 'https://quickchart.io/qr?text=' + encodeURIComponent(badgeUrl) + '&size=300&margin=2';

  img.onload = () => {
    loading.classList.add('hidden');
    img.classList.remove('hidden');
  };
  img.src = qrUrl;
};
