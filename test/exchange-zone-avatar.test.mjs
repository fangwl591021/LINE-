import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ExchangeZoneModule as zone } from '../worker/exchange-zone.mjs';

const uid = n => 'U' + n.toString(16).padStart(32, '0');
const image = label => 'https://profile.line-scdn.net/' + label;
const PREFIX = 'MEMBER_CHAT_LINE_AVATAR_';
const noFetch = async () => { throw Error('unexpected external request'); };

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(`
    CREATE TABLE users(row_id TEXT,line_id TEXT,name TEXT);
    CREATE TABLE card_contacts(row_id TEXT,name TEXT,company_name TEXT,title TEXT,department TEXT,services TEXT,
      mobile TEXT,office_phone TEXT,email TEXT,website TEXT,socials TEXT,address TEXT,image_url TEXT,custom_config TEXT,
      source_type TEXT,visibility TEXT,line_id TEXT,owner_user_id TEXT,profile_user_id TEXT);
    CREATE TABLE exchange_zone_posts(post_id INTEGER PRIMARY KEY,post_handle TEXT,title TEXT,body TEXT,contact_tags_json TEXT,
      author_user_id TEXT,card_row_id TEXT,published_at TEXT,created_at TEXT,status TEXT);
    CREATE TABLE line_oa_threads(thread_id TEXT,user_id TEXT,source_type TEXT,picture_url TEXT,updated_at TEXT,private_message TEXT);
  `);
  const queries = [], values = new Map(), cacheWrites = [];
  const kv = {
    async get(key, type) { assert.equal(type, 'json'); return values.get(key) || null; },
    async put(key, value) { cacheWrites.push({ key, value: JSON.parse(value) }); values.set(key, JSON.parse(value)); }
  };
  function prepare(query, args = []) {
    queries.push({ query, args });
    assert.match(query, /^\s*SELECT\b/i, 'avatar rendering must never write application data');
    return {
      bind(...bindings) { return prepare(query, bindings); },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return { success: true, results: sql.prepare(query).all(...args) }; },
      async run() { throw Error('unexpected database write'); }
    };
  }
  const env = { ACTMASTER_DB: { prepare }, ACTMASTER_KV: kv, EXCHANGE_ZONE_ACCESS_MODE: 'open' };
  function add(n, { authorId = uid(n), status = 'published', card = true, visibility = 'public', cover = 'https://example.test/card-cover-' + n } = {}) {
    const lineId = uid(n), rowId = 'internal-member-' + n, handle = 'post-' + n, cardId = 'card-' + n;
    sql.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?)').run(rowId, lineId, '合成會員' + n);
    if (card) sql.prepare('INSERT INTO card_contacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      cardId, '名片姓名' + n, '合成公司', '顧問', '', '合成服務', '', '', '', '', '', '', cover, '{}',
      'self_profile', visibility, lineId, lineId, lineId);
    sql.prepare('INSERT INTO exchange_zone_posts VALUES(?,?,?,?,?,?,?,?,?,?)').run(n, handle, '合成交流' + n,
      '合成貼文內容，不涉及正式會員', '["合作邀約"]', authorId, card ? cardId : null, '2026-10-25', '2026-10-25', status);
    return { lineId, rowId, handle, cardId, cover };
  }
  const seed = (lineId, pictureUrl) => values.set(PREFIX + lineId, { pictureUrl, updatedAt: Date.now() });
  const oa = (lineId, pictureUrl, id = lineId) => sql.prepare('INSERT INTO line_oa_threads VALUES(?,?,?,?,?,?)')
    .run(id, lineId, 'user', pictureUrl, '2026-10-25', 'private-monitor-body');
  const snapshot = () => JSON.stringify(['users', 'card_contacts', 'exchange_zone_posts', 'line_oa_threads']
    .map(table => sql.prepare('SELECT * FROM ' + table).all()));
  return { sql, env, queries, values, cacheWrites, add, seed, oa, snapshot };
}

