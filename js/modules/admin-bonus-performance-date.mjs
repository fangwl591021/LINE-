// The recorded date is a candidate awaiting verification, not a settlement.
// This module never alters the original order, payment, bonus or ledger fields.
let mounted = false;
const endpoint = '/v1/admin/bonus-performance-date';
const precisionLabels = { month: '月份', day: '日期', minute: '日期時間（台北時間）' };
const sameSession = (a, b) => !!a && !!b && a.role === 'admin' && b.role === 'admin' &&
  !!a.uid && !!a.token && a.uid === b.uid && a.token === b.token;

export function mount({workerUrl, session}) {
  if (mounted) return;
  const body = document.getElementById('bonus-orders-body');
  const tab = document.getElementById('tab-bonus');
  if (!body || !tab) throw new Error('bonus list unavailable');
  mounted = true;
  let generation = 0, active = null, lastSession = null;
  const uncertain = new Set();
  const currentSession = () => { try { return session() || null; } catch { return null; } };
  const isVisible = () => !tab.classList.contains('hidden');
  const authorized = s => sameSession(s, s);
  const make = (tag, text, className = '') => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const styles = make('style');
  styles.textContent = '.bonus-date-dialog{width:min(94vw,460px);max-height:90vh;overflow:auto;border:1px solid #cbd5e1;border-radius:16px;padding:20px;color:#1e293b;background:#fff}.bonus-date-dialog::backdrop{background:#0f172a99}.bonus-date-dialog label{display:block;font-weight:700;margin-top:12px}.bonus-date-dialog input,.bonus-date-dialog select,.bonus-date-dialog textarea{display:block;width:100%;min-height:44px;border:1px solid #94a3b8;border-radius:8px;margin-top:5px;padding:8px;background:#fff}.bonus-date-dialog button{min-height:44px;padding:8px 12px;border-radius:8px}.bonus-date-dialog [data-actions]{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.bonus-date-warning{color:#b91c1c;font-weight:700}.bonus-date-open{display:block;min-height:44px;color:#1d4ed8;text-decoration:underline;font-weight:700}.bonus-date-dialog [data-status]{margin-top:12px;white-space:normal}';
  document.head.append(styles);

  function close() {
    generation++;
    if (!active) return;
    const modal = active.modal;
    active = null;
    if (modal.open) modal.close();
    modal.remove();
  }
  function validActive(a) {
    return active === a && a.modal.isConnected && isVisible() &&
      sameSession(a.session, currentSession()) && body.contains(a.row);
  }
  function clearButtons() { body.querySelectorAll('[data-bonus-date-open]').forEach(node => node.remove()); }
  function sync() {
    const s = currentSession();
    if (!sameSession(lastSession, s)) {
      if (active && active.sending) uncertain.add(active.orderId);
      close(); clearButtons(); lastSession = authorized(s) ? s : null;
    }
    if (active && !validActive(active)) {
      if (active.sending) uncertain.add(active.orderId);
      close();
    }
    if (!isVisible() || !authorized(s)) { clearButtons(); return; }
    for (const row of body.querySelectorAll('tr')) {
      const cells = row.querySelectorAll('td');
      if (cells.length !== 8 || cells[0].querySelector('[data-bonus-date-open]')) continue;
      const orderId = cells[1].textContent.trim();
      if (!orderId || orderId.length > 100) continue;
      const button = make('button', '查看／調整業績日期', 'bonus-date-open');
      button.type = 'button'; button.dataset.bonusDateOpen = '1';
      button.addEventListener('click', () => void open(row, orderId));
      cells[0].append(button);
    }
  }
  async function request(s, orderId, data) {
    const url = new URL(endpoint, workerUrl);
    if (!data) url.searchParams.set('order_id', orderId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        method: data ? 'POST' : 'GET',
        headers: {Authorization: `Bearer ${s.token}`, ...(data ? {'Content-Type':'application/json'} : {})},
        body: data ? JSON.stringify(data) : undefined,
        cache: 'no-store', credentials: 'omit', signal: controller.signal
      });
      let result;
      try { result = await response.json(); } catch { throw new Error('invalid_response'); }
      if (!response.ok || result?.success !== true) {
        const error = new Error(result?.error || '暫時無法讀取'); error.status = response.status; error.code = result?.code; throw error;
      }
      if (result.orderId !== orderId || !Number.isSafeInteger(result.version) || result.version < 0) throw new Error('invalid_response');
      return result;
    } finally { clearTimeout(timer); }
  }
  async function open(row, orderId) {
    const s = currentSession();
    if (!authorized(s) || !isVisible()) return;
    close();
    const modal = make('dialog', '', 'bonus-date-dialog');
    modal.setAttribute('aria-labelledby', 'bonus-date-heading');
    const title = make('h2', '業績歸屬日期', 'text-lg font-black'); title.id = 'bonus-date-heading';
    const order = make('p', `訂單：${orderId}`, 'text-sm break-all');
    const explanation = make('p', '業績日期僅供登錄，不會更改原訂單或收款時間。補登日期可能影響成交順序；目前不計入結算，獎金與截止日須待成交順序核對，尚不會建立對帳。其他制度、續約或資料不明也待核。成交確認前可調整或撤回，確認後不可直接修改。', 'bonus-date-warning');
    const status = make('p', '正在讀取…'); status.dataset.status = '1'; status.setAttribute('role', 'status');
    const current = make('p', '', 'text-sm');
    const form = document.createElement('form'); form.hidden = true;
    const precisionLabel = make('label', '知道的時間精度');
    const precision = document.createElement('select'); precision.name = 'precision';
    for (const [value, text] of Object.entries(precisionLabels)) {
      const option = make('option', text); option.value = value; precision.append(option);
    }
    precisionLabel.append(precision);
    const valueLabel = make('label', '實際業績歸屬時間');
    const value = document.createElement('input'); value.name = 'value'; value.type = 'month'; value.required = true;
    valueLabel.append(value);
    const reasonLabel = make('label', '備註（可不填）');
    const reason = document.createElement('textarea'); reason.name = 'reason'; reason.maxLength = 300; reason.rows = 2;
    reasonLabel.append(reason);
    const actions = make('div'); actions.dataset.actions = '1';
    const save = make('button', '儲存業績日期', 'bg-emerald-700 text-white font-bold'); save.type = 'submit';
    const withdraw = make('button', '撤回業績日期', 'border border-red-300 text-red-700'); withdraw.type = 'button';
    const refresh = make('button', '重新讀取', 'border border-slate-300'); refresh.type = 'button';
    const cancel = make('button', '關閉', 'border border-slate-300'); cancel.type = 'button';
    actions.append(save, withdraw, refresh, cancel); form.append(precisionLabel, valueLabel, reasonLabel, actions);
    modal.append(title, order, explanation, status, current, form);
    document.body.append(modal);
    const a = {modal, row, orderId, session:s, version:null, editable:false, hasCurrent:false, sending:false}; active = a;
    modal.addEventListener('cancel', event => { event.preventDefault(); if (a.sending) uncertain.add(orderId); close(); });
    cancel.addEventListener('click', () => { if (a.sending) uncertain.add(orderId); close(); });
    precision.addEventListener('change', () => {
      value.type = precision.value === 'day' ? 'date' : precision.value === 'minute' ? 'datetime-local' : 'month';
      value.value = '';
    });
    async function read() {
      const ticket = ++generation;
      status.textContent = '正在讀取…'; status.className = '';
      form.hidden = false; save.disabled = true; withdraw.disabled = true; refresh.disabled = true;
      try {
        const result = await request(s, orderId);
        if (ticket !== generation || !validActive(a)) return;
        a.version = result.version;
        if (result.current && (!Object.hasOwn(precisionLabels, result.current.precision) || typeof result.current.value !== 'string')) throw new Error('invalid_response');
        current.textContent = result.current ? `目前登錄：${result.current.value}（${precisionLabels[result.current.precision]}）；登錄時間：${result.current.recordedAt || '未提供'}` : '尚未登錄業績歸屬日期。';
        if (result.current) {
          precision.value = result.current.precision;
          value.type = precision.value === 'day' ? 'date' : precision.value === 'minute' ? 'datetime-local' : 'month';
          value.value = result.current.value;
          reason.value = result.current.reason || '';
        } else { precision.value = 'month'; value.type = 'month'; value.value = ''; reason.value = ''; }
        if (uncertain.has(orderId)) {
          status.textContent = '已重新讀取目前紀錄；先核對上方資料，再決定是否重新儲存。';
          uncertain.delete(orderId);
        } else status.textContent = result.editable ? '請依實際資料選擇月份或日期。' : (result.lockReason || '目前無法調整此筆日期。');
        status.className = result.editable ? '' : 'bonus-date-warning';
        a.editable = result.editable === true;
        a.hasCurrent = !!result.current;
        save.disabled = !a.editable;
        withdraw.disabled = !a.editable || !a.hasCurrent;
      } catch (error) {
        if (ticket !== generation || !validActive(a)) return;
        current.textContent = ''; status.textContent = '無法讀取日期，請重新讀取。'; status.className = 'bonus-date-warning';
      } finally { if (ticket === generation && validActive(a)) refresh.disabled = false; }
    }
    refresh.addEventListener('click', () => void read());
    async function write(isWithdrawal) {
      if (!validActive(a) || a.sending || !a.editable || a.version === null || uncertain.has(orderId)) return;
      if (isWithdrawal && !a.hasCurrent) return;
      if (!isWithdrawal && !form.reportValidity()) return;
      if (typeof crypto?.randomUUID !== 'function') { status.textContent = '目前瀏覽器無法安全儲存，請更新瀏覽器後重試。'; status.className = 'bonus-date-warning'; return; }
      if (isWithdrawal && !window.confirm('確定撤回這筆業績日期？原訂單和收款紀錄不會改變。')) return;
      const data = {orderId, precision:isWithdrawal ? 'none' : precision.value, value:isWithdrawal ? '' : value.value, reason:reason.value.trim(), expectedVersion:a.version, requestKey:crypto.randomUUID()};
      const ticket = ++generation; a.sending = true; save.disabled = true; withdraw.disabled = true; refresh.disabled = true;
      status.textContent = isWithdrawal ? '正在撤回…' : '正在儲存…'; status.className = '';
      try {
        const result = await request(s, orderId, data);
        if (ticket !== generation || !validActive(a)) return;
        if (isWithdrawal ? result.current !== null : (!result.current || result.current.precision !== data.precision || result.current.value !== data.value)) throw new Error('invalid_response');
        a.version = result.version;
        a.hasCurrent = !isWithdrawal;
        current.textContent = isWithdrawal ? '尚未登錄業績歸屬日期。' : `目前登錄：${result.current.value}（${precisionLabels[result.current.precision]}）；登錄時間：${result.current.recordedAt || '請重新讀取確認'}`;
        status.textContent = isWithdrawal ? '業績日期已撤回；獎金與截止日仍須依資料核對。' : '日期已登錄；獎金與截止日須待成交順序核對，尚未建立對帳。';
        uncertain.delete(orderId);
      } catch (error) {
        if (ticket !== generation || !validActive(a)) return;
        uncertain.add(orderId);
        status.textContent = error.code === 'FEATURE_DISABLED' ? '業績日期與排序功能暫未開放；請稍後重新讀取確認。' : error.status === 409 ? '資料已變動，請重新讀取後再確認。' : '儲存結果尚未確認，請先重新讀取，勿重複提交。';
        status.className = 'bonus-date-warning';
      } finally {
        a.sending = false;
        if (ticket === generation && validActive(a)) { refresh.disabled = false; save.disabled = uncertain.has(orderId) || !a.editable; withdraw.disabled = uncertain.has(orderId) || !a.editable || !a.hasCurrent; }
      }
    }
    form.addEventListener('submit', event => { event.preventDefault(); void write(false); });
    withdraw.addEventListener('click', () => void write(true));
    modal.showModal();
    await read();
  }
  new MutationObserver(sync).observe(body, {childList:true});
  new MutationObserver(sync).observe(tab, {attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange', sync);
  window.setInterval(sync, 1000);
  sync();
  import('./admin-bonus-order-sequence.mjs?v=1').then(module => module.mount({workerUrl, session})).catch(() => {});
}
