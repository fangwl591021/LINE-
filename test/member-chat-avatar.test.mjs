import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { hydrateMemberAvatars, lineAvatarUrl } from '../worker/member-chat-avatar.mjs';

const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), C = 'U' + 'c'.repeat(32);
const PREFIX = 'MEMBER_CHAT_LINE_AVATAR_', NOW = 1800000000000;
const image = label => 'https://profile.line-scdn.net/' + label;
const actor = pictureUrl => ({ user: { line_id: A }, pictureUrl });
const page = (...ids) => ids.map(avatar_line_id => ({ avatar_line_id }));
function cache() {
  const values = new Map(), reads = [], writes = [];
  return { values, reads, writes,
    seed(uid, pictureUrl, updatedAt = NOW) { values.set(PREFIX + uid, { pictureUrl, updatedAt }); },
    async get(key, type) { assert.equal(type, 'json'); reads.push(key); return values.get(key) || null; },
    async put(key, value, options) { writes.push({ key, value: JSON.parse(value), options }); values.set(key, JSON.parse(value)); }
  };
}
function database(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  sql.exec('CREATE TABLE line_oa_threads(thread_id TEXT,user_id TEXT,source_type TEXT,picture_url TEXT,updated_at TEXT,private_message TEXT)');
  return { sql, prepare(query) {
    assert.match(query, /^SELECT user_id,picture_url FROM line_oa_threads/);
    return { bind(...args) { return { all: async () => ({ success: true, results: sql.prepare(query).all(...args) }) }; } };
  } };
}
const absentDb = { prepare() { throw Error('no OA table'); } };
const noFetch = async () => { throw Error('unexpected external request'); };

test('only safe HTTPS LINE CDN image URLs survive normalization', () => {
  for (const url of [image('member'), 'https://obs.line-scdn.net/avatar', 'https://scdn.line-apps.com/avatar']) assert.equal(lineAvatarUrl(url), url);
  for (const url of [null, {}, 'javascript:alert(1)', 'http://profile.line-scdn.net/a', 'https://evil.test/a', 'https://line-scdn.net.evil.test/a', 'https://profile.line-scdn.net@evil.test/a', 'https://user:secret@profile.line-scdn.net/a', 'https://profile.line-scdn.net:444/a', image('x') + '#fragment', image('x') + '\n', 'x'.repeat(2049)]) assert.equal(lineAvatarUrl(url), '');
});

test('verified own picture updates only its independent canonical cache and avoids repeated writes', async () => {
  const kv = cache();
  await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: kv }, actor(image('self')), [], noFetch, NOW);
  assert.deepEqual(kv.writes.map(row => row.key), [PREFIX + A]);
  assert.deepEqual(kv.writes[0].value, { pictureUrl: image('self'), updatedAt: NOW });
  await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: kv }, actor(image('self')), [], noFetch, NOW + 1000);
  assert.equal(kv.writes.length, 1);
  await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: kv }, actor(image('new')), [], noFetch, NOW + 2000);
  assert.equal(kv.writes.length, 2);
  await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: kv }, actor(image('new')), [], noFetch, NOW + 6 * 3600000 + 2000);
  assert.equal(kv.writes.length, 3);
  await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: kv }, actor('https://evil.test/self'), [], noFetch, NOW + 6 * 3600000 + 3000);
  assert.equal(kv.writes.length, 3, 'invalid picture must not erase a known image');
});

test('known empty verified pictures suppress older OA pictures and Bot requests', async t => {
  const db = database(t), kv = cache();
  db.sql.prepare('INSERT INTO line_oa_threads VALUES(?,?,?,?,?,?)').run('old-b', B, 'user', image('old'), '2026-10-24', 'private');
  kv.seed(B, '');
  const result = await hydrateMemberAvatars(db, { ACTMASTER_KV: kv, LINE_CHANNEL_ACCESS_TOKEN: 'bot' }, actor(), page(B), noFetch, NOW);
  assert.equal(result.has(B), true); assert.equal(result.get(B), '');
  assert.equal(kv.values.get(PREFIX + A).pictureUrl, '');
});

test('OA fallback reads exact authorized user rows without changing monitoring data', async t => {
  const db = database(t), kv = cache(), insert = db.sql.prepare('INSERT INTO line_oa_threads VALUES(?,?,?,?,?,?)');
  insert.run('b-old', B, 'user', image('old'), '2026-10-23', 'private older body');
  insert.run('b-new', B, 'user', image('current'), '2026-10-24', 'private newer body');
  insert.run('c-group', C, 'group', image('group'), '2026-10-25', 'private group body');
  insert.run('unrequested', A, 'user', image('unrequested'), '2026-10-25', 'private unrelated body');
  const before = JSON.stringify(db.sql.prepare('SELECT * FROM line_oa_threads').all());
  const result = await hydrateMemberAvatars(db, { ACTMASTER_KV: kv }, actor(image('self')), page(B, C), noFetch, NOW);
  assert.equal(result.get(B), image('current')); assert.equal(result.has(C), false); assert.equal(result.has(A), false);
  assert.equal(JSON.stringify(db.sql.prepare('SELECT * FROM line_oa_threads').all()), before);
  assert.equal(kv.values.get(PREFIX + B).pictureUrl, image('current'));
  assert.doesNotMatch(JSON.stringify(kv.writes.map(row => row.value)), /private|user_id|group/);
});

