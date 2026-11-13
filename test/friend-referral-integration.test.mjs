import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import entry from '../worker-entry.mjs';
import { issueFriendReferralForVerifiedUser } from '../worker/friend-referral-credit.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const auth = read('../js/auth.js');
const worker = read('../workerbackup.js');
const config = read('../js/config.js');
const ref = 'U' + 'b'.repeat(32);
const challenge = 'signed-challenge';

function frontend(fetcher, loggedIn = true) {
  const ctx = { URLSearchParams, AbortController, setTimeout, clearTimeout,
    fetch: fetcher, Config: { WORKER_URL: 'https://worker.invalid/' }, currentUserProfile: { userId: 'U' + 'a'.repeat(32) },
    liff: { isLoggedIn: () => loggedIn, getAccessToken: () => 'test-token' } };
  ctx.window = ctx;
  vm.createContext(ctx);
  const start = auth.indexOf('window.recordFriendReferralBeforeGate =');
  const end = auth.indexOf('window.reorderSettingsSections =', start);
  assert(start >= 0 && end > start);
  vm.runInContext(auth.slice(start, end), ctx);
  return ctx;
}

test('personal invite sends only token and signed challenge; client friendship flags are never sent', async () => {
  const calls = [];
  const reserve = frontend(async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ success: true, reserved: true, referrerId: ref, networkId: 'trusted-network' }) }; }).recordFriendReferralBeforeGate;
  assert.equal((await reserve(new URLSearchParams({ ref, friend_referral_challenge: challenge, point_friend: '1' }))).status, 'recorded');
  assert.equal(calls[0].url, 'https://worker.invalid/v1/friend-referral/reserve');
  assert.deepEqual(JSON.parse(calls[0].init.body), { token: 'test-token', challenge });
  await reserve(new URLSearchParams({ friend_referral_challenge: challenge }), { isFeatureRoute: true });
  await reserve(new URLSearchParams({ ref }));
  assert.equal(calls.length, 1);
  assert.equal((await frontend(() => { throw Error('should not call'); }, false).recordFriendReferralBeforeGate(new URLSearchParams({ friend_referral_challenge: challenge }))).status, 'unavailable');
});

test('referral service failures do not prevent login', async () => {
  const reserve = frontend(async () => { throw Error('network offline'); }).recordFriendReferralBeforeGate;
  assert.equal((await reserve(new URLSearchParams({ friend_referral_challenge: challenge }))).status, 'unavailable');
});

test('signed invite issuance rejects a changed actor, changed token or foreign link', async () => {
  let resolve;
  const ctx = { URL, Config: { WORKER_URL: 'https://worker.invalid/' },
    currentUserProfile: { userId: ref }, liff: { isLoggedIn: () => true, getAccessToken: () => 'token' },
    fetch: () => new Promise(r => { resolve = r; }) };
  ctx.window = ctx;
  vm.createContext(ctx);
  const start = config.indexOf('window.createSignedFriendInvite =');
  const end = config.indexOf('// 舊版模組大量使用', start);
  vm.runInContext(config.slice(start, end), ctx);
  const issue = ctx.createSignedFriendInvite();
  ctx.currentUserProfile = { userId: 'U' + 'c'.repeat(32) };
  resolve({ ok: true, json: async () => ({ success: true, url: 'https://worker.invalid/v1/friend-referral/visit?ticket=ok' }) });
  await assert.rejects(issue, /身分已變更/);
  ctx.fetch = async () => ({ ok: true, json: async () => ({ success: true, url: 'https://evil.invalid/v1/friend-referral/visit?ticket=ok' }) });
  await assert.rejects(ctx.createSignedFriendInvite(), /資料有誤/);
});