test('public list and detail use LINE author picture while retaining the separate public card image', async t => {
  const f = fixture(t), a = f.add(1);
  f.seed(a.lineId, image('current-avatar'));
  const before = f.snapshot(), actor = { userId: a.lineId, role: 'user' };
  const list = await zone.list({}, f.env, actor, noFetch);
  assert.equal(list.success, true);
  assert.deepEqual(list.posts[0].author, { name: '合成會員1', avatarUrl: image('current-avatar') });
  const detail = await zone.get({ postHandle: a.handle }, f.env, actor, noFetch);
  assert.equal(detail.post.author.avatarUrl, image('current-avatar'));
  assert.equal(detail.post.card.imageUrl, a.cover);
  assert.equal(detail.post.canEdit, true);
  assert.equal(f.snapshot(), before);
  assert.equal(f.cacheWrites.length, 0, 'legacy actor without a verified picture must not erase the existing own cache');
  const returned = JSON.stringify([list, detail]);
  assert.doesNotMatch(returned, /avatar_line_id|author_user_id|private-monitor-body|internal-member-|card-1/);
  assert.equal(returned.includes(a.lineId), false);
});

test('posts without a public attached card still show author LINE avatars and never reveal card covers', async t => {
  const f = fixture(t), noCard = f.add(1, { card: false }), privateCard = f.add(2, { visibility: 'private' });
  f.oa(noCard.lineId, image('no-card'));
  f.oa(privateCard.lineId, image('private-card'));
  const before = f.snapshot();
  const list = await zone.list({}, f.env, { userId: uid(90) }, noFetch);
  assert.equal(list.posts.length, 2);
  for (const a of [noCard, privateCard]) {
    const post = list.posts.find(p => p.postHandle === a.handle);
    assert.equal(post.cardAvailable, false);
    assert.ok(post.author.avatarUrl.startsWith('https://profile.line-scdn.net/'));
    const detail = await zone.get({ postHandle: a.handle }, f.env, { userId: uid(90) }, noFetch);
    assert.equal(detail.post.card, null);
    assert.equal(detail.post.author.avatarUrl, post.author.avatarUrl);
  }
  assert.equal(f.snapshot(), before);
  assert.ok(f.cacheWrites.every(row => !JSON.stringify(row).includes('private-monitor-body')));
});

test('verified empty pictures suppress old OA images and cover fallback; missing/unsafe/failing images stay empty', async t => {
  const f = fixture(t), a = f.add(1), b = f.add(2), c = f.add(3);
  f.seed(a.lineId, '');
  f.oa(a.lineId, image('old-avatar'));
  f.oa(c.lineId, 'https://example.test/not-a-line-avatar');
  f.env.LINE_CHANNEL_ACCESS_TOKEN = 'synthetic-bot-token';
  const requests = [];
  const fail = async url => { requests.push(url); throw Error('synthetic outage'); };
  const list = await zone.list({}, f.env, { userId: a.lineId }, fail);
  assert.equal(list.success, true);
  assert.ok(list.posts.every(p => p.author.avatarUrl === ''));
  assert.ok(requests.every(url => !url.endsWith(a.lineId)));
  assert.equal(requests.length, 2);
  assert.equal(f.values.get(PREFIX + a.lineId).pictureUrl, '');
  assert.ok(!JSON.stringify(list).includes('card-cover'));
});

