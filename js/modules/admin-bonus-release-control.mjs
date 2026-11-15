// Administrator-operated release gate. This does not calculate or pay bonuses.
export function mount({workerUrl, session}) {
  const tab = document.getElementById('tab-bonus');
  if (!tab || tab.querySelector('[data-bonus-release]')) return;
  const box = document.createElement('div');
  box.dataset.bonusRelease = '1';
  box.className = 'rounded-xl border border-amber-300 bg-amber-50 p-4';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = '啟用業績日期及成交排序';
  button.className = 'rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white';
  box.append(status, button); tab.prepend(box);
  const current = () => { try { return session() || {}; } catch { return {}; } };
  const same = (a, b) => a.role === 'admin' && !!a.uid && !!a.token && a.role === b.role && a.uid === b.uid && a.token === b.token;
  async function request(s, data) {
    const response = await fetch(new URL('/v1/admin/bonus-release-control', workerUrl), {
      method: data ? 'POST' : 'GET', cache: 'no-store', credentials: 'omit',
      headers: {Authorization:`Bearer ${s.token}`, ...(data ? {'Content-Type':'application/json'} : {})},
      body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(20000)
    });
    const result = await response.json();
    if (!response.ok || result?.success !== true || typeof result.enabled !== 'boolean' || !Number.isSafeInteger(result.version)) throw Error(result?.error || '狀態讀取失敗');
    return result;
  }
  button.addEventListener('click', async () => {
    const s = current();
    if (!same(s, s)) { status.textContent = '請以總管身分重新登入。'; status.className = 'text-red-700'; return; }
    button.disabled = true; status.textContent = '正在確認功能狀態…';
    try {
      let state = await request(s);
      if (!same(s, current())) throw Error('登入狀態已變更，請重新操作。');
      if (!state.enabled) {
        if (!window.confirm('啟用業績日期與成交排序功能？此操作不會計算或支付獎金。')) { status.textContent = '已取消啟用。'; return; }
        if (!same(s, current())) throw Error('登入狀態已變更，請重新操作。');
        state = await request(s, {enabled:true, reason:'正式啟用業績日期與成交排序功能', expectedVersion:state.version, requestKey:crypto.randomUUID()});
        if (!same(s, current())) throw Error('登入狀態已變更，請重新確認功能狀態。');
      }
      if (!state.enabled) throw Error('功能狀態已變更，請重新確認。');
      status.textContent = '業績日期與成交排序已啟用。'; status.className = 'text-emerald-700'; button.hidden = true;
    } catch (error) {
      status.textContent = `${error?.message || '暫時無法確認'}。請重新確認功能狀態。`; status.className = 'text-red-700';
    } finally { button.disabled = false; }
  });
  status.textContent = '若業績日期及排序尚未開放，請由總管啟用。';
}