test('valid and ineligible invitations finish without showing or waiting on a dialog', async () => {
  const cases = [
    [{ success: true, reserved: true, referrerId: ref, networkId: 'trusted-network' }, 'recorded'],
    [{ success: true, reserved: false, reason: 'already_friend', referrerId: ref, networkId: 'not-trusted' }, 'ineligible'],
    [{ success: true, reserved: false, reason: 'ineligible_or_recorded', referrerId: ref, networkId: 'not-trusted' }, 'ineligible'],
    [{ success: true, reserved: true, referrerId: 'invalid', networkId: 'not-trusted' }, 'ineligible'],
    [{ success: true, reserved: true, referrerId: ref, networkId: '' }, 'ineligible']
  ];
  for (const [payload, expected] of cases) {
    let calls = 0, dialogReads = 0, toasts = 0;
    const app = frontend(async () => { calls++; return { ok: true, json: async () => payload }; });
    app.document = { getElementById: () => { dialogReads++; throw Error('invitation dialog should not be opened'); } };
    app.showToast = () => { toasts++; };
    const result = await app.ensureFriendReferralBeforeGate(new URLSearchParams({ ref, friend_referral_challenge: challenge }));
    assert.equal(result.status, expected);
    assert.equal(calls, 1);
    assert.equal(dialogReads, 0);
    assert.equal(toasts, 0);
    if (expected === 'recorded') {
      assert.equal(result.referrerId, ref);
      assert.equal(result.networkId, 'trusted-network');
    } else {
      assert.equal(result.referrerId, undefined);
      assert.equal(result.networkId, undefined);
    }
  }
});

test('network failure, HTTP error and timeout allow entry without a dialog or unverified referral', async () => {
  const cases = [
    async () => { throw Error('offline'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => { throw Error('bad JSON'); } }),
    (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('timeout'))))
  ];
  for (const [index, fetcher] of cases.entries()) {
    let dialogReads = 0, toasts = 0;
    const app = frontend(fetcher);
    app.document = { getElementById: () => { dialogReads++; throw Error('invitation dialog should not be opened'); } };
    app.showToast = () => { toasts++; };
    if (index === 3) {
      app.setTimeout = (callback, ms) => { assert.equal(ms, 12000); queueMicrotask(callback); return 1; };
      app.clearTimeout = () => {};
    }
    const result = await app.ensureFriendReferralBeforeGate(new URLSearchParams({ ref, net: 'url-network', friend_referral_challenge: challenge }));
    assert.equal(result.status, 'unavailable');
    assert.equal(result.referrerId, undefined);
    assert.equal(result.networkId, undefined);
    assert.equal(dialogReads, 0);
    assert.equal(toasts, 0);
  }
});

