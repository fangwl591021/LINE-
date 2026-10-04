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

test('both member-registration entries use numeric text; customer date picker stays unchanged', () => {
  for (const id of ['reg-birthday', 'profile-birthday']) {
  const field = html.match(new RegExp('<input id="' + id + '"[^>]+>'))[0];
  assert.match(field, /type="text"/); assert.match(field, /inputmode="numeric"/);
  assert.match(field, /maxlength="7"/); assert.match(field, /autocomplete="off"/);
  assert.doesNotMatch(field, /type="(?:date|number)"|required/);
  }
  assert.match(html.match(/<input id="customer-birthday"[^>]+>/)[0], /type="date"/);
  assert.match(html, /js\/auth\.js\?[^"\s]+&birthday=2/);
});

test('stored ISO birthday displays ROC digits and manual input is not overwritten', () => {
  const fields = { 'profile-birthday': { value: '', dataset: {} }, 'profile-name': { value: '', dataset: {} } };
  const context = vm.createContext({ document: { getElementById: id => fields[id] } });
  vm.runInContext(auth.slice(start, submit), context);
  const setterStart = auth.indexOf('function setInputValueUnlessTouched(');
  vm.runInContext(auth.slice(setterStart, auth.indexOf('window.prepareRegistrationInputs', setterStart)), context);
  for (const [iso, digits] of [['1970-10-21','591021'],['1950-03-05','390305'],['2011-01-01','1000101'],['1912-01-01','010101']]) {
    context.setInputValueUnlessTouched('profile-birthday', iso);
    assert.equal(fields['profile-birthday'].value, digits);
    assert.equal(context.registrationBirthdayToISO(digits), iso);
  }
  fields['profile-birthday'].dataset.userTouched = '1';
  fields['profile-birthday'].value = '390305';
  context.setInputValueUnlessTouched('profile-birthday', '1970-10-21');
  assert.equal(fields['profile-birthday'].value, '390305');
  context.setInputValueUnlessTouched('profile-name', '1970-10-21');
  assert.equal(fields['profile-name'].value, '1970-10-21');
});

test('home member registration/data-maintenance converts birthday on both create and update', async () => {
  for (const registered of [false, true]) {
    const f = registration('591021');
    for (const name of ['name','phone','industry','birthday']) f.elements['profile-' + name] = f.elements['reg-' + name];
    f.elements['btn-save-profile-registration'] = { disabled: false, innerHTML: '儲存' };
    f.context.window.getSocialLikeActorId = () => 'user-test';
    f.context.window.currentUser = { referrerId: 'original-ref', networkId: 'original-net' };
    f.context.window.fetchAPI = async (action, payload) => {
      f.calls.push([action, payload]);
      return action === 'checkUser' ? { isRegistered: registered } : { success: true };
    };
    vm.runInContext(auth.slice(end, auth.indexOf('window.submitClaimRegistration =', end)), f.context);
    await f.context.window.saveProfileRegistration();
    const saved = f.calls.find(([action]) => action !== 'checkUser');
    assert.equal(saved[0], registered ? 'updateUserProfile' : 'registerUser');
    assert.equal(saved[1].birthday, '1970-10-21');
    assert.equal(saved[1].referrerId, 'original-ref');
    assert.equal(saved[1].networkId, 'original-net');
    assert.equal(f.elements['btn-save-profile-registration'].disabled, false);
    f.calls.length = 0; f.elements['profile-birthday'].value = '590231';
    await f.context.window.saveProfileRegistration();
    assert.equal(f.calls.length, 0); assert.equal(f.elements['profile-birthday'].focused, true);
  }
});
