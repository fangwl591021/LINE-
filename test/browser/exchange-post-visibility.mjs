// Synthetic browser-only API, actual exchange HTML and modules; never uses LINE or production data.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const tailwindResponse = await fetch('https://cdn.tailwindcss.com?plugins=forms,container-queries');
assert.ok(tailwindResponse.ok, 'load the same Tailwind runtime as production');
const tailwind = await tailwindResponse.text();
const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const index = read('index.html');
const section = index.slice(index.indexOf('<div id="page-exchange-zone"'), index.indexOf('<!-- ==================== 合作店家目錄'));
const configStart = index.indexOf('tailwind.config');
const tailwindConfig = index.slice(index.lastIndexOf('<script>', configStart), index.indexOf('</script>', configStart) + 9);
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>${tailwindConfig}${(index.match(/<style[\s\S]*?<\/style>/g) || []).join('')}<link rel="stylesheet" href="/css/styles.css"></head><body>${section}<script src="/js/modules/exchange-zone.js"></script></body></html>`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390, isMobile: width === 390 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://cdn.tailwindcss.com**', (route) => route.fulfill({ contentType: 'application/javascript', body: tailwind }));
    await page.route('http://exchange.test/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      route.fulfill({ contentType: path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html', body: path === '/' ? html : read(path.slice(1)) });
    });
    await page.addInitScript(() => {
      window.currentUserProfile = { userId: 'synthetic-owner' };
      window.toasts = []; window.showToast = (text) => window.toasts.push(text);
      window.appConfirm = async () => window.confirmResult !== false;
      window.post = { postHandle: 'synthetic-post', title: '合成測試貼文', body: '這是合成測試內容，不包含正式資料。', author: { name: '合成作者' }, canEdit: true, isHidden: false };
      const access = { mode: 'open', allowed: true, canPublish: true };
      window.fetchAPI = async (action, payload) => {
        if (action === 'getExchangeZoneAccess') return { success: true, access };
        if (action === 'listExchangeZonePosts') {
          const result = { success: true, access, posts: window.post && (payload.ownOnly || !window.post.isHidden) ? [{ ...window.post }] : [] };
          if (window.delayMine && payload.ownOnly) { window.delayMine = false; await new Promise((resolve) => { window.releaseMine = resolve; }); }
          return result;
        }
        if (action === 'getExchangeZonePost') return { success: true, post: { ...window.post } };
        if (action === 'updateExchangeZonePost') {
          if (window.failSave) return { success: false, error: '合成網路錯誤，請重試' };
          if (payload.archivePost) window.post = null;
          else if (typeof payload.hidden === 'boolean') { window.post.isHidden = payload.hidden; window.visibilityWrites = (window.visibilityWrites || 0) + 1; }
          return { success: true, isHidden: payload.hidden };
        }
        throw Error('Unexpected API: ' + action);
      };
    });
    await page.goto('http://exchange.test/');
    await page.waitForFunction(() => typeof window.tailwind === 'object');
    await page.waitForFunction(() => typeof window.openExchangeZone === 'function');
    await page.evaluate(() => window.openExchangeZone());
    const item = page.locator('[data-exchange-post-handle]'), visibility = page.locator('#exchange-zone-visibility-button');
    await item.click(); await visibility.waitFor();
    assert.match(await visibility.textContent(), /隱藏貼文/);
    await page.waitForFunction(() => {
      const rect = document.querySelector('#exchange-zone-visibility-button').getBoundingClientRect();
      return rect.x >= 0 && rect.right <= innerWidth + 1;
    });
    const box = await visibility.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
    await page.evaluate(() => { window.confirmResult = false; }); await visibility.click();
    assert.equal(await page.evaluate(() => window.visibilityWrites || 0), 0);
    await page.evaluate(() => { window.confirmResult = true; window.failSave = true; }); await visibility.click();
    await page.waitForFunction(() => window.toasts.some((s) => s.includes('合成網路錯誤')));
    assert.equal(await page.evaluate(() => window.post.isHidden), false);
    await page.evaluate(() => { window.failSave = false; }); await visibility.click();
    await page.waitForFunction(() => document.querySelectorAll('[data-exchange-post-handle]').length === 0);
    await page.locator('#exchange-zone-drawer').waitFor({ state: 'hidden' });
    await page.locator('[data-exchange-scope="mine"]').click(); await item.click();
    await page.waitForFunction(() => document.querySelector('#exchange-zone-visibility-button')?.textContent.includes('重新顯示'));
    assert.equal(await page.locator('#exchange-zone-edit-button').isDisabled(), true);
    assert.equal(await page.locator('#exchange-zone-archive-button').count(), 1);
    await visibility.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(tmpdir(), `exchange-hidden-${width}.png`) });
    await visibility.click(); await page.locator('#exchange-zone-drawer').waitFor({ state: 'hidden' });
    await page.locator('[data-exchange-scope="public"]').click(); await item.waitFor();
    // A late private response must never repopulate the public feed.
    await page.evaluate(() => { window.post.isHidden = true; window.delayMine = true; });
    await page.locator('[data-exchange-scope="mine"]').click(); await page.waitForFunction(() => !!window.releaseMine);
    await page.locator('[data-exchange-scope="public"]').click();
    await page.waitForFunction(() => document.querySelector('#exchange-zone-status').textContent === '');
    await page.evaluate(() => window.releaseMine()); await page.waitForTimeout(100);
    assert.equal(await item.count(), 0);
    await page.locator('[data-exchange-scope="mine"]').click(); await item.click();
    await page.locator('#exchange-zone-archive-button').click();
    await page.waitForFunction(() => window.post === null);
    assert.equal(await page.evaluate(() => window.visibilityWrites), 2);
    assert.deepEqual(errors, []);
    console.log(`PASS exchange visibility browser ${width}px: hide / restore / cancel / failure / stale scope / hidden delete; screenshot in temp`);
    await page.close();
  }
} finally { await browser.close(); }
