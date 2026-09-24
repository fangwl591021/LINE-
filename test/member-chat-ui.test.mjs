import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChatClient, chatMessageHtml, chatMatchHtml } from '../js/modules/member-chat.js';
import { memberChatRoute } from '../js/modules/member-chat-route.js';
import { normalizeLineContact } from '../js/modules/member-chat-line-contact.js';
import vm from 'node:vm';
const response = value => new Response(JSON.stringify({ success: true, ...value }));
function login() { globalThis.window = { currentUserProfile: { userId: 'a' }, liff: { isLoggedIn: () => true, getAccessToken: () => 'token-a' } }; }
test('private API uses bearer auth only, no UI IDs, no cache or cookies', async () => {
  login(); let request;
  const client = createChatClient({ base: 'https://worker.test/', fetcher: async (url, options) => { request = { url, ...options }; return response({ items: [] }); } });
  await client.request('/members'); assert.equal(request.url, 'https://worker.test/v1/member-chat/members');
  assert.equal(request.headers.Authorization, 'Bearer token-a'); assert.equal(request.cache, 'no-store'); assert.equal(request.credentials, 'omit');
  assert.equal(request.body, undefined); client.close();
});
test('late response after account/token/page changes is rejected; closing aborts in-flight work', async () => {
  for (const mode of ['account', 'token', 'closed', 'page']) {
    login(); let release, signal, current = true;
    const client = createChatClient({ isCurrent: () => current, fetcher: (url, options) => { signal = options.signal; return new Promise(resolve => { release = resolve; }); } });
    const pending = client.request('/threads');
    if (mode === 'account') window.currentUserProfile.userId = 'b';
    if (mode === 'token') window.liff.getAccessToken = () => 'new-token';
    if (mode === 'closed') { client.close(); assert.equal(signal.aborted, true); }
    if (mode === 'page') current = false;
    release(response({ items: [{ body: 'private' }] }));
    await assert.rejects(pending, /身分已變更/); client.close();
  }
});
test('failure does not masquerade as success and retry reuses exact client id/content', async () => {
  login(); const requests = []; let fail = true;
  const client = createChatClient({ fetcher: async (url, options) => { requests.push(JSON.parse(options.body)); if (fail) throw new DOMException('timeout', 'AbortError'); return response({ item: { seq: 1 } }); } });
  const data = { body: 'hello', clientId: crypto.randomUUID() };
  await assert.rejects(client.request('/threads/x/messages', data), /連線逾時/); fail = false;
  assert.equal((await client.request('/threads/x/messages', data)).item.seq, 1); assert.deepEqual(requests[0], requests[1]); client.close();
});
test('score presentation preserves zero, distinguishes rules, and never invents missing results', () => {
  assert.match(chatMatchHtml({ score: 0, source: 'ai' }), /0%/);
  assert.match(chatMatchHtml({ score: 82, source: 'rules' }), /規則配對/);
  for (const match of [null, { score: null }, { score: -1 }, { score: 101 }, { score: NaN }, { score: '<script>' }]) {
    assert.equal(chatMatchHtml(match), '<span class="mc-match-empty">尚無配對</span>');
  }
});

test('attachment references stay in the authorized conversation; opening a popup is not a send or redemption', () => {
  assert.match(chatMessageHtml({ seq: 1, body: '<b>優惠</b>', hasCoupon: true }), /data-action="coupon" data-seq="1"/);
  const ui = readFileSync(new URL('../js/modules/member-chat.js', import.meta.url), 'utf8');
  const popups = readFileSync(new URL('../js/modules/member-chat-popups.js', import.meta.url), 'utf8');
  assert.match(ui, /data-action="attach"/); assert.match(ui, /data-action="card"/);
  assert.match(ui, /popups.close\(\)/); assert.match(ui, /couponHandle: selectedCoupon.handle/);
  assert.match(popups, /確認核銷/); assert.match(popups, /client.request\(path, \{\}\)/);
  assert.doesNotMatch(popups, /currentCard|fetchAPI|localStorage|innerHTML = error/);
});

