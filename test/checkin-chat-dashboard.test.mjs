import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { defaultCheckinDashboardConfig, normalizeCheckinDashboardConfig, buildCheckinDashboardMessage } from '../worker/checkin-chat-dashboard-render.mjs';
import { handleCheckinChatDashboard, readPublishedCheckinDashboard, readCheckinDashboardSnapshots } from '../worker/checkin-chat-dashboard.mjs';
import { supplementCheckinMallCards } from '../worker/checkin-mall-card.mjs';
const A = 'U' + '1'.repeat(32), B = 'U' + '2'.repeat(32), ADMIN = 'U' + '3'.repeat(32), OLD = 'U' + '4'.repeat(32);
const NOW = Date.parse('2026-10-25T04:00:00Z'), CARD = '11111111-1111-1111-1111-111111111111';
const defaultConfig = () => normalizeCheckinDashboardConfig(defaultCheckinDashboardConfig());
function fixture(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  sql.exec(`PRAGMA foreign_keys=ON; CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT ''); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT); CREATE TABLE protected_points(id INTEGER,balance INTEGER); INSERT INTO protected_points VALUES(1,999);`);
  for (const file of ['0063_checkin_mall_cards.sql', '0071_checkin_chat_dashboard.sql']) sql.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  for (const [uid, role] of [[A, 'user'], [B, 'store'], [ADMIN, 'admin']]) sql.prepare('INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,?,?)').run(uid, uid, role, '測試會員');
  const writes = [], fetches = [], pushes = []; let hook = null, pointReads = 0, balance = 12867, failSnapshot = false;
  const prepare = (query, args = []) => ({ bind(...values) { return prepare(query, values); }, async first() { return sql.prepare(query).get(...args) || null; }, async all() { return { success: true, results: sql.prepare(query).all(...args) }; }, async run() {
    assert.match(query, /^\s*(UPDATE checkin_chat_dashboard_templates|INSERT INTO checkin_chat_dashboard_snapshots|INSERT OR IGNORE INTO checkin_mall_cards|UPDATE checkin_mall_cards)/);
    if (hook && query.startsWith('UPDATE checkin_chat_dashboard_templates')) { const action = hook; hook = null; action(); }
    if (failSnapshot && query.includes('INSERT INTO checkin_chat_dashboard_snapshots')) throw Error('snapshot unavailable');
    writes.push(query); const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes) } };
  } });
  const db = { prepare, withSession() { return this; } }, env = { ACTMASTER_DB: db, CHECKIN_MALL_CARD_ENABLED: 'true', LINE_CHANNEL_ACCESS_TOKEN: 'secret-fixture-only' };
  const fetcher = async (url, options) => {
    fetches.push(url);
    if (url === 'https://api.line.me/v2/profile') {
      const uid = options.headers.Authorization.slice(7); return /^U[0-9a-f]{32}$/i.test(uid) ? Response.json({ userId: uid }) : Response.json({}, { status: 401 });
    }
    assert.equal(url, 'https://api.line.me/v2/bot/message/push'); pushes.push(JSON.parse(options.body)); return Response.json({});
  };
  const mapper = row => ({ role: row.role });
  const call = async (path = '', body, uid = ADMIN, method = body ? 'POST' : 'GET') => {
    const request = new Request('https://worker.test/v1/checkin-chat-dashboard' + path, { method, headers: { ...(uid ? { Authorization: 'Bearer ' + uid } : {}), 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
    const response = await handleCheckinChatDashboard(request, env, mapper, fetcher, NOW); return { status: response.status, ...await response.json() };
  };
  const save = (config = defaultConfig(), expectedDraftRevision = 0, requestKey = crypto.randomUUID(), uid = ADMIN) => call('/draft', { expectedDraftRevision, config, requestKey }, uid);
  const publish = (expectedDraftRevision, expectedPublishedRevision = 0, requestKey = crypto.randomUUID(), uid = ADMIN) => call('/publish', { expectedDraftRevision, expectedPublishedRevision, requestKey }, uid);
  const send = async (uid = A, dayOffset = 0) => supplementCheckinMallCards([{ type: 'message', source: { type: 'user', userId: uid }, webhookEventId: crypto.randomUUID(), timestamp: NOW + dayOffset, message: { type: 'text', text: '會員打卡' } }], env, { success: true }, { async read(userId) { pointReads++; return { identity: userId, balance }; } }, fetcher, NOW + dayOffset);
  return { sql, db, env, call, save, publish, send, writes, fetches, pushes, get pointReads() { return pointReads; }, setBalance(value) { balance = value; }, setHook(value) { hook = value; }, setFailSnapshot(value) { failSnapshot = value; } };
}
test('additive schema seeds the two-page shopping-money-first default without modifying protected data', async t => {
  const f = fixture(t), result = await f.call(); assert.equal(result.status, 200); assert.equal(result.template.key, 'member_checkin');
  assert.equal(result.template.draftRevision, 0); assert.equal(result.template.publishedRevision, 0); assert.deepEqual(result.template.draftConfig, defaultConfig());
  assert.equal(f.sql.prepare('SELECT balance FROM protected_points').get().balance, 999); assert.equal(f.writes.length, 0);
  const one = defaultCheckinDashboardConfig(); one.pages.pop(); assert.equal(defaultCheckinDashboardConfig().pages.length, 2);
});
test('pure carousel preserves authoritative zero, unavailable state, query time and fixed disclosures with tracked internal buttons', () => {
  for (const [balance, expected] of [[0, /0 元/], [12867, /12,867 元/], [null, /暫時無法取得/], [-1, /暫時無法取得/]]) {
    const message = buildCheckinDashboardMessage({}, CARD, balance, NOW, defaultConfig()), raw = JSON.stringify(message);
    assert.equal(message.contents.type, 'carousel'); assert.equal(message.contents.contents.length, 2); assert.match(raw, expected); assert.match(raw, /原文字回覆為準/); assert.match(raw, /查詢時間/); assert.match(raw, /記錄登入身分與時間/); assert.doesNotMatch(raw, /打卡成功|打卡贈點|固定增加|replyToken/);
    for (const page of message.contents.contents) for (const item of page.footer.contents.filter(item => item.type === 'button')) { const url = new URL(item.action.uri); assert.equal(url.hostname, 'liff.line.me'); assert.equal(url.searchParams.get('checkinCard'), CARD); assert(['mall', 'details'].includes(url.searchParams.get('checkinAction'))); assert(!url.href.includes(A)); }
  }
});
test('strict typed config rejects removed/moved wallet, raw JSON/actions, duplicate IDs and unsafe images', () => {
  const cases = [c => c.pages.shift(), c => c.pages.reverse(), c => c.pages[1].kind = 'wallet', c => c.pages[1].id = 'wallet', c => c.foo = 1, c => c.pages[0].balance = 10000, c => c.pages[0].heroImageUrl = 'https://example.test/one.png', c => c.pages[0].buttons.pop(), c => c.pages[0].buttons[0].target = 'https://example.test', c => c.pages[1].buttons[0].uri = 'javascript:alert(1)', c => c.pages[0].buttons[0].label = 'x'.repeat(21), c => c.themeColor = 'red', c => c.pages[1].heroImageUrl = 'http://example.test/a.png', c => c.pages[1].heroImageUrl = 'https://user:password@example.test/a.png', c => c.pages[1].heroImageUrl = 'javascript:alert(1)'];
  for (const change of cases) { const value = defaultConfig(); change(value); assert.throws(() => normalizeCheckinDashboardConfig(value)); }
  const c = defaultConfig(); c.pages[1].heroImageUrl = 'https://example.test/a.png'; const message = buildCheckinDashboardMessage({}, CARD, 0, NOW, c); assert.equal(message.contents.contents[1].hero.aspectRatio, '2:1');
});
test('2–12 page and UTF-8 compiled size boundaries are enforced', () => {
  const config = defaultConfig(); for (let i = 2; i < 12; i++) config.pages.push({ ...structuredClone(config.pages[1]), id: 'page_' + i });
  assert.equal(buildCheckinDashboardMessage({}, CARD, 0, NOW, config).contents.contents.length, 12);
  config.pages.push({ ...structuredClone(config.pages[1]), id: 'too_many' }); assert.throws(() => normalizeCheckinDashboardConfig(config)); config.pages.pop();
  for (const page of config.pages.slice(1)) { page.title = '字'.repeat(60); page.body = '字'.repeat(600); page.heroImageUrl = 'https://example.test/' + 'a'.repeat(2000 - 'https://example.test/'.length); page.buttons.push({ id: 'third', label: '字'.repeat(20), target: 'mall' }); }
  assert.throws(() => buildCheckinDashboardMessage({}, CARD, Number.MAX_SAFE_INTEGER, NOW, config), error => error.code === 'FLEX_TOO_LARGE');
});
test('preview uses an explicit example and does not read wallets, send LINE, create cards, record clicks or write DB', async t => {
  const f = fixture(t), result = await f.call('/preview', { config: defaultConfig() }); assert.equal(result.status, 200); assert.match(JSON.stringify(result.message), /示範預覽/); assert.equal(f.pointReads, 0); assert.equal(f.pushes.length, 0); assert.equal(f.writes.length, 0); assert.equal(f.fetches.length, 1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM checkin_mall_cards').get().n, 0); assert.equal(f.sql.prepare('SELECT count(*) n FROM checkin_mall_clicks').get().n, 0);
});
test('all admin endpoints require fresh authoritative admin identity and reject forged fields', async t => {
  const f = fixture(t);
  for (const uid of ['', 'bad', A, B]) assert([401, 403].includes((await f.call('', undefined, uid)).status));
  assert.equal((await f.call('/draft', { expectedDraftRevision: 0, config: defaultConfig(), requestKey: crypto.randomUUID(), role: 'admin' })).status, 400);
  assert.equal((await f.call('/preview', { config: defaultConfig(), userId: ADMIN })).status, 400);
  assert.equal((await f.call('/draft?role=admin', {})).status, 400); assert.equal(f.writes.length, 0);
});
test('draft CAS is isolated from published rendering and stale saves cannot overwrite', async t => {
  const f = fixture(t), c = defaultConfig(); c.pages[1].title = '草稿新標題';
  const saved = await f.save(c); assert.equal(saved.status, 200); assert.equal(saved.template.draftRevision, 1); assert.equal(saved.template.publishedRevision, 0);
  assert.equal((await readPublishedCheckinDashboard(f.db)).config.pages[1].title, '購物金怎麼用');
  assert.equal((await f.save(defaultConfig(), 0)).status, 409);
  const published = await f.publish(1); assert.equal(published.status, 200); assert.equal(published.template.publishedRevision, 1); assert.equal((await readPublishedCheckinDashboard(f.db)).config.pages[1].title, '草稿新標題');
  assert.equal((await f.publish(1, 0)).status, 409);
});
test('concurrent draft and publish CAS each accept exactly one request at the same revisions', async t => {
  const f = fixture(t), results = await Promise.all([f.save(), f.save()]); assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const publishes = await Promise.all([f.publish(1), f.publish(1)]); assert.deepEqual(publishes.map(result => result.status).sort(), [200, 409]); assert.equal((await f.call()).template.publishedRevision, 1);
});
test('immediate same-key exact retries replay once; changed payload/action or stale later replay do not overwrite', async t => {
  const f = fixture(t), key = crypto.randomUUID(), c = defaultConfig(); assert.equal((await f.save(c, 0, key)).status, 200);
  const replayed = await f.save(c, 0, key); assert.equal(replayed.status, 200); assert.equal(replayed.replayed, true); assert.equal(replayed.template.draftRevision, 1);
  c.pages[1].title = '不同內容'; assert.equal((await f.save(c, 0, key)).status, 409); assert.equal((await f.publish(1, 0, key)).status, 409);
  assert.equal((await f.publish(1)).status, 200); assert.equal((await f.save(defaultConfig(), 0, key)).status, 409);
});
test('role revocation and active-link changes immediately before atomic UPDATE cannot write', async t => {
  const f = fixture(t); f.setHook(() => f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN));
  assert.equal((await f.save()).status, 409); assert.equal((await readPublishedCheckinDashboard(f.db)).revision, 0); assert.equal(f.sql.prepare('SELECT draft_revision FROM checkin_chat_dashboard_templates').get().draft_revision, 0);
  f.sql.prepare("UPDATE users SET role='admin' WHERE line_id=?").run(ADMIN); f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(OLD, ADMIN);
  f.setHook(() => f.sql.prepare("UPDATE user_identity_links SET status='revoked'").run()); assert.equal((await f.save(defaultConfig(), 0, crypto.randomUUID(), OLD)).status, 409);
  assert.equal(f.sql.prepare('SELECT draft_revision FROM checkin_chat_dashboard_templates').get().draft_revision, 0);
});
test('published read failures fall back safely without touching either draft or protected tables', async t => {
  const f = fixture(t); f.sql.prepare("UPDATE checkin_chat_dashboard_templates SET published_json='invalid'").run();
  assert.deepEqual(await readPublishedCheckinDashboard(f.db), { revision: 0, config: defaultCheckinDashboardConfig() });
  f.sql.exec('DROP TABLE checkin_chat_dashboard_templates'); assert.deepEqual(await readPublishedCheckinDashboard(f.db), { revision: 0, config: defaultCheckinDashboardConfig() }); assert.equal(f.writes.length, 0);
});
test('one carousel snapshot precedes one push and remains immutable after later draft/publish edits', async t => {
  const f = fixture(t); await f.send(); assert.equal(f.pushes.length, 1); assert.equal(f.pushes[0].messages.length, 1); assert.equal(f.pushes[0].messages[0].contents.type, 'carousel'); assert.equal(f.pointReads, 1);
  const first = f.sql.prepare('SELECT * FROM checkin_chat_dashboard_snapshots').get(), firstJson = first.message_json; assert.equal(first.template_revision, 0); assert.deepEqual(JSON.parse(firstJson), f.pushes[0].messages[0]);
  const c = defaultConfig(); c.pages[1].title = '新發佈的說明'; await f.save(c); await f.publish(1); await f.send(); assert.equal(f.pushes.length, 1); await f.send(B); assert.equal(f.pushes.length, 2);
  assert.equal(f.sql.prepare('SELECT message_json FROM checkin_chat_dashboard_snapshots WHERE card_id=?').get(first.card_id).message_json, firstJson);
  const map = await readCheckinDashboardSnapshots(f.db, [first.card_id]); assert.equal(map.get(first.card_id).config.pages[1].title, '購物金怎麼用'); assert.equal(map.get(first.card_id).createdAt, NOW);
  assert.equal(f.sql.prepare('SELECT balance FROM protected_points').get().balance, 999);
});
test('snapshot failure closes sending without clearing daily dedup or causing another wallet read', async t => {
  const f = fixture(t); f.setFailSnapshot(true); await f.send(); assert.equal(f.pushes.length, 0); assert.equal(f.pointReads, 1); assert.equal(f.sql.prepare('SELECT state FROM checkin_mall_cards').get().state, 'preparing');
  f.setFailSnapshot(false); await f.send(); assert.equal(f.pushes.length, 0); assert.equal(f.pointReads, 1);
});
test('bulk snapshot read is bounded, read-only and rejects mismatched time, corrupt data and absent table gracefully', async t => {
  const f = fixture(t); await f.send(); const card = f.sql.prepare('SELECT id FROM checkin_mall_cards').get().id, n = f.writes.length;
  assert.equal((await readCheckinDashboardSnapshots(f.db, [card])).size, 1); assert.equal(f.writes.length, n);
  assert.equal((await readCheckinDashboardSnapshots(f.db, Array(81).fill(card))).size, 0);
  f.sql.prepare('UPDATE checkin_chat_dashboard_snapshots SET created_at=created_at+1 WHERE card_id=?').run(card); assert.equal((await readCheckinDashboardSnapshots(f.db, [card])).size, 0);
  f.sql.exec('DROP TABLE checkin_chat_dashboard_snapshots'); assert.equal((await readCheckinDashboardSnapshots(f.db, [card])).size, 0);
});
