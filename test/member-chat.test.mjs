import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleMemberChat, processMemberChatNotifications } from '../worker/member-chat.mjs';
import { CHAT_INDUSTRIES, CHAT_INDUSTRY_FILTER } from '../worker/member-chat-industry.mjs';
const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), C = 'U' + 'c'.repeat(32), OLD = 'U' + 'd'.repeat(32);
const BASE = 'https://chat.test/v1/member-chat';
function fixture(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',name TEXT,phone TEXT,role TEXT,network_id TEXT);
    CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
    CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,line_id TEXT DEFAULT '',profile_user_id TEXT DEFAULT '',owner_user_id TEXT DEFAULT '',source_type TEXT,visibility TEXT,pool_eligible INTEGER,ai_review_status TEXT,name TEXT,company_name TEXT,title TEXT,updated_at TEXT,english_name TEXT DEFAULT '',archived_at TEXT DEFAULT '',merged_into_row_id TEXT DEFAULT '',custom_config TEXT DEFAULT '{}',tags TEXT DEFAULT '',services TEXT DEFAULT '');
    CREATE TABLE inbox_items(message_id TEXT); CREATE TABLE points_ledger(id TEXT);
    INSERT INTO users(row_id,line_id,legacy_line_id,name,phone,role,network_id) VALUES('a','${A}','${OLD}','甲','0900000001','user','network-a'),('b','${B}','','乙','0900000002','user','network-b'),('c','${C}','','管理員','0900000003','admin','admin');
    INSERT INTO user_identity_links VALUES('${OLD}','${A}','active');`);
  for (const [id, uid] of [['a', A], ['b', B], ['c', C]]) sql.prepare("INSERT INTO card_contacts(row_id,line_id,profile_user_id,owner_user_id,source_type,visibility,pool_eligible,ai_review_status,name,company_name,title,updated_at) VALUES(?,?,?,?,'self_profile','public',1,'passed',?,'測試公司','業務','2026-09-24')").run('card-' + id, uid, uid, uid, '會員' + id);
  const migration = readFileSync(new URL('../migrations/0046_member_private_chat.sql', import.meta.url), 'utf8'); sql.exec(migration);
  sql.exec(readFileSync(new URL('../migrations/0047_member_chat_notifications.sql', import.meta.url), 'utf8'));
  let failWrites = false, authStatus = 200, botStatus = 200, pushStatus = 200, failFinalize = false;
  const pushes = [], botLookups = [];
  const writes = [];
  function prepare(query, args = []) {
    return {
      bind(...values) { return prepare(query, values); },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return { success: true, results: sql.prepare(query).all(...args) }; },
      async run() {
        if (failWrites) throw Error('private database exception');
        if (failFinalize && args[0] === 'sent') { failFinalize = false; throw Error('simulated lost completion'); }
        assert.match(query, /^(?:INSERT INTO|UPDATE|DELETE FROM) member_chat_/);
        writes.push(query); const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes) } };
      }
    };
  }
  const db = { prepare, withSession() { return this; } }, env = { ACTMASTER_DB: db, EXCHANGE_ZONE_ACCESS_MODE: 'open' };
  const fetcher = async (url, options) => {
    if (url.startsWith('https://api.line.me/v2/bot/profile/')) {
      const uid = url.split('/').at(-1); botLookups.push(uid);
      assert.equal(options.headers.Authorization, 'Bearer test-bot-token');
      return new Response(JSON.stringify({ userId: uid }), { status: botStatus });
    }
    if (url === 'https://api.line.me/v2/bot/message/push') {
      pushes.push({ body: JSON.parse(options.body), key: options.headers['X-Line-Retry-Key'] });
      if (pushStatus === 'timeout') throw new DOMException('network', 'TimeoutError');
      return new Response('{}', { status: pushStatus, headers: pushStatus === 409 ? { 'x-line-accepted-request-id': 'already-accepted' } : {} });
    }
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
  const drain = () => processMemberChatNotifications(env, fetcher);
  const due = () => sql.exec("UPDATE member_chat_notification_jobs SET due_at=0,lease_until=0 WHERE status='pending'");
  const enable = (token = 'b') => { env.LINE_CHANNEL_ACCESS_TOKEN = 'test-bot-token'; return api('/notifications', { token, data: { enabled: true } }); };
  return { sql, env, api, room, send, writes, migration, drain, due, enable, pushes, botLookups,
    setBot: value => { botStatus = value; }, setPush: value => { pushStatus = value; }, failFinalize: () => { failFinalize = true; },
    setFail: value => { failWrites = value; }, setAuth: value => { authStatus = value; } };
}
test('routing is isolated; LINE auth, registration, own card and exchange access fail closed', async t => {
  const f = fixture(t);
  assert.equal(await handleMemberChat(new Request('https://chat.test/other'), {}), null);
  assert.equal((await f.api('/me', { token: '' })).status, 401);
  assert.equal((await f.api('/me', { token: 'fake' })).status, 401);
  f.setAuth(503); assert.equal((await f.api('/me')).status, 503); f.setAuth(200);
  assert.equal((await f.api('/me?userId=' + B)).status, 400);
  f.env.EXCHANGE_ZONE_ACCESS_MODE = 'private'; assert.equal((await f.api('/me')).status, 403); f.env.EXCHANGE_ZONE_ACCESS_MODE = 'open';
  f.sql.exec("UPDATE users SET phone='' WHERE row_id='a'"); assert.equal((await f.api('/me')).success, true);
  f.sql.exec("UPDATE users SET phone='09' WHERE row_id='a'; UPDATE card_contacts SET source_type='ocr_scan' WHERE row_id='card-a'");
  assert.equal((await f.api('/me')).code, 'OWN_CARD_REQUIRED'); assert.equal(f.writes.length, 0);
});
test('directory accepts own cards regardless of public pool; collectors and inactive cards stay excluded', async t => {
  const f = fixture(t); const list = await f.api('/members'); assert.equal(list.items.length, 2);
  assert.doesNotMatch(JSON.stringify(list), /090000|U[abc][abc]{31}|network-|phone|sender_id/);
  assert.equal((await f.api('/members?q=不存在')).items.length, 0);
  for (const [column, value] of [['visibility', 'private'], ['ai_review_status', 'pending'], ['ai_review_status', 'failed'], ['pool_eligible', 0]]) {
    f.sql.prepare(`UPDATE card_contacts SET ${column}=? WHERE row_id='card-b'`).run(value);
    assert.equal((await f.api('/members')).items.length, 2);
    assert.equal((await f.api('/threads', { data: { cardHandle: 'card-b' } })).success, true);
  }
  for (const [column, value] of [['source_type', 'ocr_scan'], ['archived_at', '2026-09-24'], ['merged_into_row_id', 'card-other']]) {
    f.sql.prepare(`UPDATE card_contacts SET ${column}=? WHERE row_id='card-b'`).run(value);
    assert.equal((await f.api('/members')).items.length, 1);
    assert.equal((await f.api('/threads', { data: { cardHandle: 'card-b' } })).status, 403);
    f.sql.exec("UPDATE card_contacts SET source_type='self_profile',archived_at='',merged_into_row_id='' WHERE row_id='card-b'");
  }
  assert.equal((await f.api('/threads', { data: { cardHandle: 'card-a' } })).code, 'SELF_CHAT');
});
test('English and account names are searchable, ignoring case and spaces, without changing cards or requiring phone', async t => {
  const f = fixture(t);
  f.sql.exec("UPDATE card_contacts SET visibility='private',ai_review_status='pending',pool_eligible=0,english_name='Tony Fang' WHERE row_id='card-b'; UPDATE users SET name='LINE 別名',phone='' WHERE row_id='b'");
  const original = JSON.stringify(f.sql.prepare('SELECT * FROM card_contacts ORDER BY row_id').all());
  for (const query of ['TONYFANG', 'tony fang', '  TonyFang  ', 'LINE別名', '測試公司', '業務']) {
    const result = await f.api('/members?q=' + encodeURIComponent(query));
    assert.equal(result.status, 200); assert.ok(result.items.some(row => row.handle === 'card-b'), query);
    assert.doesNotMatch(JSON.stringify(result), /english_name|line_id|profile_user_id|phone|visibility|pool_eligible/);
  }
  assert.equal((await f.api('/me', { token: 'b' })).success, true);
  const id = await f.room(); assert.equal((await f.send(id)).success, true); assert.equal((await f.send(id, '收到', 'b')).success, true);
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM card_contacts ORDER BY row_id').all()), original);
  f.sql.exec("UPDATE card_contacts SET name='' WHERE row_id='card-b'");
  assert.equal((await f.api('/members?q=tonyfang')).items[0].name, 'Tony Fang');
  f.sql.exec("UPDATE card_contacts SET english_name='' WHERE row_id='card-b'");
  assert.equal((await f.api('/members?q=LINE別名')).items[0].name, 'LINE 別名');
  await f.api('/preferences', { token: 'b', data: { accepting: false } });
  assert.equal((await f.api('/members?q=LINE別名')).items.length, 0);
  await f.api('/preferences', { token: 'b', data: { accepting: true } });
  await f.api(`/threads/${id}/block`, { token: 'b', data: { blocked: true } });
  assert.equal((await f.api('/members?q=LINE別名')).items.length, 0);
});
test('directory chooses one current own card and paginates the expanded member pool', async t => {
  const f = fixture(t);
  f.sql.exec(`INSERT INTO card_contacts(row_id,line_id,source_type,visibility,pool_eligible,ai_review_status,name,english_name,updated_at) VALUES('card-b-new','${B}','self_profile','private',0,'pending','新名片','Tony Fang','2026-09-25');`);
  assert.deepEqual((await f.api('/members?q=tonyfang')).items.map(row => row.handle), ['card-b-new']);
  assert.equal((await f.api('/members')).items.filter(row => row.handle.startsWith('card-b')).length, 1);
  f.sql.exec("UPDATE card_contacts SET archived_at='2026-09-26' WHERE row_id='card-b-new'");
  assert.equal((await f.api('/members?q=tonyfang')).items.length, 0);
  f.sql.exec("DELETE FROM card_contacts WHERE row_id='card-c'");
  assert.equal((await f.api('/members')).items.length, 1);
  assert.equal((await f.api('/me', { token: 'c' })).code, 'OWN_CARD_REQUIRED');
  for (let i = 0; i < 35; i++) {
    const uid = 'U' + i.toString(16).padStart(32, '0'), id = 'sample-' + i.toString().padStart(2, '0');
    f.sql.prepare('INSERT INTO users(row_id,line_id,name,phone) VALUES(?,?,?,?)').run(id, uid, '測試會員', '');
    f.sql.prepare("INSERT INTO card_contacts(row_id,line_id,source_type,visibility,pool_eligible,ai_review_status,name,updated_at) VALUES(?,?,'self_profile','private',0,'pending','測試會員','2026-09-24')").run(id, uid);
  }
  const first = await f.api('/members'), second = await f.api('/members?after=' + first.next);
  assert.equal(first.items.length, 30); assert.equal(second.items.length, 6); assert.equal(second.next, '');
  assert.equal(new Set([...first.items, ...second.items].map(row => row.handle)).size, 36);
});
test('industry filter uses existing primary/secondary classification, tags and safe legacy fallback, without writes', async t => {
  const f = fixture(t);
  const update = (config, tags = '', company = '咖啡食品公司') => f.sql.prepare("UPDATE card_contacts SET custom_config=?,tags=?,company_name=?,english_name='Tony Fang' WHERE row_id='card-b'").run(typeof config === 'string' ? config : JSON.stringify(config), tags, company);
  const found = async (industry, q = '') => {
    const result = await f.api('/members?' + new URLSearchParams({ industry, q }));
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.deepEqual(result.industries, CHAT_INDUSTRIES);
    assert.doesNotMatch(JSON.stringify(result.items), /custom_config|tags|services|line_id|phone/);
    return result.items.some(row => row.handle === 'card-b');
  };
  update({ industryClassification: { primary: '科技資訊', secondary: ['教育培訓', '金融保險'] } }, '餐飲食品');
  assert.equal(await found('科技資訊', 'TONYFANG'), true);
  assert.equal(await found('教育培訓'), true); assert.equal(await found('金融保險'), true);
  assert.equal(await found('餐飲食品'), false, 'manual classification overrides older tags/company keywords');
  assert.equal(await found('科技資訊', '不存在'), false);
  update({ industryClassification: { primary: '待分類', secondary: ' 教育培訓、金融保險 ' } });
  assert.equal(await found('待分類'), true); assert.equal(await found('教育培訓'), true); assert.equal(await found('餐飲食品'), false);
  for (const tags of ['科技資訊, 教育培訓，金融保險|餐飲食品', '["科技資訊","教育培訓"]']) {
    update('{broken', tags); assert.equal(await found('科技資訊'), true); assert.equal(await found('教育培訓'), true);
  }
  update('{}', '科技資訊', '健康診所'); assert.equal(await found('健康醫療'), false, 'explicit industry tag beats inferred keyword');
  update('{broken', 'VIP'); assert.equal(await found('餐飲食品'), true, 'legacy fallback is read-only');
  update('null', '', '無分類名稱'); assert.equal(await found('其他行業'), true);
  for (const industry of ["' OR 1=1 --", '金融', 'x'.repeat(100)]) assert.equal((await f.api('/members?' + new URLSearchParams({ industry }))).status, 400);
  assert.equal((await f.api('/members?industry=科技資訊&industry=餐飲食品')).status, 400);
  const original = JSON.stringify(f.sql.prepare('SELECT * FROM card_contacts ORDER BY row_id').all());
  await found(''); await found('其他行業');
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM card_contacts ORDER BY row_id').all()), original);
  assert.equal(f.writes.length, 0);
});

test('industry options and inferred fallback stay aligned with existing card-folder rules', async t => {
  const f = fixture(t), source = readFileSync(new URL('../js/modules/a-kaffit-card-scanner-adapter.js', import.meta.url), 'utf8');
  const rules = [...source.slice(source.indexOf('const INDUSTRY_RULES'), source.indexOf('let scanState')).matchAll(/\['([^']+)',\/([^/]+)\/i\]/g)].map(([, label, pattern]) => [label, pattern]);
  assert.equal(rules.length, 14);
  assert.deepEqual(CHAT_INDUSTRIES, [...rules.map(([label]) => label), '其他行業', '待分類']);
  for (const [, pattern] of rules) for (const word of pattern.split('|')) {
    const expected = rules.find(([, rule]) => new RegExp(rule, 'i').test(word))[0];
    f.sql.prepare("UPDATE card_contacts SET company_name='',title='',services=? WHERE row_id='card-b'").run(word);
    const result = f.sql.prepare(`SELECT row_id FROM card_contacts c WHERE c.row_id=?1 AND ?2='' AND ?3='' AND ${CHAT_INDUSTRY_FILTER}`).all('card-b', '', '', expected);
    assert.equal(result.length, 1, word + ' => ' + expected);
  }
});

test('industry AND text filter precedes pagination and preserves latest own-card/contact boundaries', async t => {
  const f = fixture(t);
  for (let i = 0; i < 66; i++) {
    const id = 'sample-' + String(i).padStart(2, '0'), uid = 'U' + i.toString(16).padStart(32, '0');
    f.sql.prepare('INSERT INTO users(row_id,line_id,name) VALUES(?,?,?)').run(id, uid, '測試會員');
    f.sql.prepare("INSERT INTO card_contacts(row_id,line_id,source_type,name,tags,updated_at) VALUES(?,?,'self_profile','篩選會員',?,'2026-09-24')").run(id, uid, i % 2 ? '餐飲食品' : '科技資訊');
  }
  const query = new URLSearchParams({ industry: '科技資訊', q: '篩選會員' });
  const first = await f.api('/members?' + query); query.set('after', first.next);
  const second = await f.api('/members?' + query);
  assert.equal(first.items.length, 30); assert.equal(second.items.length, 3); assert.equal(second.next, '');
  assert.equal(new Set([...first.items, ...second.items].map(row => row.handle)).size, 33);
  f.sql.exec("UPDATE card_contacts SET tags='科技資訊' WHERE row_id IN ('card-a','card-b')");
  f.sql.prepare("INSERT INTO card_contacts(row_id,line_id,source_type,name,tags,updated_at) VALUES('card-b-new',?,'self_profile','新名片','金融保險','2026-09-25')").run(B);
  const tech = await f.api('/members?industry=科技資訊');
  assert.ok(!tech.items.some(row => ['card-a', 'card-b'].includes(row.handle)), 'no self or older classified card');
  assert.deepEqual((await f.api('/members?industry=金融保險')).items.map(row => row.handle), ['card-b-new']);
  await f.api('/preferences', { token: 'b', data: { accepting: false } });
  assert.equal((await f.api('/members?industry=金融保險')).items.length, 0);
  await f.api('/preferences', { token: 'b', data: { accepting: true } });
  const room = await f.room(); await f.api(`/threads/${room}/block`, { token: 'b', data: { blocked: true } });
  assert.equal((await f.api('/members?industry=金融保險')).items.length, 0);
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
test('persisted old and new member rows use the confirmed new account without rewriting member data', async t => {
  const f = fixture(t);
  f.sql.prepare('INSERT INTO users(row_id,line_id,name,phone) VALUES(?,?,?,?)').run('old-row', OLD, '歷史會員', '');
  f.sql.prepare("UPDATE card_contacts SET line_id=?,profile_user_id=?,owner_user_id=? WHERE row_id='card-a'").run(OLD, OLD, OLD);
  const snapshot = () => JSON.stringify(['users', 'user_identity_links', 'card_contacts'].map(table => f.sql.prepare(`SELECT * FROM ${table}`).all()));
  const before = snapshot();
  for (const token of ['a', 'old']) {
    assert.equal((await f.api('/me', { token })).success, true);
    const list = await f.api('/members', { token });
    assert.equal(list.success, true); assert.ok(!list.items.some(row => row.handle === 'card-a'));
  }
  const found = await f.api('/members?q=' + encodeURIComponent('會員a'), { token: 'b' });
  assert.deepEqual(found.items.map(row => row.handle), ['card-a']);
  const opened = await f.api('/threads', { token: 'b', data: { cardHandle: 'card-a' } });
  assert.equal(opened.success, true, JSON.stringify(opened));
  const id = opened.id;
  assert.equal(await f.room(), id);
  assert.equal((await f.api('/threads', { token: 'old', data: { cardHandle: 'card-b' } })).id, id);
  const key = crypto.randomUUID(), sent = await f.send(id, '新舊登入同一對話', 'old', key);
  assert.equal(sent.success, true);
  assert.equal((await f.send(id, '新舊登入同一對話', 'a', key)).item.seq, sent.item.seq);
  assert.equal(f.sql.prepare('SELECT sender_id FROM member_chat_messages').get().sender_id, 'a');
  assert.equal((await f.api(`/threads/${id}/messages`, { token: 'c' })).status, 404);
  await f.api('/preferences', { token: 'old', data: { accepting: false } });
  assert.equal((await f.api('/me')).accepting, false);
  assert.equal((await f.api('/members?q=' + encodeURIComponent('會員a'), { token: 'b' })).items.length, 0);
  await f.api('/preferences', { data: { accepting: true } });
  await f.api(`/threads/${id}/block`, { token: 'old', data: { blocked: true } });
  assert.equal((await f.send(id, '不可傳送', 'b')).success, false);
  assert.equal((await f.api('/members?q=' + encodeURIComponent('會員a'), { token: 'b' })).items.length, 0);
  assert.equal(snapshot(), before);
});

test('unconfirmed aliases are ignored; inactive and ambiguous LINE links grant no access', async t => {
  const f = fixture(t);
  f.sql.prepare('INSERT INTO users(row_id,line_id,name,phone) VALUES(?,?,?,?)').run('old-row', OLD, '歷史會員', '');
  const id = await f.room();
  f.sql.exec("UPDATE user_identity_links SET status='replaced'");
  assert.equal((await f.api('/me')).success, true);
  assert.equal((await f.api('/me', { token: 'old' })).code, 'OWN_CARD_REQUIRED');
  f.sql.prepare("INSERT INTO card_contacts(row_id,line_id,source_type,name,updated_at) VALUES('own-old',?,'self_profile','歷史本人','2026-09-24')").run(OLD);
  assert.equal((await f.api(`/threads/${id}/messages`, { token: 'old' })).status, 404);
  f.sql.exec("UPDATE user_identity_links SET status='active'");
  f.sql.prepare("UPDATE users SET point_line_id=? WHERE row_id='c'").run(OLD);
  assert.equal((await f.api('/me')).success, true);
  assert.equal((await f.api(`/threads/${id}/messages`, { token: 'c' })).status, 404);
  f.sql.exec("UPDATE users SET point_line_id='' WHERE row_id='c'");
  f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(C, A);
  assert.equal((await f.api('/me')).code, 'IDENTITY_CONFLICT');
});

test('separate LINE logins sharing a points UID stay searchable and cannot access each others chats', async t => {
  const f = fixture(t), otherOld = 'U' + 'e'.repeat(32);
  f.sql.prepare("UPDATE users SET point_line_id=? WHERE row_id IN('a','c')").run(A);
  f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(otherOld, C);
  const snapshot = () => JSON.stringify(['users', 'user_identity_links', 'card_contacts'].map(table => f.sql.prepare(`SELECT * FROM ${table}`).all()));
  const before = snapshot();
  for (const token of ['a', 'old', 'b', 'c']) assert.equal((await f.api('/me', { token })).success, true, token);
  await f.api('/preferences', { token: 'c', data: { accepting: false } });
  assert.equal((await f.api('/me')).accepting, true);
  const list = await f.api('/members?q=' + encodeURIComponent('會員a'), { token: 'b' });
  assert.deepEqual(list.items.map(item => item.handle), ['card-a']);
  assert.ok(!(await f.api('/members')).items.some(item => item.handle === 'card-a'));
  const opened = await f.api('/threads', { token: 'b', data: { cardHandle: 'card-a' } });
  assert.equal(opened.success, true, JSON.stringify(opened));
  const sent = await f.send(opened.id, '只給本人', 'b'); assert.equal(sent.success, true);
  assert.equal((await f.api(`/threads/${opened.id}/messages`, { token: 'a' })).items.length, 1);
  for (const [suffix, data] of [['messages', undefined], ['messages', { body: '冒用', clientId: crypto.randomUUID() }], ['read', { through: sent.item.seq }], ['block', { blocked: true }], ['report', { seq: sent.item.seq, reason: 'x' }]]) {
    assert.equal((await f.api(`/threads/${opened.id}/${suffix}`, { token: 'c', data })).status, 404);
  }
  await f.api(`/threads/${opened.id}/block`, { token: 'old', data: { blocked: true } });
  assert.equal((await f.send(opened.id, '封鎖不能繞過', 'b')).success, false);
  assert.equal((await f.api('/members?q=' + encodeURIComponent('會員a'), { token: 'b' })).items.length, 0);
  assert.equal(snapshot(), before);
});

test('points and bare legacy aliases never grant registration or ownership of someone elses card', async t => {
  const f = fixture(t);
  f.sql.exec('DELETE FROM user_identity_links');
  for (const column of ['point_line_id', 'legacy_line_id']) {
    f.sql.prepare(`UPDATE users SET ${column}=? WHERE row_id='a'`).run(OLD);
    assert.equal((await f.api('/me', { token: 'old' })).code, 'MEMBER_REQUIRED');
    f.sql.exec(`UPDATE users SET ${column}='' WHERE row_id='a'`);
  }
  f.sql.prepare("UPDATE users SET point_line_id=?,legacy_line_id=? WHERE row_id='c'").run(A, A);
  f.sql.exec("DELETE FROM card_contacts WHERE row_id='card-c'");
  assert.equal((await f.api('/me', { token: 'c' })).code, 'OWN_CARD_REQUIRED');
  assert.deepEqual((await f.api('/members?q=' + encodeURIComponent('會員a'), { token: 'b' })).items.map(item => item.handle), ['card-a']);
  assert.equal(f.writes.length, 0);
});

test('confirmed LINE links support old row card ownership with or without the new member row', async t => {
  const f = fixture(t);
  f.sql.prepare('INSERT INTO users(row_id,line_id,name,phone) VALUES(?,?,?,?)').run('old-row', OLD, '歷史會員', '');
  f.sql.exec("UPDATE users SET legacy_line_id='',point_line_id=''; UPDATE card_contacts SET profile_user_id='old-row',line_id='',owner_user_id='' WHERE row_id='card-a'");
  const check = async () => {
    assert.equal((await f.api('/me')).success, true);
    assert.equal((await f.api('/me', { token: 'old' })).success, true);
    assert.deepEqual((await f.api('/members?q=' + encodeURIComponent('會員a'), { token: 'b' })).items.map(item => item.handle), ['card-a']);
    assert.equal((await f.api('/threads', { token: 'b', data: { cardHandle: 'card-a' } })).success, true);
    assert.ok(!(await f.api('/members')).items.some(item => item.handle === 'card-a'));
  };
  await check();
  f.sql.exec("DELETE FROM users WHERE row_id='a'");
  f.sql.prepare("UPDATE card_contacts SET profile_user_id=? WHERE row_id='card-a'").run(A);
  await check();
});

test('a genuinely missing member remains denied without inventing registration', async t => {
  const f = fixture(t); f.sql.exec("DELETE FROM users WHERE row_id='b'");
  const result = await f.api('/me', { token: 'b' });
  assert.equal(result.status, 403); assert.equal(result.code, 'MEMBER_REQUIRED');
  assert.equal(f.writes.length, 0);
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
  assert.equal((await f.api('/me')).success, true); // An unrelated legacy field is not login authority.
  f.sql.exec("UPDATE users SET legacy_line_id='' WHERE row_id='c'; DROP TABLE member_chat_preferences");
  assert.equal((await f.api('/me')).status, 503);
});

test('notifications require explicit opt-in and an OA-verified current login, never a points alias', async t => {
  const f = fixture(t), id = await f.room();
  assert.equal((await f.api('/me')).notifications, false);
  await f.send(id); assert.equal(f.sql.prepare('SELECT count(*) n FROM member_chat_notification_jobs').get().n, 0);
  assert.equal((await f.api('/notifications', { token: '', data: { enabled: true } })).status, 401);
  assert.equal((await f.api('/notifications', { data: { enabled: true, line_id: B } })).status, 400);
  assert.equal((await f.api('/notifications', { data: { enabled: true } })).status, 503);
  f.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-bot-token'; f.setBot(404);
  assert.equal((await f.enable()).code, 'FOLLOW_REQUIRED');
  f.setBot(503); assert.equal((await f.enable()).status, 503); f.setBot(200);
  f.sql.exec(`UPDATE users SET point_line_id='${C}',legacy_line_id='${C}' WHERE row_id='b'`);
  assert.equal((await f.enable()).notifications, true);
  assert.equal(f.botLookups.at(-1), B);
  assert.equal(f.sql.prepare('SELECT line_id FROM member_chat_notifications WHERE member_id=?').get('b').line_id, B);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM member_chat_notification_jobs').get().n, 0, 'no historical backlog');
  const first = await f.send(id, 'new message'); assert.equal(first.success, true);
  const key = crypto.randomUUID(); await f.send(id, 'retry', 'a', key); await f.send(id, 'retry', 'a', key);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM member_chat_notification_jobs').get().n, 1);
  delete f.env.LINE_CHANNEL_ACCESS_TOKEN;
  assert.equal((await f.api('/notifications', { token: 'b', data: { enabled: false } })).notifications, false);
  assert.equal(f.sql.prepare('SELECT status FROM member_chat_notification_jobs').get().status, 'cancelled');
});

test('durable outbox survives closed pages, coalesces and pushes only a generic LINE reminder', async t => {
  const f = fixture(t), id = await f.room(); await f.enable();
  await f.send(id, 'private telephone 0912345678'); await f.send(id, 'private second body');
  await f.drain(); assert.equal(f.pushes.length, 0, 'buffer period');
  f.due(); await Promise.all([f.drain(), f.drain()]);
  assert.equal(f.pushes.length, 1); const push = f.pushes[0];
  assert.equal(push.body.to, B); assert.equal(push.body.notificationDisabled, false);
  assert.match(push.key, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.doesNotMatch(JSON.stringify(push.body.messages), /private|091234|甲|乙|line_id/);
  assert.equal(push.body.messages[0].template.actions[0].uri, `https://liff.line.me/1660923784-vViMTZ1y?memberChat=${id}`);
  await f.send(id, 'third within same window'); f.due(); await f.drain(); assert.equal(f.pushes.length, 1);
  assert.equal((await f.api(`/threads/${id}/messages`, { token: 'c' })).status, 404, 'URL does not grant access');
});

