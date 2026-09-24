import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleMemberChat } from '../worker/member-chat.mjs';
const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), C = 'U' + 'c'.repeat(32), OLD = 'U' + 'd'.repeat(32);
const BASE = 'https://chat.test/v1/member-chat';
function fixture(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',name TEXT,phone TEXT,role TEXT,network_id TEXT);
    CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
    CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,line_id TEXT DEFAULT '',profile_user_id TEXT DEFAULT '',owner_user_id TEXT DEFAULT '',source_type TEXT,visibility TEXT,pool_eligible INTEGER,ai_review_status TEXT,name TEXT,company_name TEXT,title TEXT,updated_at TEXT);
    CREATE TABLE inbox_items(message_id TEXT); CREATE TABLE points_ledger(id TEXT);
    INSERT INTO users(row_id,line_id,legacy_line_id,name,phone,role,network_id) VALUES('a','${A}','${OLD}','甲','0900000001','user','network-a'),('b','${B}','','乙','0900000002','user','network-b'),('c','${C}','','管理員','0900000003','admin','admin');
    INSERT INTO user_identity_links VALUES('${OLD}','${A}','active');`);
  for (const [id, uid] of [['a', A], ['b', B], ['c', C]]) sql.prepare("INSERT INTO card_contacts(row_id,line_id,profile_user_id,owner_user_id,source_type,visibility,pool_eligible,ai_review_status,name,company_name,title,updated_at) VALUES(?,?,?,?,'self_profile','public',1,'passed',?,'測試公司','業務','2026-09-24')").run('card-' + id, uid, uid, uid, '會員' + id);
  const migration = readFileSync(new URL('../migrations/0046_member_private_chat.sql', import.meta.url), 'utf8'); sql.exec(migration);
  let failWrites = false, authStatus = 200;
  const writes = [];
  function prepare(query, args = []) {
    return {
      bind(...values) { return prepare(query, values); },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return { success: true, results: sql.prepare(query).all(...args) }; },
      async run() {
        if (failWrites) throw Error('private database exception');
        assert.match(query, /^(?:INSERT INTO|UPDATE|DELETE FROM) member_chat_/);
        writes.push(query); const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes) } };
      }
    };
  }
  const db = { prepare, withSession() { return this; } }, env = { ACTMASTER_DB: db, EXCHANGE_ZONE_ACCESS_MODE: 'open' };
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://api.line.me/v2/profile'); assert.equal(options.redirect, 'manual');
    const uid = { a: A, b: B, c: C, old: OLD }[options.headers.Authorization.slice(7)];
    return new Response(JSON.stringify({ userId: uid }), { status: uid ? authStatus : 401 });
  };
  async function api(path, { token = 'a', data, method = data === undefined ? 'GET' : 'POST' } = {}) {
    const response = await handleMemberChat(new Request(BASE + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) }), env, fetcher);
    return { status: response.status, ...await response.json() };
  }
  const room = async () => { const result = await api('/threads', { data: { cardHandle: 'card-b' } }); assert.equal(result.success, true, JSON.stringify(result)); return result.id; };
  const send = (id, body = '你好', token = 'a', clientId = crypto.randomUUID()) => api(`/threads/${id}/messages`, { token, data: { body, clientId } });
  return { sql, env, api, room, send, writes, migration, setFail: value => { failWrites = value; }, setAuth: value => { authStatus = value; } };
}
test('routing is isolated; LINE auth, registration, own card and exchange access fail closed', async t => {
  const f = fixture(t);
  assert.equal(await handleMemberChat(new Request('https://chat.test/other'), {}), null);
  assert.equal((await f.api('/me', { token: '' })).status, 401);
  assert.equal((await f.api('/me', { token: 'fake' })).status, 401);
  f.setAuth(503); assert.equal((await f.api('/me')).status, 503); f.setAuth(200);
  assert.equal((await f.api('/me?userId=' + B)).status, 400);
  f.env.EXCHANGE_ZONE_ACCESS_MODE = 'private'; assert.equal((await f.api('/me')).status, 403); f.env.EXCHANGE_ZONE_ACCESS_MODE = 'open';
  f.sql.exec("UPDATE users SET phone='' WHERE row_id='a'"); assert.equal((await f.api('/me')).code, 'REGISTRATION_REQUIRED');
  f.sql.exec("UPDATE users SET phone='09' WHERE row_id='a'; UPDATE card_contacts SET source_type='ocr_scan' WHERE row_id='card-a'");
  assert.equal((await f.api('/me')).code, 'OWN_CARD_REQUIRED'); assert.equal(f.writes.length, 0);
});
test('directory shows only eligible own public cards, no phone/UID/private collectors', async t => {
  const f = fixture(t); const list = await f.api('/members'); assert.equal(list.items.length, 2);
  assert.doesNotMatch(JSON.stringify(list), /090000|U[abc][abc]{31}|network-|phone|sender_id/);
  assert.equal((await f.api('/members?q=不存在')).items.length, 0);
  for (const [column, value] of [['visibility', 'private'], ['source_type', 'ocr_scan'], ['ai_review_status', 'pending'], ['pool_eligible', 0]]) {
    f.sql.prepare(`UPDATE card_contacts SET ${column}=? WHERE row_id='card-b'`).run(value);
    assert.equal((await f.api('/members')).items.length, 1);
    assert.equal((await f.api('/threads', { data: { cardHandle: 'card-b' } })).status, 403);
    f.sql.exec("UPDATE card_contacts SET visibility='public',source_type='self_profile',ai_review_status='passed',pool_eligible=1 WHERE row_id='card-b'");
  }
  assert.equal((await f.api('/threads', { data: { cardHandle: 'card-a' } })).code, 'SELF_CHAT');
});
test('paired conversation, reciprocal replies, legacy identity, unique retried messages', async t => {
  const f = fixture(t), id = await f.room();
  assert.equal((await f.api('/threads', { token: 'b', data: { cardHandle: 'card-a' } })).id, id);
  assert.equal((await f.api('/threads', { token: 'old', data: { cardHandle: 'card-b' } })).id, id);
  const key = crypto.randomUUID(); const sent = await f.send(id, '你好 👋', 'a', key);
  assert.equal(sent.success, true); assert.equal((await f.send(id, '你好 👋', 'old', key)).item.seq, sent.item.seq);
  assert.equal((await f.send(id, '改過內容', 'a', key)).status, 409);
  await f.send(id, '你好，收到', 'b');
  const a = await f.api(`/threads/${id}/messages`), b = await f.api(`/threads/${id}/messages`, { token: 'b' });
  assert.deepEqual(a.items.map(row => row.mine), [true, false]); assert.deepEqual(b.items.map(row => row.mine), [false, true]);
  assert.equal((await f.api('/threads')).items[0].unread, 1);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM member_chat_threads').get().n, 1);
  assert.doesNotMatch(JSON.stringify(a), /sender_id|member_a|U[ab]{32}/);
});
test('third user including admin cannot read/send/read-mark/block/report another pair', async t => {
  const f = fixture(t), id = await f.room(); const sent = await f.send(id);
  assert.equal((await f.api('/threads', { token: 'c' })).items.length, 0);
  for (const [suffix, data] of [['messages', undefined], ['messages', { body: 'hack', clientId: crypto.randomUUID() }], ['read', { through: sent.item.seq }], ['block', { blocked: true }], ['report', { seq: sent.item.seq, reason: 'x' }]]) {
    assert.equal((await f.api(`/threads/${id}/${suffix}`, { token: 'c', data })).status, 404);
  }
  assert.equal(f.sql.prepare('SELECT count(*) n FROM member_chat_messages').get().n, 1);
});
test('read receipts are bounded to displayed messages and never cover future inserts', async t => {
  const f = fixture(t), id = await f.room(), one = await f.send(id), two = await f.send(id, '第二則');
  assert.equal((await f.api(`/threads/${id}/read`, { token: 'b', data: { through: one.item.seq } })).success, true);
  assert.equal((await f.api('/threads', { token: 'b' })).items[0].unread, 1);
  const result = await f.api(`/threads/${id}/messages`); assert.equal(result.lastRead, one.item.seq);
  assert.equal(result.items[1].read, false);
  assert.equal((await f.api(`/threads/${id}/read`, { token: 'b', data: { through: two.item.seq + 100 } })).status, 400);
});
test('opt-out blocks new contact, existing dialogue remains; bilateral blocking always stops sending', async t => {
  const f = fixture(t);
  await f.api('/preferences', { token: 'b', data: { accepting: false } });
  assert.equal((await f.api('/members')).items.length, 1);
  assert.equal((await f.api('/threads', { data: { cardHandle: 'card-b' } })).status, 403);
  await f.api('/preferences', { token: 'b', data: { accepting: true } }); const id = await f.room(); await f.send(id);
  await f.api('/preferences', { token: 'b', data: { accepting: false } }); assert.equal((await f.send(id, '既有對話')).success, true);
  await f.api(`/threads/${id}/block`, { token: 'b', data: { blocked: true } });
  assert.equal((await f.send(id, '不能收到')).success, false); assert.equal((await f.send(id, '不能寄出', 'b')).success, false);
  assert.equal((await f.api(`/threads/${id}/messages`, { token: 'b' })).blockedByMe, true);
  await f.api(`/threads/${id}/block`, { token: 'b', data: { blocked: false } }); assert.equal((await f.send(id, '解除')).success, true);
});
test('closing new contact after empty thread creation prevents first send', async t => {
  const f = fixture(t), id = await f.room(); await f.api('/preferences', { token: 'b', data: { accepting: false } });
  assert.equal((await f.send(id)).success, false);
});
test('real SQL keyset pagination and incremental updates do not leak or duplicate', async t => {
  const f = fixture(t), id = await f.room();
  for (let i = 0; i < 65; i++) f.sql.prepare('INSERT INTO member_chat_messages(thread_id,sender_id,client_id,body) VALUES(?,?,?,?)').run(id, 'b', crypto.randomUUID(), '訊息' + i);
  const first = await f.api(`/threads/${id}/messages`); assert.equal(first.items.length, 30); assert.equal(first.more, true);
  const older = await f.api(`/threads/${id}/messages?before=${first.items[0].seq}`); assert.equal(older.items.length, 30);
  assert.equal(new Set([...first.items, ...older.items].map(row => row.seq)).size, 60);
  const sent = await f.send(id, '新訊息'); const newer = await f.api(`/threads/${id}/messages?after=${first.items.at(-1).seq}`);
  assert.deepEqual(newer.items.map(row => row.seq), [sent.item.seq]);
  assert.equal((await f.api(`/threads/${id}/messages?after=1&before=2`)).status, 400);
});
test('validation, rate limit, fail-safe persistence and scoped reports', async t => {
  const f = fixture(t), id = await f.room();
  assert.equal((await f.send(id, 'x'.repeat(2001))).status, 400);
  assert.equal((await f.api(`/threads/${id}/messages`, { data: { body: 'x', clientId: crypto.randomUUID(), senderId: 'b' } })).status, 400);
  const sent = await f.send(id, '<script>unsafe</script>');
  assert.equal((await f.api(`/threads/${id}/report`, { token: 'b', data: { seq: sent.item.seq, reason: '騷擾' } })).success, true);
  await f.api(`/threads/${id}/report`, { token: 'b', data: { seq: sent.item.seq, reason: '重送' } });
  assert.equal(f.sql.prepare('SELECT count(*) n FROM member_chat_reports').get().n, 1);
  assert.equal((await f.api(`/threads/${id}/report`, { data: { seq: sent.item.seq, reason: '不能檢舉自己' } })).status, 404);
  for (let i = 0; i < 19; i++) assert.equal((await f.send(id, '正常訊息' + i)).success, true);
  assert.equal((await f.send(id, '太快')).status, 429);
  f.setFail(true); const failed = await f.send(id, '不能假成功', 'b'); assert.equal(failed.status, 503); assert.doesNotMatch(JSON.stringify(failed), /private database exception/);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM inbox_items').get().n, 0); assert.equal(f.sql.prepare('SELECT count(*) n FROM points_ledger').get().n, 0);
});
test('migration is additive and repeatable; ambiguity and missing schema fail closed', async t => {
  const f = fixture(t); f.sql.exec(f.migration);
  const before = JSON.stringify(f.sql.prepare('SELECT * FROM users').all());
  f.sql.exec(f.migration); assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM users').all()), before);
  f.sql.exec(`UPDATE users SET legacy_line_id='${A}' WHERE row_id='c'`);
  assert.equal((await f.api('/me')).status, 403);
  f.sql.exec("UPDATE users SET legacy_line_id='' WHERE row_id='c'; DROP TABLE member_chat_preferences");
  assert.equal((await f.api('/me')).status, 503);
});
