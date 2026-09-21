import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/modules/cards.js', import.meta.url), 'utf8');
const coreSource = readFileSync(new URL('../js/core.js', import.meta.url), 'utf8');
const loadCardDataStart = coreSource.indexOf('window.loadCardData = async function');
const loadCardDataEnd = coreSource.indexOf('// === 5. LIFF', loadCardDataStart);
assert.ok(loadCardDataStart >= 0 && loadCardDataEnd > loadCardDataStart, 'extract only the real loader, never run login/bootstrap');
const intent = { offer: '食品通路', seek: '日本經銷商', collaboration: '聯合推廣' };
const intentKey = JSON.stringify(intent);

function card(id, score = 75, extra = {}) {
  return {
    rowId: id, 姓名: id, sourceType: 'private_import', scannerUserId: 'U_SELF',
    公司名稱: '食品公司', 職稱: '業務', 業種: '餐飲食品',
    created_at: '2026-09-01T00:00:00Z',
    aiMatch: { status: 'completed', score, reason: '食品通路可協助日本商品在地推廣。', source: 'ai', updatedAt: '2026-09-18T00:00:00Z', intentKey },
    ...extra,
  };
}

function harness(cards = [], options = {}) {
  const nodes = new Map();
  const created = [];
  const makeElement = (tagName = 'div') => {
    const element = {
      tagName: tagName.toUpperCase(), id: '', innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, attributes: {}, children: [],
      className: '', isConnected: true, open: false,
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      appendChild(child) { this.children.push(child); child.parentNode = this; if (child.id) nodes.set(child.id, child); return child; },
      append(...children) { children.forEach(child => this.appendChild(child)); },
      remove() { this.isConnected = false; nodes.delete(this.id); if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); },
      addEventListener(name, callback) { this['on' + name] = callback; },
      querySelector() { return makeElement('button'); }, querySelectorAll() { return []; },
      showModal() { this.open = true; }, close() { this.open = false; }, focus() {},
    };
    created.push(element);
    return element;
  };
  for (const id of ['card-list', 'search-card-input']) { const element = makeElement(); element.id = id; nodes.set(id, element); }
  const body = makeElement('body');
  const notices = [];
  const window = {
    currentUserProfile: { userId: 'U_SELF' }, currentUser: { userId: 'U_SELF' }, userRole: 'user',
    harvestCards: cards, allCards: cards,
    currentUserCard: { rowId: 'SELF', 'LINE ID': 'U_SELF', 自訂名片設定: JSON.stringify({ businessIntent: intent }) },
    showToast: message => notices.push(message), goPage() {},
    ...options,
  };
  const document = {
    body, head: makeElement('head'), activeElement: makeElement('button'), getElementById: id => nodes.get(id) ?? null,
    createElement: makeElement, querySelectorAll: () => [],
    querySelector: selector => selector.startsWith('#') ? nodes.get(selector.slice(1)) ?? null : created.find(node => node.attributes.role === 'dialog') ?? null,
    addEventListener() {}, removeEventListener() {},
  };
  const context = vm.createContext({ window, document, console: { ...console, error() {} }, alert: message => notices.push(message), setTimeout, clearTimeout });
  vm.runInContext(source, context);
  return {
    window, document, nodes, created, notices,
    loadActualCoreLoader() { window.syncUserCardMatch = () => {}; vm.runInContext(coreSource.slice(loadCardDataStart, loadCardDataEnd), context); },
    render() { window.renderCardList(cards); return nodes.get('card-list').innerHTML; },
    html() { return nodes.get('card-list').innerHTML; },
    ids() { return [...nodes.get('card-list').innerHTML.matchAll(/openCardDetailByRowId\('([^']+)'\)/g)].map(match => match[1]); },
  };
}

test('collection displays real percentage including zero and separates AI from rule estimates', () => {
  const h = harness([card('ZERO', 0), card('RULE', 68, { aiMatch: { ...card('seed').aiMatch, score: 68, source: 'rules' } })]);
  const html = h.render();
  assert.match(html, /\b0%/);
  assert.match(html, /68%/);
  assert.match(html, /AI 配對/);
  assert.match(html, /規則評估/);
  assert.match(html, /最新收藏/);
  assert.match(html, /配對排名/);
  assert.match(html, /aria-pressed="true"[^>]*setCardListSortMode\('latest'\)/);
});

test('invalid or absent score never turns into a misleading zero percent', () => {
  for (const score of [null, undefined, '', '75', false, NaN, Infinity, -1, 101]) {
    const h = harness([card('INVALID', score)]);
    if (score === undefined) delete h.window.harvestCards[0].aiMatch.score;
    assert.doesNotMatch(h.render(), /\d+(?:\.\d+)?%/, `unexpected score display for ${String(score)}`);
  }
  for (const status of ['pending', 'stale', 'unavailable', 'needs_login']) {
    const h = harness([card('PENDING', 75, { aiMatch: { ...card('seed').aiMatch, status } })]);
    assert.doesNotMatch(h.render(), /75%/, `a ${status} cache is not a current result`);
  }
  const h = harness([card('INTENT', null, { aiMatch: { status: 'needs_intent', score: null } })]);
  assert.match(h.render(), /待配對/); assert.doesNotMatch(h.render(), /先填需求/);
});

test('latest is default; match sorts globally before pagination, with pending last and newest ties', () => {
  const cards = Array.from({ length: 12 }, (_, index) => card('CARD_' + index, index * 5, { created_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z` }));
  cards[0].aiMatch.score = 99;
  cards[1].aiMatch.score = 99;
  cards[11].aiMatch.status = 'pending';
  const h = harness(cards);
  h.render();
  assert.equal(h.ids()[0], 'CARD_11');
  assert.equal(h.ids().length, 10);
  h.window.setCardListSortMode('match');
  assert.deepEqual(h.ids().slice(0, 2), ['CARD_1', 'CARD_0']);
  assert.equal(h.ids().includes('CARD_11'), false);
  h.window.loadMoreCards();
  assert.equal(h.ids().length, 12);
  assert.equal(h.ids().at(-1), 'CARD_11');
  h.window.setCardListSortMode('latest');
  assert.equal(h.ids()[0], 'CARD_11');
  assert.equal(h.ids().length, 10);
});

test('sort switching retains search, industry filters, harvest ownership and detail access', () => {
  const cards = [
    card('FOOD_LOW', 20, { 姓名: '搜尋食品甲' }),
    card('FOOD_HIGH', 90, { 姓名: '搜尋食品乙' }),
    card('OTHER_SEARCH', 95, { 姓名: '其他食品' }),
    card('OTHER_INDUSTRY', 96, { 姓名: '搜尋業務', 公司名稱: '保險公司', 業種: '金融保險' }),
    card('FOREIGN_PRIVATE', 100, { 姓名: '搜尋食品 чужой', scannerUserId: 'U_OTHER' }),
    card('REFERRAL', 100, { sourceType: 'referral_placeholder', 姓名: '搜尋食品邀請' }),
    card('OWN_PROFILE', 100, { sourceType: 'self_profile', 'LINE ID': 'U_SELF', 姓名: '搜尋食品本人' }),
    card('CLAIMED', 80, { sourceType: 'self_profile', 'LINE ID': 'U_INVITEE', 姓名: '搜尋食品認領' }),
  ];
  const h = harness(cards, { userRole: 'admin' });
  h.nodes.get('search-card-input').value = '搜尋';
  h.window.cardIndustryFilter = '餐飲食品';
  h.window.filterCards();
  h.window.setCardListSortMode('match');
  assert.deepEqual(h.ids(), ['FOOD_HIGH', 'CLAIMED', 'FOOD_LOW']);
  assert.equal(h.nodes.get('search-card-input').value, '搜尋');
  assert.equal(h.window.cardIndustryFilter, '餐飲食品');
  assert.equal(h.window.canEditCardRecord(cards.at(-1)), false, 'claimed cards remain read only');
});

test('changing own intent preserves score with historical label, not a fabricated current match', () => {
  const h = harness([card('CURRENT', 82)], { getCurrentBusinessIntent: () => ({ offer: '別張名片', seek: '錯誤來源', collaboration: '' }) });
  assert.match(h.render(), /82%/, 'last-viewed-card helper must not invalidate own-card match');
  h.window.currentUserCard.自訂名片設定 = JSON.stringify({ businessIntent: { ...intent, seek: '加拿大經銷商' } });
  assert.match(h.render(), /82%/, 'changed own intent must preserve older result');
  assert.match(h.render(), /既有 AI 配對/);
  const noOwnCard = harness([card('SERVER', 82)], { currentUserCard: null });
  assert.match(noOwnCard.render(), /82%/, 'server metadata remains usable before own-card background load');
});

test('reason popup escapes untrusted text, is closable and cannot reveal another owner card', async () => {
  const malicious = '<img src=x onerror="alert(1)"> & 合作理由';
  const own = card('OWN', 82, { aiMatch: { ...card('seed').aiMatch, score: 82, reason: malicious } });
  const foreign = card('FOREIGN', 99, { scannerUserId: 'U_OTHER', aiMatch: { ...card('seed').aiMatch, score: 99, reason: '不應公開的配對理由' } });
  const h = harness([own, foreign]);
  h.render();
  await h.window.showCollectedCardMatch('OWN');
  const allMarkup = h.created.map(node => node.innerHTML).join('\n');
  const allText = h.created.map(node => node.textContent).join('\n');
  assert.doesNotMatch(allMarkup, /<img src=x onerror=/);
  assert.ok(allMarkup.includes('&lt;img') || allText.includes(malicious), 'reason must remain available as inert text');
  assert.ok(h.created.some(node => node.tagName === 'DIALOG' || node.attributes.role === 'dialog' || /role="dialog"/.test(node.innerHTML)));
  assert.match(allMarkup + allText, /關閉|取消|close/i);
  await h.window.showCollectedCardMatch('FOREIGN');
  assert.doesNotMatch(h.created.map(node => node.innerHTML + node.textContent).join('\n'), /不應公開的配對理由/);
});

test('historical score stays visible with no intent and popup explains basis and original date',()=>{
  const old=card('OLD',82);old.aiMatch.basis='previous';old.aiMatch.intentKey='';
  const h=harness([old],{currentUserCard:{自訂名片設定:'{}'}});
  assert.match(h.render(),/82%/);assert.doesNotMatch(h.render(),/先填需求/);
  h.window.showCollectedCardMatch('OLD');const html=h.created.map(n=>n.innerHTML).join('\n');
  assert.match(html,/沿用既有需求評估/);assert.match(html,/2026-09-18/);
  assert.doesNotMatch(html,/依目前業務需求評估/);
});

test('refresh only reads collection data and retains the selected filters and sort mode', async () => {
  const calls = [];
  const h = harness([card('FOOD', 82)], { loadCardData: async options => { calls.push(JSON.parse(JSON.stringify(options))); } });
  h.nodes.get('search-card-input').value = 'FOOD';
  h.window.cardIndustryFilter = '餐飲食品';
  h.window.setCardListSortMode('match');
  await h.window.refreshCollectedCardMatches();
  assert.deepEqual(calls, [{ harvest: true, force: true, render: false, initPanels: false, throwOnError: true }]);
  assert.equal(h.window.cardListSortMode, 'match');
  assert.equal(h.window.cardIndustryFilter, '餐飲食品');
  assert.equal(h.nodes.get('search-card-input').value, 'FOOD');
  assert.equal(h.window.cardMatchRefreshing, false);
  assert.deepEqual(h.ids(), ['FOOD']);
});

test('opening public detail then returning reloads missing viewer-specific match metadata', async () => {
  const original = card('DETAIL', 82);
  const detail = { ...original, 公司名稱: '更新後食品公司' };
  delete detail.aiMatch;
  const fresh = { ...original, ...detail, aiMatch: { ...original.aiMatch, score: 91 } };
  const calls = [];
  const h = harness([original], {
    fetchAPI: async (action, payload, authenticated) => {
      calls.push({ action, rowId: payload.rowId, authenticated });
      if (action === 'getPublicCardById') return { success: true, data: detail };
      assert.equal(action, 'getCardHarvestContacts');
      return { success: true, data: [fresh] };
    },
  });
  h.loadActualCoreLoader();
  h.window.openCardDetail = value => { h.window.currentCard = value; };
  await h.window.openCardDetailByRowId('DETAIL');
  assert.equal(h.window.harvestCards[0].aiMatch, undefined, 'public detail lacks viewer score');
  await h.window.loadCardData({ harvest: true, initPanels: false });
  assert.deepEqual(calls.map(call => call.action), ['getPublicCardById', 'getCardHarvestContacts']);
  assert.equal(calls[1].authenticated, true);
  assert.match(h.html(), /91%/);
  await h.window.loadCardData({ harvest: true, initPanels: false });
  assert.equal(calls.length, 2, 'valid match cache keeps existing read fast path');
});

test('core cache fast path is invalidated when the own-card intent changes', async () => {
  const nextIntent = { ...intent, seek: '加拿大經銷商' };
  const original = card('CURRENT', 82);
  const updated = { ...original, aiMatch: { ...original.aiMatch, score: 63, intentKey: JSON.stringify(nextIntent) } };
  const calls = [];
  const h = harness([original], { fetchAPI: async action => { calls.push(action); return { success: true, data: [updated] }; } });
  h.loadActualCoreLoader();
  await h.window.loadCardData({ harvest: true, initPanels: false });
  assert.equal(calls.length, 0);
  h.window.currentUserCard.自訂名片設定 = JSON.stringify({ businessIntent: nextIntent });
  await h.window.loadCardData({ harvest: true, initPanels: false });
  assert.deepEqual(calls, ['getCardHarvestContacts']);
  assert.match(h.html(), /63%/);
  assert.doesNotMatch(h.html(), /82%/);
});

test('structured errors and malformed responses preserve the old collection and explain refresh failure', async () => {
  for (const response of [null, { success: false, error: '測試讀取失敗' }, { success: true, error: '來源不可用', data: [] }, { success: true, data: {} }]) {
    const original = card('KEEP_ME', 82);
    const h = harness([original], { fetchAPI: async () => response });
    h.loadActualCoreLoader();
    h.render();
    const cached = h.window.harvestCards;
    await h.window.refreshCollectedCardMatches();
    assert.equal(h.window.harvestCards, cached);
    assert.equal(h.window.harvestCards[0], original);
    assert.match(h.html(), /82%/);
    assert.ok(h.notices.some(notice => /已保留原名單/.test(notice)));
    assert.equal(h.window.cardMatchRefreshing, false);
  }
});
