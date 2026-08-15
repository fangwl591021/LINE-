/* My Customers: private CRM and preview-first spreadsheet import. */
(function () {
  'use strict';

  const LIMITS = Object.freeze({ fileBytes: 5 * 1024 * 1024, rows: 500, headerRows: 20 });
  const TARGETS = [
    ['', '忽略'], ['name', '客戶姓名（必填）'], ['mobile', '手機'], ['email', 'Email'],
    ['company', '公司名稱'], ['title', '職稱'], ['address', '地址'], ['birthday', '生日'],
    ['category', '客戶類型'], ['status', '客戶狀態'], ['lastContactAt', '最後聯絡日期'],
    ['nextFollowupAt', '下次跟進日期'], ['notes', '備註'], ['externalId', '客戶編號']
  ];
  const ALIASES = {
    name: ['姓名', '客戶姓名', 'customername', 'name', '聯絡人'],
    mobile: ['手機', '手機號碼', '行動電話', 'mobile', 'phone', 'tel'],
    email: ['email', '電子郵件', '信箱', '郵件'],
    company: ['公司', '公司名稱', 'company', 'organization'],
    title: ['職稱', 'title', 'jobtitle'],
    address: ['地址', '公司地址', 'address'],
    birthday: ['生日', 'birthday', 'birthdate'],
    category: ['分類', '客戶類型', 'category', 'type'],
    status: ['客戶狀態', '狀態', 'status'],
    lastContactAt: ['最後聯絡日期', '上次聯絡', 'lastcontact'],
    nextFollowupAt: ['下次跟進日期', '下次聯絡', 'nextfollowup'],
    notes: ['備註', '說明', 'notes', 'note'],
    externalId: ['客戶編號', '外部編號', '會員編號', 'customerid', 'externalid']
  };

  const state = {
    customers: [], workbook: null, sheetName: '', matrix: [], headers: [], mapping: {}, mappingHints: {}, mappedRows: [],
    batchId: '', previewRows: [], sourceName: '', sourceType: '', sessionKey: '', busy: false,
    tagProfiles: new Map(), tagControl: null, estimatedTagBatch: null
  };

  function el(id) { return document.getElementById(id); }
  function escape(value) { return window.escapeHTML ? window.escapeHTML(value) : String(value ?? ''); }
  function cleanHeader(value) { return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/[\s_\-／/()（）]/g, ''); }
  function statusLabel(value) {
    return ({ new: '新客戶', contacted: '已聯絡', qualified: '有意願', quoted: '已報價', won: '已成交', lost: '未成交', inactive: '暫停' })[value] || '新客戶';
  }
  function sourceLabel(value) {
    return ({ manual: '手動', csv: 'CSV', xlsx: 'Excel', xls: 'Excel' })[String(value || '').toLowerCase()] || String(value || '手動');
  }
  function autoTarget(header) {
    const normalized = cleanHeader(header);
    for (const [target, aliases] of Object.entries(ALIASES)) {
      if (aliases.some(alias => cleanHeader(alias) === normalized)) return target;
    }
    return '';
  }
  function maskedAiSample(value) {
    const raw = String(value ?? '').normalize('NFKC').trim().slice(0, 80);
    if (!raw) return '';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return 'a***@' + raw.split('@').pop();
    if (/^[+\d\s().-]{7,}$/.test(raw)) return raw.replace(/\d/g, '#');
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(raw)) return 'YYYY-MM-DD';
    return `<text:${Array.from(raw).length}>`;
  }
  function confidenceLabel(value) {
    return ({ high: 'AI 高信心', medium: 'AI 中信心', low: 'AI 低信心' })[value] || '規則建議';
  }
  function setBusy(next, message = '') {
    state.busy = !!next;
    document.querySelectorAll('[data-customer-action]').forEach(button => { button.disabled = state.busy; });
    const status = el('customer-import-status');
    if (status && message) status.textContent = message;
  }
  function showPanel(id, show = true) {
    const target = el(id);
    if (target) target.classList.toggle('hidden', !show);
  }

  window.initCustomersPage = async function () {
    if (!el('page-customers')) return;
    await window.loadCustomerTagProfiles();
    await window.loadCustomers();
    if (typeof window.isHardAdminUser === 'function' && window.isHardAdminUser(window.currentUserProfile?.userId, window.currentUser || {})) {
      await window.loadCustomerTagControl();
    }
  };

  window.loadCustomerTagProfiles = async function () {
    const result = await window.fetchAPI('listCustomerTagProfiles', {}, true);
    const rows = Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : []);
    state.tagProfiles = new Map(rows.map(row => [String(row.customerId || ''), row]));
  };

  window.loadCustomers = async function () {
    const list = el('customer-list');
    if (list) list.innerHTML = '<div class="py-10 text-center text-sm font-bold text-slate-400">客戶資料載入中...</div>';
    const result = await window.fetchAPI('listCustomers', { query: el('customer-search')?.value || '' }, true);
    if (result?.error) {
      if (list) list.innerHTML = '<div class="py-10 text-center text-sm font-bold text-red-400">客戶資料載入失敗</div>';
      return [];
    }
    state.customers = Array.isArray(result) ? result : [];
    window.renderCustomers(state.customers);
    return state.customers;
  };

  window.renderCustomers = function (customers) {
    const list = el('customer-list');
    const count = el('customer-total-count');
    if (count) count.textContent = String(customers.length);
    if (!list) return;
    if (!customers.length) {
      list.innerHTML = '<div class="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center"><span class="material-symbols-outlined text-5xl text-slate-300">group_add</span><p class="mt-3 text-base font-black text-slate-700">還沒有客戶資料</p><p class="mt-1 text-xs font-bold text-slate-400">可手動新增，或先預覽 Excel／CSV 再匯入。</p></div>';
      return;
    }
    list.innerHTML = customers.map((customer, index) => {
      const phone = String(customer.mobile || '').trim();
      const email = String(customer.email || '').trim();
      const tagProfile = state.tagProfiles.get(String(customer.customerId || ''));
      const tagItems = [['個性','personality'],['興趣','hobbies'],['財富','wealth'],['健康','health'],['事業','career']];
      const tagHtml = tagProfile ? tagItems.map(([label,key]) => `<span class="rounded-full px-2 py-1 text-[10px] font-black ${tagProfile[key] ? 'bg-violet-50 text-violet-700' : 'bg-slate-50 text-slate-400'}">${label}${tagProfile[key] ? '：' + escape(tagProfile[key]) : ''}</span>`).join('') : '<span class="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-400">尚未申請 AI 分析</span>';
      return `<article class="rounded-3xl bg-white border border-slate-100 shadow-sm p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap"><h3 class="text-[16px] font-black text-slate-800">${escape(customer.name || '未命名')}</h3><span class="px-2 py-1 rounded-full bg-emerald-50 text-[#06C755] text-[10px] font-black">${escape(statusLabel(customer.status))}</span><span class="px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black">${escape(sourceLabel(customer.sourceType))}</span></div>
            ${customer.company || customer.title ? `<p class="mt-1 text-[12px] font-bold text-slate-500">${escape([customer.company, customer.title].filter(Boolean).join('／'))}</p>` : ''}
            ${customer.nextFollowupAt ? `<p class="mt-2 text-[11px] font-black text-blue-600">下次跟進：${escape(customer.nextFollowupAt)}</p>` : ''}
          </div>
          <button type="button" onclick="window.openCustomerForm(${index})" class="w-9 h-9 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center"><span class="material-symbols-outlined text-[20px]">edit</span></button>
        </div>
        <div class="mt-3 flex flex-wrap gap-1.5">${tagHtml}</div>
        <div class="mt-3 flex gap-2">
          ${phone ? `<a href="tel:${escape(phone.replace(/[^+\d]/g, ''))}" class="flex-1 rounded-2xl bg-blue-50 text-blue-600 py-2.5 text-center text-xs font-black">撥打電話</a>` : ''}
          ${email ? `<a href="mailto:${escape(email)}" class="flex-1 rounded-2xl bg-violet-50 text-violet-600 py-2.5 text-center text-xs font-black">寄 Email</a>` : ''}
        </div>
      </article>`;
    }).join('');
  };

  function usd(microusd) { return (Number(microusd || 0) / 1000000).toLocaleString('zh-TW', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 6 }); }
  function isTony() {
    return !!state.tagControl;
  }

  window.loadCustomerTagControl = async function () {
    const result = await window.fetchAPI('getCustomerTagAnalysisControl', {}, true);
    if (result?.error) return;
    const data = result?.settings ? result : (result?.data || {});
    state.tagControl = data;
    showPanel('customer-tag-admin-control', true);
    const settings = data.settings || {};
    el('customer-tag-master-enabled').checked = Number(settings.master_enabled || 0) === 1;
    el('customer-tag-offpeak-start').value = Number(settings.offpeak_start_hour_taipei ?? 2);
    el('customer-tag-offpeak-end').value = Number(settings.offpeak_end_hour_taipei ?? 5);
    el('customer-tag-per-run').value = Number(settings.max_jobs_per_run ?? 5);
    el('customer-tag-per-day').value = Number(settings.max_jobs_per_day ?? 100);
    el('customer-tag-control-status').textContent = el('customer-tag-master-enabled').checked ? '總開關已開' : '總開關關閉';
    const latest = Array.isArray(data.prices) ? data.prices.find(row => Number(row.enabled) === 1) : null;
    if (latest) {
      el('customer-tag-provider').value = latest.provider || 'openai'; el('customer-tag-model').value = latest.model || '';
      el('customer-tag-input-price').value = Number(latest.input_price_microusd_per_million || 0) / 1000000;
      el('customer-tag-output-price').value = Number(latest.output_price_microusd_per_million || 0) / 1000000;
    }
  };

  window.saveCustomerTagControl = async function () {
    if (!isTony()) return window.showToast('只有 Tony 可以變更此開關', true);
    setBusy(true);
    const result = await window.fetchAPI('saveCustomerTagAnalysisControl', { masterEnabled: el('customer-tag-master-enabled').checked, offpeakStartHourTaipei: Number(el('customer-tag-offpeak-start').value), offpeakEndHourTaipei: Number(el('customer-tag-offpeak-end').value), maxJobsPerRun: Number(el('customer-tag-per-run').value), maxJobsPerDay: Number(el('customer-tag-per-day').value) }, true);
    setBusy(false);
    if (result?.error) return window.showToast(result.error, true);
    window.showToast('分析開關與離峰限制已儲存'); await window.loadCustomerTagControl();
  };

  window.saveCustomerTagPrice = async function () {
    if (!isTony()) return window.showToast('只有 Tony 可以設定價格', true);
    const input = Number(el('customer-tag-input-price').value); const output = Number(el('customer-tag-output-price').value);
    if (!el('customer-tag-model').value.trim() || !Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return window.showToast('請填入有效模型與價格', true);
    setBusy(true);
    const result = await window.fetchAPI('saveCustomerTagModelPrice', { provider: el('customer-tag-provider').value, model: el('customer-tag-model').value, inputPriceMicrousdPerMillion: Math.round(input * 1000000), outputPriceMicrousdPerMillion: Math.round(output * 1000000) }, true);
    setBusy(false);
    if (result?.error) return window.showToast(result.error, true);
    window.showToast('模型價格已建立最新驗證快照');
  };

  window.estimateCustomerTagBatch = async function () {
    if (!isTony()) return window.showToast('只有 Tony 可以建立估價', true);
    setBusy(true);
    const result = await window.fetchAPI('estimateCustomerTagAnalysisBatch', { provider: el('customer-tag-provider').value, model: el('customer-tag-model').value }, true);
    setBusy(false);
    if (result?.error) return window.showToast(result.error === 'MODEL_PRICE_REQUIRED' ? '請先儲存模型價格' : result.error, true);
    const batch = result?.batchId ? result : result?.data;
    state.estimatedTagBatch = batch;
    const host = el('customer-tag-estimate'); showPanel('customer-tag-estimate', true); showPanel('customer-tag-approve-button', true);
    host.innerHTML = `<strong class="block text-sm text-slate-800">${Number(batch.eligibleCustomers || 0).toLocaleString()} 位客戶</strong><span class="mt-1 block">基準估價 ${usd(batch.estimatedCostMicrousd)}；含 35% 緩衝的最高核准額 ${usd(batch.estimatedHighCostMicrousd)}。</span><span class="mt-2 block text-amber-700">這只是估價，不會啟動分析。價格或客戶集合變動時必須重新估價。</span>`;
  };

  window.approveCustomerTagBatch = async function () {
    const batch = state.estimatedTagBatch;
    if (!isTony() || !batch?.batchId) return window.showToast('請先由 Tony 建立估價', true);
    if (!await window.appConfirm(`核准最高費用 ${usd(batch.estimatedHighCostMicrousd)}？總開關與離峰限制仍會生效。`)) return;
    setBusy(true);
    const result = await window.fetchAPI('approveCustomerTagAnalysisBatch', { batchId: batch.batchId, maxCostMicrousd: Number(batch.estimatedHighCostMicrousd) }, true);
    setBusy(false);
    if (result?.error) return window.showToast(result.error, true);
    showPanel('customer-tag-approve-button', false); window.showToast('批次已核准，僅能在離峰且總開關開啟時處理');
  };

  let searchTimer = 0;
  window.searchCustomers = function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => window.loadCustomers(), 300);
  };

  window.openCustomerForm = function (index = -1) {
    const customer = index >= 0 ? state.customers[index] : {};
    el('customer-form-title').textContent = customer.customerId ? '編輯客戶' : '新增客戶';
    el('customer-id').value = customer.customerId || '';
    for (const field of ['name','mobile','email','company','title','address','birthday','category','lastContactAt','nextFollowupAt','notes']) {
      const input = el(`customer-${field}`);
      if (input) input.value = customer[field] || '';
    }
    el('customer-status').value = customer.status || 'new';
    el('customer-archive-button').classList.toggle('hidden', !customer.customerId);
    showPanel('customer-form-panel', true);
  };

  window.saveCustomerForm = async function () {
    const customer = {};
    for (const field of ['name','mobile','email','company','title','address','birthday','category','status','lastContactAt','nextFollowupAt','notes']) {
      customer[field] = el(`customer-${field}`)?.value || '';
    }
    if (!customer.name.trim()) return window.showToast('請輸入客戶姓名', true);
    setBusy(true);
    const result = await window.fetchAPI('saveCustomer', { customerId: el('customer-id').value || '', customer }, true);
    setBusy(false);
    if (result?.error) return window.showToast(result.error === 'EXACT_DUPLICATE_REVIEW_REQUIRED' ? '手機、Email 或客戶編號與既有客戶重複' : result.error, true);
    showPanel('customer-form-panel', false);
    window.showToast('客戶資料已儲存');
    await window.loadCustomers();
  };

  window.archiveCurrentCustomer = async function () {
    const customerId = el('customer-id').value;
    if (!customerId || !await window.appConfirm('確定封存這位客戶？歷史資料不會直接刪除。')) return;
    const result = await window.fetchAPI('archiveCustomer', { customerId }, true);
    if (result?.error) return window.showToast(result.error, true);
    showPanel('customer-form-panel', false);
    window.showToast('客戶已封存');
    await window.loadCustomers();
  };

  window.openCustomerImport = function () {
    state.workbook = null; state.matrix = []; state.headers = []; state.mapping = {}; state.mappedRows = [];
    state.batchId = ''; state.previewRows = []; state.sourceName = ''; state.sourceType = '';
    state.sessionKey = window.crypto && typeof window.crypto.randomUUID === 'function' ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    if (el('customer-file-input')) el('customer-file-input').value = '';
    if (el('customer-import-file-summary')) el('customer-import-file-summary').textContent = '尚未選擇檔案';
    showPanel('customer-import-workbook-step', false);
    showPanel('customer-import-mapping-step', false);
    showPanel('customer-import-preview-step', false);
    showPanel('customer-import-result-step', false);
    showPanel('customer-import-panel', true);
  };

  window.downloadCustomerTemplate = function () {
    const rows = [
      ['客戶姓名','手機號碼','Email','公司名稱','職稱','地址','生日','客戶類型','客戶狀態','最後聯絡日期','下次跟進日期','備註','客戶編號'],
      ['王小明','0912345678','demo@example.com','範例公司','經理','','1980-01-01','潛在客戶','new','','','','C0001']
    ];
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'customer-import-template.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  window.handleCustomerFile = async function (input) {
    const file = input?.files?.[0];
    if (!file) return;
    const extension = String(file.name.split('.').pop() || '').toLowerCase();
    if (!['xlsx','xls','csv'].includes(extension)) return window.showToast('只支援 .xlsx、.xls、.csv', true);
    if (file.size > LIMITS.fileBytes) return window.showToast('檔案不可超過 5 MB', true);
    if (typeof window.XLSX === 'undefined') return window.showToast('Excel 解析元件載入失敗，請確認網路後重試', true);
    setBusy(true, '正在讀取檔案...');
    try {
      const bytes = await file.arrayBuffer();
      state.workbook = window.XLSX.read(bytes, { type: 'array', cellFormula: false, cellHTML: false, cellNF: false, dense: true });
      state.sourceName = file.name;
      state.sourceType = extension;
      const sheetSelect = el('customer-sheet-select');
      sheetSelect.innerHTML = state.workbook.SheetNames.map(name => `<option value="${escape(name)}">${escape(name)}</option>`).join('');
      state.sheetName = state.workbook.SheetNames[0] || '';
      if (!state.sheetName) throw new Error('找不到可讀取的工作表');
      el('customer-import-file-summary').textContent = `${file.name}・${(file.size / 1024).toFixed(0)} KB・${state.workbook.SheetNames.length} 個工作表`;
      showPanel('customer-import-workbook-step', true);
      window.prepareCustomerSheet();
    } catch (error) {
      window.showToast(error.message || '檔案解析失敗', true);
    } finally { setBusy(false); }
  };

  window.prepareCustomerSheet = function () {
    state.sheetName = el('customer-sheet-select')?.value || state.workbook?.SheetNames?.[0] || '';
    const sheet = state.workbook?.Sheets?.[state.sheetName];
    if (!sheet) return;
    state.matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false }).slice(0, LIMITS.rows + LIMITS.headerRows + 1);
    const headerSelect = el('customer-header-row');
    const candidates = state.matrix.slice(0, Math.min(LIMITS.headerRows, state.matrix.length));
    headerSelect.innerHTML = candidates.map((row, index) => `<option value="${index}">第 ${index + 1} 列：${escape(row.slice(0, 4).join('｜') || '空白')}</option>`).join('');
    window.buildCustomerMapping();
  };

  window.buildCustomerMapping = function () {
    const headerIndex = Number(el('customer-header-row')?.value || 0);
    state.headers = (state.matrix[headerIndex] || []).map((value, index) => String(value || `欄位 ${index + 1}`).trim()).slice(0, 50);
    state.mapping = {};
    state.mappingHints = {};
    const host = el('customer-mapping-list');
    host.innerHTML = state.headers.map((header, index) => {
      const suggested = autoTarget(header);
      state.mapping[index] = suggested;
      const options = TARGETS.map(([value, label]) => `<option value="${value}" ${value === suggested ? 'selected' : ''}>${label}</option>`).join('');
      const sample = state.matrix[headerIndex + 1]?.[index] ?? '';
      return `<div class="rounded-2xl border border-slate-200 bg-white p-3"><div class="flex items-center justify-between gap-2"><p class="text-xs font-black text-slate-700">${escape(header)}</p><span id="customer-map-hint-${index}" class="text-[9px] font-black text-slate-400">規則建議</span></div><p class="mt-1 text-[10px] font-bold text-slate-400 truncate">範例：${escape(sample)}</p><select data-map-index="${index}" onchange="window.updateCustomerMapping(${index}, this.value)" class="custom-input !py-2.5 mt-2 text-xs">${options}</select></div>`;
    }).join('');
    const rowCount = Math.max(0, state.matrix.length - headerIndex - 1);
    el('customer-workbook-summary').textContent = `${state.sheetName}・約 ${Math.min(rowCount, LIMITS.rows)} 筆資料・最多讀取 ${LIMITS.rows} 筆`;
    showPanel('customer-import-mapping-step', true);
    window.requestCustomerAiMapping(headerIndex);
  };

  window.requestCustomerAiMapping = async function (headerIndex) {
    const columns = state.headers.map((header, index) => ({
      index,
      header,
      samples: state.matrix.slice(headerIndex + 1, headerIndex + 4).map(row => maskedAiSample(row?.[index])).filter(Boolean)
    }));
    if (!columns.length || typeof window.fetchAPI !== 'function') return;
    const status = el('customer-import-status');
    if (status) status.textContent = 'AI 正在判斷欄位語意；資料樣本已去識別化';
    const result = await window.fetchAPI('suggestCustomerImportMapping', { columns }, true);
    const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
    if (!suggestions.length) {
      if (status) status.textContent = 'AI 暫時無法使用，已保留規則建議，可手動調整';
      return;
    }
    suggestions.forEach(item => {
      const index = Number(item.index);
      if (!Number.isInteger(index) || index < 0 || index >= state.headers.length) return;
      state.mapping[index] = item.target || '';
      const select = document.querySelector(`[data-map-index="${index}"]`);
      if (select) select.value = state.mapping[index];
      state.mappingHints[index] = item;
      const hint = el(`customer-map-hint-${index}`);
      if (hint) {
        hint.textContent = confidenceLabel(item.confidence);
        hint.title = item.reason || '';
        hint.className = `text-[9px] font-black ${item.confidence === 'high' ? 'text-emerald-600' : item.confidence === 'medium' ? 'text-amber-600' : 'text-red-500'}`;
      }
    });
    if (status) status.textContent = 'AI 欄位建議已完成；低信心欄位請人工確認';
  };

  window.updateCustomerMapping = function (index, value) { state.mapping[index] = value; };

  function mappedRows() {
    const headerIndex = Number(el('customer-header-row')?.value || 0);
    const used = Object.values(state.mapping).filter(Boolean);
    if (!used.includes('name')) throw new Error('請指定「客戶姓名」欄位');
    if (new Set(used).size !== used.length) throw new Error('同一個目標欄位不可重複指定');
    return state.matrix.slice(headerIndex + 1, headerIndex + 1 + LIMITS.rows).map((row, offset) => {
      const data = {};
      Object.entries(state.mapping).forEach(([index, target]) => { if (target) data[target] = row[Number(index)] ?? ''; });
      return { rowNumber: headerIndex + offset + 2, data, resolution: el('customer-duplicate-resolution')?.value || 'skip' };
    }).filter(row => Object.values(row.data).some(value => String(value || '').trim()));
  }

  window.previewCustomerImport = async function () {
    try { state.mappedRows = mappedRows(); } catch (error) { return window.showToast(error.message, true); }
    if (!state.mappedRows.length) return window.showToast('沒有可匯入的資料列', true);
    setBusy(true, '正在檢查欄位與重複客戶...');
    try {
      const created = await window.fetchAPI('createCustomerImportBatch', {
        sourceType: state.sourceType, sourceName: state.sourceName,
        idempotencyKey: state.sessionKey
      }, true);
      if (created?.error) throw new Error(created.error);
      state.batchId = created.batchId;
      const preview = await window.fetchAPI('previewCustomerImportRows', {
        batchId: state.batchId, mapping: state.mapping, rows: state.mappedRows
      }, true);
      if (preview?.error) throw new Error(preview.error);
      const report = await window.fetchAPI('getCustomerImportBatch', { batchId: state.batchId }, true);
      if (report?.error) throw new Error(report.error);
      state.previewRows = Array.isArray(report.rows) ? report.rows : [];
      const summary = preview.summary || {};
      el('customer-preview-summary').innerHTML = `<div class="grid grid-cols-3 gap-2"><div class="rounded-2xl bg-emerald-50 p-3 text-center"><strong class="block text-xl text-[#06C755]">${Number(summary.ready || 0)}</strong><span class="text-[10px] font-black text-emerald-700">可新增</span></div><div class="rounded-2xl bg-amber-50 p-3 text-center"><strong class="block text-xl text-amber-600">${Number(summary.duplicate || 0)}</strong><span class="text-[10px] font-black text-amber-700">重複</span></div><div class="rounded-2xl bg-red-50 p-3 text-center"><strong class="block text-xl text-red-500">${Number(summary.error || 0)}</strong><span class="text-[10px] font-black text-red-700">錯誤</span></div></div>`;
      const previewHost = el('customer-preview-list');
      previewHost.innerHTML = state.previewRows.slice(0, 30).map((row, index) => {
        const local = state.mappedRows[index]?.data || {};
        const tone = row.decision === 'create' ? 'text-[#06C755] bg-emerald-50' : row.decision === 'duplicate' ? 'text-amber-600 bg-amber-50' : 'text-red-500 bg-red-50';
        const label = row.decision === 'create' ? '新增' : row.decision === 'duplicate' ? (row.resolution === 'fill_blanks' ? '補空白' : '略過重複') : '錯誤';
        return `<div class="flex items-center justify-between gap-3 border-b border-slate-100 py-3"><div class="min-w-0"><p class="text-sm font-black text-slate-700 truncate">${escape(local.name || `第 ${row.row_number} 列`)}</p><p class="text-[10px] font-bold text-slate-400 truncate">${escape(local.mobile || local.email || local.company || '')}</p></div><span class="shrink-0 px-2 py-1 rounded-full text-[10px] font-black ${tone}">${label}</span></div>`;
      }).join('');
      showPanel('customer-import-preview-step', true);
      el('customer-import-preview-step')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { window.showToast(error.message || '預覽失敗', true); }
    finally { setBusy(false); }
  };

  window.commitCustomerImport = async function () {
    if (!el('customer-authority-confirm')?.checked) return window.showToast('請先確認您有權匯入這份客戶資料', true);
    if (!state.batchId) return window.showToast('請先完成匯入預覽', true);
    setBusy(true, '正在分批匯入，請勿關閉頁面...');
    try {
      let result = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        result = await window.fetchAPI('commitCustomerImportBatch', { batchId: state.batchId, confirmAuthority: true }, true);
        if (result?.error) throw new Error(result.error);
        if (result.state !== 'importing') break;
      }
      const report = await window.fetchAPI('getCustomerImportBatch', { batchId: state.batchId }, true);
      const batch = report?.batch || {};
      el('customer-import-result-text').textContent = result?.state === 'completed'
        ? `匯入完成：新增 ${batch.created_rows || 0}、更新 ${batch.updated_rows || 0}、略過 ${batch.skipped_rows || 0}`
        : '部分資料尚未完成，請保留此批次並稍後重試。';
      showPanel('customer-import-result-step', true);
      window.showToast(result?.state === 'completed' ? '客戶匯入完成' : '匯入部分完成');
      await window.loadCustomers();
    } catch (error) { window.showToast(error.message || '匯入失敗', true); }
    finally { setBusy(false); }
  };

  window.rollbackCustomerImport = async function () {
    if (!state.batchId || !await window.appConfirm('確定回復這次匯入？匯入後已人工修改的客戶會被保護，不會強制覆蓋。')) return;
    const result = await window.fetchAPI('rollbackCustomerImportBatch', { batchId: state.batchId }, true);
    if (result?.error) return window.showToast(result.error, true);
    window.showToast(`已回復 ${result.rolledBack || 0} 筆，保護 ${result.blocked || 0} 筆後續修改`);
    await window.loadCustomers();
  };
})();
