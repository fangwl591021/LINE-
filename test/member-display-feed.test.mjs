import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ExchangeZoneModule } from '../worker/exchange-zone.mjs';

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,name TEXT);
    CREATE TABLE exchange_zone_posts(post_id INTEGER PRIMARY KEY,post_handle TEXT,author_user_id TEXT,
      card_row_id TEXT DEFAULT '',title TEXT DEFAULT '交流內容',body TEXT DEFAULT '公開介紹',contact_tags_json TEXT DEFAULT '[]',
      published_at TEXT,created_at TEXT,status TEXT DEFAULT 'published');`);
  const queries = [];
  function prepare(query, args = []) {
    queries.push(query);
    return {
      bind(...values) { return prepare(query, values); },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return { success: true, results: sql.prepare(query).all(...args) }; },
      async run() { throw Error('discovery must never write'); }
    };
  }
  const env = { ACTMASTER_DB: { prepare }, EXCHANGE_ZONE_ACCESS_MODE: 'open' };
  const actor = { userId: 'viewer', role: 'user' };
  const noFetch = async () => { throw Error('unexpected external request'); };
  function author(id, name, rowId = 'row-' + id) {
    sql.prepare('INSERT INTO users(row_id,line_id,name) VALUES(?,?,?)').run(rowId, id, name);
  }
  function post(handle, id, timestamp = '2026-10-27 08:00:00', status = 'published') {
    sql.prepare('INSERT INTO exchange_zone_posts(post_handle,author_user_id,published_at,created_at,status) VALUES(?,?,?,?,?)').run(handle, id, timestamp, timestamp, status);
  }
  const list = (payload = {}, currentActor = actor) => ExchangeZoneModule.list(payload, env, currentActor, noFetch);
  const get = (handle, payload = {}, currentActor = actor) => ExchangeZoneModule.get({ postHandle: handle, ...payload }, env, currentActor, noFetch);
  return { sql, env, actor, author, post, list, get, queries };
}

test('public feed excludes unnamed and missing accounts before LIMIT without changing data', async t => {
  const f = fixture(t);
  f.author('a', '王小明'); f.author('b', 'Kevin Chen');
  f.post('valid-older', 'a', '2026-10-25'); f.post('valid-newer', 'b', '2026-10-26');
  const placeholders = ['', null, '未命名', ' 未命名會員 ', '\t未命名用戶\n', '未命名用户', '未命名使用者', 'UNNAMED', 'unknown', '\u200b未命名\u3000'];
  for (const [index, name] of placeholders.entries()) { f.author('empty-' + index, name); f.post('post-empty-' + index, 'empty-' + index, '2026-10-27'); }
  f.post('no-account', 'missing', '2026-10-28');
  const before = f.sql.prepare('SELECT * FROM exchange_zone_posts ORDER BY post_id').all();
  const result = await f.list({ limit: 2 });
  assert.equal(result.success, true);
  assert.deepEqual(result.posts.map(row => row.postHandle), ['valid-newer', 'valid-older']);
  assert.deepEqual(result.posts.map(row => row.author.name), ['Kevin Chen', '王小明']);
  assert.equal(result.count, 2);
  for (const handle of ['post-empty-2', 'post-empty-7', 'no-account']) assert.equal((await f.get(handle)).success, false);
  assert.equal((await f.get('valid-older')).post.author.name, '王小明');
  assert.deepEqual(f.sql.prepare('SELECT * FROM exchange_zone_posts ORDER BY post_id').all(), before);
});

test('author can still manage unnamed own posts while other users cannot open them publicly', async t => {
  const f = fixture(t), owner = { userId: 'owner', role: 'user' };
  f.author('owner', '未命名'); f.post('owner-visible', 'owner'); f.post('owner-hidden', 'owner', '2026-10-27', 'hidden');
  assert.equal((await f.list()).count, 0);
  assert.equal((await f.get('owner-visible')).success, false);
  assert.equal((await f.list({ ownOnly: true }, owner)).count, 2);
  assert.equal((await f.get('owner-visible', { ownOnly: true }, owner)).post.canEdit, true);
  assert.equal((await f.get('owner-hidden', { ownOnly: true }, owner)).post.isHidden, true);
  assert.equal((await f.get('owner-visible', { ownOnly: true })).success, false);
});

test('public feed keeps LINE-id priority over a colliding row id and reflects later name repairs', async t => {
  const f = fixture(t);
  f.author('line-wins', '真實 LINE 姓名', 'canonical');
  f.author('unrelated', '未命名', 'line-wins');
  f.post('priority-post', 'line-wins');
  assert.equal((await f.list()).posts[0].author.name, '真實 LINE 姓名');
  f.sql.prepare('UPDATE users SET name=? WHERE row_id=?').run('unknown', 'canonical');
  f.sql.prepare('UPDATE users SET name=? WHERE row_id=?').run('不能取代 LINE 姓名', 'line-wins');
  assert.equal((await f.list()).count, 0);
  assert.equal((await f.get('priority-post')).success, false);
  f.sql.prepare('UPDATE users SET name=? WHERE row_id=?').run('陳先生', 'canonical');
  assert.equal((await f.get('priority-post')).post.author.name, '陳先生');
  f.author('row-only-line', '舊式會員姓名', 'legacy-row'); f.post('legacy-post', 'legacy-row');
  assert.equal((await f.get('legacy-post')).post.author.name, '舊式會員姓名');
});
