/* ==================== 名片庫模組 ==================== */

// 由 ID 開啟名片詳細頁
window.openCardDetailById = function(rowId) {
  const card = allCards.find(c => String(c.rowId) === String(rowId));
  if (card) window.openCardDetail(card);
};

// 開啟名片詳細頁
window.openCardDetail = function(card) {
  currentCard = card;
  const fields = [
    { label: '姓名', key: '姓名' }, { label: '英文名', key: '英文名' },
    { label: '職稱', key: '職稱' }, { label: '公司', key: '公司名稱' },
    { label: '手機', key: '手機號碼' }, { label: '公司電話', key: '公司電話' },
    { label: 'Email', key: '電子郵件' }, { label: '網址', key: '公司網址' },
    { label: '地址', key: '公司地址' }, { label: '部門', key: '部門' },
    { label: '統編', key: '統一編號' }, { label: '分機', key: '分機' },
    { label: '傳真', key: '傳真' }, { label: '社群', key: '社群帳號' },
    { label: '服務項目', key: '服務項目' }, { label: '備註', key: '建檔人/備註' }
  ];

  document.getElementById('detail-fields').innerHTML = fields
    .filter(f => card[f.key] !== undefined && card[f.key] !== null && card[f.key] !== '')
    .map(f => {
      const val = window.escapeJS(String(card[f.key]).replaceAll(String.fromCharCode(8203), '').replaceAll("'", ""));
      if (!val) return '';
      const isLink = f.key === '公司網址' || f.key === '電子郵件';
      const href = f.key === '電子郵件' ? 'mailto:' + val : (val.startsWith('http') ? val : 'https://' + val);
      const valueHtml = isLink
        ? '<a href="' + href + '" class="text-blue-500 font-bold underline truncate block">' + val + '</a>'
        : '<span class="font-medium text-slate-700 break-all">' + val + '</span>';
      return '<div class="bg-slate-50 p-3 rounded-xl flex flex-col gap-1 border border-slate-100"><span class="text-[11px] font-black text-slate-400 uppercase tracking-wide">' + f.label + '</span>' + valueHtml + '</div>';
    }).join('') || '<div class="text-center py-6 text-slate-400 font-medium">尚無資料,請點擊「編輯內容」補充</div>';

  fields.forEach(f => {
    const el = document.getElementById('edit-' + f.key);
    if (el) el.value = String(card[f.key] || '').replaceAll(String.fromCharCode(8203), '').replaceAll("'", "");
  });

  try {
    const cfg = card['自訂名片設定'] ? JSON.parse(card['自訂名片設定']) : {};
    currentECardStyle = 'v1';
    v1Buttons = cfg.buttons || [{l:'加為好友', u:'', c:'#06C755'}];
    document.getElementById('v1-img-url').value = cfg.imgUrl || card['名片圖檔'] || '';

    window.setDescAlign(cfg.descAlign || 'center');
    const colorInput = document.getElementById('edit-desc-color');
    if (colorInput) colorInput.value = cfg.descColor || '#666666';
  } catch(e) {
    currentECardStyle = 'v1';
    v1Buttons = [{l:'加為好友', u:'', c:'#06C755'}];
    document.getElementById('v1-img-url').value = card['名片圖檔'] || '';
    window.setDescAlign('center');
    const colorInput = document.getElementById('edit-desc-color');
    if (colorInput) colorInput.value = '#666666';
  }

  window.switchTab('info');
  window.goPage('card-detail');
};

// 儲存名片編輯
window.saveCardEdit = async function() {
  const btn = document.getElementById('btn-save');
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
  btn.disabled = true;
  const fields = ['姓名','英文名','職稱','部門','公司名稱','統一編號','手機號碼','公司電話','分機','傳真','電子郵件','公司網址','社群帳號','公司地址','服務項目','建檔人/備註'];
  const updated = { ...currentCard };
  fields.forEach(f => {
    const el = document.getElementById('edit-' + f);
    if (el) updated[f] = el.value;
  });

  let cfg = {};
  try { cfg = JSON.parse(currentCard['自訂名片設定'] || '{}'); } catch(e){}
  cfg.descAlign = window.currentDescAlign;
  const colorInput = document.getElementById('edit-desc-color');
  cfg.descColor = colorInput ? colorInput.value : '#666666';
  updated['自訂名片設定'] = JSON.stringify(cfg);

  try {
    await window.fetchAPI('updateCard', { rowId: currentCard.rowId, data: updated }, true);
    currentCard = { ...currentCard, ...updated };
    window.showToast('✅ 資料已更新！');

    if (currentUserProfile && currentUserCard && currentCard.rowId === currentUserCard.rowId) {
      const newName = updated['姓名'] || '';
      const newPhone = updated['手機號碼'] || '';
      if (newName !== currentUser?.name || newPhone !== currentUser?.phone) {
        window.fetchAPI('updateUserProfile', {
          userId: currentUserProfile.userId,
          data: { '姓名': newName, '手機': newPhone }
        }, true);
        if (currentUser) {
          currentUser.name = newName;
          currentUser.phone = newPhone;
          const elUserName = document.getElementById('user-name');
          if (elUserName) elUserName.textContent = '歡迎回來,' + newName;
        }
      }
    }

    window.openCardDetail(currentCard);
    await window.loadAllData();
  } catch(e) {
    window.showToast('⚠️ 儲存失敗:' + e.message, true);
  } finally {
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> 儲存變更';
    btn.disabled = false;
  }
};

