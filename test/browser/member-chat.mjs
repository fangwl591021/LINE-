// Start member-chat-preview.mjs first; all accounts/messages are synthetic and loopback-only.
// PLAYWRIGHT_PATH may point to an existing installed Playwright package; no dependency changes.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = []; const pages = [];
async function page(as) {
  const p = await context.newPage(); pages.push(p); p.on('pageerror', error => errors.push(error.message));
  await p.clock.install(); await p.goto('http://127.0.0.1:8804/?as=' + as); return p;
}
const wait = (p, fn) => p.waitForFunction(fn, null, { timeout: 10000 });
async function send(p, body) {
  await p.locator('#mc-body').fill(body); await p.locator('.mc-compose button').click();
  await wait(p, () => document.querySelector('#mc-body').value === '');
}
try {
  const a = await page('a');
  let releaseMe;
  await a.route('**/v1/member-chat/me', async route => { await new Promise(resolve => { releaseMe = resolve; }); await route.continue(); });
  await a.locator('#open').click(); await a.locator('nav [data-action="members"]').click();
  await new Promise(resolve => setTimeout(resolve, 50)); releaseMe();
  await a.locator('[data-handle="card-b"]').waitFor(); await a.unroute('**/v1/member-chat/me');
  assert.equal(await a.locator('.mc-contact').count(), 2);
  await a.locator('[data-handle="card-b"]').click(); await wait(a, () => document.querySelector('.mc-peer strong').textContent.includes('小陳'));
  await send(a, '您好！想了解咖啡禮盒合作 ☕');
  const b = await page('b'); await b.locator('#open').click(); await b.locator('.mc-contact').first().click();
  await wait(b, () => document.querySelector('.mc-rows').textContent.includes('咖啡禮盒'));
  await send(b, '您好！歡迎交流，我們可以一起討論。');
  await a.locator('[data-action="refresh"]').click(); await wait(a, () => document.querySelector('.mc-rows').textContent.includes('一起討論'));
  await send(b, '這是對方先送出、稍後才同步的訊息'); await send(a, '本機先顯示的回覆');
  await a.locator('[data-action="refresh"]').click(); await wait(a, () => document.querySelector('.mc-rows').textContent.includes('稍後才同步'));
  const sequences = await a.locator('.mc-message').evaluateAll(nodes => nodes.map(node => Number(node.dataset.seq)));
  assert.deepEqual(sequences, [...sequences].sort((x, y) => x - y)); assert.equal(new Set(sequences).size, sequences.length);
  const sizes = await a.evaluate(() => { const modal = document.querySelector('dialog'), close = document.querySelector('[data-action="close"]'), send = document.querySelector('.mc-compose button'); return { width: modal.scrollWidth, viewport: innerWidth, close: close.getBoundingClientRect().top, send: send.getBoundingClientRect().bottom, height: innerHeight }; });
  assert.ok(sizes.width <= sizes.viewport && sizes.close >= 0 && sizes.send <= sizes.height);
  const screenshot = join(tmpdir(), 'member-chat-mobile.png'); await a.screenshot({ path: screenshot });
  let dropped = false;
  await a.route('**/v1/member-chat/threads/*/messages', async route => {
    if (route.request().method() === 'POST' && !dropped) { dropped = true; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await a.locator('#mc-body').fill('網路回應遺失後重試'); await a.locator('.mc-compose button').click();
  await wait(a, () => document.querySelector('.mc-compose button').textContent === '重試傳送');
  await a.unroute('**/v1/member-chat/threads/*/messages'); await a.locator('.mc-compose button').click();
  await wait(a, () => document.querySelector('#mc-body').value === ''); await a.locator('[data-action="refresh"]').click();
  assert.equal(await a.locator('.mc-message p', { hasText: '網路回應遺失後重試' }).count(), 1);
  await b.locator('[data-action="block"]').click(); await wait(b, () => document.querySelector('[data-action="block"]').textContent === '解除封鎖');
  await a.locator('[data-action="refresh"]').click(); await wait(a, () => document.querySelector('.mc-compose button').disabled);
  await b.locator('[data-action="block"]').click(); await wait(b, () => document.querySelector('[data-action="block"]').textContent === '封鎖');
  const c = await page('c'); await c.locator('#open').click(); await c.locator('.mc-empty').waitFor(); assert.equal(await c.locator('.mc-contact').count(), 0);
  let requests = 0; a.on('request', req => { if (req.url().includes('/v1/member-chat/')) requests++; });
  await a.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const start = requests; await a.clock.fastForward(45000); assert.equal(requests, start, 'background makes no polling calls');
  await a.evaluate(() => { window.currentUserProfile.userId = 'changed-account'; Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await a.locator('dialog').count(), 0, 'account change removes private UI');
  const stopped = requests; await a.clock.fastForward(45000); assert.equal(requests, stopped, 'closed view makes no polling calls');
  await b.setViewportSize({ width: 1440, height: 900 });
  assert.ok(await b.locator('dialog').evaluate(node => node.getBoundingClientRect().width <= 620));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', checks: ['two-party replies', 'third-party isolation', 'receive cursor and chronological order', 'lost-response retry', 'block/unblock', 'background/close polling stop', 'account change cleanup', 'mobile/desktop layout'], screenshot }));
} finally { await browser.close(); }
