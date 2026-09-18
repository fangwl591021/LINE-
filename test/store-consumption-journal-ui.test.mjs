import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

let serial = 0;
const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32);
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) }; };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const sample = (extra = {}) => ({
  id: 'store:SAMPLE', source: 'store', sourceId: 'SAMPLE', occurredAt: '2026-09-16T13:57:00Z',
  shopName: '合成咖啡店', title: '店內消費折抵', amountCents: 10000, discountPoints: 10,
  earnedPoints: 0, payableCents: 9000, paymentStatus: 'unconfirmed', fulfillmentStatus: '', unread: true,
  ...extra,
});
async function fixture() {
  const module = await import('../js/modules/store-consumption-journal.js?journal-ui=' + serial++);
  let token = 'synthetic-token-a', active = true;
  const calls = [];
  globalThis.window = { currentUserProfile: { userId: A }, currentUser: { userId: A }, liff: { getAccessToken: () => token, isLoggedIn: () => true } };
  globalThis.fetch = async (url, options = {}) => { calls.push({ url, options }); return response({ success: true, items: [], snapshot: 'snap', unreadCount: 0, nextCursor: null }); };
  return {
    module, calls, setToken(value) { token = value; }, setActive(value) { active = value; },
    client() { return module.createJournalClient({ base: 'http://127.0.0.1:8775', isCurrent: () => active }); },
  };
}

