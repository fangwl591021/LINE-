/* ==================== 名片庫模組 (Cards) ==================== */

window.renderCardList = function(cards) {
  const list = document.getElementById('card-list');
  if (!cards || cards.length === 0) {
    list.innerHTML = '<div class="bg-white p-8 rounded-3xl text-center text-slate-400 border border-slate-100 shadow-sm"><span class="material-symbols-outlined text-4xl mb-2 text-slate-300">search_off</span><p class="font-bold text-[13px]">目前沒有找到任何名片</p></div>';
    return;
  }

  const html = cards.map(c => {
    let rawService = c['服務項目'] || c['職稱'] || c['公司名稱'] || '';
    let serviceStr = String(rawService).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ');
    if (serviceStr.length > 25) serviceStr = serviceStr.substring(0, 25) + '...';
    
    let tagHtml = '';
    if (c['標籤']) {
      tagHtml = String(c['標籤']).split(' ').map(t => `<span class="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold mr-1">${window.escapeHTML(t)}</span>`).join('');
    }

    let imgHtml = '';
    let cfg = {};
    try { cfg = JSON.parse(c['自訂名片設定'] || '{}'); } catch(e){}
    let imgUrl = cfg.imgUrl || c['名片圖檔'] || '';
    if (imgUrl) {
      imgHtml = `<img src="${window.escapeHTML(imgUrl)}" class="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-100 shadow-sm">`;
    } else {
      imgHtml = `<div class="w-12 h-12 rounded-xl bg-slate-100 text-slate-300 flex items-center justify-center shrink-0 shadow-sm"><span class="material-symbols-outlined">person</span></div>`;
    }

    return `
      <div class="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm active:scale-[0.98] transition-all cursor-pointer flex gap-3 items-center" onclick="window.openCardDetailByRowId('${c.rowId}')">
        ${imgHtml}
        <div class="flex-1 min-w-0">
          <div class="font-black text-slate-800 text-[16px] leading-tight flex items-center gap-1">
             ${window.escapeHTML(c['姓名'] || '未知')}
             ${c['LINE ID'] === currentUserProfile.userId ? '<span class="bg-primary-light text-primary text-[9px] px-1.5 py-0.5 rounded font-black tracking-wider">我的</span>' : ''}
          </div>
          <div class="text-[12px] text-slate-500 font-medium truncate mt-0.5">${serviceStr}</div>
          ${tagHtml ? `<div class="mt-1.5 truncate">${tagHtml}</div>` : ''}
        </div>
        <span class="material-symbols-outlined text-slate-300 text-[20px] shrink-0">chevron_right</span>
      </div>
    `;
  }).join('');
  list.innerHTML = html;
};

window.filterCards = function() {
  const keyword = document.getElementById('search-card-input').value.toLowerCase().trim();
  if (!keyword) {
    window.renderCardList(allCards);
    return;
  }
  const filtered = allCards.filter(c => {
    const str = [c['姓名'], c['公司名稱'], c['手機號碼'], c['公司電話'], c['標籤']].join(' ').toLowerCase();
    return str.includes(keyword);
  });
  window.renderCardList(filtered);
};

window.openCardDetailByRowId = function(rowId) {
  const c = allCards.find(card => String(card.rowId) === String(rowId));
  if (c) window.openCardDetail(c);
};

