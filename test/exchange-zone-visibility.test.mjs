import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ExchangeZoneModule as zone } from '../worker/exchange-zone.mjs';
import { ExchangeZoneCouponModule as coupons } from '../worker/exchange-zone-coupon.mjs';

const owner = { userId: 'owner', role: 'user' };
const other = { userId: 'other', role: 'admin' };
function fixture(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  for (const file of ['0021_exchange_zone_foundation.sql', '0022_exchange_zone_publish.sql', '0023_exchange_zone_likes.sql', '0024_exchange_zone_coupons.sql']) {
    sql.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  }
  sql.exec("CREATE TABLE users(row_id TEXT,line_id TEXT,name TEXT); INSERT INTO users VALUES('owner','owner','合成作者'),('other','other','合成讀者')");
  for (const [handle, author, status] of [['post', 'owner', 'published'], ['private', 'owner', 'hidden'], ['other', 'other', 'hidden'], ['draft', 'owner', 'draft'], ['deleted', 'owner', 'archived']]) {
    sql.prepare("INSERT INTO exchange_zone_posts(post_handle,author_user_id,title,body,status,published_at,expires_at,point_cost) VALUES(?,?,?,'合成資料，驗證狀態不修改內容',?,'2026-08-22','2000-01-01',10)").run(handle, author, handle, status);
  }
  sql.exec("INSERT INTO exchange_zone_coupons(coupon_handle,post_handle,owner_user_id,title,description,expires_at,status) VALUES('coupon','post','owner','測試券','合成優惠','2099-12-31','active')");
  const writes = [];
  function prepare(query, args = []) {
    return {
      bind(...values) { return prepare(query, values); },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return { success: true, results: sql.prepare(query).all(...args) }; },
      async run() { writes.push(query); const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes) } }; }
    };
  }
  const env = { ACTMASTER_DB: { prepare, batch: async (statements) => Promise.all(statements.map((s) => s.run())) }, EXCHANGE_ZONE_ACCESS_MODE: 'open' };
  const set = (hidden, actor = owner, postHandle = 'post', extra = {}) => zone.update({ postHandle, hidden, ...extra }, env, actor);
  const row = (handle = 'post') => ({ ...sql.prepare('SELECT * FROM exchange_zone_posts WHERE post_handle=?').get(handle) });
  return { sql, writes, env, set, row };
}

test('hide/restore is idempotent and preserves content, card, publication date, coupon and point metadata', async (t) => {
  const f = fixture(t), before = f.row();
  for (const hidden of [true, true, false, false]) {
    const result = await f.set(hidden);
    assert.equal(result.success, true); assert.equal(result.isHidden, hidden); assert.equal(result.chargedPoints, 0);
    const after = f.row(); delete after.updated_at;
    const expected = { ...before, status: hidden ? 'hidden' : 'published' }; delete expected.updated_at;
    assert.deepEqual(after, expected);
  }
  assert.equal(f.writes.length, 4);
  assert.ok(f.writes.every((q) => /^\s*UPDATE exchange_zone_posts\s+SET status =/.test(q)));
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM exchange_zone_coupons').get().n, 1);
});

test('public feed and direct details exclude hidden posts even for their owner', async (t) => {
  const f = fixture(t); await f.set(true);
  for (const actor of [owner, other]) {
    assert.deepEqual((await zone.list({}, f.env, actor)).posts, []);
    assert.equal((await zone.get({ postHandle: 'post' }, f.env, actor)).success, false);
  }
  await f.set(false);
  assert.equal((await zone.get({ postHandle: 'post' }, f.env, other)).post.isHidden, false);
  assert.equal((await zone.list({}, f.env, other)).posts.length, 1);
});