test('plain text messages escape injected HTML and do not execute URLs', () => {
  const html = chatMessageHtml({ seq: 1, body: '<img src=x onerror=alert(1)> javascript:evil()', mine: false, createdAt: '2026-09-24 08:30:00' });
  assert.doesNotMatch(html, /<img|href=/); assert.match(html, /&lt;img/); assert.match(html, /data-action="report"/);
});
test('integration stays lazy and isolated from existing public feed/inbox/points', () => {
  const root = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const loader = root('js/modules/exchange-zone.js'), ui = root('js/modules/member-chat.js'), entry = root('worker-entry.mjs');
  assert.match(loader, /openExchangeMemberChat = async/); assert.match(loader, /await import\(new URL\('member-chat/);
  assert.match(root('index.html'), /新增自我宣傳・10 點/); assert.match(root('index.html'), /我的聊天/);
  assert.match(entry, /handleMemberChat\(request, env\)/);
  assert.match(ui, /document.hidden/); assert.match(ui, /clearTimeout\(timer\)/); assert.match(ui, /pagehide/);
  assert.match(ui, /英文名/); assert.match(ui, /已建立本人名片並接受新聯絡/);
  assert.doesNotMatch(ui, /僅列出已公開且通過檢查/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|setInterval|sendInboxMessage|fetchAPI\(/);
  assert.doesNotMatch(root('worker/member-chat.mjs'), /INSERT INTO (users|inbox_items|points_ledger|card_contacts)/);
  assert.match(root('migrations/0046_member_private_chat.sql'), /UNIQUE\(sender_id,client_id\)/);
});

test('notification link is view-only, validates UUID and cannot take over any other feature route', () => {
  const id = crypto.randomUUID();
  assert.equal(memberChatRoute(new URLSearchParams({ memberChat: id, code: 'oauth', state: 'oauth' })), id);
  for (const key of ['shareCardId','claimCardId','shopSection','shopProduct','ref','net','userId','role','checkin','memberProduct']) {
    assert.equal(memberChatRoute(new URLSearchParams({ memberChat: id, [key]: 'x' })), '');
  }
  for (const value of ['', 'bad', '../secret', '<script>']) assert.equal(memberChatRoute(new URLSearchParams({ memberChat: value })), '');
  assert.equal(memberChatRoute(new URLSearchParams(`memberChat=${id}&memberChat=${id}`)), '');
  const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
  const reader = config.slice(config.indexOf('function readActmasterInitialParams()'), config.indexOf('function hasNfcCheckinParams'));
  for (const search of [`?memberChat=${id}&code=oauth&state=opaque_STATE`, `?liff.state=${encodeURIComponent('?memberChat=' + id)}`]) {
    const context = { window: { location: { search } }, URLSearchParams, console };
    const parsed = vm.runInNewContext(reader + '\nreadActmasterInitialParams()', context);
    assert.equal(memberChatRoute(parsed), id, 'actual existing LIFF/OAuth query reader');
  }
});

test('member industry selection is below text search, resets paging and versions the scoped assets', () => {
  const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const ui = read('js/modules/member-chat.js');
  assert.match(ui, /id="mc-query"[^\n]+業種搜尋<select id="mc-industry"/);
  assert.match(ui, /params.set\('industry', memberIndustry\)/);
  assert.match(ui, /industry.addEventListener\('change', searchMembers\)/);
  assert.match(ui, /generation\+\+; busy = false; next = ''; list.replaceChildren\(\)/);
  assert.match(ui, /member-chat.css\?v=6/);
  assert.equal((read('js/modules/exchange-zone.js').match(/member-chat.js\?v=9/g) || []).length, 1, 'both entry points share the same lazy chat loader');
  assert.match(read('index.html'), /exchange-zone.js\?v=1.20/);
});

test('exchange navigation is a single fixed top tablist with an optional embedded private-chat container', () => {
  const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const html = read('index.html'), core = read('js/modules/exchange-zone-core.js'), loader = read('js/modules/exchange-zone.js'), chat = read('js/modules/member-chat.js');
  const section = html.slice(html.indexOf('<div id="page-exchange-zone"'), html.indexOf('<!-- ==================== 合作店家目錄'));
  assert.equal((section.match(/role="tablist"/g) || []).length, 1);
  assert.deepEqual([...section.matchAll(/data-exchange-tab="([^"]+)"/g)].map(match => match[1]), ['threads', 'members', 'public', 'mine']);
  assert.ok(section.indexOf('role="tablist"') < section.indexOf('id="exchange-zone-feed"'));
  assert.match(section, /id="exchange-zone-chat" role="tabpanel"/);
  assert.match(core, /window.closeExchangeMemberChat\?\.\(\{ confirm: true \}\)/);
  assert.match(loader, /ticket === chatRequest/); assert.match(loader, /root\?\.dataset.exchangeTab === tab/);
  assert.match(loader, /openExchangeZone\(\{ tab: 'threads', threadId \}\)/);
  assert.match(chat, /if \(container\) modal.show\(\); else modal.showModal\(\)/);
  assert.match(chat, /closeActive = null/); assert.match(chat, /popups.close\(\); client.close\(\)/);
});

test('exchange publishing intro is restricted to My Posts, including before a tab is selected', () => {
  const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  assert.ok(read('css/exchange-zone.css').includes('#page-exchange-zone:not([data-exchange-tab="mine"]) .exchange-feed-intro{display:none}'));
  assert.match(read('index.html'), /css\/exchange-zone\.css\?v=3/);
});

test('member search hides duplicate preferences and notification copy without changing values', () => {
  const ui = readFileSync(new URL('../js/modules/member-chat.js', import.meta.url), 'utf8');
  const setView = ui.slice(ui.indexOf('function setView(nextView)'), ui.indexOf('async function openConversation'));
  assert.ok(setView.includes("$('.mc-settings').hidden = view !== 'threads'"));
  assert.ok(setView.includes("$('.mc-hint').hidden = view === 'members'"));
  assert.doesNotMatch(setView, /client\.request|\.checked\s*=/);
});

test('chat list uses collapsed native settings and preserves original preference controls', () => {
  const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const ui = read('js/modules/member-chat.js');
  assert.match(ui, /<details class="mc-preferences" hidden><summary aria-label="聊天設定">/);
  assert.match(ui, /class="mc-hint">[^<]+<\/p><\/details>/);
  assert.ok(ui.includes("$('.mc-preferences').open = false"));
  assert.ok(ui.includes("modal.classList.toggle('mc-thread-list', view === 'threads')"));
  assert.ok(read('css/member-chat.css').includes('.member-chat.mc-thread-list{background:#fff}'));
  assert.ok(read('css/exchange-zone.css').includes('#page-exchange-zone[data-exchange-tab="threads"] #exchange-zone-panel>header p{display:none}'));
});

test('LINE contact accepts only IDs or add-friend URLs and is separate from notification opt-in', () => {
  for (const [input, expected] of [[' demo_id ', 'https://line.me/ti/p/~demo_id'], ['@demo', 'https://line.me/R/ti/p/%40demo'], ['https://line.me/ti/p/AB-C_xyz', 'https://line.me/ti/p/AB-C_xyz'], ['https://lin.ee/abc123', 'https://lin.ee/abc123'], ['', '']]) assert.equal(normalizeLineContact(input), expected);
  for (const input of [null, {}, 123, 'abc', 'U' + 'a'.repeat(32), 'a'.repeat(501), 'https://evil.test/a', 'javascript:alert(1)', 'http://line.me/ti/p/abc', 'https://line.me.evil.test/ti/p/abc', 'https://evil@line.me/ti/p/abc', 'https://line.me:444/ti/p/abc', 'https://line.me/R/share?text=x', 'https://line.me/ti/p/a%2fb', 'https://line.me/ti/p/abc\n', 'https://line.me\\evil.test/ti/p/abc']) assert.equal(normalizeLineContact(input), null, String(input));
  const ui = readFileSync(new URL('../js/modules/member-chat.js', import.meta.url), 'utf8');
  assert.match(ui, /data-notifications disabled>LINE通知<\/label><button[^>]+edit-line-contact/);
  assert.match(ui, /（點我新增）/); assert.match(ui, /member-chat-popups.js\?v=2/);
  assert.doesNotMatch(ui, /LINE 私訊通知|離開頁面也提醒/);
});

test('opt-in is explicit, auth precedes deep link, private notifications cron cannot run legacy jobs', () => {
  const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const ui = read('js/modules/member-chat.js'), auth = read('js/auth.js'), entry = read('worker-entry.mjs');
  assert.match(ui, /data-notifications disabled/); assert.doesNotMatch(ui, /data-notifications checked/);
  assert.match(ui, /client.request\('\/notifications', \{ enabled \}\)/);
  assert.match(ui, /const me = await client.request\('\/me'\)[\s\S]+room = threadId/);
  assert.match(auth, /applyRegisteredUserSession\(checkRes.info,[^\n]+\n\s+if \(await window.openMemberChatNotification\?\.\(urlParams\)\) return/);
  assert.match(read('index.html'), /js\/auth\.js\?v=11\.06&manage=1&chat=1/);
  assert.match(entry, /controller\?\.cron === '\* \* \* \* \*'[\s\S]+processMemberChatNotifications\(env\)[\s\S]+return;\s+}\s+if \(controller\?\.cron === '\*\/15/);
  assert.match(read('wrangler.toml'), /crons = \["0 1 \* \* \*", "\*\/15 18-20 \* \* \*", "\* \* \* \* \*"\]/);
});
