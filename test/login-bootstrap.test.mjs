import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const bootstrapSource = read('../js/login-bootstrap.js');
const configSource = read('../js/config.js');
const authSource = read('../js/auth.js');
const coreSource = read('../js/core.js');
const inboxSource = read('../js/modules/inbox.js');
const indexSource = read('../index.html');
const actor = 'U' + 'a'.repeat(32);
const otherActor = 'U' + 'b'.repeat(32);

function block(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert(first >= 0 && last > first, `Missing source boundary: ${start}`);
  return source.slice(first, last);
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settle() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

function fixture({ query = '', init, profile = null, token = 'fixture-access-token', loggedIn = true } = {}) {
  const calls = [], marks = [], nodes = new Map(), timers = new Map(), listeners = new Map();
  let now = 100000, nextTimer = 1;
  function node(id) {
    if (!nodes.has(id)) {
      const classes = new Set(id.includes('slow') ? ['hidden'] : []);
      const events = new Map();
      nodes.set(id, {
        id, textContent: '', innerText: '', hidden: false, disabled: false, style: {}, attributes: {},
        classList: {
          add: (...names) => names.forEach(name => classes.add(name)),
          remove: (...names) => names.forEach(name => classes.delete(name)),
          contains: name => classes.has(name),
          toggle(name, enabled) { if (enabled ?? !classes.has(name)) classes.add(name); else classes.delete(name); }
        },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name] ?? null; },
        addEventListener(name, fn) { events.set(name, fn); },
        click() { return events.get('click')?.(); },
        append() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => []
      });
    }
    return nodes.get(id);
  }
  const location = new URL('https://example.invalid/LINE-/' + query);
  location.replace = url => calls.push(['replace', url]);
  location.reload = () => calls.push(['reload']);
  const makeStorage = name => {
    const entries = new Map();
    return {
      getItem: key => entries.get(key) ?? null,
      setItem(key, value) { entries.set(key, String(value)); calls.push([name, 'set', key]); },
      removeItem(key) { entries.delete(key); calls.push([name, 'remove', key]); }
    };
  };
  const context = {
    URL, URLSearchParams, AbortController, Map, Set, Promise,
    Date: class extends Date { static now() { return now; } },
    console: { log() {}, warn() {}, error() {} },
    LIFF_ID: 'fixture-liff-id', Config: { LIFF_ID: 'fixture-liff-id', WORKER_URL: 'https://worker.invalid/' },
    location, currentUserProfile: profile, currentToken: token, loggedIn,
    performance: { now: () => now, mark: (name, options) => marks.push([name, options]) },
    localStorage: makeStorage('local-storage'), sessionStorage: makeStorage('session-storage'),
    navigator: { onLine: true },
    setTimeout(fn, delay = 0) { const id = nextTimer++; timers.set(id, { fn, at: now + Number(delay) }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval(fn, delay = 0) { const id = nextTimer++; timers.set(id, { fn, at: now + Number(delay), repeat: Number(delay) }); return id; },
    clearInterval: id => timers.delete(id),
    document: {
      readyState: 'loading', hidden: false, getElementById: node, createElement: node,
      querySelector: selector => node(selector.replace(/^#/, '')),
      addEventListener(name, fn) { const handlers = listeners.get(name) || []; handlers.push(fn); listeners.set(name, handlers); }
    },
    addEventListener(name, fn) { listeners.set('window:' + name, [fn]); },
    fetch(...args) { calls.push(['unexpected-fetch', ...args]); throw new Error('No network in login bootstrap fixture'); },
    __actmasterLiffInit: { liffId: '', promise: null, ready: false },
    isActmasterMainLiffClient: () => true,
    liff: {
      init(options) { calls.push(['liff-init', options]); return init ? init(context) : Promise.resolve(); },
      isLoggedIn: () => context.loggedIn,
      getAccessToken: () => context.currentToken,
      login: options => calls.push(['login', options]),
      getFriendship: async () => ({ friendFlag: true }),
      requestFriendship: async () => calls.push(['request-friendship'])
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(block(configSource, 'function readActmasterInitialParams()', 'function hasNfcCheckinParams'), context);
  vm.runInContext(block(configSource, 'window.initActmasterLiff =', 'window.getActmasterLiffProfile ='), context);
  vm.runInContext(block(configSource, 'window.readActmasterPointFriendship =', 'window.showActmasterPointFriendshipGate ='), context);
  vm.runInContext(block(configSource, 'window.ensureActmasterPointFriendship =', 'window.recheckActmasterPointFriendship ='), context);
  context.showActmasterPointFriendshipGate = message => calls.push(['friendship-gate', message]);
  vm.runInContext(bootstrapSource, context);
  async function tick(duration) {
    const until = now + duration;
    for (let n = 0; n < 100; n += 1) {
      await settle();
      const next = [...timers].filter(([, item]) => item.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) { now = until; await settle(); return; }
      const [id, item] = next;
      timers.delete(id); now = item.at;
      if (item.repeat) timers.set(id, { ...item, at: now + item.repeat });
      item.fn();
    }
    assert.fail('Fixture timer loop did not settle');
  }
  async function domReady() {
    context.document.readyState = 'interactive';
    return Promise.all((listeners.get('DOMContentLoaded') || []).map(fn => fn()));
  }
  return { context, calls, marks, nodes, node, timers, listeners, tick, domReady, api: context.LoginBootstrap };
}

function installAuth(f, { result = { isRegistered: true, info: { userId: actor, role: 'user' } }, profilePromise, friendshipPromise } = {}) {
  const { context: c, calls } = f;
  Object.assign(c, {
    reorderSettingsSections() {},
    getActmasterLiffProfile: async () => { calls.push(['profile']); return profilePromise ? await profilePromise : { userId: actor, displayName: 'Fixture user' }; },
    ensureActmasterLiffLogin: options => { calls.push(['login', options]); return false; },
    fetchAPI: async (action, payload) => { calls.push(['api', action, payload]); return typeof result === 'function' ? result() : result; },
    applyRegisteredUserSession: info => { calls.push(['session']); c.currentUser = info; c.userRole = info.role; },
    applyUnregisteredHomeSession: () => calls.push(['unregistered-session']),
    goPage: page => calls.push(['page', page]),
    loadHomeData: async () => calls.push(['home-data']),
    resumePendingMotherRegistration: async () => null,
    recoverRegisteredUserFromLegacyCache: async () => false,
    recoverRegisteredUserFromBoundCard: async () => false,
    showActmasterStartupFailure: () => calls.push(['startup-failure']),
    showToast: (...args) => calls.push(['toast', ...args]),
    renderStandaloneWebCardPage: async (...args) => calls.push(['web-card', ...args]),
    handleLineOAKeywordShareEntry: async (...args) => calls.push(['keyword-share', ...args]),
    handleAutoSendCardEntry: async (...args) => calls.push(['send-card', ...args]),
    handleAutoShareCardEntry: async (...args) => calls.push(['share-card', ...args])
  });
  c.liff.getFriendship = async () => { calls.push(['friendship-read']); return friendshipPromise ? await friendshipPromise : { friendFlag: true }; };
  const finish = f.api.finish;
  f.api.finish = allow => { calls.push(['finish', allow]); return finish(allow); };
  const start = authSource.lastIndexOf("document.addEventListener('DOMContentLoaded', async () => {");
  assert(start >= 0);
  vm.runInContext(authSource.slice(start), c);
}

test('plain home and plain OAuth callbacks prewarm exactly one captured wrapper', async () => {
  for (const query of ['', '?code=fixture-code&state=opaque-state', '?liffClientId=fixture&liffRedirectUri=https%3A%2F%2Fexample.invalid%2FLINE-%2F&friendship_status_changed=true']) {
    const init = deferred();
    const f = fixture({ query, init: () => init.promise });
    assert(f.api.initialParams instanceof URLSearchParams, query);
    assert(f.api.initPromise instanceof Promise, query);
    const captured = f.api.initPromise;
    const params = f.api.initialParams.toString();
    f.context.location.search = '';
    await settle();
    assert.equal(f.calls.filter(call => call[0] === 'liff-init').length, 1, query);
    assert.equal(f.context.LoginBootstrap.initPromise, captured);
    assert.equal(f.api.initialParams.toString(), params);
    init.resolve(true);
    const outcome = await captured;
    assert.equal(outcome.ok, true);
    assert.equal(outcome.value, true);
  }
});

test('feature routes, nested LIFF states and hashes never prewarm', async () => {
  const queries = ['?webCardId=card', '?shareCardId=card&share=1', '?shareCardId=card&send=1', '?likeCardId=card',
    '?lineoaKeywordShare=rule', '?checkin=activity', '?nfcAct=activity', '?shopSection=store&shopId=shop',
    '?shopQr=qr', '?shopProduct=product', '?memberProduct=product', '?claim=card', '?ref=inviter',
    '?liff.state=', '?liff.state=' + encodeURIComponent('/?shopSection=store&shopId=shop'),
    '?liff.state=' + encodeURIComponent(encodeURIComponent('/?shareCardId=card&send=1')),
    '?state=' + encodeURIComponent('/?checkin=activity'),
    '?state=' + encodeURIComponent(encodeURIComponent('/?shareCardId=card&share=1')),
    '?liffRedirectUri=' + encodeURIComponent('not-a-valid-url'),
    '?liffRedirectUri=' + encodeURIComponent('https://other.invalid/LINE-/'),
    '?liffRedirectUri=' + encodeURIComponent('https://example.invalid/store-shop.html'),
    '?liffRedirectUri=' + encodeURIComponent('https://example.invalid/LINE-/?shopSection=store'),
    '?liffRedirectUri=' + encodeURIComponent('https://example.invalid/LINE-/#feature'),
    '#open=inbox', '?code=fixture-code#liff.state=feature'];
  for (const query of queries) {
    const f = fixture({ query });
    await settle();
    assert.equal(f.calls.filter(call => call[0] === 'liff-init').length, 0, query);
    assert.equal(f.api.initialParams, null, query);
    assert.equal(f.api.initPromise, null, query);
    assert.equal(f.api.defer('existing-feature-refresh', () => {}), false, query);
  }
});

test('captured initialization waits through the original wrapper retry', async () => {
  const first = deferred(), second = deferred();
  let attempts = 0;
  const f = fixture({ init: () => (++attempts === 1 ? first.promise : second.promise) });
  const captured = f.api.initPromise;
  let completed = false;
  captured.then(() => { completed = true; });
  first.reject(new Error('temporary SDK failure'));
  await settle();
  assert.equal(completed, false);
  await f.tick(499);
  assert.equal(attempts, 1);
  await f.tick(1);
  assert.equal(attempts, 2);
  assert.equal(completed, false);
  second.resolve();
  assert.equal((await captured).ok, true);
  assert.equal(f.context.__actmasterLiffInit.ready, true);
});

test('initialization failures are captured immediately without unhandled rejection or automatic recovery', async () => {
  const failure = new Error('invalid authorization code');
  const f = fixture({ init: () => Promise.reject(failure) });
  await settle();
  const outcome = await f.api.initPromise;
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, failure);
  await f.tick(20000);
  assert.equal(f.calls.filter(call => call[0] === 'liff-init').length, 1);
  assert(!f.calls.some(call => ['replace', 'reload', 'login', 'api', 'unexpected-fetch'].includes(call[0])));
});

test('background tasks remain queued during authentication, merge keys and wait two seconds after success', async () => {
  const f = fixture({ profile: { userId: actor } });
  const work = [];
  assert.equal(f.api.defer('inbox-badge', () => work.push('old')), true);
  assert.equal(f.api.defer('inbox-badge', () => work.push('new')), true);
  assert.equal(f.api.defer('exchange-entry', () => work.push('exchange')), true);
  await f.tick(12000);
  assert.deepEqual(work, []);
  f.api.finish(true);
  await f.tick(1999);
  assert.deepEqual(work, []);
  await f.tick(1);
  assert.deepEqual(work.sort(), ['exchange', 'new']);
  assert.equal(f.api.defer('later', () => work.push('later')), false);
  assert(!work.includes('later'));
});

test('queued background tasks cannot cross UID, token or logged-out session changes', async () => {
  for (const change of [c => { c.currentUserProfile = { userId: otherActor }; }, c => { c.currentToken = 'different-token'; }, c => { c.loggedIn = false; }]) {
    const f = fixture({ profile: { userId: actor } });
    let runs = 0;
    f.api.defer('protected-read', () => { runs += 1; });
    f.api.finish(true);
    change(f.context);
    await f.tick(2000);
    assert.equal(runs, 0);
  }
  const beforeIdentity = fixture();
  let runs = 0;
  beforeIdentity.api.defer('no-actor-yet', () => { runs += 1; });
  beforeIdentity.context.currentUserProfile = { userId: actor };
  beforeIdentity.api.finish(true);
  await beforeIdentity.tick(2000);
  assert.equal(runs, 0);
});

test('a missing token cannot establish a queued background task', async () => {
  const f = fixture({ profile: { userId: actor }, token: '' });
  let runs = 0;
  f.api.defer('read', () => { runs += 1; });
  f.context.currentToken = 'new-session-token';
  f.api.finish(true);
  await f.tick(2000);
  assert.equal(runs, 0);
});

test('a token change between queue flush and the task microtask still cancels the task', async () => {
  const f = fixture({ profile: { userId: actor } });
  let runs = 0;
  f.api.defer('read', () => { runs += 1; });
  f.api.finish(true);
  const [id, timer] = [...f.timers].find(([, item]) => item.at === 102000);
  f.timers.delete(id);
  timer.fn();
  f.context.currentToken = 'changed-after-flush';
  await settle();
  assert.equal(runs, 0);
});

test('failed or excluded authentication drops all queued background work', async () => {
  const f = fixture({ profile: { userId: actor } });
  let runs = 0;
  f.api.defer('read', () => { runs += 1; });
  f.api.finish(false);
  await f.tick(12000);
  assert.equal(f.api.defer('read', () => { runs += 1; }), false);
  await f.tick(12000);
  assert.equal(runs, 0);
});

test('page exit drops queued work and cancels the slow hint', async () => {
  const f = fixture({ profile: { userId: actor } });
  let runs = 0;
  f.api.stage('profile');
  f.api.defer('read', () => { runs += 1; });
  f.api.finish(true);
  for (const handler of f.listeners.get('window:pagehide') || []) handler({ persisted: false });
  await f.tick(12000);
  assert.equal(runs, 0);
  assert.equal(f.api.defer('after-exit', () => { runs += 1; }), true);
  assert.equal(f.node('login-slow-hint').hidden, true);
});

test('back-forward cache restoration resumes matching queued work and permits fresh auxiliary reads', async () => {
  const f = fixture({ profile: { userId: actor } });
  let queuedRuns = 0;
  f.api.defer('queued-read', () => { queuedRuns += 1; });
  f.api.finish(true);
  for (const handler of f.listeners.get('window:pagehide') || []) handler({ persisted: true });
  for (const handler of f.listeners.get('window:pageshow') || []) handler({ persisted: true });
  await f.tick(2000);
  assert.equal(queuedRuns, 1);
  assert.equal(f.api.defer('fresh-read', () => {}), false);
});

test('back-forward cache restoration drops queued work if the authenticated actor changed', async () => {
  const f = fixture({ profile: { userId: actor } });
  let runs = 0;
  f.api.defer('queued-read', () => { runs += 1; });
  f.api.finish(true);
  for (const handler of f.listeners.get('window:pagehide') || []) handler({ persisted: true });
  f.context.currentUserProfile = { userId: otherActor };
  for (const handler of f.listeners.get('window:pageshow') || []) handler({ persisted: true });
  await f.tick(2000);
  assert.equal(runs, 0);
});

test('stages and the eight-second hint only update neutral UI and anonymous fixed marks', async () => {
  const init = deferred();
  const f = fixture({ query: '?code=private-oauth-code&state=private-state', init: () => init.promise });
  f.context.currentUser = { role: 'fixture-role', points: 123 };
  f.api.stage('connecting');
  assert.equal(f.node('loading-text').textContent, '正在連線到 LINE…');
  assert.equal(f.node('login-slow-hint').hidden, true);
  await f.tick(7999);
  assert.equal(f.node('login-slow-hint').hidden, true);
  await f.tick(1);
  assert.equal(f.node('login-slow-hint').hidden, false);
  f.api.stage('profile');
  assert.equal(f.node('loading-text').textContent, '正在確認 LINE 身分…');
  assert.equal(f.node('login-slow-hint').hidden, true);
  f.api.stage('friendship');
  assert.equal(f.node('loading-text').textContent, '正在確認官方帳號好友狀態…');
  f.api.stage('member');
  assert.equal(f.node('loading-text').textContent, '正在確認會員資料…');
  const beforeUnknown = f.marks.length;
  for (const value of ['private-oauth-code', actor, 'fixture-access-token', f.context.location.href, '__proto__', 'constructor']) f.api.stage(value);
  assert.equal(f.marks.length, beforeUnknown);
  assert.equal(f.node('loading-text').textContent, '正在確認會員資料…');
  f.api.finish(false);
  await f.tick(20000);
  assert.equal(f.node('login-slow-hint').hidden, true);
  assert.deepEqual(f.context.currentUser, { role: 'fixture-role', points: 123 });
  assert.equal(f.context.currentUserProfile, null);
  assert.deepEqual(f.calls.map(call => call[0]), ['liff-init']);
  const allowedMarks = new Set(['init-start', 'init-ready', 'connecting', 'profile', 'friendship', 'member', 'background-released', 'entry-finished']);
  for (const [name, detail] of f.marks) {
    assert(allowedMarks.has(name.replace(/^login-bootstrap:/, '')), name);
    assert.equal(detail, undefined);
  }
  init.resolve();
  await f.api.initPromise;
});

test('loading shell is synchronous, accessible and contains no member authority or data', () => {
  const head = indexSource.slice(0, indexSource.indexOf('</head>'));
  assert.match(head, /<script\s+src="js\/config\.js\?v=[^"]+"><\/script>\s*<script\s+src="js\/login-bootstrap\.js\?v=[^"]+"><\/script>/);
  const shell = block(indexSource, '<div id="loading-screen"', '<div id="toast-container"');
  assert.match(shell, /id="loading-text"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(shell, /aria-hidden="true"/);
  assert.match(shell, /id="login-slow-hint" hidden/);
  assert.match(shell, /<button[^>]*type="button"[^>]*>重新連線<\/button>/);
  assert.doesNotMatch(shell, /id="(?:avatar|header-admin-badge|header-role-label|point-balance-badge)"|\bcurrentUser\b|\buserRole\b/);
});

test('initial loading shows a lightweight CSS spinner instead of skeleton cards without delaying auth', () => {
  const shell = block(indexSource, '<div id="loading-screen"', '<div id="toast-container"');
  const style = block(indexSource, '<style id="login-bootstrap-style">', '</style>');
  assert.match(shell, /class="login-shell-spinner" aria-hidden="true"/);
  assert.match(shell, /class="login-shell-logo"[^>]*src="assets\/points-logo-transparent-20260916\.png"[^>]*width="96" height="96"[^>]*decoding="async" fetchpriority="low"/);
  assert.doesNotMatch(shell + style, /login-shell-(?:placeholder|line|tiles)/);
  assert.match(style, /animation:login-shell-spin \.85s linear infinite/);
  assert.match(style, /@keyframes login-shell-spin\s*\{\s*to\s*\{\s*transform:rotate\(360deg\)/);
  assert.match(style, /@media \(prefers-reduced-motion:reduce\)\s*\{\s*\.login-shell-spinner\s*\{\s*animation:none/);
  assert.match(style, /#loading-screen\.hidden\s*\{\s*display:none/);
  assert.match(style, /#loading-screen\.login-shell\s*\{[^}]*overflow:auto[^}]*box-sizing:border-box/);
  assert.match(style, /#loading-screen\.login-shell\s*\{[^}]*flex-direction:column/);
  assert.match(style, /\.login-shell-inner\s*\{[^}]*flex:none[^}]*width:100%[^}]*max-width:340px/);
  assert.match(style, /#loading-screen:has\(>#actmaster-startup-retry\) \.login-shell-spinner\s*\{[^}]*animation:none/);
  assert.match(style, /#loading-screen>#actmaster-startup-retry\s*\{[^}]*flex:none/);
  assert.doesNotMatch(shell, /<script|\bon(?:load|error)\s*=|setTimeout|progressbar|aria-valuenow/);
  assert.doesNotMatch(style, /@import|url\(/);
  assert.doesNotMatch(bootstrapSource, /login-shell-spinner|animationend|transitionend|document\.fonts|\.decode\(/);
});

test('inbox badge requests merge while pending and retain existing throttling after release', async () => {
  const f = fixture({ profile: { userId: actor } });
  Object.assign(f.context, {
    $: f.node,
    canUseInbox: () => !!f.context.currentUserProfile?.userId,
    updateTitleUnread: unread => f.calls.push(['title-unread', unread]),
    fetchAPI: async (...args) => { f.calls.push(['api', ...args]); return { unread: 3 }; }
  });
  vm.runInContext(block(inboxSource, 'window.refreshInboxBadge =', 'function renderEmpty('), f.context);
  await f.context.refreshInboxBadge();
  await f.context.refreshInboxBadge({ notify: true });
  assert(!f.calls.some(call => call[0] === 'api'));
  assert.equal(f.context.__inboxBadgeRequestedAt, undefined);
  f.api.finish(true);
  await f.tick(1999);
  assert(!f.calls.some(call => call[0] === 'api'));
  await f.tick(1);
  assert.equal(f.calls.filter(call => call[0] === 'api' && call[1] === 'getInboxCount').length, 1);
  assert.equal(f.node('inbox-unread-badge').textContent, '3');
  await f.context.refreshInboxBadge();
  assert.equal(f.calls.filter(call => call[0] === 'api').length, 1);
});

test('exchange-entry refresh merges while preserving the existing role and UI decisions', async () => {
  const f = fixture({ profile: { userId: actor } });
  Object.assign(f.context, {
    currentUser: { userId: actor, role: 'user' }, userRole: 'user',
    refreshExchangeZoneAccess: async () => f.calls.push(['exchange-access'])
  });
  vm.runInContext(block(coreSource, 'window.applyUserPermissions =', 'window.loadCardData ='), f.context);
  f.context.applyUserPermissions();
  f.context.applyUserPermissions();
  assert.equal(f.context.userRole, 'user');
  assert.equal(f.context.hasAdminRights, false);
  assert.equal(f.node('header-role-label').textContent, '目前：用戶');
  assert(!f.calls.some(call => call[0] === 'exchange-access'));
  f.api.finish(true);
  await f.tick(2000);
  assert.equal(f.calls.filter(call => call[0] === 'exchange-access').length, 1);
  f.context.applyUserPermissions();
  await settle();
  assert.equal(f.calls.filter(call => call[0] === 'exchange-access').length, 2);
});

test('friendship pre-read is reused, null falls back and a negative result keeps the existing gate', async () => {
  const f = fixture();
  let reads = 0;
  f.context.readActmasterPointFriendship = async () => { reads += 1; return { required: true, friendFlag: false }; };
  assert.equal(await f.context.ensureActmasterPointFriendship({ initialCheck: Promise.resolve({ required: true, friendFlag: true }) }), true);
  assert.equal(reads, 0);
  assert.equal(await f.context.ensureActmasterPointFriendship({ initialCheck: Promise.resolve(null) }), false);
  assert.equal(reads, 2);
  assert.equal(f.calls.filter(call => call[0] === 'request-friendship').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'friendship-gate').length, 1);
});

test('authentication overlaps the friendship read and profile but prompts only after the profile', async () => {
  const profile = deferred(), friendship = deferred();
  const f = fixture();
  installAuth(f, { profilePromise: profile.promise, friendshipPromise: friendship.promise });
  const pending = f.domReady();
  await settle();
  assert.equal(f.calls.filter(call => call[0] === 'profile').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'friendship-read').length, 1);
  friendship.resolve({ friendFlag: false });
  await settle();
  assert(!f.calls.some(call => call[0] === 'request-friendship'));
  assert(!f.calls.some(call => call[0] === 'api'));
  profile.resolve({ userId: actor, displayName: 'Fixture user' });
  await pending;
  assert.equal(f.calls.filter(call => call[0] === 'request-friendship').length, 1);
  assert(!f.calls.some(call => call[0] === 'api'));
  assert.equal(f.calls.find(call => call[0] === 'finish')?.[1], false);
});

test('authentication consumes the captured full initialization and preserves the LINE token payload', async () => {
  const first = deferred(), second = deferred();
  let attempts = 0;
  const f = fixture({ query: '?code=fixture-code&state=opaque-state', init: () => (++attempts === 1 ? first.promise : second.promise) });
  installAuth(f);
  first.reject(new Error('temporary SDK failure'));
  await settle();
  const pending = f.domReady();
  await settle();
  assert(!f.calls.some(call => call[0] === 'profile'));
  await f.tick(500);
  assert.equal(attempts, 2);
  f.context.location.search = '';
  second.resolve();
  await pending;
  const check = f.calls.find(call => call[0] === 'api');
  assert.equal(check?.[1], 'checkUser');
  assert.equal(check?.[2].userId, actor);
  assert.equal(check?.[2].lineAccessToken, 'fixture-access-token');
  assert.equal(f.calls.filter(call => call[0] === 'liff-init').length, 2);
  assert.equal(f.calls.find(call => call[0] === 'finish')?.[1], true);
});

test('exhausted initialization retries reach existing failure handling before any profile or member work', async () => {
  const first = deferred(), second = deferred();
  const lastError = new Error('SDK unavailable after retry');
  let attempts = 0;
  const f = fixture({ init: () => (++attempts === 1 ? first.promise : second.promise) });
  installAuth(f);
  const pending = f.domReady();
  first.reject(new Error('first SDK failure'));
  await settle();
  await f.tick(500);
  second.reject(lastError);
  await pending;
  const outcome = await f.api.initPromise;
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, lastError);
  assert.equal(attempts, 2);
  assert.equal(f.calls.filter(call => call[0] === 'startup-failure').length, 1);
  assert(!f.calls.some(call => ['profile', 'friendship-read', 'api', 'session'].includes(call[0])));
  assert.equal(f.calls.find(call => call[0] === 'finish')?.[1], false);
});

test('without an existing session fallback, only confirmed membership responses release background work', async () => {
  const cases = [
    [{ isRegistered: true, info: { userId: actor, role: 'user' } }, true],
    [{ isRegistered: false }, true],
    [null, false], [{}, false], [{ error: 'unavailable' }, false],
    [{ success: false, isRegistered: false }, false], [{ isRegistered: 'true', info: {} }, false],
    [{ isRegistered: true }, false], [{ isRegistered: true, info: [] }, false]
  ];
  for (const [result, expected] of cases) {
    const f = fixture();
    installAuth(f, { result });
    await f.domReady();
    assert.equal(f.calls.find(call => call[0] === 'finish')?.[1], expected, JSON.stringify(result));
  }
});

test('the existing cached-session fallback releases auxiliary reads without changing the cached authority', async () => {
  const f = fixture();
  const cached = { userId: actor, role: 'store', points: 321, name: 'Existing cached member' };
  f.context.localStorage.setItem('ACTMASTER_USER_' + actor, JSON.stringify({ info: cached, savedAt: 95000 }));
  installAuth(f, { result: { error: 'member lookup unavailable' } });
  const applySession = f.context.applyRegisteredUserSession;
  f.context.applyRegisteredUserSession = info => {
    applySession(info);
    f.api.defer('cached-auxiliary', () => f.calls.push(['cached-auxiliary']));
  };
  const storageWritesBefore = f.calls.filter(call => call[0] === 'local-storage' && call[1] === 'set').length;
  await f.domReady();
  assert.equal(f.calls.find(call => call[0] === 'finish')?.[1], true);
  assert.equal(f.calls.filter(call => call[0] === 'session').length, 1);
  assert.equal(f.context.userRole, 'store');
  assert.deepEqual(JSON.parse(JSON.stringify(f.context.currentUser)), cached);
  assert(!f.calls.some(call => call[0] === 'cached-auxiliary'));
  await f.tick(2000);
  assert.equal(f.calls.filter(call => call[0] === 'cached-auxiliary').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'session').length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(f.context.currentUser)), cached);
  assert.equal(f.calls.filter(call => call[0] === 'local-storage' && call[1] === 'set').length, storageWritesBefore);
  assert.deepEqual(f.calls.filter(call => call[0] === 'api').map(call => call[1]), ['checkUser']);
});

test('successful existing recovery releases reads without adding another session write or role change', async () => {
  for (const path of ['mother', 'legacy', 'bound']) {
    const f = fixture();
    const recovered = { userId: actor, role: 'user', points: 12, name: 'Recovered member' };
    installAuth(f, { result: path === 'bound' ? { error: 'member lookup unavailable' } : { isRegistered: false } });
    const restore = () => {
      f.calls.push(['existing-recovery', path]);
      f.context.applyRegisteredUserSession(recovered);
      f.api.defer('recovered-auxiliary', () => f.calls.push(['recovered-auxiliary']));
    };
    if (path === 'mother') f.context.resumePendingMotherRegistration = async () => { restore(); return { completed: true }; };
    if (path === 'legacy') f.context.recoverRegisteredUserFromLegacyCache = async () => { restore(); return true; };
    if (path === 'bound') f.context.recoverRegisteredUserFromBoundCard = async () => { restore(); return true; };
    await f.domReady();
    assert.equal(f.calls.find(call => call[0] === 'finish')?.[1], true, path);
    assert.equal(f.calls.filter(call => call[0] === 'session').length, 1, path);
    assert.equal(f.context.currentUser, recovered, path);
    assert.equal(f.context.userRole, 'user', path);
    await f.tick(2000);
    assert.equal(f.calls.filter(call => call[0] === 'recovered-auxiliary').length, 1, path);
    assert.equal(f.calls.filter(call => call[0] === 'existing-recovery').length, 1, path);
    assert.equal(f.calls.filter(call => call[0] === 'session').length, 1, path);
    assert.equal(f.context.currentUser, recovered, path);
    assert.equal(f.context.userRole, 'user', path);
    assert(!f.calls.some(call => call[0] === 'local-storage' && call[1] === 'set'), path);
    assert.deepEqual(f.calls.filter(call => call[0] === 'api').map(call => call[1]), ['checkUser'], path);
  }
});

test('an unavailable check with no cache or successful recovery drops queued reads without applying a session', async () => {
  const f = fixture();
  installAuth(f, { result: { error: 'member lookup unavailable' } });
  f.context.recoverRegisteredUserFromBoundCard = async () => {
    f.api.defer('unconfirmed-auxiliary', () => f.calls.push(['unconfirmed-auxiliary']));
    return false;
  };
  await f.domReady();
  assert.equal(f.calls.find(call => call[0] === 'finish')?.[1], false);
  await f.tick(2000);
  assert(!f.calls.some(call => ['unconfirmed-auxiliary', 'session'].includes(call[0])));
  assert.equal(f.context.currentUser, undefined);
  assert.equal(f.context.userRole, undefined);
  assert(!f.calls.some(call => call[0] === 'local-storage' && call[1] === 'set'));
});

test('a confirmed store entry retains its exact destination without entering the home bootstrap', async () => {
  const shopId = 'b7df9472-8cb0-4ae2-a6e6-f6b49eaa7688';
  const f = fixture({ query: '?shopSection=store&shopId=' + shopId });
  vm.runInContext(read('../js/modules/store-invite-route.js'), f.context);
  installAuth(f);
  f.context.openStoreShop = async (...args) => f.calls.push(['store', ...args]);
  await f.domReady();
  assert.deepEqual(f.calls.find(call => call[0] === 'store'), ['store', '', '', '', 'store', shopId]);
  assert.equal(f.calls.find(call => call[0] === 'finish')?.[1], false);
  assert(!f.calls.some(call => call[0] === 'home-data'));
});

test('public and keyword-share entries retain their earlier gates', async () => {
  for (const [query, expected] of [['?webCardId=card', 'web-card'], ['?lineoaKeywordShare=rule', 'keyword-share']]) {
    const f = fixture({ query });
    installAuth(f);
    await f.domReady();
    assert(f.calls.some(call => call[0] === expected), query);
    assert(!f.calls.some(call => ['profile', 'friendship-read', 'api'].includes(call[0])), query);
    assert.equal(f.calls.find(call => call[0] === 'finish')?.[1], false, query);
  }
});