test('only already selected authors are looked up; hidden/archived posts and payload identity do not expand the avatar set', async t => {
  const f = fixture(t), a = f.add(1), hidden = f.add(2, { status: 'hidden' });
  f.add(3, { status: 'archived' });
  f.env.LINE_CHANNEL_ACCESS_TOKEN = 'synthetic-bot-token';
  const requests = [];
  const fetcher = async url => {
    requests.push(url); const id = url.split('/').at(-1);
    return Response.json({ userId: id, pictureUrl: image('selected-' + id), privateField: 'never-return' });
  };
  const result = await zone.list({ userId: hidden.lineId, authorUserId: hidden.lineId, avatarUrl: 'https://evil.test/avatar' }, f.env,
    { userId: a.lineId }, fetcher);
  assert.deepEqual(result.posts.map(p => p.postHandle), [a.handle]);
  assert.deepEqual(requests, ['https://api.line.me/v2/bot/profile/' + a.lineId]);
  requests.length = 0;
  assert.equal((await zone.get({ postHandle: hidden.handle }, f.env, { userId: hidden.lineId }, fetcher)).success, false);
  assert.equal(requests.length, 0);
  const own = await zone.list({ ownOnly: true, userId: hidden.lineId }, f.env, { userId: a.lineId }, fetcher);
  assert.deepEqual(own.posts.map(p => p.postHandle), [a.handle]);
  assert.equal(JSON.stringify(result).includes('never-return'), false);
});

test('member row aliases resolve to canonical LINE pictures without exposing either identifier', async t => {
  const f = fixture(t), a = f.add(1, { authorId: 'internal-member-1', card: false });
  f.seed(a.lineId, image('canonical'));
  const result = await zone.get({ postHandle: a.handle }, f.env, { userId: uid(90) }, noFetch);
  assert.equal(result.post.author.avatarUrl, image('canonical'));
  assert.equal(result.post.author.name, '合成會員1');
  assert.equal(JSON.stringify(result).includes(a.lineId), false);
  assert.equal(JSON.stringify(result).includes(a.rowId), false);
});

test('all fifty distinct selected authors hydrate, including those after the directory helper limit of thirty', async t => {
  const f = fixture(t), authors = Array.from({ length: 50 }, (_, i) => f.add(i + 1));
  authors.forEach(a => f.oa(a.lineId, image(a.handle)));
  const result = await zone.list({ limit: 50 }, f.env, { userId: uid(90) }, noFetch);
  assert.equal(result.posts.length, 50);
  for (const a of authors) assert.equal(result.posts.find(p => p.postHandle === a.handle).author.avatarUrl, image(a.handle));
  const avatarQueries = f.queries.filter(q => q.args.length && q.query.includes('FROM line_oa_threads'));
  const requested = avatarQueries.flatMap(q => JSON.parse(q.args[0]));
  assert.equal(new Set(requested).size, 50);
  assert.ok(avatarQueries.every(q => JSON.parse(q.args[0]).length <= 30));
});

test('repeated posts by one author share one profile lookup and denied access does no avatar work', async t => {
  const f = fixture(t), a = f.add(1, { card: false });
  for (let i = 2; i <= 40; i++) f.sql.prepare('INSERT INTO exchange_zone_posts VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(i, 'repeat-' + i, '合成重複作者', '合成內容', '[]', a.lineId, null, '2026-10-25', '2026-10-25', 'published');
  f.env.LINE_CHANNEL_ACCESS_TOKEN = 'synthetic-bot-token';
  const requests = [];
  const fetcher = async url => { requests.push(url); return Response.json({ userId: a.lineId, pictureUrl: image('once') }); };
  const result = await zone.list({ limit: 50 }, f.env, { userId: uid(90) }, fetcher);
  assert.equal(result.posts.length, 40);
  assert.ok(result.posts.every(p => p.author.avatarUrl === image('once')));
  assert.equal(requests.length, 1);
  f.queries.length = 0; requests.length = 0;
  const denied = { ...f.env, EXCHANGE_ZONE_ACCESS_MODE: 'private' };
  assert.equal((await zone.list({}, denied, { userId: a.lineId }, fetcher)).success, false);
  assert.equal((await zone.get({ postHandle: a.handle }, denied, { userId: a.lineId }, fetcher)).success, false);
  assert.equal(f.queries.length, 0);
  assert.equal(requests.length, 0);
});
