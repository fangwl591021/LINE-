/* ==================== 活動建立模組 ==================== */

// 切換收費 / 免費輸入框
window.toggleFeeInput = function(prefix) {
  const feeRadio = document.querySelector('input[name="' + prefix + '-fee-type"]:checked');
  if (!feeRadio) return;
  const feeType = feeRadio.value;
  const priceBox = document.getElementById(prefix + '-price-box');
  if (feeType === '收費') {
    if (priceBox) priceBox.classList.remove('hidden');
  } else {
    if (priceBox) priceBox.classList.add('hidden');
    const priceInput = document.getElementById(prefix + '-price');
    if (priceInput) priceInput.value = '';
  }
};

// 新增系列梯次列
window.addBatchRow = function(defaultValues = null, insertAfterId = null) {
  activeBatchCount++;
  const container = document.getElementById('batch-container');
  const rowId = 'batch-' + activeBatchCount;
  const html =
    '<div id="' + rowId + '" class="bg-slate-50 p-4 rounded-2xl relative border-none animate-in slide-in-from-top-2">' +
      '<div class="absolute top-3 right-3 flex gap-1.5 z-10">' +
        '<button type="button" onclick="window.copyBatchRow(\'' + rowId + '\')" class="w-8 h-8 bg-white text-blue-500 hover:bg-blue-50 rounded-full flex items-center justify-center shadow-sm transition-colors" title="複製此梯次"><span class="material-symbols-outlined text-[15px]">content_copy</span></button>' +
        (activeBatchCount > 1 || insertAfterId ? '<button type="button" onclick="document.getElementById(\'' + rowId + '\').remove()" class="w-8 h-8 bg-white text-slate-400 hover:text-red-500 rounded-full flex items-center justify-center shadow-sm transition-colors" title="刪除此梯次"><span class="material-symbols-outlined text-[18px]">close</span></button>' : '') +
      '</div>' +
      '<div class="flex flex-col mb-3 pr-20">' +
        '<input type="text" id="' + rowId + '-name" class="custom-input !h-[44px] !bg-white shadow-sm batch-name-input" placeholder="梯次名稱 (例如: 台北平日班)" value="' + (defaultValues ? defaultValues.name : '') + '">' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3 mb-3">' +
        '<input type="datetime-local" id="' + rowId + '-start" class="custom-input !h-[44px] !bg-white shadow-sm !text-[13px] !px-3 text-slate-600 batch-start-input" value="' + (defaultValues ? defaultValues.start : '') + '">' +
        '<input type="datetime-local" id="' + rowId + '-end" class="custom-input !h-[44px] !bg-white shadow-sm !text-[13px] !px-3 text-slate-600 batch-end-input" value="' + (defaultValues ? defaultValues.end : '') + '">' +
      '</div>' +
      '<div class="flex items-center gap-2">' +
        '<span class="text-[13px] font-bold text-slate-500 shrink-0 ml-1">收費 NT$</span>' +
        '<input type="number" id="' + rowId + '-price" class="custom-input !h-[44px] !bg-white shadow-sm batch-price-input" placeholder="免費請留空或填 0" value="' + (defaultValues ? defaultValues.price : '') + '">' +
        '<input type="hidden" class="batch-limit-input" value="' + (defaultValues ? defaultValues.limit : '') + '">' +
      '</div>' +
    '</div>';

  if (insertAfterId) document.getElementById(insertAfterId).insertAdjacentHTML('afterend', html);
  else container.insertAdjacentHTML('beforeend', html);
};

// 複製梯次列
window.copyBatchRow = function(sourceId) {
  const srcName = document.getElementById(sourceId + '-name').value;
  const srcStart = document.getElementById(sourceId + '-start').value;
  const srcEnd = document.getElementById(sourceId + '-end').value;
  const srcPrice = document.getElementById(sourceId + '-price').value;
  window.addBatchRow({
    name: srcName ? srcName + ' (複製)' : '',
    start: srcStart,
    end: srcEnd,
    price: srcPrice,
    limit: ''
  }, sourceId);
};