test('Bot fallback handles all thirty page members with at most six concurrent profile reads', async () => {
  const ids = Array.from({ length: 31 }, (_, i) => 'U' + (i + 1).toString(16).padStart(32, '0'));
  const kv = cache(); let active = 0, maximum = 0;
  const calls = [];
  const fetcher = async (url, options) => {
    const uid = url.split('/').at(-1); calls.push(uid); active++; maximum = Math.max(maximum, active);
    assert.equal(options.headers.Authorization, 'Bearer bot-secret'); assert.equal(options.redirect, 'manual'); assert.ok(options.signal instanceof AbortSignal);
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    return Response.json({ userId: uid, pictureUrl: image('member-' + calls.indexOf(uid)), displayName: 'private-name', statusMessage: 'private-status' });
  };
  const result = await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: kv, LINE_CHANNEL_ACCESS_TOKEN: 'bot-secret' }, actor(), page(...ids), fetcher, NOW);
  assert.equal(calls.length, 30); assert.equal(result.size, 30); assert.equal(maximum, 6); assert.equal(result.has(ids[30]), false);
  assert.doesNotMatch(JSON.stringify(kv.writes.map(row => row.value)), /private-name|private-status|bot-secret|userId/);
  calls.length = 0;
  await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: kv, LINE_CHANNEL_ACCESS_TOKEN: 'bot-secret' }, actor(), page(...ids), fetcher, NOW + 1000);
  assert.equal(calls.length, 0);
});

test('successful no-picture profiles are cached; wrong identity, unsafe URL and invalid body are ignored', async () => {
  const kv = cache();
  const result = await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: kv, LINE_CHANNEL_ACCESS_TOKEN: 'bot' }, actor(), page(B), async () => Response.json({ userId: B }), NOW);
  assert.equal(result.has(B), true); assert.equal(result.get(B), ''); assert.equal(kv.values.get(PREFIX + B).pictureUrl, '');
  for (const profile of [{ userId: A, pictureUrl: image('wrong-person') }, { userId: B, pictureUrl: 'javascript:alert(1)' }, { userId: B, pictureUrl: {} }, [], null]) {
    const isolated = cache();
    const ignored = await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: isolated, LINE_CHANNEL_ACCESS_TOKEN: 'bot' }, actor(), page(B), async () => Response.json(profile), NOW);
    assert.equal(ignored.has(B), false); assert.equal(isolated.values.has(PREFIX + B), false);
  }
});

test('missing bindings, malformed/stale caches, KV failures and Bot failures retain usable fallback', async () => {
  assert.equal((await hydrateMemberAvatars(absentDb, {}, actor(), page(B), noFetch, NOW)).size, 0);
  for (const fail of [async () => { throw Error('network timeout'); }, async () => new Response('{}', { status: 401 }), async () => new Response('{}', { status: 404 }), async () => new Response('{}', { status: 429 }), async () => new Response('{bad'), async () => new Response('x'.repeat(8193))]) {
    const kv = cache();
    const result = await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: kv, LINE_CHANNEL_ACCESS_TOKEN: 'bot' }, actor(), page(B), fail, NOW);
    assert.equal(result.has(B), false); assert.equal(kv.values.has(PREFIX + B), false);
  }
  const broken = { get: async () => { throw Error('KV read'); }, put: async () => { throw Error('KV write'); } };
  const result = await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: broken, LINE_CHANNEL_ACCESS_TOKEN: 'bot' }, actor(image('self')), page(B), async () => Response.json({ userId: B, pictureUrl: image('b') }), NOW);
  assert.equal(result.get(B), image('b'));
  const kv = cache(); kv.seed(B, image('stale'), NOW - 86400000); kv.values.set(PREFIX + C, { pictureUrl: 'https://evil.test/forged', updatedAt: NOW });
  assert.equal((await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: kv }, actor(), page(B, C, 'invalid-uid'), noFetch, NOW)).size, 0);
});

test('Bot failure bodies are cancelled before advancing the bounded profile queue', async () => {
  let cancelled = 0;
  const result = await hydrateMemberAvatars(absentDb, { LINE_CHANNEL_ACCESS_TOKEN: 'bot' }, actor(), page(B, C), async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
    cancel() { cancelled++; }
  }), { status: 429 }), NOW);
  assert.equal(result.size, 0); assert.equal(cancelled, 2);
});

test('known pictures survive Bot errors without being overwritten', async () => {
  const kv = cache(); kv.seed(B, image('known'));
  const before = JSON.stringify(kv.values.get(PREFIX + B));
  const result = await hydrateMemberAvatars(absentDb, { ACTMASTER_KV: kv, LINE_CHANNEL_ACCESS_TOKEN: 'bot' }, actor(), page(B, C), async () => new Response('{}', { status: 500 }), NOW);
  assert.equal(result.get(B), image('known')); assert.equal(result.has(C), false);
  assert.equal(JSON.stringify(kv.values.get(PREFIX + B)), before);
});