// ✅ 嚴格權限鎖定機制
window.openCardDetail = function(card) {
  if (!card) return;
  currentCard = card;
  
  // 鎖定判斷：是否為名片擁有人，或是系統總管
  const isOwner = (card['LINE ID'] === currentUserProfile.userId);
  const isAdminOrStore = (userRole === 'admin' || userRole === 'store');
  const canEdit = isOwner || isAdminOrStore;

  // 根據權限顯示/隱藏 Tab
  const tabEdit = document.getElementById('tab-edit');
  const tabEcard = document.getElementById('tab-ecard');
  const btnDelete = document.getElementById('btn-delete-card');

  if (canEdit) {
    tabEdit.classList.remove('hidden');
    tabEcard.classList.remove('hidden');
    if (btnDelete) btnDelete.classList.remove('hidden');
  } else {
    // 權限不足，強制鎖定只能看第一頁「聯絡資料」
    tabEdit.classList.add('hidden');
    tabEcard.classList.add('hidden');
    if (btnDelete) btnDelete.classList.add('hidden');
    window.switchTab('info'); 
  }

  // 1. 填寫聯絡資料 Tab
  let infoHtml = '';
  const skipFields = ['rowId', 'LINE ID', '時間戳', '名片圖檔', '自訂名片設定', '推薦人', '歸屬網'];
  
  const displayFields = [
    { label: '公司名稱', icon: 'business', key: '公司名稱' },
    { label: '職稱', icon: 'badge', key: '職稱' },
    { label: '手機號碼', icon: 'smartphone', key: '手機號碼', isPhone: true },
    { label: '公司電話', icon: 'call', key: '公司電話', isPhone: true },
    { label: '電子郵件', icon: 'mail', key: '電子郵件' },
    { label: '公司網址', icon: 'language', key: '公司網址' },
    { label: '公司地址', icon: 'location_on', key: '公司地址' },
    { label: '服務項目', icon: 'design_services', key: '服務項目' },
    { label: '標籤', icon: 'label', key: '標籤' },
  ];

  displayFields.forEach(f => {
    let val = card[f.key];
    if (val) {
      let displayVal = window.escapeHTML(val);
      if (f.key === '服務項目') displayVal = displayVal.replace(/\n/g, '<br>');
      if (f.key === '標籤') displayVal = val.split(' ').map(t => `<span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold text-[11px] mr-1">${window.escapeHTML(t)}</span>`).join('');
      
      let actionHtml = '';
      if (f.isPhone) actionHtml = `<a href="tel:${val.replace(/[^0-9+]/g, '')}" class="text-[#06C755] bg-green-50 p-1.5 rounded-lg active:scale-90 transition-transform"><span class="material-symbols-outlined text-[18px]">call</span></a>`;
      else if (f.key === '公司地址') actionHtml = `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(val)}" target="_blank" class="text-blue-500 bg-blue-50 p-1.5 rounded-lg active:scale-90 transition-transform"><span class="material-symbols-outlined text-[18px]">map</span></a>`;
      else if (f.key === '電子郵件') actionHtml = `<a href="mailto:${val}" class="text-orange-500 bg-orange-50 p-1.5 rounded-lg active:scale-90 transition-transform"><span class="material-symbols-outlined text-[18px]">mail</span></a>`;

      infoHtml += `
        <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex gap-3">
          <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shrink-0 shadow-sm border border-slate-100">
            <span class="material-symbols-outlined text-[16px]">${f.icon}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-bold text-slate-400 mb-0.5">${f.label}</p>
            <p class="text-[14px] text-slate-700 font-medium leading-relaxed">${displayVal}</p>
          </div>
          ${actionHtml}
        </div>
      `;
    }
  });
  
  if (!infoHtml) infoHtml = '<div class="text-center text-slate-400 py-8 text-sm">無詳細資料</div>';
  document.getElementById('detail-fields').innerHTML = infoHtml;

  // 2. 如果有權限，填寫編輯 Tab
  if (canEdit) {
    const editableFields = ['姓名','英文名','職稱','部門','公司名稱','統一編號','手機號碼','公司電話','分機','傳真','電子郵件','公司網址','社群帳號','公司地址','服務項目','建檔人/備註'];
    editableFields.forEach(f => {
      const el = document.getElementById('edit-' + f);
      if (el) el.value = card[f] || '';
    });

    let cfg = {};
    try { cfg = JSON.parse(card['自訂名片設定'] || '{}'); } catch(e){}
    v1Buttons = cfg.buttons || [];
    window.currentDescAlign = cfg.descAlign || 'center';
    const colorInput = document.getElementById('edit-desc-color');
    if(colorInput) colorInput.value = cfg.descColor || '#666666';

    window.setDescAlign(window.currentDescAlign);
    window.renderECardSettings();

    // 如果沒有自訂名片設定，給它預設值以便預覽
    if (!cfg.layoutStyle) {
      document.getElementById('v1-img-url').value = card['名片圖檔'] || '';
      const layoutRadio = document.querySelector(`input[name="ecard-layout"][value="landscape"]`);
      if (layoutRadio) layoutRadio.checked = true;
    }

    // 觸發預覽更新
    window.currentLoadedCardId = null; // 重置，讓 updateECardPreview 強制重繪
    window.updateECardPreview();
  }

  // 是否顯示「發送認領」按鈕
  const btnClaim = document.getElementById('btn-send-claim');
  if (btnClaim) {
    if (card['LINE ID']) {
      btnClaim.classList.add('hidden'); // 已被認領，隱藏按鈕
    } else {
      btnClaim.classList.remove('hidden'); // 未被認領，可發送邀請
    }
  }

  window.goPage('card-detail');
};