test('read, disabled notification, bilateral blocks, removed card and identity conflict suppress pending push', async t => {
  for (const mode of ['read', 'off', 'block-a', 'block-b', 'card', 'identity', 'access']) {
    const f = fixture(t), id = await f.room(); await f.enable(); const sent = await f.send(id);
    if (mode === 'read') await f.api(`/threads/${id}/read`, { token: 'b', data: { through: sent.item.seq } });
    if (mode === 'off') await f.api('/notifications', { token: 'b', data: { enabled: false } });
    if (mode.startsWith('block')) await f.api(`/threads/${id}/block`, { token: mode.at(-1), data: { blocked: true } });
    if (mode === 'card') f.sql.exec("UPDATE card_contacts SET archived_at='archived' WHERE row_id='card-b'");
    if (mode === 'identity') f.sql.exec(`INSERT INTO user_identity_links VALUES('${B}','${A}','active')`);
    if (mode === 'access') f.env.EXCHANGE_ZONE_ACCESS_MODE = 'private';
    f.due(); await f.drain(); assert.equal(f.pushes.length, 0, mode);
    assert.equal(f.sql.prepare('SELECT status FROM member_chat_notification_jobs').get().status, 'cancelled', mode);
  }
});

test('an already-read cancelled reminder can be rearmed by a later unread message after leaving', async t => {
  const f = fixture(t), id = await f.room(); await f.enable(); const sent = await f.send(id);
  await f.api(`/threads/${id}/read`, { token: 'b', data: { through: sent.item.seq } });
  f.due(); await f.drain(); const old = f.sql.prepare('SELECT id FROM member_chat_notification_jobs').get().id;
  await f.send(id, '離開頁面後的新訊息'); f.due(); await f.drain();
  assert.equal(f.pushes.length, 1); assert.notEqual(f.sql.prepare('SELECT id FROM member_chat_notification_jobs').get().id, old);
});

