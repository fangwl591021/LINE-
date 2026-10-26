import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleIslandEntry } from '../worker/island-entry.mjs';
import { handleMemberChat } from '../worker/member-chat.mjs';
import { ExchangeZoneModule } from '../worker/exchange-zone.mjs';
import { chatExtraSchema } from './member-chat-extra-fixture.mjs';
const uid = n => 'U' + n.toString(16).padStart(32, '0');
const A = uid(100), B = uid(101), OLD = uid(99), NEW = uid(98), GUEST = uid(97);
function fixture(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,name TEXT,role TEXT,phone TEXT,member_number TEXT DEFAULT '',network_id TEXT DEFAULT '',referrer_id TEXT DEFAULT '');
    CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
    CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,line_id TEXT DEFAULT '',profile_user_id TEXT DEFAULT '',owner_user_id TEXT DEFAULT '',source_type TEXT,visibility TEXT,pool_eligible INTEGER DEFAULT 0,ai_review_status TEXT,name TEXT,company_name TEXT,title TEXT,updated_at TEXT,english_name TEXT DEFAULT '',archived_at TEXT DEFAULT '',merged_into_row_id TEXT DEFAULT '',custom_config TEXT DEFAULT '{}',tags TEXT DEFAULT '',services TEXT DEFAULT '');`);
  for (const file of ['0046_member_private_chat.sql','0047_member_chat_notifications.sql']) sql.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  chatExtraSchema(sql);
  sql.exec(readFileSync(new URL('../migrations/0076_island_video_card_copies.sql',import.meta.url),'utf8'));
  const reads = [], writes = [], requests = [];
  let beforeWrite = null, joined = true, profileStatus = 200, friendshipStatus = 200, friendshipValue;
  function prepare(query, args = []) {
    return {
      bind(...values) { return prepare(query, values); },
      async first() { reads.push(query); return sql.prepare(query).get(...args) || null; },
      async all() { reads.push(query); return { success: true, results: sql.prepare(query).all(...args) }; },
      async run() { beforeWrite?.(query); writes.push(query); const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes) } }; }
    };
  }
  const db = { prepare, withSession() { return this; } }, env = { ACTMASTER_DB: db, EXCHANGE_ZONE_ACCESS_MODE: 'open' };
  const tokens = { a: A, b: B, old: OLD, new: NEW, guest: GUEST };
  const fetcher = async (url, options) => {
    requests.push({ url, method: options?.method || 'GET' });
    assert.equal(options.redirect, 'manual'); assert.ok(options.signal instanceof AbortSignal);
    const userId = tokens[options.headers.Authorization.slice(7)];
    if (url === 'https://api.line.me/v2/profile') return Response.json({ userId, displayName: 'private-login-name' }, { status: userId ? profileStatus : 401 });
    assert.equal(url, 'https://api.line.me/friendship/v1/status');
    return Response.json(friendshipValue ?? { friendFlag: joined }, { status: friendshipStatus });
  };
  function add(n, { lineId = uid(n), rowId = 'member-' + n, status = 'passed', visibility = 'public', source = 'self_profile', updated = '2026-10-01', owner = lineId } = {}) {
    sql.prepare('INSERT OR IGNORE INTO users(row_id,line_id,name,role,phone) VALUES(?,?,?,?,?)').run(rowId, lineId, '會員' + n, 'user', '0900000099');
    sql.prepare('INSERT INTO card_contacts(row_id,line_id,profile_user_id,owner_user_id,source_type,visibility,ai_review_status,name,company_name,title,updated_at,custom_config,services,email,mobile,website,address) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      'card-' + n, lineId, owner, owner, source, visibility, status, '公開會員' + n, '公開公司', '顧問', updated,
      JSON.stringify({ privateSecret: 'private-configuration', industryClassification: { primary: '科技資訊' } }), '公開服務', 'private@example.test', '0900000098', 'https://private.test', 'private-address');
    return { lineId, rowId, handle: 'card-' + n };
  }
  add(100, { lineId: A, rowId: 'a' }); add(101, { lineId: B, rowId: 'b' });
  async function entry(path, { token = 'a', method = 'GET', data } = {}) {
    const res = await handleIslandEntry(new Request('https://island.test/v1/island-entry' + path, { method, headers: token ? { Authorization: 'Bearer ' + token } : {}, body: data ? JSON.stringify(data) : undefined }), env, fetcher);
    return { status: res.status, ...await res.json() };
  }
  async function chat(path, { token = 'a', data } = {}) {
    const res = await handleMemberChat(new Request('https://island.test/v1/member-chat' + path, { method: data ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token }, body: data ? JSON.stringify(data) : undefined }), env, fetcher);
    return { status: res.status, ...await res.json() };
  }
  const snapshot = () => JSON.stringify(['users','user_identity_links','card_contacts','member_chat_threads','member_chat_messages'].map(table => sql.prepare('SELECT * FROM ' + table).all()));
  return { sql, env, entry, chat, add, reads, writes, requests, snapshot,
    setJoined(value) { joined = value; }, setProfileStatus(value) { profileStatus = value; }, setFriendshipStatus(value) { friendshipStatus = value; }, setFriendshipValue(value) { friendshipValue = value; }, beforeWrite(value) { beforeWrite = value; } };
}

test('fresh LINE identity and friendship determine join/register/card/review/ready without writes', async t => {
  const f = fixture(t), before = f.snapshot();
  assert.deepEqual(await f.entry('/status'), { status: 200, success: true, stage: 'ready', canVisit: true, canInteract: true, reviewStatus: 'passed' });
  f.setJoined(false);
  assert.equal((await f.entry('/status')).stage, 'join');
  assert.equal((await f.entry('/members')).code, 'FOLLOW_REQUIRED');
  f.setJoined(true);
  assert.equal((await f.entry('/status', { token: 'guest' })).stage, 'register');
  f.sql.exec("UPDATE card_contacts SET source_type='video_profile' WHERE row_id='card-100'");
  assert.equal((await f.entry('/status')).stage, 'card');
  for (const value of ['', null, 'pending', 'failed', 'PASSED', ' passed ']) {
    f.sql.prepare("UPDATE card_contacts SET source_type='self_profile',ai_review_status=? WHERE row_id='card-100'").run(value);
    const result = await f.entry('/status'); assert.equal(result.stage, 'review'); assert.equal(result.canVisit, true); assert.equal(result.canInteract, false);
    assert.equal(result.reviewStatus, value === 'failed' ? 'failed' : 'pending');
  }
  f.sql.exec("UPDATE card_contacts SET ai_review_status='passed' WHERE row_id='card-100'");
  assert.equal(f.snapshot(), before); assert.equal(f.writes.length, 0);
  assert.ok(f.requests.every(request => request.method === 'GET'));
});

test('visitor roster is a safe public projection and accepts joined users without registration/card', async t => {
  const f = fixture(t), before = f.snapshot();
  const result = await f.entry('/members', { token: 'guest' });
  assert.equal(result.status, 200); assert.equal(result.items.length, 2);
  assert.deepEqual(Object.keys(result.items[0]).sort(), ['avatarUrl','company','handle','industry','name','title']);
  assert.doesNotMatch(JSON.stringify(result), /private-|09000000|line_id|row_id|userId|ai_review_status|custom_config|email|website|mobile|address|sender|online/);
  assert.equal(JSON.stringify(result).includes(A), false);
  assert.equal(f.snapshot(), before); assert.equal(f.writes.length, 0);
});

test('public roster preserves blocks, opt-out, canonical members and private-version exclusion', async t => {
  const f = fixture(t);
  f.add(102, { status: 'pending' });
  f.add(103, { visibility: 'private' });
  f.sql.exec("INSERT INTO member_chat_preferences(member_id,accepting) VALUES('member-102',0)");
  f.sql.exec("INSERT INTO member_chat_blocks(member_id,blocked_id) VALUES('b','a')");
  assert.deepEqual((await f.entry('/members')).items, []);
  const guest = await f.entry('/members', { token: 'guest' });
  assert.deepEqual(guest.items.map(row => row.handle).sort(), ['card-100','card-101']);
  f.sql.exec(`INSERT INTO users(row_id,line_id,name,role) VALUES('old-row','${OLD}','舊名稱','user'); INSERT INTO user_identity_links VALUES('${OLD}','${A}','active')`);
  assert.deepEqual((await f.entry('/members', { token: 'old' })).items, []);
  assert.equal((await f.entry('/status', { token: 'old' })).stage, 'ready');
  assert.equal(f.writes.length, 0);
});

test('roster pagination spans fifty members, rejects malformed/foreign cursor and never widens selectors', async t => {
  const f = fixture(t);
  for (let i = 0; i < 50; i++) f.add(i + 200);
  const first = await f.entry('/members', { token: 'guest' }), second = await f.entry('/members?after=' + encodeURIComponent(first.next), { token: 'guest' });
  assert.equal(first.items.length, 30); assert.equal(second.items.length, 22); assert.equal(second.next, '');
  assert.equal(new Set([...first.items, ...second.items].map(row => row.handle)).size, 52);
  for (const path of ['/status?point_friend=1','/members?userId=' + B,'/members?after=x','/members?after=&after=']) assert.equal((await f.entry(path)).status, 400);
  const foreign = 'island-v1:' + btoa(encodeURIComponent(JSON.stringify([1,'private-card'])));
  assert.equal((await f.entry('/members?after=' + encodeURIComponent(foreign))).code, 'INVALID_CURSOR');
  assert.equal(f.writes.length, 0);
});

test('authentication errors, friendship outages, malformed flags and identity conflicts never grant access', async t => {
  const f = fixture(t);
  for (const token of ['', 'forged']) assert.equal((await f.entry('/status', { token })).status, 401);
  f.setProfileStatus(503); assert.equal((await f.entry('/status')).status, 503); f.setProfileStatus(200);
  f.setFriendshipStatus(503); assert.equal((await f.entry('/members')).status, 503); f.setFriendshipStatus(200);
  f.setFriendshipValue({ friendFlag: 'true' }); assert.equal((await f.entry('/status')).status, 503); f.setFriendshipValue(undefined);
  f.sql.exec(`INSERT INTO user_identity_links VALUES('${OLD}','${A}','active'),('${OLD}','${B}','active')`);
  assert.equal((await f.entry('/status', { token: 'old' })).code, 'IDENTITY_CONFLICT');
  assert.equal(f.writes.length, 0);
  assert.equal((await f.entry('/status', { method: 'POST', data: { canInteract: true, aiReviewStatus: 'passed' } })).status, 405);
});

test('latest valid own card governs qualification; aliases work and scanned/video/archived ownership cannot substitute', async t => {
  const f = fixture(t);
  f.sql.exec(`INSERT INTO user_identity_links VALUES('${OLD}','${A}','active')`);
  assert.equal((await f.entry('/status', { token: 'old' })).stage, 'ready');
  f.add(102, { lineId: A, rowId: 'a', status: 'pending', updated: '2099-01-01' });
  assert.equal((await f.entry('/status')).stage, 'review', 'newer unapproved data cannot borrow an older approval');
  for (const field of ["source_type='private_import'", "source_type='video_profile'", "archived_at='2026-10-26'", "merged_into_row_id='elsewhere'"]) {
    f.sql.exec("UPDATE card_contacts SET source_type='self_profile',archived_at='',merged_into_row_id='' WHERE row_id='card-102'");
    f.sql.exec('UPDATE card_contacts SET ' + field + " WHERE row_id='card-102'");
    assert.equal((await f.entry('/status')).stage, 'ready', 'inactive/unrelated versions do not replace latest active own profile');
  }
  f.sql.exec("DELETE FROM card_contacts WHERE row_id='card-100'; UPDATE card_contacts SET source_type='private_import' WHERE row_id='card-102'");
  assert.equal((await f.entry('/status')).stage, 'card');
});

test('direct thread/message writes require approval while reads remain and revocation races cannot insert', async t => {
  const f = fixture(t);
  const opened = await f.chat('/threads', { data: { cardHandle: 'card-101' } }); assert.equal(opened.success, true);
  const id = opened.id;
  const send = () => f.chat(`/threads/${id}/messages`, { data: { body: '合成訊息', clientId: crypto.randomUUID() } });
  for (const status of ['', 'pending', 'failed']) {
    f.sql.prepare("UPDATE card_contacts SET ai_review_status=? WHERE row_id='card-100'").run(status);
    const before = f.writes.length;
    assert.equal((await f.chat('/threads', { data: { cardHandle: 'card-101' } })).code, 'REVIEW_REQUIRED');
    assert.equal((await send()).code, 'REVIEW_REQUIRED');
    assert.equal((await f.chat('/presence', { data: {} })).code, 'REVIEW_REQUIRED');
    assert.equal((await f.chat(`/threads/${id}/messages`)).success, true);
    assert.equal(f.writes.length, before);
  }
  f.sql.exec("UPDATE card_contacts SET ai_review_status='passed' WHERE row_id='card-100'");
  f.beforeWrite(query => { if (query.includes('INSERT INTO member_chat_messages')) f.sql.exec("UPDATE card_contacts SET ai_review_status='pending' WHERE row_id='card-100'"); });
  assert.equal((await send()).success, false);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM member_chat_messages').get().n, 0);
  f.beforeWrite(null);
});

test('unreviewed social publish/edit/like is blocked before side effects but owner archive remains available', async t => {
  const f = fixture(t), actor = { userId: A, role: 'user' };
  f.sql.prepare("INSERT INTO exchange_zone_posts(post_handle,author_user_id,title,body,status) VALUES('post',?,'合成標題','合成測試內容，不涉及正式資料','published')").run(A);
  f.sql.exec("UPDATE card_contacts SET ai_review_status='pending' WHERE row_id='card-100'");
  const before = f.writes.length, points = { balance() { throw Error('must not read balance'); }, adjust() { throw Error('must not adjust points'); } };
  const posted = await ExchangeZoneModule.publish({ title: '合成標題', body: '合成內容，符合原本最少字數', contactTags: [], idempotencyKey: 'synthetic-island-publication-1' }, f.env, actor, points);
  assert.equal(posted.code, 'REVIEW_REQUIRED');
  assert.equal((await ExchangeZoneModule.update({ postHandle: 'post', title: '合成修改', body: '合成內容，符合原本最少字數' }, f.env, actor)).code, 'REVIEW_REQUIRED');
  assert.equal((await ExchangeZoneModule.update({ postHandle: 'post', toggleLike: true, archivePost: 'true' }, f.env, actor)).code, 'REVIEW_REQUIRED');
  assert.equal(f.writes.length, before);
  const archived = await ExchangeZoneModule.update({ postHandle: 'post', toggleLike: true, archivePost: true }, f.env, actor);
  assert.equal(archived.archived, true);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM exchange_zone_post_likes').get().n, 0);
  assert.ok(f.writes.at(-1).includes("SET status = 'archived'"));
});

test('personal share link always uses the verified current sharer instead of an incoming ref or net', async t => {
  const f = fixture(t), before = f.snapshot();
  for (const query of ['ref=' + A, 'net=incoming-a', 'userId=' + A, 'ref=' + A + '&net=incoming-a', 'ref=&ref=']) {
    assert.equal((await f.entry('/share-link?' + query, { token: 'b' })).code, 'INVALID_QUERY');
  }
  const result = await f.entry('/share-link', { token: 'b' });
  assert.equal(result.status, 200); assert.deepEqual(Object.keys(result).sort(), ['card','entryUrl','status','success']);
  assert.deepEqual(Object.keys(result.card).sort(),['desc','revision','title']);assert.equal(result.card.revision,0);
  const url = new URL(result.entryUrl);
  assert.equal(url.origin, 'https://liff.line.me'); assert.equal(url.pathname, '/1660923784-vViMTZ1y');
  assert.deepEqual([...url.searchParams], [['peopleIslandCard', '1'], ['ref', B], ['net', 'admin']]);
  assert.equal(result.entryUrl.includes(A), false);
  assert.equal(f.snapshot(), before); assert.equal(f.writes.length, 0);
  assert.deepEqual(f.requests.map(request => request.url), ['https://api.line.me/v2/profile']);
});

test('personal share canonical aliases and own stored scope follow admin/store/tenant/member rules', async t => {
  const f = fixture(t);
  f.sql.exec(`INSERT INTO user_identity_links VALUES('${OLD}','${A}','active')`);
  for (const [role, network, referrer, expected] of [
    ['user', 'own-network', 'old-referrer', 'own-network'], ['user', '', 'own-referrer', 'own-referrer'], ['user', '', '', 'admin'],
    ['admin', 'other-network', 'old-referrer', 'admin'], ['store', 'other-network', 'old-referrer', A], ['tenant', 'other-network', 'old-referrer', A]
  ]) {
    f.sql.prepare("UPDATE users SET role=?,network_id=?,referrer_id=? WHERE row_id='a'").run(role, network, referrer);
    const result = await f.entry('/share-link', { token: 'old' }), url = new URL(result.entryUrl);
    assert.equal(url.searchParams.get('ref'), A); assert.equal(url.searchParams.get('net'), expected);
    assert.equal(result.entryUrl.includes(OLD), false);
  }
  f.sql.prepare('INSERT INTO users(row_id,line_id,name,role,network_id) VALUES(?,?,?,?,?)').run('old-row', OLD, '舊會員', 'store', 'old-network');
  f.sql.exec("UPDATE users SET role='user',network_id='canonical-network' WHERE row_id='a'");
  const migrated = new URL((await f.entry('/share-link', { token: 'old' })).entryUrl);
  assert.equal(migrated.searchParams.get('ref'), A); assert.equal(migrated.searchParams.get('net'), 'canonical-network');
  assert.equal(f.writes.length, 0);
});

test('verified unregistered or non-friend sharers can share without acquiring viewing or interaction authority', async t => {
  const f = fixture(t), before = f.snapshot();
  f.setJoined(false); f.setFriendshipStatus(503);
  const guest = await f.entry('/share-link', { token: 'guest' }), user = await f.entry('/share-link');
  assert.equal(guest.status, 200); assert.equal(new URL(guest.entryUrl).searchParams.get('ref'), GUEST); assert.equal(new URL(guest.entryUrl).searchParams.get('net'), 'admin');
  assert.equal(user.status, 200); assert.equal(new URL(user.entryUrl).searchParams.get('ref'), A);
  assert.ok(f.requests.every(request => request.url === 'https://api.line.me/v2/profile'));
  f.setFriendshipStatus(200);
  assert.equal((await f.entry('/status')).stage, 'join'); assert.equal((await f.entry('/members')).code, 'FOLLOW_REQUIRED');
  assert.equal(f.snapshot(), before); assert.equal(f.writes.length, 0);
});

test('personal share rejects invalid identity, method, query, ambiguous aliases and auth outages without writes', async t => {
  const f = fixture(t);
  for (const token of ['', 'forged']) assert.equal((await f.entry('/share-link', { token })).status, 401);
  for (const method of ['POST','PUT','DELETE']) assert.equal((await f.entry('/share-link', { method, data: { ref: B, net: B } })).status, 405);
  for (const query of ['after=x', 'point_friend=1', 'x=1']) assert.equal((await f.entry('/share-link?' + query)).status, 400);
  f.setProfileStatus(503); assert.equal((await f.entry('/share-link')).status, 503); f.setProfileStatus(200);
  f.sql.exec(`INSERT INTO user_identity_links VALUES('${OLD}','${A}','active'),('${OLD}','${B}','active')`);
  assert.equal((await f.entry('/share-link', { token: 'old' })).code, 'IDENTITY_CONFLICT');
  assert.equal(f.writes.length, 0);
});
