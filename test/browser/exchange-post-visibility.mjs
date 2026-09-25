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
const fonts = (index.match(/<link[^>]+href="https:\/\/fonts.googleapis.com[^>]+>/g) || []).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>${tailwindConfig}${fonts}${(index.match(/<style[\s\S]*?<\/style>/g) || []).join('')}<link rel="stylesheet" href="/css/styles.css"><link rel="stylesheet" href="/css/exchange-zone.css"></head><body>${section}<script src="/js/modules/exchange-zone.js"></script></body></html>`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 390, isMobile: width === 390 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://cdn.tailwindcss.com**', (route) => route.fulfill({ contentType: 'application/javascript', body: tailwind }));
    let releaseChat, releaseMembers, delayChat = true, delayMembers = false, showThreads = false, failMe = false, peerName = '合成會員';
    const chatReads = [];
    await page.route('https://exchange.test/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/js/modules/member-chat.js' && delayChat) { delayChat = false; await new Promise(resolve => { releaseChat = resolve; }); }
      if (path.startsWith('/v1/member-chat/')) {
        chatReads.push(path);
        const endpoint = path.slice('/v1/member-chat/'.length);
        if (endpoint === 'me' && failMe) { failMe = false; await route.fulfill({ status: 503, json: { success: false, error: '合成登入讀取失敗，請重試' } }); return; }
        if (endpoint.endsWith('/messages') && route.request().method() === 'POST') { await route.fulfill({ status: 503, json: { success: false, error: '合成傳送逾時，請重試' } }); return; }
        if (endpoint === 'members' && delayMembers) { delayMembers = false; await new Promise(resolve => { releaseMembers = resolve; }); }
        const payload = endpoint === 'me' ? { accepting: false, notifications: true }
          : endpoint === 'members' ? { items: [{ handle: 'synthetic-card', name: '合成會員', company: '合成公司', match: { score: 82, source: 'ai' } }], next: '', industries: ['科技資訊'] }
          : endpoint === 'threads' && route.request().method() === 'POST' ? { id: '00000000-0000-4000-8000-000000000001' }
          : endpoint === 'threads' && showThreads ? { items: ['合作交流', '活動討論', '商品詢問', '設計提案', '近況分享'].map((name, i) => ({ id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'), name: '合成' + name, preview: '您好！我們可以再聊聊合作細節。', createdAt: '2026-09-25 03:00:00', unread: i === 0 ? 2 : 0 })), next: '' }
          : endpoint.endsWith('/messages') ? { items: [], more: false, peer: { name: peerName }, blocked: false, blockedByMe: false, lastRead: 0 }
          : endpoint === 'line-contact' ? { lineContact: '' } : { items: [], next: '' };
        await route.fulfill({ json: { success: true, ...payload } }); return;
      }
      route.fulfill({ contentType: path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html', body: path === '/' ? html : read(path.slice(1)) });
    });
    await page.addInitScript(() => {
      window.currentUserProfile = { userId: 'synthetic-owner' };
      window.Config = { WORKER_URL: 'https://exchange.test' };
      window.liff = { isLoggedIn: () => true, getAccessToken: () => 'synthetic-token' };
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
    await page.goto('https://exchange.test/');
    await page.waitForFunction(() => typeof window.tailwind === 'object');
    await page.waitForFunction(() => typeof window.openExchangeZone === 'function');
    await page.evaluate(() => window.openExchangeZone());
    await page.evaluate(() => document.fonts.ready);
    const tabs = page.locator('.exchange-top-tabs [role=tab]');
    assert.deepEqual(await tabs.allTextContents(), ['我的聊天', '找會員', '公開動態', '我的貼文']);
    assert.equal(await page.locator('[role=tab][aria-selected=true]').textContent(), '公開動態');
    const intro = page.locator('.exchange-feed-intro'), compose = page.locator('#exchange-zone-compose-button');
    assert.equal(await intro.isVisible(), false, 'public feed has no duplicated publishing intro');
    assert.equal(await compose.isVisible(), false);
    await page.locator('#exchange-tab-mine').click();
    assert.equal(await intro.isVisible(), true, 'My Posts retains its publishing intro');
    assert.equal(await compose.isVisible(), true);
    await compose.click();
    const publish = page.locator('#exchange-zone-publish-button');
    await publish.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const r = document.querySelector('#exchange-zone-publish-button').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
    assert.ok(await page.locator('#exchange-zone-drawer-close').evaluate(node => node.getBoundingClientRect().top >= 0), 'post editor close stays above its scrolling form');
    await page.locator('#exchange-zone-drawer-close').click(); await page.locator('#exchange-zone-drawer').waitFor({ state: 'hidden' });
    await page.locator('#exchange-tab-public').click();
    assert.equal(await intro.isVisible(), false, 'switching back hides the entire intro again');
    assert.equal(await page.locator('[data-exchange-post-handle]').count(), 1, 'public posts are unchanged');
    const tabTop = await page.locator('.exchange-top-tabs').evaluate(node => node.getBoundingClientRect().top);
    await page.evaluate(() => { const list = document.querySelector('#exchange-zone-list'); list.style.minHeight = '1800px'; document.querySelector('#exchange-zone-feed').scrollTop = 400; });
    assert.equal(await page.locator('.exchange-top-tabs').evaluate(node => node.getBoundingClientRect().top), tabTop);
    await page.evaluate(() => { document.querySelector('#exchange-zone-list').style.minHeight = ''; document.querySelector('#exchange-zone-feed').scrollTop = 0; });
    assert.ok(await page.locator('.exchange-top-tabs').evaluate(node => node.scrollWidth <= innerWidth));
    await page.locator('#exchange-tab-threads').click();
    await page.waitForFunction(() => document.querySelector('#page-exchange-zone').dataset.exchangeTab === 'threads');
    for (let attempt = 0; !releaseChat && attempt < 100; attempt++) await page.waitForTimeout(20);
    assert.ok(releaseChat, 'lazy chat request was intercepted');
    await page.locator('#exchange-tab-mine').click(); releaseChat();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.member-chat').count(), 0, 'late lazy import cannot reopen chat over another tab');
    await page.locator('#exchange-tab-members').click(); await page.locator('.mc-contact').waitFor();
    assert.equal(await page.locator('#exchange-zone-chat .mc-embedded').count(), 1);
    assert.equal(await page.locator('.mc-embedded nav').isVisible(), false);
    assert.equal(await page.locator('#exchange-zone-feed').isVisible(), false);
    for (const selector of ['.mc-settings', '.mc-hint', '[data-accepting]', '[data-notifications]', '[data-action="edit-line-contact"]']) {
      assert.equal(await page.locator(selector).isVisible(), false, 'member search omits duplicated setting: ' + selector);
    }
    assert.equal(await page.locator('.mc-search').isVisible(), true);
    assert.ok(await page.locator('#mc-query').evaluate(node => node.getBoundingClientRect().bottom < innerHeight / 2), 'search stays near the top');
    const memberRefresh = page.locator('.mc-search-tools [data-action="refresh"]');
    assert.equal(await memberRefresh.isVisible(), true);
    assert.equal(await page.locator('[data-action="refresh"]').count(), 1);
    const memberRefreshBox = await memberRefresh.boundingBox();
    assert.ok(memberRefreshBox.height >= 44 && memberRefreshBox.x >= 0 && memberRefreshBox.x + memberRefreshBox.width <= width, 'member refresh fits at finger size');
    for (const sort of ['latest', 'match']) {
      const box = await page.locator(`[data-sort="${sort}"]`).boundingBox();
      assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width, 'sort controls fit narrow screens at finger size');
    }
    await page.locator('#mc-industry').selectOption('科技資訊');
    await page.locator('#mc-query').fill('合成');
    await page.locator('.mc-search button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('.mc-status').textContent === '');
    const memberReads = chatReads.filter(path => path.endsWith('/members')).length;
    const memberReload = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/members'));
    await memberRefresh.click(); const memberResponse = await memberReload;
    assert.equal(new URL(memberResponse.url()).searchParams.get('q'), '合成');
    assert.equal(new URL(memberResponse.url()).searchParams.get('industry'), '科技資訊');
    assert.equal(chatReads.filter(path => path.endsWith('/members')).length, memberReads + 1, 'refresh does not also submit the search form');
    await page.screenshot({ path: join(tmpdir(), `exchange-tabs-members-${width}.png`) });
    showThreads = true; failMe = true;
    await page.locator('#exchange-tab-threads').click();
    await page.locator('.mc-status', { hasText: '合成登入讀取失敗' }).waitFor();
    const refreshButton = page.locator('[data-action="refresh"]');
    assert.equal(await refreshButton.count(), 1);
    assert.equal(await page.locator('.mc-preferences summary [data-action="refresh"]').isVisible(), true, 'top refresh available even when initialization fails');
    await refreshButton.click(); await page.locator('.mc-contact').first().waitFor();
    assert.equal(await page.locator('.mc-settings').isVisible(), false, 'chat list starts with settings collapsed');
    assert.equal(await page.locator('.mc-hint').isVisible(), false);
    assert.equal(await page.locator('.mc-contact').count(), 5);
    assert.equal(await page.locator('.mc-contact-meta b').textContent(), '2');
    assert.ok(await page.locator('.mc-contact').first().evaluate(node => node.getBoundingClientRect().top < 180), 'first chat is near the top');
    assert.equal(await page.locator('.member-chat').evaluate(node => node.scrollWidth <= node.clientWidth), true);
    const refreshBox = await refreshButton.boundingBox(), settingsBox = await page.locator('.mc-preferences summary > span').boundingBox();
    assert.ok(refreshBox.height >= 44 && refreshBox.x + refreshBox.width <= settingsBox.x && Math.abs(refreshBox.y - settingsBox.y) < 20, 'refresh sits to the left of settings on the same row');
    const threadReads = chatReads.filter(path => path.endsWith('/threads')).length;
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/threads'));
    await refreshButton.focus(); await page.keyboard.press('Enter');
    await refreshed;
    await page.waitForFunction(() => document.querySelector('.mc-status').textContent === '');
    assert.equal(chatReads.filter(path => path.endsWith('/threads')).length, threadReads + 1);
    assert.equal(await page.locator('.mc-preferences').evaluate(node => node.open), false, 'refresh must not expand settings');
    await page.locator('.mc-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
    assert.equal((await refreshButton.boundingBox()).y, refreshBox.y, 'refresh stays above the scrolling list');
    await page.locator('.mc-scroll').evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: join(tmpdir(), `exchange-chat-list-${width}.png`) });
    if (width === 390) await page.setViewportSize({ width, height: 500 });
    const settings = page.locator('.mc-preferences summary');
    await settings.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.mc-settings').isVisible(), true);
    assert.equal(await page.locator('.mc-hint').isVisible(), true);
    await refreshButton.click(); await page.waitForFunction(() => document.querySelector('.mc-status').textContent === '');
    assert.equal(await page.locator('.mc-preferences').evaluate(node => node.open), true, 'refresh must not collapse settings');
    assert.ok(await settings.evaluate(node => node.getBoundingClientRect().top >= 0 && node.getBoundingClientRect().bottom < innerHeight), 'settings close control remains reachable');
    assert.ok(await page.locator('.mc-scroll').evaluate(node => node.clientHeight >= 80), 'expanded settings leave list space');
    await page.locator('.mc-preferences').evaluate(node => { node.scrollTop = node.scrollHeight; });
    await settings.locator('span').click(); assert.equal(await page.locator('.mc-settings').isVisible(), false);
    await settings.focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('[data-accepting]').isChecked(), false);
    assert.equal(await page.locator('[data-notifications]').isChecked(), true, 'saved opt-in is unchanged');
    await page.locator('[data-action="edit-line-contact"]').click(); await page.locator('#mc-line-contact').waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.mc-popup').count(), 0);
    if (width === 390) await page.setViewportSize({ width, height: 900 });
    showThreads = false;
    await page.locator('#exchange-tab-members').click(); await page.locator('.mc-contact').waitFor();
    assert.equal(await page.locator('.mc-preferences summary [data-action="refresh"]').count(), 0);
    assert.equal(await page.locator('.mc-search-tools [data-action="refresh"]').isVisible(), true, 'member refresh is above results');
    assert.equal(await page.locator('.mc-settings').isVisible(), false);
    assert.equal(await page.locator('.mc-hint').isVisible(), false);
    assert.equal(chatReads.some(path => /\/(preferences|notifications)$/.test(path)), false, 'tab switching never writes preferences');
    peerName = '合成會員・' + '超長公司名稱及職稱'.repeat(10);
    await page.locator('.mc-contact').click(); await page.locator('.mc-peer strong', { hasText: '合成會員' }).waitFor();
    assert.equal(await page.locator('.mc-peer strong').getAttribute('title'), peerName, 'full long name remains available');
    assert.equal(await page.locator('.member-chat>header [data-action="refresh"]').isVisible(), true);
    if (width <= 390) {
      await page.setViewportSize({ width, height: 430 });
      await page.screenshot({ path: join(tmpdir(), `exchange-conversation-actions-${width}.png`) });
      for (const selector of ['.member-chat>header [data-action="back"]', '.member-chat>header [data-action="refresh"]', '#exchange-zone-panel-close', '.mc-compose button']) {
        assert.ok(await page.locator(selector).evaluate(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight; }), 'short viewport action fits: ' + selector);
      }
      assert.equal(await page.locator('.member-chat').evaluate(node => node.scrollWidth <= node.clientWidth), true, 'long peer name does not widen dialog');
      await page.setViewportSize({ width, height: 900 });
    }
    const conversationReload = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/messages'));
    await refreshButton.click(); await conversationReload;
    peerName = '合成會員';
    await page.locator('[data-action="back"]').click();
    await page.waitForFunction(() => document.querySelector('#exchange-tab-threads').getAttribute('aria-selected') === 'true');
    assert.equal(await page.locator('.mc-preferences').evaluate(node => node.open), false, 'return from conversation restores compact list');
    delayMembers = true; await page.locator('#exchange-tab-members').click();
    for (let attempt = 0; !releaseMembers && attempt < 100; attempt++) await page.waitForTimeout(20);
    assert.ok(releaseMembers, 'member request was intercepted');
    await page.locator('#exchange-tab-public').click(); releaseMembers(); await page.waitForTimeout(100);
    assert.equal(await page.locator('.member-chat').count(), 0, 'late private response is discarded after switching to feed');
    await page.locator('#exchange-tab-mine').focus(); await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('#exchange-tab-threads').getAttribute('aria-selected') === 'true');
    await page.locator('.mc-empty').waitFor();
    await page.locator('#exchange-zone-panel-close').click(); await page.locator('#page-exchange-zone').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.member-chat').count(), 0, 'closing the parent cleans up chat');
    await page.clock.install(); const readsAfterClose = chatReads.length; await page.clock.fastForward(45000);
    assert.equal(chatReads.length, readsAfterClose, 'closed shell does not poll');
    await page.evaluate(() => window.openMemberChatNotification(new URLSearchParams({ memberChat: '00000000-0000-4000-8000-000000000001' })));
    await page.locator('.mc-peer strong', { hasText: '合成會員' }).waitFor();
    assert.equal(await page.locator('#exchange-tab-threads').getAttribute('aria-selected'), 'true');
    await page.locator('#mc-body').fill('尚未確認的合成訊息'); await page.locator('.mc-compose button').click();
    await page.locator('.mc-compose button', { hasText: '重試傳送' }).waitFor();
    page.once('dialog', dialog => dialog.dismiss()); await page.locator('#exchange-tab-public').click();
    assert.equal(await page.locator('#exchange-tab-threads').getAttribute('aria-selected'), 'true', 'cancel preserves pending message and current tab');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#exchange-tab-public').click();
    await page.screenshot({ path: join(tmpdir(), `exchange-tabs-public-${width}.png`) });
    const item = page.locator('[data-exchange-post-handle]'), visibility = page.locator('#exchange-zone-visibility-button');
    await item.click(); await visibility.waitFor();
    await page.locator('#exchange-zone-archive-button').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#exchange-zone-archive-button').evaluate(node => node.getBoundingClientRect().bottom <= innerHeight), 'post management action can be scrolled into view');
    assert.ok(await page.locator('#exchange-zone-drawer-close').evaluate(node => node.getBoundingClientRect().top >= 0), 'post detail close remains visible');
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
