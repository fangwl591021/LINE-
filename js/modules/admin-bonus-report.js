(() => {
  'use strict';
  const id = name => document.getElementById('bonus-report-' + name);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {review_required:'待核對', frozen:'凍結中', payable:'可給付', paid:'已付款（系統紀錄）', reversed:'已沖回', service_ineligible:'服務資格不符', cancelled:'已取消'};
  const label = status => labels[status] || String(status || '未標示狀態');
  const money = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-TW', {maximumFractionDigits: 2}) : '—';
  const taipeiTime = value => {
    if (!value) return '';
    let input = String(value).trim();
    if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(input)) input = input.replace(' ', 'T') + 'Z';
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? String(value) + '（原始時間）' : new Intl.DateTimeFormat('zh-TW', {timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).format(date);
  };
  const state = {mode:'summary', page:1, member:null, memberName:'', seq:0, exporting:false, total:0, pageSize:100, rows:[], totals:[]};
  let timer;

  function params(page = state.page) {
    const selectedStatus = id('status').value;
    return {mode:state.mode, basis:'performance', page, q:id('search').value.trim(), month:id('month').value, status:selectedStatus === '__blank__' ? '' : (selectedStatus || null), member:state.member};
  }
  function setMessage(message, error = false) {
    const el = id('message'); el.textContent = message;
    el.classList.toggle('text-red-700', error); el.classList.toggle('text-slate-500', !error);
  }
  async function request(query) {
    if (!window.liff?.isLoggedIn?.()) throw Error('請先登入 LINE，再重新開啟報表。');
    const token = window.liff.getAccessToken();
    if (!token) throw Error('登入已失效，請重新登入。');
    const url = new URL('/v1/partner-contracts/bonus-report', WORKER_URL);
    Object.entries(query).forEach(([key,value]) => { if (value !== null && value !== undefined && (value !== '' || key === 'member' || key === 'status')) url.searchParams.set(key, String(value)); });
    const response = await fetch(url, {headers:{Authorization:'Bearer ' + token}, credentials:'omit', cache:'no-store', signal:AbortSignal.timeout(20000)});
    const data = await response.json();
    if (!response.ok || !data.success) throw Error(data.error || '無法讀取獎金報表，請稍後重試。');
    if (!window.liff?.isLoggedIn?.() || window.liff.getAccessToken() !== token) throw Error('登入已變更，請重新開啟報表。');
    if (!Array.isArray(data.rows) || !Array.isArray(data.totals) || !Number.isSafeInteger(Number(data.total)) || Number(data.total) < 0) throw Error('報表回傳資料不完整，請稍後重試。');
    return data;
  }
  function updateControls() {
    const isSummary = state.mode === 'summary';
    for (const [name,active] of [['summary',isSummary],['details',!isSummary]]) {
      id(name).classList.toggle('bg-slate-800', active); id(name).classList.toggle('text-white', active);
      id(name).setAttribute('aria-pressed', String(active));
    }
    id('selection').textContent = state.member !== null ? '會員：' + (state.memberName || state.member || '未標示會員') + '；按「會員彙整」可返回全站。' : '目前顯示全部符合條件的會員。';
    id('page').textContent = '第 ' + state.page + ' 頁，共 ' + state.total.toLocaleString('zh-TW') + (isSummary ? ' 位會員' : ' 筆流水');
    id('prev').disabled = state.exporting || state.page <= 1;
    id('next').disabled = state.exporting || state.page * state.pageSize >= state.total;
    id('export').disabled = state.exporting || !state.total;
  }
  const statusColumns = totals => {
    const present = totals.map(item => String(item.status ?? ''));
    return [...new Set([...['review_required','frozen','payable','paid','reversed','service_ineligible','cancelled'], ...present])];
  };
  function renderTotals() {
    id('totals').innerHTML = state.totals.length ? state.totals.map(row => `<div class="rounded-lg border border-slate-200 bg-slate-50 p-4"><div class="text-sm font-bold text-slate-600">${esc(label(row.status))}</div><div class="text-xl font-black text-slate-800 mt-1">NT$ ${esc(money(row.amount))}</div><div class="text-xs text-slate-500 mt-1">${esc(row.count)} 筆</div></div>`).join('') : '<p class="text-sm text-slate-500">目前沒有符合條件的獎金流水。</p>';
  }
  function renderTable() {
    const isSummary = state.mode === 'summary';
    const statuses = statusColumns(state.totals);
    const headings = isSummary ? ['會員','流水筆數', ...statuses.map(label),''] : ['會員','獎金類型','金額','狀態','訂單編號','流水編號','業績歸屬月份','建立時間','更新時間','結算時間','備註'];
    id('head').innerHTML = '<tr>' + headings.map(h => `<th class="px-3 py-3 whitespace-nowrap">${esc(h)}</th>`).join('') + '</tr>';
    if (!state.rows.length) {
      id('body').innerHTML = `<tr><td colspan="${headings.length}" class="p-8 text-center text-slate-500">目前沒有符合條件的獎金流水。</td></tr>`;
      return;
    }
    id('body').innerHTML = state.rows.map(row => {
      const member = `<strong>${esc(row.memberName || '未能唯一辨識會員')}</strong><br><span class="text-xs text-slate-500">會員編號：${esc(row.memberNumber || '未登錄')}<br>${esc(row.memberId)}</span>`;
      const cells = isSummary ? [member, esc(row.count), ...statuses.map(s => esc(money(row.statusAmounts?.[s] ?? 0))), `<button type="button" class="min-h-[44px] px-3 rounded-lg text-blue-700 border border-blue-200 font-bold" data-member="${esc(row.memberId)}" data-name="${esc(row.memberName || '')}">查看明細</button>`] : [member, esc(row.bonusType), esc(money(row.amount)), esc(label(row.status)), esc(row.orderId), esc(row.txId), esc(row.performanceMonth), esc(taipeiTime(row.createdAt)), esc(taipeiTime(row.updatedAt)), esc(taipeiTime(row.settledAt)), esc(row.note)];
      return '<tr>' + cells.map(cell => `<td class="px-3 py-3 align-top whitespace-nowrap">${cell}</td>`).join('') + '</tr>';
    }).join('');
  }
  async function load() {
    const seq = ++state.seq;
    setMessage('讀取中…'); id('export').disabled = true;
    try {
      const data = await request(params());
      if (seq !== state.seq) return;
      state.rows = data.rows; state.totals = data.totals; state.total = Number(data.total); state.pageSize = Number(data.pageSize) || 100;
      if (state.page > 1 && !state.rows.length && state.total <= (state.page - 1) * state.pageSize) { state.page = Math.max(1, Math.ceil(state.total / state.pageSize)); return load(); }
      renderTotals(); renderTable(); updateControls();
      setMessage(state.total ? '資料已載入。' : '目前沒有符合條件的獎金流水。');
    } catch (error) {
      if (seq !== state.seq) return;
      state.rows = []; state.totals = []; state.total = 0; renderTotals(); renderTable(); updateControls();
      setMessage(error.name === 'TimeoutError' ? '讀取逾時，請重新查詢。' : error.message, true);
    }
  }
  function safeCsvCell(value) {
    let text = String(value ?? '');
    if (typeof value !== 'number' && (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r]/.test(text))) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  async function exportAll() {
    if (state.exporting || !state.total) return;
    clearTimeout(timer); state.seq++;
    state.exporting = true; updateControls();
    const query = params(1), selectedMode = state.mode;
    const disabled = [...id('filters').elements, id('summary'), id('details')];
    const prior = disabled.map(el => el.disabled); disabled.forEach(el => el.disabled = true);
    try {
      setMessage('正在讀取所有符合條件的資料，請稍候…');
      const rows = [], seen = new Set(); let total = null, totals = [];
      for (let page = 1; ; page++) {
        const result = await request({...query,page});
        if (total === null) { total = Number(result.total); totals = result.totals; }
        if (Number(result.total) !== total) throw Error('匯出期間資料筆數已變動，請重新匯出。');
        for (const row of result.rows) {
          const key = selectedMode === 'summary' ? row.memberId : row.txId;
          if ((key == null || (selectedMode === 'details' && key === '')) || seen.has(key)) throw Error('匯出期間資料已變動或不完整，請重新匯出。');
          seen.add(key); rows.push(row);
        }
        if (rows.length > total) throw Error('匯出資料筆數不符，請重新匯出。');
        if (rows.length === total) break;
        if (!result.rows.length) throw Error('匯出資料不完整，請重新匯出。');
      }
      const statuses = statusColumns(totals);
      const headers = selectedMode === 'summary' ? ['會員姓名','會員編號','會員識別碼','流水筆數',...statuses.map(label)] : ['會員姓名','會員編號','會員識別碼','獎金類型','金額','狀態','訂單編號','流水編號','業績歸屬月份','建立時間','更新時間','結算時間','備註'];
      const records = rows.map(row => selectedMode === 'summary' ? [row.memberName,row.memberNumber,row.memberId,Number(row.count),...statuses.map(s => Number(row.statusAmounts?.[s] ?? 0))] : [row.memberName,row.memberNumber,row.memberId,row.bonusType,Number(row.amount),label(row.status),row.orderId,row.txId,row.performanceMonth,taipeiTime(row.createdAt),taipeiTime(row.updatedAt),taipeiTime(row.settledAt),row.note]);
      const csv = '\uFEFF' + [headers,...records].map(record => record.map(safeCsvCell).join(',')).join('\r\n');
      const blob = new Blob([csv], {type:'text/csv;charset=utf-8'}), url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = '獎金報表-' + (selectedMode === 'summary' ? '會員彙整' : '獎金明細') + '.csv';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('已匯出 ' + rows.length.toLocaleString('zh-TW') + ' 筆資料。匯出期間如資料有變動，請重新核對。');
    } catch (error) { setMessage(error.name === 'TimeoutError' ? '匯出逾時，請重新匯出。' : error.message, true); }
    finally { disabled.forEach((el,i) => el.disabled = prior[i]); state.exporting = false; updateControls(); }
  }
  id('filters').addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); state.page = 1; void load(); });
  id('search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.page = 1; void load(); }, 300); });
  id('reset').addEventListener('click', () => { id('filters').reset(); state.member = null; state.memberName = ''; state.page = 1; void load(); });
  id('summary').addEventListener('click', () => { state.mode = 'summary'; state.member = null; state.memberName = ''; state.page = 1; void load(); });
  id('details').addEventListener('click', () => { state.mode = 'details'; state.member = null; state.memberName = ''; state.page = 1; void load(); });
  id('prev').addEventListener('click', () => { if (state.page > 1) { state.page--; void load(); } });
  id('next').addEventListener('click', () => { if (state.page * state.pageSize < state.total) { state.page++; void load(); } });
  id('export').addEventListener('click', () => void exportAll());
  id('body').addEventListener('click', event => {
    const button = event.target.closest('[data-member]'); if (!button) return;
    state.member = button.dataset.member; state.memberName = button.dataset.name; state.mode = 'details'; state.page = 1; void load();
  });
  window.loadAdminBonusReport = () => { state.page = 1; void load(); };
})();