test('private management is explicitly scoped to the verified author, never payload identity', async (t) => {
  const f = fixture(t);
  const result = await zone.list({ ownOnly: true, userId: 'other', limit: 999 }, f.env, owner);
  assert.deepEqual(result.posts.map((p) => p.postHandle).sort(), ['post', 'private']);
  assert.ok(result.posts.every((p) => p.canEdit));
  assert.equal(result.posts.find((p) => p.postHandle === 'private').isHidden, true);
  for (const handle of ['other', 'draft', 'deleted']) assert.equal((await zone.get({ ownOnly: true, postHandle: handle }, f.env, owner)).success, false);
  assert.equal((await zone.get({ ownOnly: true, postHandle: 'private', userId: 'owner' }, f.env, other)).success, false);
  assert.equal((await zone.get({ ownOnly: true, postHandle: 'private' }, f.env, owner)).success, true);
  assert.equal((await zone.list({ ownOnly: true, userId: 'owner' }, f.env, {})).success, false);
  assert.equal((await zone.get({ ownOnly: true, postHandle: 'private' }, f.env, {})).success, false);
  assert.deepEqual((await zone.list({ ownOnly: 'true' }, f.env, owner)).posts.map((p) => p.postHandle), ['post']);
  assert.equal((await zone.list({ ownOnly: true, limit: 1 }, f.env, owner)).posts.length, 1);
});

test('non-owner/admin, missing identity, malformed and combined mutations cannot change visibility', async (t) => {
  const f = fixture(t);
  for (const actor of [other, {}, { role: 'admin' }]) assert.equal((await f.set(true, actor, 'post', { userId: 'owner' })).success, false);
  for (const hidden of ['true', 1, null]) assert.equal((await f.set(hidden)).success, false);
  for (const extra of [{ coupon: {} }, { title: '新內容' }, { toggleLike: true, archivePost: true }]) assert.equal((await f.set(true, owner, 'post', extra)).success, false);
  for (const handle of ['draft', 'deleted', 'missing']) assert.equal((await f.set(false, owner, handle)).success, false);
  assert.equal(f.row().status, 'published');
  const deniedEnv = { ...f.env, EXCHANGE_ZONE_ACCESS_MODE: 'private' };
  assert.equal((await zone.update({ hidden: true, postHandle: 'post' }, deniedEnv, owner)).success, false);
});

test('hidden post cannot be edited, liked or coupon-redeemed; restore retains one-time coupon redemption', async (t) => {
  const f = fixture(t); await f.set(true);
  assert.equal((await zone.update({ postHandle: 'post', title: '修改標題', body: '這是超過十個字的合成內容' }, f.env, owner)).success, false);
  assert.equal((await zone.update({ postHandle: 'post', toggleLike: true }, f.env, other)).success, false);
  assert.equal((await coupons.redeem({ couponHandle: 'coupon' }, f.env, other)).success, false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM exchange_zone_coupon_redemptions').get().n, 0);
  await f.set(false);
  assert.equal((await coupons.redeem({ couponHandle: 'coupon' }, f.env, other)).success, true);
  await f.set(true); await f.set(false);
  assert.equal((await coupons.redeem({ couponHandle: 'coupon' }, f.env, other)).success, false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM exchange_zone_coupon_redemptions').get().n, 1);
});

test('owner can archive hidden content, but cannot restore deleted content', async (t) => {
  const f = fixture(t); await f.set(true);
  const payload = { postHandle: 'post', toggleLike: true, archivePost: true };
  assert.equal((await zone.update(payload, f.env, other)).success, false);
  assert.equal((await zone.update(payload, f.env, owner)).success, true);
  assert.equal(f.row().status, 'archived');
  assert.equal((await f.set(false)).success, false);
});

test('failed writes never return successful visibility changes', async () => {
  for (const run of [async () => { throw Error('offline'); }, async () => ({ success: false, meta: { changes: 1 } }), async () => undefined]) {
    const env = { EXCHANGE_ZONE_ACCESS_MODE: 'open', ACTMASTER_DB: { prepare() { return { bind() { return { run }; } }; } } };
    assert.equal((await zone.update({ postHandle: 'post', hidden: true }, env, owner)).success, false);
  }
});