// 刪除名片
window.deleteCard = async function() {
  if (!confirm('確定要永久刪除這張名片嗎？')) return;
  try {
    await window.fetchAPI('deleteCard', { rowId: currentCard.rowId }, true);
    window.showToast('🗑 名片已刪除');
    await window.loadAllData();
    window.goPage('card');
  } catch(e) {
    window.showToast('⚠️ 刪除失敗:' + e.message, true);
  }
};

// 渲染名片列表
window.renderCardList = function(cards) {
  const container = document.getElementById('card-list');
  if (!container) return;

  container.innerHTML = cards.length === 0
    ? '<div class="text-center py-10 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200"><span class="material-symbols-outlined text-4xl text-slate-300 mb-2">inventory_2</span><p class="text-slate-400 font-bold text-sm">找不到名片</p></div>'
    : cards.map((c, i) =>
      '<div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between cursor-pointer active:bg-slate-50 transition-colors mb-3 animate-in fade-in" style="animation-delay: ' + (i*30) + 'ms" onclick="window.openCardDetailById(\'' + window.escapeJS(c.rowId) + '\')">' +
        '<div class="flex items-center gap-3">' +
          '<div class="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-lg shrink-0 border border-blue-100">' + (window.escapeJS(c['姓名']?.[0]) || '未') + '</div>' +
          '<div>' +
            '<p class="font-black text-slate-800">' + window.escapeJS(c['姓名']||'未知') + '</p>' +
            '<p class="text-[12px] text-slate-500 font-medium">' + window.escapeJS(c['公司名稱']||'自由工作者') + (c['職稱'] ? ' · ' + window.escapeJS(c['職稱']) : '') + '</p>' +
          '</div>' +
        '</div>' +
        '<span class="material-symbols-outlined text-slate-300">chevron_right</span>' +
      '</div>'
    ).join('');
};

// 名片搜尋
window.filterCards = function() {
  const query = document.getElementById('search-card-input').value.toLowerCase().trim();
  if (!query) {
    window.renderCardList(allCards);
    return;
  }
  const filtered = allCards.filter(c => {
    const name = String(c['姓名'] || '').toLowerCase();
    const comp = String(c['公司名稱'] || '').toLowerCase();
    const phone1 = String(c['手機號碼'] || '').toLowerCase();
    const phone2 = String(c['公司電話'] || '').toLowerCase();
    const title = String(c['職稱'] || '').toLowerCase();
    return name.includes(query) || comp.includes(query) || phone1.includes(query) || phone2.includes(query) || title.includes(query);
  });
  window.renderCardList(filtered);
};

// 載入所有名片資料
window.loadAllData = async function() {
  const cardsRes = await window.fetchAPI('getCardContacts', {}, true);
  if (cardsRes && !cardsRes.error) {
    allCards = (cardsRes || []).reverse();
    window.renderCardList(allCards);
    window.updateHomeBanner();
  }
};

// 啟動名片掃描(一般名片庫)
window.recognizeCard = async function(inputEl) {
  window.cropTarget = 'general';
  const file = inputEl.files[0];
  if (!file) return;

  const role = currentUser?.role || 'user';
  const limit = window.LIMITS[role].cards;
  if (allCards.length >= limit) {
    inputEl.value = '';
    return window.showToast('用量限制:您的方案 (' + role + ') 最多只能掃描 ' + limit + ' 張名片,請聯絡管理員升級。', true);
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const cropperModal = document.getElementById('cropper-modal');
    const cropperImage = document.getElementById('cropper-image');
    cropperImage.src = e.target.result;
    cropperModal.classList.remove('hidden');

    if (cropperInstance) cropperInstance.destroy();
    cropperInstance = new Cropper(cropperImage, {
      aspectRatio: NaN,
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 0.9,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
    });
  };
  reader.readAsDataURL(file);
  inputEl.value = '';
};

// 啟動名片掃描(我的專屬名片)
window.recognizeMyCard = async function(inputEl) {
  window.cropTarget = 'mycard';
  const file = inputEl.files[0];
  if (!file) return;

  const role = currentUser?.role || 'user';
  const limit = window.LIMITS[role].cards;
  if (allCards.length >= limit) {
    inputEl.value = '';
    return window.showToast('用量限制:您的方案 (' + role + ') 最多只能掃描 ' + limit + ' 張名片,請聯絡管理員升級。', true);
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const cropperModal = document.getElementById('cropper-modal');
    const cropperImage = document.getElementById('cropper-image');
    cropperImage.src = e.target.result;
    cropperModal.classList.remove('hidden');

    // 切換確認按鈕指向專屬版本
    const confirmBtn = document.getElementById('btn-confirm-crop');
    if (confirmBtn) confirmBtn.setAttribute('onclick', 'window.confirmMyCardCrop()');

    if (cropperInstance) cropperInstance.destroy();
    cropperInstance = new Cropper(cropperImage, {
      aspectRatio: NaN,
      viewMode: 1, dragMode: 'move', autoCropArea: 0.9, restore: false,
      guides: true, center: true, highlight: false, cropBoxMovable: true,
      cropBoxResizable: true, toggleDragModeOnDblclick: false,
    });
  };
  reader.readAsDataURL(file);
  inputEl.value = '';
};