function mountDocument() {
  const made = [];
  function node(tagName = 'div') {
    const handlers = new Map();
    const el = {
      tagName: tagName.toUpperCase(), dataset: {}, attributes: {}, children: [], disabled: false, hidden: false,
      textContent: '', innerHTML: '', className: '', isConnected: true, open: false, scrollTop: 0,
      addEventListener(type, fn) { const list = handlers.get(type) || []; list.push(fn); handlers.set(type, list); },
      dispatch(type, event = {}) { for (const fn of handlers.get(type) || []) fn({ preventDefault() {}, ...event }); },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      getAttribute(key) { return this.attributes[key]; },
      append(...values) { this.children.push(...values); values.forEach(value => { value.parentNode = this; }); },
      remove() { this.isConnected = false; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(item => item !== this); },
      replaceChildren() { this.children = []; this.innerHTML = ''; this.textContent = ''; },
      showModal() { this.open = true; },
      close() { this.open = false; this.dispatch('close'); },
      focus() { this.focused = true; },
      contains(target) { return target === this || target.modal === this; },
      closest() { return this; },
      querySelector() { return null; }, querySelectorAll() { return []; },
    };
    made.push(el);
    if (tagName === 'dialog') {
      const controls = new Map(), sections = new Map();
      const control = (action, id = '') => {
        const key = action + ':' + id;
        if (!controls.has(key)) { const button = node('button'); button.modal = el; button.dataset = { journal: action, id }; controls.set(key, button); }
        return controls.get(key);
      };
      for (const action of ['close', 'refresh', 'read-all', 'list', 'more', 'points']) control(action);
      for (const key of ['[data-journal-list-view]', '[data-journal-detail-view]', '[data-journal-rows]', '[data-journal-status]', '[data-journal-filters]', '[data-journal-count]', '.journal-scroll']) sections.set(key, node());
      const form = sections.get('[data-journal-filters]');
      form.elements = { type: { value: 'all' }, start: { value: '' }, end: { value: '' } };
      sections.get('[data-journal-list-view]').querySelectorAll = () => [...controls.values()].filter(button => !['close', 'list', 'points'].includes(button.dataset.journal)).concat(Object.values(form.elements));
      el.querySelector = selector => sections.get(selector) || control(selector.match(/^\[data-journal="([^"]+)"\]$/)?.[1] || selector);
      el.testClick = (action, id = '') => { const button = control(action, id); el.dispatch('click', { target: button }); };
      el.testForm = form;
      el.testSections = sections;
      el.testControls = controls;
    }
    return el;
  }
  const document = {
    baseURI: 'http://127.0.0.1:8775/', body: node('body'), head: node('head'), activeElement: node('button'),
    createElement: node,
    querySelector(selector) { return selector === 'link[data-store-journal-style]' ? this.head.children.find(child => child.tagName === 'LINK') || null : null; },
  };
  globalThis.document = document;
  return { document, made };
}

async function until(predicate) {
  for (let attempt = 0; attempt < 80; attempt++) { if (predicate()) return; await delay(5); }
  assert.ok(predicate(), 'asynchronous journal UI condition eventually holds');
}
const page = (items = [sample()], extras = {}) => ({ success: true, items, snapshot: 'snap-one', nextCursor: null, unreadCount: items.filter(item => item.unread).length, timeZone: 'Asia/Taipei', ...extras });
const statusOf = modal => modal.testSections.get('[data-journal-status]').textContent;
const rowsOf = modal => modal.testSections.get('[data-journal-rows]').innerHTML;
const closeModal = modal => { if (modal?.open) modal.testClick('close'); };

test('journal money preserves real zero and cents; missing or malformed amounts are never zero', async () => {
  const { module } = await fixture();
  assert.match(module.journalMoney(0), /0/);
  assert.match(module.journalMoney(12345), /123\.45/);
  for (const value of [null, undefined, '', '100', false, NaN, Infinity, -1, 1.5]) {
    assert.doesNotMatch(module.journalMoney(value), /\d/, `malformed cents ${String(value)} must not become a numeric amount`);
  }
});

test('journal UTC dates display as Taiwan time rather than browser-local or double-shifted time', async () => {
  const { module } = await fixture();
  const formatted = module.journalTime('2026-09-16T13:57:00Z');
  assert.match(formatted, /21:57/);
  assert.doesNotMatch(formatted, /13:57/);
  assert.doesNotMatch(module.journalTime('not-a-date'), /Invalid Date|NaN/);
});

test('journal rows escape supplied shop/title/id and distinguish points from paid cash', async () => {
  const { module } = await fixture();
  const html = module.journalRowHtml(sample({ shopName: '<img src=x onerror=alert(1)>', title: '<script>alert(1)</script>', id: 'store:\" onclick=\"alert(1)' }));
  assert.doesNotMatch(html, /<img src=x|<script>|data-id="store:" onclick=/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script/);
  assert.match(html, /折抵|點/);
  assert.doesNotMatch(html, /已收現金/);
  assert.match(html, /未讀/);
  assert.match(module.journalRowHtml(sample({ earnedPoints: 25, discountPoints: 0 })), /消費贈點 25 點/, 'render the backend earnedPoints field rather than a nonexistent alias');
});

test('journal client sends the captured bearer token but never sends browser-selected UID', async () => {
  const f = await fixture(); const client = f.client();
  try {
    await client.request('?type=all');
    assert.equal(f.calls.length, 1);
    const call = f.calls[0];
    assert.match(String(call.url), /^http:\/\/127\.0\.0\.1:8775\/v1\/store-consumption-journal/);
    const headers = new Headers(call.options.headers);
    assert.equal(headers.get('authorization'), 'Bearer synthetic-token-a');
    assert.ok(!String(call.url).includes(A));
    assert.ok(!String(call.options.body || '').includes(A));
  } finally { client.close(); }
});

test('client rejects late list responses after account/token/navigation/close changes', async () => {
  for (const change of ['account', 'token', 'navigation', 'close']) {
    const f = await fixture(), wait = deferred(), client = f.client();
    globalThis.fetch = async () => wait.promise;
    const request = client.request('?type=all');
    const rejects = assert.rejects(request, undefined, `late ${change} response must not be usable`);
    if (change === 'account') window.currentUserProfile = { userId: B };
    if (change === 'token') f.setToken('synthetic-token-b');
    if (change === 'navigation') f.setActive(false);
    if (change === 'close') client.close();
    wait.resolve(response({ success: true, items: [sample()], snapshot: 'old' }));
    await rejects;
    client.close();
  }
});

test('structured API failures remain errors and read state is not claimed saved', async () => {
  for (const reply of [response({ success: false, error: '無法讀取日誌' }), response({ success: false, error: '已讀儲存失敗' }, 503)]) {
    const f = await fixture(), client = f.client();
    globalThis.fetch = async () => reply;
    try { await assert.rejects(client.request('/read', { id: 'store:SAMPLE', snapshot: 'snap' }), /失敗|無法/); }
    finally { client.close(); }
  }
});

test('modal suppresses duplicate open, detail click and read-all submissions', async () => {
  const f = await fixture(); mountDocument(); const calls = [], detailWait = deferred(), allWait = deferred();
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/detail?')) return detailWait.promise;
    if (url.endsWith('/read-all')) return allWait.promise;
    if (url.endsWith('/read')) return response({ success: true, unreadCount: 0 });
    return response(page());
  };
  const modal = f.module.openStoreConsumptionJournal({ base: 'http://127.0.0.1:8775' });
  try {
    assert.equal(f.module.openStoreConsumptionJournal({ base: 'http://127.0.0.1:8775' }), modal);
    await until(() => rowsOf(modal).includes('合成咖啡店'));
    assert.equal(calls.length, 1);
    modal.testClick('detail', 'store:SAMPLE'); modal.testClick('detail', 'store:SAMPLE');
    assert.equal(calls.filter(call => call.url.includes('/detail?')).length, 1);
    detailWait.resolve(response({ success: true, item: sample({ earnedPoints: 25 }) }));
    await until(() => calls.some(call => call.url.endsWith('/read')) && !modal.testControls.get('refresh:').disabled);
    assert.deepEqual(JSON.parse(calls.find(call => call.url.endsWith('/read')).options.body), { id: 'store:SAMPLE', snapshot: 'snap-one' });
    assert.match(modal.testSections.get('[data-journal-detail-view]').innerHTML, /消費贈點<\/dt><dd>25 點/);
    assert.doesNotMatch(rowsOf(modal), /class="journal-unread"/);
    modal.testClick('list');
    // Use a fresh unread page before testing duplicate read-all requests.
    modal.testClick('refresh'); await until(() => rowsOf(modal).includes('class="journal-unread"'));
    modal.testClick('read-all'); modal.testClick('read-all');
    assert.equal(calls.filter(call => call.url.endsWith('/read-all')).length, 1);
    assert.deepEqual(JSON.parse(calls.find(call => call.url.endsWith('/read-all')).options.body), { snapshot: 'snap-one' });
    allWait.resolve(response({ success: true, unreadCount: 0 }));
    await until(() => statusOf(modal).includes('已標示為已讀'));
  } finally { closeModal(modal); }
});

