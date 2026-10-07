import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { sdkVersion, fixedEntrypoints, queryCases, extractParser } from './fixtures/liff-query-compat.mjs';

const root = new URL('../', import.meta.url);
const sources = {
  main: readFileSync(new URL('js/config.js', root), 'utf8'),
  bridge: readFileSync(new URL('point-bridge.html', root), 'utf8')
};

function parse(kind, search) {
  const forbidden = () => { throw new Error('Parsing must not call authentication, network, storage, or navigation'); };
  const location = { search, replace: forbidden, assign: forbidden };
  const context = {
    URLSearchParams, window: { location, fetch: forbidden, liff: { init: forbidden, getProfile: forbidden }, localStorage: { getItem: forbidden, setItem: forbidden } },
    fetch: forbidden, console: { warn() {} }
  };
  const name = kind === 'main' ? 'readActmasterInitialParams' : 'readParams';
  vm.runInNewContext(extractParser(sources[kind], kind) + '\nresult = ' + name + '();', context);
  return context.result;
}

for (const kind of ['main', 'bridge']) {
  for (const fixture of queryCases) {
    test(`${kind}: ${fixture.name}`, () => {
      const params = parse(kind, fixture.search);
      for (const [key, value] of Object.entries(fixture.expected)) assert.equal(params.get(key), value, key);
      for (const key of fixture.absent || []) assert.equal(params.has(key), false, 'Nested value must not become key: ' + key);
    });
  }
}

test('main keeps all short aliases and explicit canonical values', () => {
  const params = parse('main', '?' + new URLSearchParams({ 'liff.state': '/?a=ACT&r=REF&n=NET&v=qr&c=CLAIM&s=CARD', ref: 'OUTER' }));
  for (const [key, value] of Object.entries({ activityId: 'ACT', ref: 'OUTER', net: 'NET', via: 'qr', claim: 'CLAIM', shareCardId: 'CARD' })) assert.equal(params.get(key), value, key);
});

test('bridge retains redirect sanitization and trusted profile precedence', () => {
  const bridge = sources.bridge;
  const start = bridge.indexOf('function buildBusinessUrl');
  const end = bridge.indexOf('function goNext', start);
  assert.ok(start >= 0 && end > start);
  const search = '?' + new URLSearchParams({ code: 'oauth-code', state: 'opaque', pt_uid: 'untrusted', from: 'legacy', 'liff.state': '/?' + new URLSearchParams({ return_url: 'https://shop.example.test/buy?sku=1&uid=not-trusted', ref: 'REF', net: 'NET' }) });
  const context = { URLSearchParams, window: { location: { search } }, BUSINESS_APP_URL: 'https://fangwl591021.github.io/LINE-/' };
  vm.runInNewContext(extractParser(bridge, 'bridge') + bridge.slice(start, end) + "\nresult = buildBusinessUrl({userId:'trusted-profile'}, true);", context);
  const url = new URL(context.result);
  assert.equal(url.origin, 'https://fangwl591021.github.io');
  assert.equal(url.pathname, '/LINE-/');
  assert.equal(url.searchParams.get('pt_uid'), 'trusted-profile');
  assert.equal(url.searchParams.get('point_friend'), '1');
  assert.equal(url.searchParams.get('point_from'), 'point-liff');
  assert.equal(url.searchParams.get('return_url'), 'https://shop.example.test/buy?sku=1&uid=not-trusted');
  assert.equal(url.searchParams.get('ref'), 'REF');
  assert.equal(url.searchParams.get('net'), 'NET');
  for (const key of ['code', 'state', 'liff.state', 'from', 'uid']) assert.equal(url.searchParams.has(key), false, key);
});

test('five fixed LIFF entrypoints load 2.31.2 while edge entrypoints keep their policy', () => {
  for (const file of fixedEntrypoints) {
    const html = readFileSync(new URL(file, root), 'utf8');
    assert.ok(html.includes('https://static.line-scdn.net/liff/edge/versions/' + sdkVersion + '/sdk.js'), file);
    assert.ok(!html.includes('/versions/2.22.3/'), file);
  }
  for (const file of ['lineoa-monitor.html', 'lineoa-crm.html']) assert.ok(readFileSync(new URL(file, root), 'utf8').includes('https://static.line-scdn.net/liff/edge/2/sdk.js'), file);
});

test('both config consumers load the patched cache version', () => {
  for (const file of ['index.html', 'ocr-lab.html']) assert.ok(readFileSync(new URL(file, root), 'utf8').includes('js/config.js?v=9.17'), file);
});
