import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const auth = readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = auth.indexOf('function registrationBirthdayToISO(');
const submit = auth.indexOf('window.submitRegistration =', start);
const end = auth.indexOf('window.saveProfileRegistration =', submit);
assert(start >= 0 && submit > start && end > submit);
const convert = vm.runInNewContext(auth.slice(start, submit) + ';registrationBirthdayToISO');

test('ROC numeric birthdays convert to the existing ISO storage format', () => {
  for (const [input, expected] of [
    ['591021', '1970-10-21'], ['390305', '1950-03-05'], ['010101', '1912-01-01'],
    ['890229', '2000-02-29'], ['1000101', '2011-01-01'], ['1130229', '2024-02-29'],
    [' ５９１０２１ ', '1970-10-21'], ['', ''], ['  ', '']
  ]) assert.equal(convert(input, '2026-10-04'), expected, input);
});

test('invalid, partial, Gregorian and future birthdays cannot silently roll over', () => {
  for (const value of ['000101', '591301', '590001', '591000', '590431', '590229', '1120229',
    '20261004', '59/10/21', '1970-10-21', '59102', 'abc123', '1160101', '1151005']) {
    assert.throws(() => convert(value, '2026-10-04'), /生日/, value);
  }
  assert.equal(convert('1151004', '2026-10-04'), '2026-10-04');
});

function registration(value, agreed = true) {
  const elements = Object.fromEntries(Object.entries({ 'reg-name': '測試會員', 'reg-phone': '0912345678',
    'reg-industry': '測試業種', 'reg-birthday': value, 'btn-register': '' }).map(([id, value]) =>
    [id, { value, disabled: false, focus() { this.focused = true; } }]));
  const calls = [], toasts = [], sessions = [];
  const context = vm.createContext({ URLSearchParams, setTimeout() {}, document: { getElementById: id => elements[id] },
    localStorage: { setItem() {} }, resolveReferralForRegistration: () => ({ referrerId: 'ref-test', networkId: 'net-test' }),
    window: { location: { search: '?ref=ref-test&net=net-test' }, currentUserProfile: { userId: 'user-test' },
      showToast: (...args) => toasts.push(args), requirePrivacyTermsAgreement: () => agreed,
      fetchAPI: async (...args) => { calls.push(args); return { isRegistered: true }; },
      applyRegisteredUserSession: value => sessions.push(value) } });
  vm.runInContext(auth.slice(start, end), context);
  return { context, elements, calls, toasts, sessions, run: () => context.window.submitRegistration() };
}

test('actual registration submits converted birthday with identity/referral/other fields unchanged', async () => {
  for (const [input, expected] of [['591021', '1970-10-21'], ['390305', '1950-03-05'], ['', '']]) {
    const f = registration(input); await f.run();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0][0], 'registerUser');
    assert.equal(f.calls[0][2], true);
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0][1])), { userId: 'user-test', name: '測試會員',
      phone: '0912345678', industry: '測試業種', birthday: expected, '推薦人': 'ref-test', referrerId: 'ref-test', networkId: 'net-test' });
    assert.equal(f.sessions[0].birthday, expected);
  }
});

test('invalid input focuses the birthday field without requests or disabling submit', async () => {
  const f = registration('590231'); await f.run();
  assert.equal(f.calls.length, 0);
  assert.equal(f.elements['reg-birthday'].focused, true);
  assert.equal(f.elements['btn-register'].disabled, false);
  assert.match(f.toasts[0][0], /生日日期不正確/);
  assert.equal(f.elements['reg-birthday'].value, '590231');
});

test('required name/phone and privacy consent still guard registration', async () => {
  const noConsent = registration('591021', false); await noConsent.run(); assert.equal(noConsent.calls.length, 0);
  for (const id of ['reg-name', 'reg-phone']) {
    const f = registration('591021'); f.elements[id].value = ''; await f.run();
    assert.equal(f.calls.length, 0); assert.match(f.toasts[0][0], /姓名與手機/);
  }
});

test('only registration uses numeric text entry; profile/customer date pickers stay unchanged', () => {
  const field = html.match(/<input id="reg-birthday"[^>]+>/)[0];
  assert.match(field, /type="text"/); assert.match(field, /inputmode="numeric"/);
  assert.match(field, /maxlength="7"/); assert.match(field, /autocomplete="off"/);
  assert.doesNotMatch(field, /type="(?:date|number)"|required/);
  for (const id of ['profile-birthday', 'customer-birthday']) assert.match(html.match(new RegExp('<input id="' + id + '"[^>]+>'))[0], /type="date"/);
  assert.match(html, /js\/auth\.js\?[^"\s]+&birthday=1/);
  assert.doesNotMatch(auth.slice(end), /registrationBirthdayToISO\(/);
});