test('homepage no longer contains the invitation confirmation dialog', () => {
  const index = read('../index.html');
  assert.doesNotMatch(index, /id=["']friend-referral-modal["']/);
  assert.doesNotMatch(index, /id=["']friend-referral-retry["']/);
  assert.doesNotMatch(index, /id=["']friend-referral-proceed["']/);
});

test('a reservation result is ignored when LINE actor or access token changes in flight', async () => {
  for (const changed of ['actor', 'token', 'logout']) {
    let resolve;
    const app = frontend(() => new Promise(done => { resolve = done; }));
    const pending = app.ensureFriendReferralBeforeGate(new URLSearchParams({ friend_referral_challenge: challenge }));
    if (changed === 'actor') app.currentUserProfile = { userId: 'U' + 'c'.repeat(32) };
    if (changed === 'token') app.liff.getAccessToken = () => 'other-token';
    if (changed === 'logout') app.liff.isLoggedIn = () => false;
    resolve({ ok: true, json: async () => ({ success: true, reserved: true, referrerId: ref, networkId: 'trusted-network' }) });
    const result = await pending;
    assert.equal(result.status, 'unavailable', changed);
    assert.equal(result.referrerId, undefined, changed);
    assert.equal(result.networkId, undefined, changed);
  }
});

test('reservation route handles preflight and rejects malformed data before touching the database', async () => {
  const url = 'https://worker.invalid/v1/friend-referral/reserve';
  const preflight = await entry.fetch(new Request(url, { method: 'OPTIONS' }), {}, {});
  assert.equal(preflight.status, 204);
  const malformed = await entry.fetch(new Request(url, { method: 'POST', body: '{}' }), {}, {});
  assert.equal(malformed.status, 400);
  const invalid = await entry.fetch(new Request(url, {
    method: 'POST', body: JSON.stringify({ token: 'test-token', challenge: 'invalid' })
  }), { LINE_CHANNEL_SECRET: 'synthetic-secret' }, {});
  assert.equal(invalid.status, 200);
  assert.equal((await invalid.json()).reserved, false);
});

test('signed landing redirects to LIFF and the challenge survives a simulated OAuth nested state', async () => {
  const db = { prepare: query => ({ bind: () => ({
    all: async () => ({ results: query.includes('FROM users') ? [{ line_id: ref, point_line_id: '', legacy_line_id: '' }] : [] }), first: async () => ({ ok: 1 })
  }) }) };
  const secret = 'synthetic-referral-secret';
  const { ticket } = await issueFriendReferralForVerifiedUser(db, { userId: ref, secret }, { networkId: 'trusted-network' });
  const landing = new URL('https://worker.invalid/v1/friend-referral/visit');
  landing.searchParams.set('ticket', ticket);
  const response = await entry.fetch(new Request(landing), { LINE_CHANNEL_SECRET: secret }, {});
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const target = new URL(response.headers.get('Location'));
  assert.equal(target.origin, 'https://liff.line.me');
  assert.equal(target.searchParams.get('ref'), ref);
  assert.equal(target.searchParams.get('net'), 'trusted-network');
  const signedChallenge = target.searchParams.get('friend_referral_challenge');
  assert.ok(signedChallenge);
  const oauthState = '/?' + target.searchParams.toString();
  const callback = new URL('https://example.invalid/LINE-/');
  callback.searchParams.set('code', 'synthetic');
  callback.searchParams.set('liff.state', oauthState);
  const context = { URL, URLSearchParams, console, location: callback };
  context.window = context;
  vm.createContext(context);
  const start = config.indexOf('function readActmasterInitialParams()');
  const end = config.indexOf('function hasNfcCheckinParams', start);
  vm.runInContext(config.slice(start, end), context);
  const params = context.readActmasterInitialParams();
  assert.equal(params.get('ref'), ref);
  assert.equal(params.get('net'), 'trusted-network');
  assert.equal(params.get('friend_referral_challenge'), signedChallenge);
});

test('only verified webhook follow events reach referral; a failed referral does not block existing event owner', async () => {
  const calls = [], jobs = [], errors = [];
  const ctx = { Response, Promise, console: { error: (...args) => errors.push(args) },
    completeFriendReferral: async (_db, event) => { calls.push(['referral', event.webhookEventId]); throw Error('database unavailable'); } };
  vm.createContext(ctx);
  const start = worker.indexOf('  async handleWebhook(request, env, ctx)');
  const end = worker.indexOf('\n  async hubTest(', start);
  assert(start >= 0 && end > start);
  const chat = vm.runInContext('({' + worker.slice(start, end) + '})', ctx);
  chat.verifySignature = async (_body, signature) => signature === 'valid';
  chat.consumeMyCardEvents = async events => { calls.push(['existing-handler', events.length]); return []; };
  const events = [{ type: 'follow', webhookEventId: 'follow-1' }, { type: 'message', webhookEventId: 'message-1' }];
  const request = signature => new Request('https://worker.invalid/line-webhook', {
    method: 'POST', headers: { 'x-line-signature': signature }, body: JSON.stringify({ events })
  });
  assert.equal((await chat.handleWebhook(request('bad'), {}, { waitUntil: p => jobs.push(p) })).status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await chat.handleWebhook(request('valid'), {}, { waitUntil: p => jobs.push(p) })).status, 200);
  await Promise.all(jobs);
  assert.deepEqual(calls, [['referral', 'follow-1'], ['existing-handler', 2]]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0][1], 'follow-1');
});