test('network timeout and lost completion retry with identical LINE key, destination and payload', async t => {
  for (const mode of ['timeout', 'finalize', 'server']) {
    const f = fixture(t), id = await f.room(); await f.enable(); await f.send(id);
    if (mode === 'finalize') f.failFinalize(); else f.setPush(mode === 'timeout' ? 'timeout' : 500);
    f.due(); await f.drain(); assert.equal(f.sql.prepare('SELECT status FROM member_chat_notification_jobs').get().status, 'pending');
    f.env.LIFF_ID = '12345-different'; // Persisted payload must survive deployment/config changes.
    f.setPush(409); f.due(); await f.drain();
    assert.equal(f.pushes.length, 2); assert.deepEqual(f.pushes[0], f.pushes[1]);
    assert.equal(f.sql.prepare('SELECT status FROM member_chat_notification_jobs').get().status, 'sent');
    await f.drain(); assert.equal(f.pushes.length, 2);
  }
});

test('permanent LINE failure and bounded retries do not affect saved chat or loop forever', async t => {
  for (const status of [400, 401, 429, 503]) {
    const f = fixture(t), id = await f.room(); await f.enable(); const saved = await f.send(id);
    f.setPush(status);
    for (let i=0;i<7;i++) { f.due(); await f.drain(); }
    assert.equal(f.pushes.length, status === 503 ? 5 : 1);
    assert.equal(f.sql.prepare('SELECT status FROM member_chat_notification_jobs').get().status, 'failed');
    assert.equal((await f.api(`/threads/${id}/messages`, { token: 'b' })).items[0].seq, saved.item.seq);
  }
});

