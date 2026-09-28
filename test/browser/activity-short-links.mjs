// Actual share modal, activities.js and core.fetchAPI. All identities and HTTP responses are fixtures.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const index = read('index.html');
const modal = index.slice(index.indexOf('<div id="activity-share-modal"'), index.indexOf('<div id="invite-link-modal"'));
const css = await (await fetch('https://cdn.tailwindcss.com', { signal: AbortSignal.timeout(20000) })).text();
const browser = await pw.chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 700 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const base = 'https://line-engine.fangwl591021.workers.dev';
const uid = 'U' + 'a'.repeat(32), code = 'AbcD1234efGH5678', short = base + '/a/' + code;
const calls = [], errors = [], blocked = [];
let release, mode = 'hold';
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (request.method() === 'POST' && url.origin === base) {
    const body = request.postDataJSON(); calls.push(body);
    assert.equal(body.action, 'createActivityShareLink'); assert.equal(body.payload.lineAccessToken, 'synthetic-token');
    assert.equal(body.payload.userId, uid); assert.equal(body.payload.networkId, 'admin');
    const scenario = mode;
    if (scenario === 'hold') await new Promise(resolve => { release = resolve; });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(scenario === 'fail'
      ? { success: false, error: '合成短網址失敗' }
      : { success: true, data: { code, url: scenario === 'evil' ? 'https://evil.invalid/a/' + code : short } }) });
  }
  if (url.origin === 'http://localhost') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>.material-symbols-outlined{font-size:0!important;display:inline-block;width:16px;min-width:16px;height:16px}</style>' + modal });
  if (url.hostname === 'quickchart.io') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  blocked.push(url.href); return route.abort();
});
const open = async id => page.evaluate(id => { void openActivityShareModal(id, '商機交流會'); }, id);
try {
  await page.goto('http://localhost/');
  await page.addScriptTag({ content: css });
  await page.evaluate(base => { window.WORKER_URL = base + '/'; window.DEFAULT_LIFF_ID = '1660923784-vViMTZ1y'; }, base);
  await page.addScriptTag({ content: read('js/core.js') });
  await page.addScriptTag({ content: read('js/modules/activities.js') });
  await page.evaluate(uid => {
    window.currentUserProfile = { userId: uid }; window.currentNetworkId = 'admin';
    window.__shared = []; window.__toasts = [];
    window.showToast = message => __toasts.push(message);
    window.liff = { isLoggedIn: () => true, getAccessToken: () => 'synthetic-token', isApiAvailable: () => true,
      shareTargetPicker: async value => { __shared.push(value); return {}; } };
  }, uid);
  await open('ACT_test');
  await page.waitForFunction(() => document.getElementById('activity-share-status').textContent.includes('正在產生'));
  assert.equal(await page.locator('[data-activity-share-action]').first().isDisabled(), true);
  assert.equal(await page.locator('#activity-share-url').inputValue(), '');
  await page.evaluate(() => copyActivityShareLink());
  assert.equal(await page.evaluate(() => __toasts.at(-1)), '請稍候，活動連結準備中');
  await page.waitForFunction(() => currentActivityShare.pending);
  while (!release) await page.waitForTimeout(10);
  release();
  await page.waitForFunction(() => currentActivityShare.pending === false);
  assert.equal(await page.locator('#activity-share-url').inputValue(), short, 'real core unwraps data');
  assert.equal(new URL(await page.locator('#activity-share-qr').getAttribute('src')).searchParams.get('text'), short);
  await page.getByRole('button', { name: /複製/ }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), short);
  await page.getByRole('button', { name: /分享至 LINE/ }).click();
  const shared = await page.evaluate(() => __shared.at(-1)[0]);
  assert(shared.contents.footer.contents.every(button => button.action.uri === short));
  const out = join(tmpdir(), 'activity-short-browser-20260928'); mkdirSync(out, { recursive: true });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 700 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: /分享至 LINE/ }).click({ trial: true });
    await page.screenshot({ path: join(out, `short-${width}.png`) });
  }
  for (mode of ['fail', 'evil']) {
    await open('ACT_fallback'); await page.waitForFunction(() => currentActivityShare.pending === false);
    assert.match(await page.locator('#activity-share-status').textContent(), /原活動網址/);
    const original = new URL(await page.locator('#activity-share-url').inputValue());
    assert.equal(original.origin, 'https://liff.line.me'); assert.equal(original.searchParams.get('a'), 'ACT_fallback');
    assert.equal(original.searchParams.get('r'), uid);
  }
  mode = 'hold'; release = null;
  await open('ACT_old'); while (!release) await page.waitForTimeout(10);
  const oldRelease = release;
  mode = 'ok'; await open('ACT_new'); await page.waitForFunction(() => currentActivityShare.pending === false);
  oldRelease(); await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => currentActivityShare.activityId), 'ACT_new');
  mode = 'hold'; release = null;
  await open('ACT_closed'); while (!release) await page.waitForTimeout(10);
  await page.evaluate(() => closeActivityShareModal()); release(); await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => currentActivityShare), null); assert.equal(await page.locator('#activity-share-modal').isVisible(), false);
  // Accelerate only the share timeout. Late responses must not silently switch an already-copied URL.
  await page.evaluate(() => { const native = window.setTimeout; window.setTimeout = (fn, ms, ...args) => native(fn, ms === 12000 ? 80 : ms, ...args); });
  release = null; await open('ACT_timeout'); while (!release) await page.waitForTimeout(10);
  await page.waitForFunction(() => currentActivityShare.pending === false);
  const fallback = await page.locator('#activity-share-url').inputValue(); release(); await page.waitForTimeout(60);
  assert.equal(await page.locator('#activity-share-url').inputValue(), fallback); assert.match(fallback, /ACT_timeout/);
  release = null; await open('ACT_account'); while (!release) await page.waitForTimeout(10);
  await page.evaluate(() => { currentUserProfile = { userId: 'different-account' }; }); release();
  await page.waitForFunction(() => currentActivityShare === null);
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
  console.log(JSON.stringify({ result: 'PASS', widths: [320,390,1440], calls: calls.length, screenshots: out, productionWrites: 0 }));
} finally { await browser.close(); }
