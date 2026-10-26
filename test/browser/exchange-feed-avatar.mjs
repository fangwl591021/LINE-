// Actual exchange HTML/modules with synthetic API and image responses only.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const response = await fetch('https://cdn.tailwindcss.com?plugins=forms,container-queries');
assert.ok(response.ok);
const tailwind = await response.text();
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const index = read('index.html');
const section = index.slice(index.indexOf('<div id="page-exchange-zone"'), index.indexOf('<!-- ==================== 合作店家目錄'));
const configStart = index.indexOf('tailwind.config');
const config = index.slice(index.lastIndexOf('<script>', configStart), index.indexOf('</script>', configStart) + 9);
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>${config}${(index.match(/<style[\s\S]*?<\/style>/g) || []).join('')}<link rel="stylesheet" href="/css/styles.css"><link rel="stylesheet" href="/css/exchange-zone.css"></head><body>${section}<script src="/js/modules/exchange-zone.js"></script></body></html>`;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#009d77"/></svg>';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let cases = 0;
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], pending = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'application/javascript', body: tailwind });
      if (url.hostname === 'profile.line-scdn.net') {
        if (url.pathname === '/pending.svg') await new Promise(resolve => pending.push(resolve));
        return route.fulfill(url.pathname === '/broken.svg' ? { status: 404, body: '' } : { contentType: 'image/svg+xml', body: svg });
      }
      if (url.hostname === 'cover.test') return route.fulfill({ contentType: 'image/svg+xml', body: svg });
      if (url.hostname === 'exchange.test') return route.fulfill({ contentType: url.pathname.endsWith('.js') ? 'application/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html', body: url.pathname === '/' ? html : read(url.pathname.slice(1)) });
      unexpected.push(url.hostname); return route.abort();
    });
    await page.addInitScript(() => {
      window.currentUserProfile = { userId: 'synthetic-owner' };
      window.Config = { WORKER_URL: 'https://exchange.test' };
      window.showToast = () => {};
      window.calls = [];
      window.posts = ['good', 'broken', 'pending', 'empty'].map((kind, i) => ({
        postHandle: kind, title: '合成頭貼' + i, excerpt: '合成內容，沒有正式資料', body: '合成完整內容', contactTags: ['合作邀約'],
        author: { name: ['陳', '林', '王', '李'][i] + '測試', avatarUrl: kind === 'empty' ? '' : 'https://profile.line-scdn.net/' + kind + '.svg' },
        cardAvailable: true, card: { name: '合成名片', imageUrl: 'https://cover.test/card.svg', buttons: [] }
      }));
      const access = { allowed: true, canPublish: true, mode: 'open' };
      window.fetchAPI = async (action, payload) => {
        window.calls.push(action);
        if (action === 'getExchangeZoneAccess') return { success: true, access };
        if (action === 'listExchangeZonePosts') return { success: true, access, posts: window.posts };
        if (action === 'getExchangeZonePost') return { success: true, post: window.posts.find(post => post.postHandle === payload.postHandle) };
        throw Error('Unexpected write/action: ' + action);
      };
    });
    await page.goto('https://exchange.test/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.openExchangeZone === 'function');
    await page.evaluate(() => window.openExchangeZone());
    const row = name => page.locator(`[data-exchange-post-handle="${name}"]`);
    await row('good').locator('img[data-exchange-avatar]').waitFor({ state: 'visible' });
    assert.equal(await row('good').locator('img').getAttribute('src'), 'https://profile.line-scdn.net/good.svg');
    assert.equal(await row('good').locator('img').evaluate(image => image.previousElementSibling.hidden), true);
    cases++;
    await page.waitForFunction(() => !document.querySelector('[data-exchange-post-handle="broken"] img'));
    assert.ok((await row('broken').textContent()).includes('林'));
    assert.equal(await row('broken').locator('[aria-hidden="true"]').first().isVisible(), true);
    cases++;
    assert.equal(await row('pending').locator('img').isVisible(), false);
    assert.equal(await row('pending').locator('img').evaluate(image => image.previousElementSibling.hidden), false);
    assert.equal(await row('empty').locator('img').count(), 0);
    assert.ok((await row('empty').textContent()).includes('李'));
    cases++;
    await row('good').click();
    const detail = page.locator('#exchange-zone-drawer-content');
    await detail.locator('img[data-exchange-avatar]').waitFor({ state: 'visible' });
    assert.equal(await detail.locator('img[data-exchange-avatar]').getAttribute('src'), 'https://profile.line-scdn.net/good.svg');
    assert.equal(await detail.locator('img[src="https://cover.test/card.svg"]').count(), 2, 'both card cover renditions remain separate');
    cases++;
    await page.evaluate(() => window.closeExchangeZoneDrawer());
    await page.evaluate(async () => { window.posts[2].author.avatarUrl = 'https://profile.line-scdn.net/replaced.svg'; await window.loadExchangeZone(); });
    await row('pending').locator('img').waitFor({ state: 'visible' });
    for (const release of pending.splice(0)) release();
    assert.equal(await row('pending').locator('img').getAttribute('src'), 'https://profile.line-scdn.net/replaced.svg');
    assert.equal(await row('pending').locator('img').evaluate(image => image.previousElementSibling.hidden), true);
    cases++;
    assert.ok(await row('good').evaluate(node => node.getBoundingClientRect().right <= innerWidth + 1));
    assert.deepEqual(await page.evaluate(() => [...new Set(window.calls)]), ['getExchangeZoneAccess', 'listExchangeZonePosts', 'getExchangeZonePost']);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    cases++;
    await page.close();
  }
  console.log(`Exchange feed avatar browser: ${cases} cases PASS (390 / 1280; synthetic reads only).`);
} finally { await browser.close(); }
