import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/modules/cardmaster.js', import.meta.url), 'utf8');
const config = (extra = {}) => ({title: '測試商店', desc: '提供實際商品與服務介紹及聯絡資訊', imgUrl: 'https://example.com/card.jpg', buttons: [{l: '官網', u: 'https://example.com'}], isPrivate: true, theme: 'preserve', ...extra});
const card = (cfg = config()) => ({rowId: 'test-card', '自訂名片設定': JSON.stringify(cfg)});
const issue = {field: 'service', evidence: '保證獲利', reason: '未提供依據的保證收益承諾可能誤導讀者。', suggestion: '移除保證收益承諾，改填可查證的實際服務內容。'};
const failed = {pass: false, status: 'failed', riskLevel: 'medium', reasons: [issue.reason], suggestions: [issue.suggestion], issues: [issue]};

function fixture(currentCard = card(), response = {success: true, data: failed}, save = {success: true}) {
  const box = {innerHTML: '', className: '', classList: {add() {}, remove() {}}};
  const calls = [], feedback = [], toasts = [];
  const storage = new Map();
  const context = {
    console, Date, localStorage: {getItem: key => storage.get(key), setItem: (key, val) => storage.set(key, val)},
    document: {getElementById: id => id === 'cardmaster-result' ? box : null, addEventListener() {}},
    currentUser: {userId: 'test-user', role: 'user'}, currentUserCard: currentCard,
    LIMITS: {user: {cardmaster: Infinity}},
    showToast: (...args) => toasts.push(args),
    renderMatchmakeSafetyFeedback: (report, activeCard) => feedback.push({report, activeCard}),
    fetchAPI: async (action, payload) => {
      calls.push({action, payload});
      const value = action === 'reviewCardSafety' ? response : save;
      return typeof value === 'function' ? value(action, payload) : value;
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return {context, calls, feedback, toasts, box, storage};
}

test('canonical and legacy config/image aliases are read without false missing-field failures', () => {
  for (const alias of ['自訂名片設定', '電子名片設定', 'customConfig', 'custom_config', 'cardConfig', 'ecardConfig', '自訂版面', '名片設定', 'config']) {
    for (const imageKey of ['imgUrl', 'imgUrlLandscape', 'imgUrlPortrait', 'imgUrlSquare']) {
      const cfg = config(); delete cfg.imgUrl; cfg[imageKey] = 'https://example.com/card.jpg';
      const f = fixture({id: 'alias-card', [alias]: alias === 'customConfig' ? cfg : JSON.stringify(cfg)});
      assert.equal(f.context.validateCardPublicReadiness(f.context.currentUserCard).pass, true, alias + '/' + imageKey);
    }
  }
  const f = fixture({...card(), '電子名片設定': JSON.stringify(config({isPrivate: false, title: 'wrong'}))});
  assert.equal(f.context.getCardSafetyConfig(f.context.currentUserCard).title, '測試商店');
  assert.equal(f.context.getCardSafetyConfig(f.context.currentUserCard).isPrivate, true);
});

test('incomplete fields explain precise observed values and actionable fixes without calling AI', async () => {
  const f = fixture(card(config({title: 'A', desc: '短', imgUrl: '', buttons: [{l: '', u: ''}, {l: '網站', u: 'javascript:alert(1)'}]})));
  assert.equal(await f.context.ensureCardCanGoPublic(f.context.currentUserCard), false);
  const report = f.feedback.at(-1).report;
  assert.equal(report.status, 'readiness');
  assert.equal(report.issues.length, 5);
  assert.match(f.box.innerHTML, /標題只有 1 字/);
  assert.match(f.box.innerHTML, /說明不足 8 字/);
  assert.match(f.box.innerHTML, /按鈕 2/);
  assert.match(f.box.innerHTML, /怎麼修改/);
  assert.equal(f.calls.length, 0);
});

test('completed failure saves full report in canonical config and preserves other settings', async () => {
  const currentCard = {...card(), '電子名片設定': JSON.stringify(config())};
  const f = fixture(currentCard);
  assert.equal(await f.context.ensureCardCanGoPublic(currentCard), false);
  const stored = JSON.parse(currentCard['自訂名片設定']);
  assert.equal(stored.isPrivate, true);
  assert.equal(stored.theme, 'preserve');
  assert.deepEqual(stored.safetyReview.issues, [issue]);
  assert.deepEqual(stored.safetyReview.suggestions, failed.suggestions);
  assert.equal(stored.safetyReview.status, 'failed');
  assert.equal(stored.safetyReview.mode, 'ai');
  assert.ok(stored.safetyReview.reviewedAt);
  assert.equal(currentCard['電子名片設定'], currentCard['自訂名片設定']);
  assert.equal(f.calls[1].payload.data['電子名片設定'], undefined);
  assert.match(f.box.innerHTML, /服務說明/);
  assert.match(f.box.innerHTML, /保證獲利/);
  const reopened = fixture(JSON.parse(JSON.stringify(currentCard)));
  assert.equal(reopened.context.getCardSafetyFeedback(reopened.context.currentUserCard).status, 'failed');
});

test('review sends displayed config fields and a legacy row id, not stale top-level copy', async () => {
  const currentCard = {id: 'legacy-id', '服務項目': 'stale', custom_config: JSON.stringify(config({imgUrl: '', imgUrlPortrait: 'https://example.com/portrait.jpg'}))};
  const f = fixture(currentCard);
  await f.context.ensureCardCanGoPublic(currentCard);
  const payload = f.calls[0].payload.card;
  assert.equal(payload.rowId, 'legacy-id');
  assert.equal(payload.title, config().title);
  assert.equal(payload.service, config().desc);
  assert.equal(payload.imageUrl, 'https://example.com/portrait.jpg');
  assert.equal(f.calls[1].payload.rowId, 'legacy-id');
});

test('service exceptions and unsuccessful API responses do not pass or mutate privacy/report', async () => {
  for (const response of [() => { throw new Error('provider secret raw text'); }, {success: false, error: 'provider secret raw text'}, {success: false, errorCode: 'AI_REVIEW_IMAGE_INCOMPLETE'}]) {
    const currentCard = card(config({isPrivate: false, safetyReview: {pass: true, mode: 'ai'}}));
    const before = JSON.stringify(currentCard);
    const f = fixture(currentCard, response);
    assert.equal(await f.context.ensureCardCanGoPublic(currentCard), false);
    assert.equal(JSON.stringify(currentCard), before);
    assert.equal(f.calls.length, 1);
    assert.equal(f.feedback.at(-1).report.status, 'error');
    assert.equal(f.context.getCardSafetyFeedback(currentCard).status, 'error', 'transient error is not replaced by old passed report');
    assert.match(f.box.innerHTML, /未完成/);
    assert.doesNotMatch(f.box.innerHTML, /provider secret|基本健檢通過/);
    assert.equal(f.storage.size, 0);
  }
});

test('malformed boolean, basic fallback and incomplete results never authorize public access', async () => {
  for (const data of [null, {pass: 'false'}, {pass: true, basicFallback: true}, {pass: true, mode: 'basic'}, {pass: false}, {pass: true, status: 'failed'}]) {
    const f = fixture(card(), {success: true, data});
    assert.equal(await f.context.ensureCardCanGoPublic(f.context.currentUserCard), false);
    assert.equal(f.calls.length, 1);
    assert.equal(f.feedback.at(-1).report.status, 'error');
  }
});

test('legacy string reasons are retained and HTML in reports is safely escaped', () => {
  const f = fixture(card(config({safetyReview: {pass: false, reasons: '<script>alert(1)</script>'}})));
  const report = f.context.getCardSafetyFeedback(f.context.currentUserCard);
  assert.equal(report.status, 'failed');
  assert.equal(report.reasons[0], '<script>alert(1)</script>');
  assert.match(report.suggestions[0], /舊版未儲存/);
  const html = f.context.renderCardSafetyFeedbackHtml({...failed, issues: [{...issue, field: '<img>', evidence: '<script>alert(1)</script>'}]});
  assert.doesNotMatch(html, /<script>|<img>/);
  assert.match(html, /&lt;script&gt;/);
});

test('failed saving cannot change local privacy or grant success and explains the save failure', async () => {
  for (const data of [failed, {pass: true, status: 'passed', reasons: [], suggestions: [], issues: []}]) {
    const currentCard = card(config({isPrivate: false}));
    const before = JSON.stringify(currentCard);
    const f = fixture(currentCard, {success: true, data}, {success: false, error: 'save error'});
    assert.equal(await f.context.ensureCardCanGoPublic(currentCard), false);
    assert.equal(JSON.stringify(currentCard), before);
    assert.equal(f.feedback.at(-1).report.errorCode, 'REVIEW_SAVE_FAILED');
    assert.match(f.box.innerHTML, /未能儲存/);
    if (data === failed) assert.match(f.box.innerHTML, /保證獲利/);
  }
});

test('valid completed review is saved before allowing the separate explicit public toggle', async () => {
  const f = fixture(card(), {success: true, data: {pass: true, status: 'passed', reasons: [], suggestions: [], issues: []}});
  assert.equal(await f.context.ensureCardCanGoPublic(f.context.currentUserCard), true);
  assert.deepEqual(f.calls.map(call => call.action), ['reviewCardSafety', 'updateCard']);
  const saved = JSON.parse(f.context.currentUserCard['自訂名片設定']);
  assert.equal(saved.safetyReview.pass, true);
  assert.equal(saved.isPrivate, true, 'review does not silently opt the user into the public pool');
});

test('a response for changed card content or login does not write stale review', async () => {
  for (const change of [f => { f.context.currentUserCard['自訂名片設定'] = JSON.stringify(config({desc: '已修改的新的服務說明文字'})); }, f => { f.context.currentUser.userId = 'another-user'; }]) {
    let f;
    f = fixture(card(), () => { change(f); return {success: true, data: failed}; });
    assert.equal(await f.context.ensureCardCanGoPublic(f.context.currentUserCard), false);
    assert.equal(f.calls.length, 1);
    assert.equal(f.feedback.at(-1).report.errorCode, 'CARD_CHANGED');
  }
});

test('opening feedback is read only and distinguishes pending review from actual failed review', () => {
  const f = fixture();
  assert.equal(f.context.getCardSafetyFeedback(f.context.currentUserCard).status, 'pending');
  assert.equal(f.calls.length, 0);
  assert.equal(JSON.parse(f.context.currentUserCard['自訂名片設定']).isPrivate, true);
});

test('completed failed reviews synchronize existing legacy privacy flags but service errors leave them untouched', async () => {
  for (const serviceError of [true, false]) {
    const currentCard = card(config({isPrivate: false, private: false, visibility: 'public'}));
    const f = fixture(currentCard, serviceError ? {success: false} : {success: true, data: failed});
    await f.context.ensureCardCanGoPublic(currentCard);
    const saved = JSON.parse(currentCard['自訂名片設定']);
    assert.equal(saved.isPrivate, !serviceError);
    assert.equal(saved.private, !serviceError);
    assert.equal(saved.visibility, serviceError ? 'public' : 'private');
  }
});

test('direct settings review also shows readiness details without wasting an AI request', async () => {
  const f = fixture(card(config({buttons: []})));
  await f.context.runMyCardSafetyReview();
  assert.equal(f.calls.length, 0);
  assert.match(f.box.innerHTML, /尚未設定聯絡按鈕/);
});

test('incomplete AI observations remain visible without becoming a content violation', async () => {
  const f = fixture(card(), {success: false, errorCode: 'AI_REVIEW_INCOMPLETE', data: {pass: false, status: 'error', reasons: ['圖片內容無法讀取，未能判讀文字。'], suggestions: ['請重新上傳清晰圖片。']}});
  assert.equal(await f.context.ensureCardCanGoPublic(f.context.currentUserCard), false);
  assert.match(f.box.innerHTML, /圖片內容無法讀取/);
  assert.match(f.box.innerHTML, /重新上傳清晰圖片/);
  assert.match(f.box.innerHTML, /未完成/);
  assert.equal(f.calls.length, 1);
});