window.switchTab = function(tab) {
  // 如果要切換到編輯/數位名片，再檢查一次權限
  if (tab !== 'info') {
    const isOwner = (currentCard['LINE ID'] === currentUserProfile.userId);
    const isAdminOrStore = (userRole === 'admin' || userRole === 'store');
    if (!isOwner && !isAdminOrStore) {
      window.showToast('權限不足，無法編輯此名片', true);
      return;
    }
  }

  ['info', 'edit', 'ecard'].forEach(t => {
    document.getElementById('tab-content-' + t).classList.add('hidden');
    const btn = document.getElementById('tab-' + t);
    btn.classList.remove('text-blue-600', 'border-blue-600');
    btn.classList.add('text-slate-400', 'border-transparent');
  });

  document.getElementById('tab-content-' + tab).classList.remove('hidden');
  const activeBtn = document.getElementById('tab-' + tab);
  activeBtn.classList.remove('text-slate-400', 'border-transparent');
  activeBtn.classList.add('text-blue-600', 'border-blue-600');
};

window.saveCardEdit = async function() {
  if (!currentCard) return;
  const btn = document.getElementById('btn-save');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  btn.disabled = true;

  const editableFields = ['姓名','英文名','職稱','部門','公司名稱','統一編號','手機號碼','公司電話','分機','傳真','電子郵件','公司網址','社群帳號','公司地址','服務項目','建檔人/備註'];
  let payloadData = {};
  editableFields.forEach(f => {
    const el = document.getElementById('edit-' + f);
    if (el) payloadData[f] = el.value.trim();
  });

  try {
    const res = await window.fetchAPI('updateCard', { rowId: currentCard.rowId, data: payloadData }, true);
    if (res) {
      window.showToast('✅ 變更已儲存');
      Object.keys(payloadData).forEach(k => { currentCard[k] = payloadData[k]; });
      
      if (typeof allCards !== 'undefined') {
        const match = allCards.find(c => String(c.rowId) === String(currentCard.rowId));
        if (match) {
           Object.keys(payloadData).forEach(k => { match[k] = payloadData[k]; });
        }
      }
      if (typeof currentUserCard !== 'undefined' && currentUserCard && String(currentUserCard.rowId) === String(currentCard.rowId)) {
         Object.keys(payloadData).forEach(k => { currentUserCard[k] = payloadData[k]; });
      }

      // 儲存文字資料後，順便觸發右邊的預覽更新
      if (typeof window.updateECardPreview === 'function') window.updateECardPreview();
      
      // 切回 info Tab 以呈現最新資料
      window.openCardDetail(currentCard); 
    }
  } catch(e) {
    window.showToast('⚠️ 儲存失敗:' + e.message, true);
  } finally {
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> 儲存變更';
    btn.disabled = false;
  }
};

window.deleteCard = async function() {
  if (!currentCard) return;
  if (!confirm("確定要刪除這張名片嗎？此操作無法還原！")) return;
  
  try {
    const res = await window.fetchAPI('deleteCard', { rowId: currentCard.rowId }, true);
    if (res) {
      window.showToast('✅ 已刪除名片');
      if (typeof allCards !== 'undefined') {
        const idx = allCards.findIndex(c => String(c.rowId) === String(currentCard.rowId));
        if (idx !== -1) {
          allCards.splice(idx, 1);
          window.renderCardList(allCards);
        }
      }
      window.goPage('card');
    }
  } catch(e) {
    window.showToast('⚠️ 刪除失敗:' + e.message, true);
  }
};
