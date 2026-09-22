import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ecard = read('js/modules/ecard.js');
const adapter = read('js/modules/a-kaffit-card-scanner-adapter.js');
const mycard = read('js/modules/mycard.js');
const plain = value => JSON.parse(JSON.stringify(value));
const card = {
  姓名: '測試聯絡人', 手機號碼: '0912-345-678', 公司電話: '02-2345-6789',
  電子郵件: 'contact@example.com', 公司網址: 'www.example.com', 公司地址: '台北市測試路 1 號',
  社群帳號: JSON.stringify([{ t: 'LINE', u: 'https://line.me/ti/p/test' }])
};
function runtime() {
  const context = vm.createContext({
    window: { location: { href: 'https://example.com/' } }, URL, URLSearchParams, console,
    document: { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
    setTimeout() {}, clearTimeout() {}
  });
  vm.runInContext(ecard, context);
  return context;
}

test('all recognized contacts generate separate actions without a four-button cap', () => {
  const ctx = runtime();
  const buttons = plain(ctx.buildRecognizedCardButtons(card));
  assert.equal(buttons.length, 6);
  assert.deepEqual(buttons.slice(0, 4).map(b => b.u), ['tel:0912345678', 'tel:0223456789', 'mailto:contact@example.com', 'https://www.example.com/']);
  assert.equal(ctx.buildRecognizedCardButtons({}).length, 0);
  assert.equal(ctx.buildRecognizedCardButtons({ 公司電話: '02-2345-6789' })[0].l, '公司電話');
});

test('old stored aliases, duplicate contacts, multiple emails, and unsafe URLs', () => {
  const ctx = runtime();
  assert.equal(ctx.buildRecognizedCardButtons({ mobile: '0912345678', office_phone: '0912-345-678' }).length, 1);
  assert.equal(ctx.buildRecognizedCardButtons({ Email: 'a@example.com; b@example.com', website_url: 'example.com' }).length, 3);
  assert.equal(ctx.buildRecognizedCardButtons({ website: 'javascript:alert(1)', email: 'not an email' }).length, 0);
  assert.equal(ctx.buildRecognizedCardButtons({ socials: '{"LINE":"https://line.me/ti/p/test"}' })[0].u, 'https://line.me/ti/p/test');
});

test('custom and deleted buttons never regenerate or change into map actions', () => {
  const ctx = runtime();
  const existing = [{ l: '官網', u: 'https://example.com/', c: '#123456' }];
  assert.deepEqual(plain(ctx.buildAutoECardButtons(card, existing)), existing);
  assert.deepEqual(plain(ctx.buildAutoECardButtons(card, [])), []);
  assert.equal(ctx.buildAutoECardButtons(card).length, 6);
});

test('scan review saves every contact and preserves private ownership payload', async () => {
  const ctx = runtime();
  vm.runInContext(adapter.replace(/^import[^\n]*\n/, ''), ctx);
  ctx.input = { data: { displayName: '測試聯絡人', mobile: '0912-345-678', office_phone: '02-2345-6789', Email: 'contact@example.com', website_url: 'www.example.com', address: '台北市測試路 1 號' } };
  const normalized = plain(vm.runInContext('normalizeCardData(input)', ctx));
  assert.equal(normalized['電子郵件'], card['電子郵件']);
  assert.equal(normalized['公司電話'], card['公司電話']);
  assert.equal(normalized['公司網址'], card['公司網址']);
  let saved;
  ctx.window.currentUserProfile = { userId: 'scanner-test' };
  ctx.window.fetchAPI = async (action, payload) => { assert.equal(action, 'saveCard'); saved = payload; return { rowId: 'test-card' }; };
  const button = {};
  const fields = { querySelectorAll: () => Object.entries(normalized).map(([key, value]) => ({ dataset: { akField: key }, value })), querySelector: () => null };
  const modal = { querySelector: selector => selector === '#ak-review-save' ? button : selector === '#ak-review-fields' ? fields : null, querySelectorAll: () => [] };
  await ctx.saveReviewedCard(modal, '');
  assert.ok(saved, 'saveCard must be called');
  assert.equal(saved.userId, '');
  assert.equal(saved.creatorId, 'scanner-test');
  assert.equal(JSON.parse(saved['自訂名片設定']).buttons.length, 5);
  assert.equal(saved['電子郵件'], card['電子郵件']);
  assert.equal(saved['公司電話'], card['公司電話']);
});

test('record editor normalizes and saves all contacts while personal cards keep four', () => {
  const ctx = runtime();
  const expose = '\nwindow.testButtons = { normalizeMyCardButtons, normalizeMyCardButtonsForSave, setRecord: value => { wysiwygState.recordMode = value; } };\n';
  vm.runInContext(mycard.replace(/\}\)\(\);\s*$/, expose + '})();'), ctx);
  const api = ctx.window.testButtons;
  const buttons = ctx.buildRecognizedCardButtons(card);
  api.setRecord(true);
  assert.equal(api.normalizeMyCardButtons(buttons).length, 6);
  assert.equal(api.normalizeMyCardButtonsForSave(buttons).length, 6);
  assert.equal(api.normalizeMyCardButtonsForSave(buttons.slice(0, 5)).length, 5);
  assert.equal(api.normalizeMyCardButtonsForSave([]).length, 0);
  api.setRecord(false);
  assert.equal(api.normalizeMyCardButtons(buttons).length, 4);
  assert.equal(api.normalizeMyCardButtonsForSave(buttons).length, 4);
});

test('local LINE share includes all six contacts and respects empty buttons', () => {
  const ctx = runtime();
  const cfg = { imgUrl: 'https://example.com/card.jpg', buttons: ctx.buildRecognizedCardButtons(card) };
  const flex = ctx.buildLocalECardFlexMessage(card, cfg, 'https://example.com/card');
  assert.equal(flex.footer.contents.length, 6);
  assert.equal(ctx.buildLocalECardFlexMessage(card, { ...cfg, buttons: [] }, 'https://example.com/card').footer, undefined);
});