// 提交活動表單
window.submitActivityForm = async function(mode) {
  const btnId = 'btn-submit-' + mode;
  const btn = document.getElementById(btnId);
  if (btn && btn.disabled) return;

  const role = currentUser?.role || 'user';
  if (role !== 'admin') {
    try {
      const acts = await window.fetchAPI('getPublicActivities', {}, true);
      const myActs = (acts || []).filter(a => String(a.userId) === String(currentUserProfile.userId));
      const limit = window.LIMITS[role].activities;
      if (myActs.length >= limit) {
        return alert('用量限制:您的方案 (' + role + ') 最多只能建立 ' + limit + ' 個活動,請聯絡管理員升級。');
      }
    } catch(e) {
      console.log("讀取目前活動數量失敗,跳過限制檢查", e);
    }
  }

  const pfx = mode === 'quick' ? 'q' : (mode === 'full' ? 'f' : 's');

  const nameInput = document.getElementById(pfx + '-name');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) { alert('⚠️ 請填寫活動名稱/標題'); return nameInput?.focus(); }

  const oriText = btn ? btn.innerHTML : '建立';

  if (btn) {
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin align-middle mr-1 text-[20px]">refresh</span> 處理中...';
    btn.disabled = true;
    btn.classList.add('opacity-70');
  }

  let rawImageUrl = document.getElementById('in-image-url-' + mode)
    ? document.getElementById('in-image-url-' + mode).value
    : '';
  let finalImageUrl = rawImageUrl;

  if (rawImageUrl.startsWith('data:image')) {
    try {
      if (btn) btn.innerHTML = '<span class="material-symbols-outlined animate-spin align-middle mr-1 text-[20px]">refresh</span> 上傳圖片至 CDN...';

      const upJson = await window.fetchAPI('uploadImageToR2', { base64Image: rawImageUrl }, true);

      if (upJson && upJson.url) {
        finalImageUrl = upJson.url;
      } else {
        throw new Error("上傳失敗");
      }
    } catch(e) {
      alert('⚠️ 圖片上傳失敗,請重試: ' + e.message);
      if (btn) { btn.innerHTML = oriText; btn.disabled = false; btn.classList.remove('opacity-70'); }
      return;
    }
  }

  const formatDT = (val) => {
    if (!val) return '';
    return val.replace('T', ' ');
  };

  let p = {
    activityName: name,
    activityType: document.getElementById(pfx + '-type') ? document.getElementById(pfx + '-type').value : '例會',
    feeType: '免費',
    price: 0,
    startTime: formatDT(document.getElementById(pfx + '-start') ? document.getElementById(pfx + '-start').value : ''),
    endTime: formatDT(document.getElementById(pfx + '-end') ? document.getElementById(pfx + '-end').value : ''),
    description: document.getElementById(pfx + '-desc') ? document.getElementById(pfx + '-desc').value.trim() : '',
    imageUrl: finalImageUrl,
    names: [],
    defaultIdentity: document.getElementById(pfx + '-identity') ? document.getElementById(pfx + '-identity').value : '來賓',
    isBatch: (mode === 'series'),
    userId: currentUserProfile.userId
  };

  if (mode === 'quick' || mode === 'full') {
    const feeRadio = document.querySelector('input[name="' + pfx + '-fee-type"]:checked');
    p.feeType = feeRadio ? feeRadio.value : '免費';
    p.price = document.getElementById(pfx + '-price') ? document.getElementById(pfx + '-price').value : '';

    if (p.feeType === '收費' && (!p.price || p.price <= 0)) {
      if (btn) { btn.innerHTML = oriText; btn.disabled = false; btn.classList.remove('opacity-70'); }
      return alert("⚠️ 請輸入正確的收費金額");
    }

    if (mode === 'quick') {
      const namesStr = document.getElementById('q-names') ? document.getElementById('q-names').value : '';
      p.names = namesStr.split(String.fromCharCode(10)).filter(n=>n.trim());
    }
  } else if (mode === 'series') {
    const cards = document.querySelectorAll('[id^="batch-item-"]');
    p.batches = Array.from(cards).map(card => ({
      name: card.querySelector('.batch-name-input').value.trim(),
      startTime: formatDT(card.querySelector('.batch-start-input').value),
      endTime: formatDT(card.querySelector('.batch-end-input').value),
      price: card.querySelector('.batch-price-input').value,
      limit: card.querySelector('.batch-limit-input').value
    }));

    if (p.batches.length === 0) {
      if (btn) { btn.innerHTML = oriText; btn.disabled = false; btn.classList.remove('opacity-70'); }
      return alert("⚠️ 至少需新增一個梯次");
    }
    for (let b of p.batches) {
      if (!b.name) {
        if (btn) { btn.innerHTML = oriText; btn.disabled = false; btn.classList.remove('opacity-70'); }
        return alert("⚠️ 梯次名稱必填");
      }
    }

    if (p.batches.length > 0) {
      p.startTime = p.batches[0].startTime;
      p.endTime = p.batches[p.batches.length - 1].endTime;
      const hasPaid = p.batches.some(b => parseInt(b.price) > 0);
      if (hasPaid) {
        p.feeType = '收費';
        p.price = Math.max(...p.batches.map(b => parseInt(b.price) || 0));
      }
    }
  }

  try {
    const res = await window.fetchAPI('bulkAddRegistrants', p, true);
    if (!res || res.error) throw new Error(res.error || '未知的錯誤');

    alert('🎉 活動建立成功！即將跳轉...');
    setTimeout(() => { window.goPage('admin-activities'); }, 1500);
  } catch(e) {
    alert('⚠️ 建立失敗:' + e.message);
  } finally {
    if (btn) { btn.innerHTML = oriText; btn.disabled = false; btn.classList.remove('opacity-70'); }
  }
};
