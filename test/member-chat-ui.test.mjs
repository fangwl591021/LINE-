import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChatClient, chatMessageHtml } from '../js/modules/member-chat.js';
import { memberChatRoute } from '../js/modules/member-chat-route.js';
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
