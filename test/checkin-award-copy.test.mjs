import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const auth = fs.readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');
const cropper = fs.readFileSync(new URL('../js/modules/cropper.js', import.meta.url), 'utf8');
const claim = auth.match(/window\.claimDailyPointCheckin\s*=\s*async function[\s\S]*?\n\};/)?.[0];
const popup = cropper.slice(cropper.indexOf('function showPointAwardCelebration('), cropper.indexOf('\nfunction normalizeSavedCard'));
assert.ok(claim && popup, 'real production functions must be available');

function fixture(response, { popupAvailable = true } = {}) {
  const popups = [];
  const requests = [];
  const toasts = [];
  const status = { textContent: '' };
  const button = { innerHTML: '<span>簽到贈點</span>', disabled: false, classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    URLSearchParams,
    setTimeout(callback, delay) { if (delay === 1000) callback(); return 1; },
    clearTimeout() {},
    document: {
      getElementById(id) { return id === 'daily-checkin-status' ? status : null; },
      createElement() { return { innerHTML: '', addEventListener() {}, remove() {} }; },
      body: { appendChild(element) { popups.push(element); } }
    },
    window: {
      currentUserProfile: { userId: 'test-line-user' },
      location: { search: '' },
      resolvePointUserIdForCurrentProfile: () => 'test-point-user',
      fetchAPI: async (...args) => { requests.push(args); return response; },
      showToast: (...args) => toasts.push(args),
      loadPointsWallet: async () => {},
      refreshPointBalanceBadge: async () => {}
    }
  });
  vm.runInContext(popup, context);
  if (popupAvailable) context.window.showPointAwardCelebration = context.showPointAwardCelebration;
  vm.runInContext(claim, context);
  return { context, popups, requests, toasts, status, button };
}

const success = { success: true, data: { awarded: true, points: 10, balance: 120 } };

test('daily check-in uses its own success copy and keeps the existing action and identity payload', async () => {
  const f = fixture(success);
  await f.context.window.claimDailyPointCheckin(f.button);
  assert.equal(f.popups.length, 1);
  assert.match(f.popups[0].innerHTML, /簽到成功，獲得 10 點/);
  assert.match(f.popups[0].innerHTML, /每日簽到獎勵/);
  assert.doesNotMatch(f.popups[0].innerHTML, /名片/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.requests)), [['dailyPointCheckin', {
    userId: 'test-line-user', pointUserId: 'test-point-user', pt_uid: 'test-point-user'
  }, true]]);
  assert.equal(f.button.disabled, false);
  assert.equal(f.button.innerHTML, '<span>簽到贈點</span>');
});

test('check-in popup displays the returned reward, not a fixed ten points', async () => {
  const f = fixture({ success: true, data: { awarded: true, points: 20 } });
  await f.context.window.claimDailyPointCheckin(null);
  assert.match(f.popups[0].innerHTML, /簽到成功，獲得 20 點/);
});

test('already claimed does not show another success popup', async () => {
  const f = fixture({ success: true, data: { awarded: false, alreadyChecked: true, points: 0 } });
  await f.context.window.claimDailyPointCheckin(f.button);
  assert.equal(f.popups.length, 0);
  assert.match(f.toasts[0][0], /今天已領取過贈點/);
  assert.equal(f.button.disabled, false);
});

test('failed check-in never shows award success and restores the button', async () => {
  const f = fixture({ success: false, error: '測試失敗' });
  await f.context.window.claimDailyPointCheckin(f.button);
  assert.equal(f.popups.length, 0);
  assert.match(f.toasts[0][0], /每日簽到失敗：測試失敗/);
  assert.equal(f.toasts[0][1], true);
  assert.equal(f.button.disabled, false);
});

test('toast fallback also names check-in success', async () => {
  const f = fixture(success, { popupAvailable: false });
  await f.context.window.claimDailyPointCheckin(null);
  assert.equal(f.popups.length, 0);
  assert.match(f.toasts[0][0], /簽到成功，已贈送 10 點/);
});

test('existing card reward callers keep their original copy', () => {
  const f = fixture(success);
  f.context.showPointAwardCelebration(10);
  assert.match(f.popups[0].innerHTML, /恭喜獲得 10 點/);
  assert.match(f.popups[0].innerHTML, /新增不重複名片成功/);
  assert.doesNotMatch(f.popups[0].innerHTML, /簽到/);
});

test('nonpositive rewards do not show a popup', () => {
  const f = fixture(success);
  f.context.showPointAwardCelebration(0, 'daily-checkin');
  f.context.showPointAwardCelebration(-10);
  assert.equal(f.popups.length, 0);
});