test('pagination preserves snapshot and filters, deduplicates transaction IDs and refresh resets cursor', async () => {
  const f = await fixture(); mountDocument(); const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options }); const parsed = new URL(url);
    if (parsed.searchParams.has('cursor')) return response(page([sample(), sample({ id: 'online:SECOND', source: 'online', sourceId: 'SECOND', shopName: '合成網店' })]));
    return response(page([sample()], { nextCursor: 'opaque-next' }));
  };
  const modal = f.module.openStoreConsumptionJournal({ base: 'http://127.0.0.1:8775' });
  try {
    await until(() => rowsOf(modal).includes('合成咖啡店'));
    modal.testForm.elements.type.value = 'store'; modal.testForm.elements.start.value = '2026-09-01'; modal.testForm.elements.end.value = '2026-09-18';
    modal.testForm.dispatch('submit'); await until(() => calls.length === 2 && !modal.testControls.get('refresh:').disabled);
    modal.testClick('more'); await until(() => rowsOf(modal).includes('合成網店'));
    const params = new URL(calls[2].url).searchParams;
    assert.deepEqual(Object.fromEntries(params), { type: 'store', start: '2026-09-01', end: '2026-09-18', cursor: 'opaque-next', snapshot: 'snap-one' });
    assert.equal((rowsOf(modal).match(/data-id="store:SAMPLE"/g) || []).length, 1);
    modal.testClick('refresh'); await until(() => calls.length === 4 && !modal.testControls.get('refresh:').disabled);
    assert.equal(new URL(calls[3].url).searchParams.has('cursor'), false);
    assert.equal(new URL(calls[3].url).searchParams.has('snapshot'), false);
    assert.equal(new URL(calls[3].url).searchParams.get('start'), '2026-09-01');
  } finally { closeModal(modal); }
});

test('failed detail does not mark read; failed mark-read retains unread and explicitly reports failure', async () => {
  for (const failDetail of [true, false]) {
    const f = await fixture(); mountDocument(); const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/detail?')) return response(failDetail ? { success: false, error: '找不到這筆交易' } : { success: true, item: sample() }, failDetail ? 404 : 200);
      if (url.endsWith('/read')) return response({ success: false, error: '儲存失敗' }, 503);
      return response(page());
    };
    const modal = f.module.openStoreConsumptionJournal({ base: 'http://127.0.0.1:8775' });
    try {
      await until(() => rowsOf(modal).includes('合成咖啡店'));
      modal.testClick('detail', 'store:SAMPLE');
      await until(() => /找不到|尚未儲存/.test(statusOf(modal)));
      assert.equal(calls.filter(call => call.url.endsWith('/read')).length, failDetail ? 0 : 1);
      assert.match(rowsOf(modal), /class="journal-unread"/);
      if (!failDetail) assert.match(statusOf(modal), /明細已載入，但已讀狀態尚未儲存/);
    } finally { closeModal(modal); }
  }
});

test('failed refresh preserves existing records and does not masquerade as empty history', async () => {
  const f = await fixture(); mountDocument(); let calls = 0;
  globalThis.fetch = async () => response(++calls === 1 ? page() : { success: false, error: '日誌讀取失敗' }, calls === 1 ? 200 : 503);
  const modal = f.module.openStoreConsumptionJournal({ base: 'http://127.0.0.1:8775' });
  try {
    await until(() => rowsOf(modal).includes('合成咖啡店')); modal.testClick('refresh');
    await until(() => statusOf(modal).includes('日誌讀取失敗'));
    assert.match(rowsOf(modal), /合成咖啡店/); assert.match(statusOf(modal), /原紀錄保留/); assert.doesNotMatch(statusOf(modal), /沒有消費/);
  } finally { closeModal(modal); }
});

test('close/account/token/navigation clears modal and ignores a delayed result', async () => {
  for (const change of ['close', 'account', 'token', 'navigation']) {
    const f = await fixture(), doc = mountDocument(), wait = deferred();
    globalThis.fetch = async () => wait.promise;
    let current = true;
    const modal = f.module.openStoreConsumptionJournal({ base: 'http://127.0.0.1:8775', isCurrent: () => current });
    try {
      if (change === 'close') closeModal(modal);
      if (change === 'account') window.currentUserProfile = { userId: B };
      if (change === 'token') f.setToken('another-token');
      if (change === 'navigation') current = false;
      wait.resolve(response(page()));
      await until(() => !modal.isConnected);
      assert.equal(doc.document.body.children.includes(modal), false);
      assert.doesNotMatch(rowsOf(modal), /合成咖啡店/);
    } finally { closeModal(modal); }
  }
});
