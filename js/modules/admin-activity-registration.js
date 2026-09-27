/* Admin-only view over the existing mobile activity/registrant APIs. */
(function () {
  'use strict';
  const state = { mounted: false, listRequest: 0, rosterRequest: 0, selected: '', rows: null, busy: false, counts: new Map() };
  const $ = id => document.getElementById(id);
  const text = value => String(value ?? '');
  const esc = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pick = (row, keys, fallback = '') => {
    for (const key of keys) if (row?.[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    return fallback;
  };
  const activityId = row => text(pick(row, ['活動ID', 'activityId', 'rowId']));
  const title = row => text(pick(row, ['活動名稱', 'activityName', 'name'], '未命名活動'));
  const network = row => text(pick(row, ['歸屬網', 'networkId', '建立者ID', 'creatorId', 'userId'], 'admin'));
  const status = row => pick(row, ['狀態', 'status'], '上架') === '下架' ? '下架' : '上架';
  const date = value => text(value).replace('T', ' ').slice(0, 10);
  function list(result) {
    if (!result || result.success === false) return null;
    if (Array.isArray(result)) return result;
    for (const key of ['data', 'items', 'activities', 'registrations']) if (Array.isArray(result[key])) return result[key];
    return null;
  }
  function registrant(row) {
    const checked = pick(row, ['簽到', 'checkedIn', 'checkinStatus'], false);
    const payment = text(pick(row, ['付款狀態', '繳費狀態', 'paymentStatus']));
    const amount = Number(pick(row, ['金額', 'amount'], 0)) || 0;
    return {
      id: text(pick(row, ['rowId', 'registrationId', '報名ID'])),
      name: text(pick(row, ['姓名', 'name'], '未命名')),
      phone: text(pick(row, ['手機', '電話', 'phone'])),
      identity: text(pick(row, ['身份', 'identity'], '會員')),
      cancelled: row.status === 'cancelled' || row['報名狀態'] === '已取消',
      checked: checked === true || /^(true|1)$/i.test(text(checked)),
      paid: ['已付款', '已繳費'].includes(payment), payment, amount,
      time: text(pick(row, ['nfcCheckinTime', '簽到時間', 'checkedInAt']))
    };
  }
  function summary(rows) {
    const active = rows.filter(row => !row.cancelled);
    return { active: active.length, checked: active.filter(row => row.checked).length,
      unpaid: active.filter(row => row.amount > 0 && !row.paid).length,
      cancelled: rows.length - active.length };
  }
  function filterActivities(rows, filters) {
    const query = text(filters.query).trim().toLocaleLowerCase();
    return rows.filter(row => {
      const start = date(pick(row, ['開始時間', 'startTime']));
      return (!query || `${title(row)} ${activityId(row)}`.toLocaleLowerCase().includes(query)) &&
        (!filters.network || filters.network === 'all' || network(row) === filters.network) &&
        (!filters.status || filters.status === 'all' || status(row) === filters.status) &&
        (!filters.from || (start && start >= filters.from)) && (!filters.to || (start && start <= filters.to));
    });
  }
  function filterRegistrants(rows, filters) {
    const query = text(filters.query).trim().toLocaleLowerCase();
    return rows.filter(row => (!query || `${row.name} ${row.phone} ${row.id}`.toLocaleLowerCase().includes(query)) &&
      (!filters.state || filters.state === 'all' || (filters.state === 'cancelled' ? row.cancelled :
        !row.cancelled && (filters.state === 'active' || (filters.state === 'checked' ? row.checked : !row.checked)))) &&
      (!filters.payment || filters.payment === 'all' || (filters.payment === 'paid' ? row.paid : filters.payment === 'free' ? row.amount === 0 : row.amount > 0 && !row.paid)));
  }
  function csv(titleValue, rows) {
    // Prefix formula-like values and phone numbers with an apostrophe; never use ="..." formulas.
    const cell = value => '"' + (/^[\s]*[=+\-@\t\r\n]/.test(text(value)) ? "'" : '') + text(value).replace(/"/g, '""') + '"';
    return '\ufeff' + [['活動名稱','姓名','電話','身份','付款狀態','報名狀態','簽到狀態','簽到時間','報名編號'],
      ...rows.map(row => [titleValue,row.name,row.phone ? "'" + row.phone : '',row.identity,row.payment,
        row.cancelled ? '已取消' : '有效',row.checked ? '已簽到' : '未簽到',row.time,row.id])]
      .map(row => row.map(cell).join(',')).join('\r\n');
  }
  function countFor(row) {
    if (state.counts.has(activityId(row))) return state.counts.get(activityId(row));
    const value = pick(row, ['報名人數', 'registrantCount'], null);
    return value !== null && Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : null;
  }
  const stats = entries => entries.map(([label, value]) => `<div class="aar-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  function mount() {
    if (state.mounted) return;
    state.mounted = true;
    $('admin-activity-toolbar').innerHTML = `
      <div class="aar-head"><div><h2>活動報名與簽到管理</h2><p class="aar-note">與手機端共用活動及報名資料，選擇活動即可管理名單。</p></div><button type="button" class="aar-button" data-aar="refresh-list">重新整理活動</button></div>
      <div class="aar-stats" id="aar-activity-stats"></div>
      <div class="aar-filters">
        <label class="aar-search">搜尋活動<input id="aar-activity-query" type="search" placeholder="活動名稱或編號"></label>
        <label>歸屬網<select id="act-tenant-filter"><option value="all">全部歸屬網</option></select></label>
        <label>活動狀態<select id="aar-activity-state"><option value="all">全部狀態</option><option>上架</option><option>下架</option></select></label>
        <label>開始日期（起）<input id="aar-activity-from" type="date"></label><label>開始日期（迄）<input id="aar-activity-to" type="date"></label>
      </div><p id="aar-list-status" class="aar-status" role="status"></p>`;
    $('tab-activities').addEventListener('click', handleClick);
    $('admin-activity-toolbar').addEventListener('input', renderOverview);
    $('admin-activity-registrants').addEventListener('input', renderRoster);
    $('aar-activity-stats').innerHTML = stats([['已載入活動','—'],['上架','—'],['下架','—'],['符合篩選','—']]);
  }
  function message(id, value, error = false) {
    $(id).textContent = value;
    $(id).dataset.error = String(error);
  }
  async function load() {
    mount();
    const request = ++state.listRequest;
    const button = $('tab-activities').querySelector('[data-aar="refresh-list"]');
    button.disabled = true;
    $('acts-table-body').innerHTML = '<tr><td colspan="8" class="aar-empty">載入活動中…</td></tr>';
    message('aar-list-status', '正在讀取活動…');
    try {
      // Use the existing manager endpoint; never silently fall back to a public list.
      const rows = list(await fetchAPI('getAllActivities', {}, { silent: true }));
      if (request !== state.listRequest) return;
      if (!rows) throw new Error('無法讀取活動，請按「重新整理活動」重試。');
      allActivitiesData = rows;
      state.counts.clear();
      $('stat-acts').innerText = rows.length;
      const selectedNetwork = $('act-tenant-filter').value;
      $('act-tenant-filter').innerHTML = '<option value="all">全部歸屬網</option>' + [...new Set(rows.map(network))].map(id => `<option value="${esc(id)}">${esc(id === 'admin' ? '平台' : id)}</option>`).join('');
      if ([...$('act-tenant-filter').options].some(option => option.value === selectedNetwork)) $('act-tenant-filter').value = selectedNetwork;
      message('aar-list-status', rows.length >= 500 ? '已達 API 500 筆讀取上限，以下篩選僅限已載入活動。' : '依管理權限顯示活動；名單人數於開啟活動後更新。');
      renderOverview();
      if (state.selected) {
        if (rows.some(row => activityId(row) === state.selected)) await openRoster(state.selected);
        else back();
      }
    } catch (error) {
      if (request !== state.listRequest) return;
      allActivitiesData = [];
      back();
      $('acts-table-body').innerHTML = '<tr><td colspan="8" class="aar-empty">活動資料讀取失敗</td></tr>';
      $('aar-activity-stats').innerHTML = stats([['已載入活動','—'],['上架','—'],['下架','—'],['符合篩選','—']]);
      message('aar-list-status', error.message, true);
    } finally { if (request === state.listRequest) button.disabled = false; }
  }
  function renderOverview() {
    if (!state.mounted) return;
    const rows = filterActivities(allActivitiesData, { query: $('aar-activity-query').value, network: $('act-tenant-filter').value,
      status: $('aar-activity-state').value, from: $('aar-activity-from').value, to: $('aar-activity-to').value });
    $('aar-activity-stats').innerHTML = stats([['已載入活動',allActivitiesData.length],['上架',allActivitiesData.filter(row => status(row) === '上架').length],
      ['下架',allActivitiesData.filter(row => status(row) === '下架').length],['符合篩選',rows.length]]);
    $('acts-table-body').innerHTML = rows.length ? renderActivitySectionRows('上架區', rows.filter(row => status(row) === '上架'), false) +
      renderActivitySectionRows('下架區', rows.filter(row => status(row) === '下架'), true) :
      `<tr><td colspan="8" class="aar-empty">${allActivitiesData.length ? '沒有符合條件的活動' : '目前沒有活動資料'}</td></tr>`;
  }
  function back() {
    if (state.busy) return;
    ++state.rosterRequest;
    state.selected = ''; state.rows = null;
    $('admin-activity-registrants').hidden = true;
    $('admin-activity-toolbar').hidden = false;
    $('admin-activity-overview').hidden = false;
  }
  async function openRoster(id) {
    if (!id || state.busy) return;
    const activity = allActivitiesData.find(row => activityId(row) === id);
    if (!activity) return;
    state.selected = id; state.rows = null;
    $('admin-activity-toolbar').hidden = true;
    $('admin-activity-overview').hidden = true;
    const panel = $('admin-activity-registrants');
    panel.hidden = false;
    panel.innerHTML = `
      <div class="aar-head"><button type="button" class="aar-button" data-aar="back">← 返回活動列表</button><div class="aar-actions"><button type="button" class="aar-button" data-aar="refresh-roster">重新整理名單</button><button type="button" class="aar-button aar-primary" data-aar="export" disabled>匯出篩選名單 CSV</button></div></div>
      <h2>${esc(title(activity))}</h2><p class="aar-note">${esc(pick(activity,['開始時間','startTime'],'時間未設定'))} · ${esc(status(activity))} · ${esc(id)}</p>
      <div id="aar-roster-stats" class="aar-stats"></div>
      <div class="aar-filters"><label class="aar-search">搜尋報名者<input id="aar-roster-query" type="search" placeholder="姓名、電話或報名編號"></label>
      <label>報名／簽到狀態<select id="aar-roster-state"><option value="all">全部名單</option><option value="active">有效報名</option><option value="checked">已簽到</option><option value="unchecked">未簽到</option><option value="cancelled">已取消</option></select></label>
      <label>付款狀態<select id="aar-roster-payment"><option value="all">全部付款狀態</option><option value="paid">已付款／已繳費</option><option value="unpaid">待付款／待對帳</option><option value="free">免費</option></select></label></div>
      <p id="aar-roster-status" class="aar-status" role="status"></p>
      <div class="aar-panel"><div class="aar-panel-head"><h3>報名與簽到名單</h3><p class="aar-note">統計與匯出以本活動已載入資料為準，手動操作與手機端共用紀錄。</p></div>
      <div class="aar-scroll"><table class="aar-table"><thead><tr><th>姓名／身份</th><th>電話</th><th>付款狀態</th><th>報名／簽到</th><th>簽到時間</th><th>操作</th></tr></thead><tbody id="aar-roster-body"></tbody></table></div></div>`;
    await refreshRoster();
  }
  async function refreshRoster(note = '') {
    const id = state.selected;
    if (!id) return;
    const request = ++state.rosterRequest;
    state.rows = null;
    renderRoster();
    message('aar-roster-status', '正在讀取名單…');
    try {
      const rows = list(await fetchAPI('getActivityRegistrants', { activityId: id }, { silent: true }));
      if (request !== state.rosterRequest || id !== state.selected) return;
      if (!rows) throw new Error('無法讀取名單，請重新整理；尚未確認最新狀態前不提供名單操作。');
      state.rows = rows.map(registrant);
      const counts = summary(state.rows);
      if (rows.length < 500) state.counts.set(id, counts.active);
      message('aar-roster-status', (note ? note + ' ' : '') + (rows.length >= 500 ? '已達 API 500 筆讀取上限，統計與 CSV 可能不是完整名單。' : `顯示 ${rows.length} 筆報名紀錄（含已取消）。`));
      renderRoster();
      renderOverview();
    } catch (error) {
      if (request !== state.rosterRequest || id !== state.selected) return;
      $('aar-roster-body').innerHTML = '<tr><td colspan="6" class="aar-empty">名單讀取失敗，請使用上方重新整理</td></tr>';
      message('aar-roster-status', (note ? note + ' ' : '') + error.message, true);
    }
  }
  function visibleRows() {
    return filterRegistrants(state.rows || [], { query: $('aar-roster-query').value, state: $('aar-roster-state').value, payment: $('aar-roster-payment').value });
  }
  function renderRoster() {
    if (!state.selected) return;
    const counts = state.rows ? summary(state.rows) : {};
    $('aar-roster-stats').innerHTML = stats([['有效報名',counts.active ?? '—'],['已簽到',counts.checked ?? '—'],['待付款',counts.unpaid ?? '—'],['已取消',counts.cancelled ?? '—']]);
    const rows = visibleRows();
    $('admin-activity-registrants').querySelector('[data-aar="export"]').disabled = state.busy || !state.rows || !rows.length;
    if (!state.rows) {
      $('aar-roster-body').innerHTML = '<tr><td colspan="6" class="aar-empty">名單尚未載入</td></tr>';
      return;
    }
    $('aar-roster-body').innerHTML = rows.length ? rows.map(row => `<tr>
      <td><strong>${esc(row.name)}</strong><div class="aar-note">${esc(row.identity)}</div></td><td>${esc(row.phone || '未提供')}</td>
      <td>${esc(row.payment || (row.amount > 0 ? '待付款' : '免費'))}<div class="aar-note">NT$ ${esc(row.amount)}</div></td>
      <td><span class="aar-badge ${row.cancelled ? 'aar-muted' : row.checked ? 'aar-ok' : ''}">${row.cancelled ? '已取消' : row.checked ? '已簽到' : '未簽到'}</span></td>
      <td>${esc(row.time || '—')}</td><td><div class="aar-actions">${!row.cancelled && row.id ?
        `<button type="button" class="aar-button" data-row="${esc(row.id)}" data-mutation="toggleCheckin" ${state.busy ? 'disabled' : ''}>${row.checked ? '取消簽到' : '簽到'}</button>` +
        (row.amount > 0 && !row.paid ? `<button type="button" class="aar-button" data-row="${esc(row.id)}" data-mutation="confirmPayment" ${state.busy ? 'disabled' : ''}>確認繳費</button>` : '') : '—'}</div></td></tr>`).join('') :
      `<tr><td colspan="6" class="aar-empty">${state.rows.length ? '沒有符合條件的報名者' : '尚無報名者'}</td></tr>`;
  }
  async function mutate(action, rowId) {
    if (state.busy || !['toggleCheckin','confirmPayment'].includes(action)) return;
    const row = state.rows?.find(item => item.id === rowId);
    if (!state.selected || !row || row.cancelled || (action === 'confirmPayment' && (row.paid || row.amount <= 0))) return;
    const label = action === 'confirmPayment' ? '確認已收到款項' : row.checked ? '取消簽到' : '簽到';
    if (!window.confirm(`確定為「${row.name}」${label}？`)) return;
    state.busy = true;
    $('admin-activity-registrants').querySelectorAll('button').forEach(button => { button.disabled = true; });
    let note;
    try {
      const result = await fetchAPI(action, { rowId, activityId: state.selected }, { silent: true });
      note = result && result.success !== false ? '操作已完成，已重新核對名單。' : '未收到成功確認，請先核對最新狀態；系統不會自動重送。';
    } catch (_) { note = '連線異常，請先核對最新狀態；系統不會自動重送。'; }
    try { await refreshRoster(note); }
    finally {
      state.busy = false;
      $('admin-activity-registrants').querySelectorAll('[data-aar="back"], [data-aar="refresh-roster"]').forEach(button => { button.disabled = false; });
      renderRoster();
    }
  }
  function download() {
    if (state.busy || !state.rows || !visibleRows().length) return;
    const activity = allActivitiesData.find(row => activityId(row) === state.selected);
    if (!activity) return;
    const url = URL.createObjectURL(new Blob([csv(title(activity), visibleRows())], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${title(activity).replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 60)}_報名名單.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function handleClick(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled || state.busy) return;
    if (button.dataset.registrants) { void openRoster(button.dataset.registrants); return; }
    if (button.dataset.copyActivity) { void copyActivityId(button.dataset.copyActivity); return; }
    if (button.dataset.mutation) { void mutate(button.dataset.mutation, button.dataset.row); return; }
    switch (button.dataset.aar) {
      case 'refresh-list': void load(); break;
      case 'back': back(); renderOverview(); break;
      case 'refresh-roster': void refreshRoster(); break;
      case 'export': download(); break;
    }
  }
  window.AdminActivityRegistration = { load, renderActivities: renderOverview, countFor,
    list, registrant, summary, filterActivities, filterRegistrants, csv };
})();