test('notification enqueue is atomic with message persistence and migration is repeatable', async t => {
  const f = fixture(t), id = await f.room(); await f.enable();
  const before = JSON.stringify(f.sql.prepare('SELECT * FROM users').all());
  f.sql.exec(readFileSync(new URL('../migrations/0047_member_chat_notifications.sql', import.meta.url), 'utf8'));
  f.sql.exec("CREATE TRIGGER test_enqueue_failure BEFORE INSERT ON member_chat_notification_jobs BEGIN SELECT RAISE(ABORT,'test'); END");
  assert.equal((await f.send(id)).status, 503);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM member_chat_messages').get().n, 0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM member_chat_notification_jobs').get().n, 0);
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM users').all()), before);
});

test('notification leases recover, old jobs expire, and bounded cleanup preserves chat records', async t => {
  const f = fixture(t), id = await f.room(); await f.enable(); await f.send(id);
  f.sql.exec("UPDATE member_chat_notification_jobs SET due_at=0,lease_until=unixepoch()+120");
  await f.drain(); assert.equal(f.pushes.length, 0);
  f.sql.exec("UPDATE member_chat_notification_jobs SET lease_until=0,created_at=unixepoch()-86400");
  await f.drain(); assert.equal(f.pushes.length, 0); assert.equal(f.sql.prepare('SELECT status FROM member_chat_notification_jobs').get().status, 'failed');
  f.sql.exec("UPDATE member_chat_notification_jobs SET created_at=unixepoch()-8*86400");
  await f.drain(); assert.equal(f.sql.prepare('SELECT count(*) n FROM member_chat_notification_jobs').get().n, 0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM member_chat_messages').get().n, 1);
});
