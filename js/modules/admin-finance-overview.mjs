// Read-only dashboard counters. The legacy CRM and card views write to their
// original IDs, so preserve hidden sinks instead of using their paged arrays.
const fields = [
  ['stat-users', 'memberRecordCount', '會員資料筆數（含自動建檔、未完成）'],
  ['stat-cards', 'cardRecordCount', '名片資料筆數（含已合併紀錄）'],
  ['stat-acts', 'publishedActivityCount', '已上架活動主項（不含子場次）'],
  ['stat-regs', 'activeRegistrationCount', '有效報名紀錄（不含取消）']
];
let nodes, feedback, retry, generation = 0, boundSession = null, readSession;

function mount() {
  if (nodes) return;
  const tab = document.getElementById('tab-finance');
  if (!tab) throw new Error('dashboard unavailable');
  const originals = fields.map(([legacyId]) => document.getElementById(legacyId));
  if (originals.some(node => !node || !node.parentElement)) throw new Error('dashboard counters unavailable');
  nodes = fields.map(([legacyId, key, label], index) => {
    const node = originals[index];
    node.id = `finance-overview-${key}`;
    node.textContent = '—';
    if (node.previousElementSibling) node.previousElementSibling.textContent = label;
    const sink = document.createElement('span');
    sink.id = legacyId; sink.hidden = true; sink.setAttribute('aria-hidden', 'true');
    node.parentElement.append(sink);
    return node;
  });
  feedback = document.createElement('div');
  feedback.id = 'finance-overview-feedback';
  feedback.setAttribute('role', 'status');
  feedback.className = 'text-sm font-bold text-slate-600';
  retry = document.createElement('button');
  retry.type = 'button'; retry.textContent = '重新讀取'; retry.hidden = true;
  retry.className = 'ml-2 px-3 py-2 rounded-lg border border-slate-300';
  retry.addEventListener('click', () => void load(lastOptions));
  feedback.append(retry);
  tab.prepend(feedback);
  // Hidden tabs must not retain one user's results after a logout or account
  // switch. This watches identity only and makes no network requests.
  document.addEventListener('visibilitychange', invalidateChangedSession);
  window.setInterval(invalidateChangedSession, 1000);
}

let lastOptions;
function sameSession(a, b) {
  return !!a && !!b && a.role === 'admin' && b.role === 'admin' &&
    !!a.uid && !!a.token && a.uid === b.uid && a.token === b.token;
}
function getSession() { try { return readSession?.() || null; } catch { return null; } }
function message(text, isError = false, showRetry = false) {
  feedback.replaceChildren(document.createTextNode(text), retry);
  feedback.classList.toggle('text-red-700', isError);
  feedback.classList.toggle('text-slate-600', !isError);
  retry.hidden = !showRetry;
}
function clear() { if (nodes) nodes.forEach(node => { node.textContent = '—'; }); }
function invalidateChangedSession() {
  if (boundSession && !sameSession(boundSession, getSession())) {
    generation++; boundSession = null; clear();
    message('登入或管理權限已變更，請重新登入後再讀取。', true, true);
  }
}

export async function load(options) {
  lastOptions = options;
  readSession = options.session;
  mount();
  const oldError = document.getElementById('finance-overview-loader-error');
  oldError?.remove();
  const session = getSession(), ticket = ++generation;
  boundSession = session;
  clear();
  if (!sameSession(session, session)) {
    boundSession = null;
    message('僅總管可讀取全站統計，請確認登入身分。', true, true);
    return;
  }
  nodes.forEach(node => { node.textContent = '讀取中…'; });
  message('正在讀取營運統計…');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(new URL('/v1/admin/overview-stats', options.workerUrl), {
      headers: {Authorization: `Bearer ${session.token}`}, cache: 'no-store',
      credentials: 'omit', signal: controller.signal
    });
    const body = await response.json();
    if (ticket !== generation) return;
    if (!sameSession(session, getSession())) { invalidateChangedSession(); return; }
    if (response.status === 401 || response.status === 403) {
      clear(); message('目前帳號無法讀取全站統計，請確認總管權限。', true, true); return;
    }
    if (!response.ok || body?.success !== true || !body.data ||
        fields.some(([, key]) => !Number.isSafeInteger(body.data[key]) || body.data[key] < 0)) throw new Error('invalid overview');
    fields.forEach(([, key], index) => { nodes[index].textContent = body.data[key].toLocaleString('zh-TW'); });
    message('已讀取目前統計。');
  } catch {
    if (ticket !== generation) return;
    if (!sameSession(session, getSession())) { invalidateChangedSession(); return; }
    clear(); message('目前無法讀取營運統計，請重新讀取。', true, true);
  } finally { clearTimeout(timeout); }
}
