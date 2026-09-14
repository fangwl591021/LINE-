import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleStoreInviteBinding } from '../worker/store-invite-binding.mjs';
import { storeInviteProfileView } from '../workerbackup.js';

const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), C = 'U' + 'c'.repeat(32), D = 'U' + 'd'.repeat(32), E = 'U' + 'e'.repeat(32);
const SHOP_A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', SHOP_B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const PATH = 'https://worker.test/v1/store-shop/invite/accept';
const mapper = row => ({ userId: row.line_id, name: row.name || '未命名', phone: row.phone, role: row.role, referrerId: row.referrer_id, networkId: ['store', '店長'].includes(row.role) ? row.line_id : ['admin', '總管'].includes(row.role) ? 'admin' : row.network_id, points: row.points, source: 'store_invite' });

function fixture(options = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY, line_id TEXT NOT NULL UNIQUE, name TEXT DEFAULT '', industry TEXT DEFAULT '', phone TEXT DEFAULT '', role TEXT DEFAULT 'user', network_id TEXT DEFAULT 'admin', referrer_id TEXT DEFAULT '', points INTEGER DEFAULT 0, store_id TEXT DEFAULT '', socials TEXT DEFAULT '', legacy_line_id TEXT NOT NULL DEFAULT '', point_line_id TEXT NOT NULL DEFAULT '', identity_source TEXT NOT NULL DEFAULT '', migrated_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE user_identity_links(id INTEGER PRIMARY KEY AUTOINCREMENT,old_line_id TEXT NOT NULL DEFAULT '',new_line_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active');
    CREATE UNIQUE INDEX old_identity ON user_identity_links(old_line_id) WHERE old_line_id!='';
    CREATE UNIQUE INDEX new_identity ON user_identity_links(new_line_id) WHERE new_line_id!='';
    CREATE TABLE store_shop_stores(id TEXT PRIMARY KEY,owner_uid TEXT UNIQUE,status TEXT);
    CREATE TABLE points_ledger(id TEXT); CREATE TABLE cards(id TEXT); CREATE TABLE registrants(id TEXT);`);
  const queries = [], invalidated = [], calls = [], sessions = [], bindingCounts = []; let beforeWrite = options.beforeWrite;
  function user(uid, values = {}) {
    const data = { row_id: uid, line_id: uid, ...values }, keys = Object.keys(data);
    sql.prepare(`INSERT INTO users(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(data));
  }
  user(A, { role: 'store', name: '店長甲', phone: '0912345678' });
  user(B, { role: 'admin', name: '管理員乙', phone: '0923456789' });
  sql.prepare('INSERT INTO store_shop_stores VALUES(?,?,?)').run(SHOP_A, A, 'active');
  sql.prepare('INSERT INTO store_shop_stores VALUES(?,?,?)').run(SHOP_B, B, 'active');
  const db = {
    withSession(constraint) { sessions.push(constraint); return this; },
    prepare(query) {
      return { bind(...args) {
        queries.push(query);
        bindingCounts.push(args.length);
        assert.ok(args.length <= 100, `D1 bound parameters: ${args.length}`);
        return {
          async first() { return sql.prepare(query).get(...args) || null; },
          async all() { return { success: true, results: sql.prepare(query).all(...args) }; },
          async run() {
            if (beforeWrite) { const callback = beforeWrite; beforeWrite = null; callback(sql); }
            const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes) } };
          }
        };
      } };
    }
  };
  const env = { ACTMASTER_DB: db, ACTMASTER_KV: { delete(key) { invalidated.push(key); if (options.cacheFailure) throw new Error('cache down'); return Promise.resolve(); } } };
  const fetcher = async (url, init) => {
    calls.push({ url, authorization: init.headers.Authorization });
    assert.equal(url, 'https://api.line.me/v2/profile'); assert.ok(init.signal instanceof AbortSignal);
    if (options.authFailure) throw new Error('offline');
    const token = init.headers.Authorization.slice(7), uid = { actor: C, owner: A, old: D, new: E, admin: B }[token];
    return uid ? Response.json(options.profile || { userId: uid, displayName: 'LINE 名稱' }) : new Response('', { status: 401 });
  };
  async function response(data = { shopId: SHOP_A, referrerId: A }, token = 'actor', method = 'POST') {
    return handleStoreInviteBinding(new Request(PATH, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(data) } : {}) }), env, options.mapper || mapper, fetcher);
  }
  async function call(...args) { const result = await response(...args); return { status: result.status, ...(result.status === 204 ? {} : await result.json()) }; }
  const link = (old, current, status = 'active') => sql.prepare('INSERT INTO user_identity_links(old_line_id,new_line_id,status) VALUES(?,?,?)').run(old, current, status);
  const get = (uid = C) => sql.prepare('SELECT * FROM users WHERE line_id=?').get(uid);
  const count = () => sql.prepare('SELECT count(*) n FROM users').get().n;
  function untouched() {
    for (const table of ['points_ledger', 'cards', 'registrants']) assert.equal(sql.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
    assert.ok(queries.filter(q => /^(INSERT|UPDATE|DELETE)/.test(q)).every(q => /^(INSERT INTO users|UPDATE users SET referrer_id=)/.test(q)));
    assert.ok(calls.every(c => c.url === 'https://api.line.me/v2/profile'));
  }
  return { sql, env, fetcher, queries, calls, sessions, bindingCounts, invalidated, user, link, get, count, response, call, untouched };
}

test('new LINE login creates only minimal attributed user and returns authoritative incomplete profile', async () => {
  const f = fixture(); try {
    const result = await f.call(); assert.equal(result.status, 200); assert.equal(result.binding.status, 'bound');
    assert.equal(result.actorUserId, C); assert.equal(result.isRegistered, true);
    assert.equal(result.binding.referrerId, A); assert.equal(result.binding.networkId, A);
    assert.equal(result.info.needsProfileCompletion, true); assert.equal(result.info.profileStatus, 'incomplete');
    const row = f.get(); assert.equal(row.row_id, C); assert.equal(row.role, 'user'); assert.equal(row.name, ''); assert.equal(row.phone, ''); assert.equal(row.points, 0); assert.equal(row.socials, '');
    assert.deepEqual(f.sessions, ['first-primary']); assert.deepEqual(f.invalidated, [`U_PROFILE_${C}`]); f.untouched();
  } finally { f.sql.close(); }
});

test('already registered unscoped user changes only referral and network, not profile, role or points', async () => {
  const f = fixture(); try {
    f.user(C, { row_id: 'USR_' + C, name: '真實姓名', phone: '0911111111', points: 912, industry: '設計', identity_source: 'existing' });
    const before = f.get(); const result = await f.call(); assert.equal(result.binding.status, 'bound');
    assert.deepEqual({ ...f.get() }, { ...before, referrer_id: A, network_id: A }); assert.equal(result.info.points, 912); assert.equal(result.info.needsProfileCompletion, undefined); f.untouched();
  } finally { f.sql.close(); }
});

for (const values of [{ referrer_id: B }, { network_id: B }, { role: 'store' }, { role: 'admin' }, { role: '店長' }, { role: '總管' }, { role: 'tenant' }, { role: 'reward' }]) {
  test(`existing attribution or privileged role is preserved ${JSON.stringify(values)}`, async () => {
    const f = fixture(); try {
      f.user(C, { name: '會員', points: 135, ...values }); const before = f.get();
      const result = await f.call(); assert.equal(result.status, 200); assert.equal(result.binding.status, 'existing');
      assert.deepEqual(f.get(), before); assert.equal(f.invalidated.length, 0); assert.equal(result.binding.networkId, result.info.networkId); f.untouched();
    } finally { f.sql.close(); }
  });
}

test('repeated requests and later store links never move first attribution', async () => {
  const f = fixture(); try {
    assert.equal((await f.call()).binding.status, 'bound');
    assert.equal((await f.call()).binding.status, 'existing');
    const result = await f.call({ shopId: SHOP_B, referrerId: B });
    assert.equal(result.binding.status, 'existing'); assert.equal(result.binding.referrerId, A); assert.equal(f.count(), 3); assert.equal(f.invalidated.length, 1); f.untouched();
  } finally { f.sql.close(); }
});

test('concurrent different-store invitations insert once and first successful attribution wins', async () => {
  const f = fixture(); try {
    const results = await Promise.all([f.call(), f.call({ shopId: SHOP_B, referrerId: B })]);
    assert.ok(results.every(r => r.status === 200)); assert.deepEqual(results.map(r => r.binding.status).sort(), ['bound', 'existing']);
    assert.equal(results[0].binding.referrerId, results[1].binding.referrerId); assert.equal(f.count(), 3); assert.equal(f.invalidated.length, 1); f.untouched();
  } finally { f.sql.close(); }
});

test('concurrent existing-member claims update only once', async () => {
  const f = fixture(); try {
    f.user(C, { points: 30 });
    const results = await Promise.all([f.call(), f.call({ shopId: SHOP_B, referrerId: B })]);
    assert.deepEqual(results.map(r => r.binding.status).sort(), ['bound', 'existing']); assert.equal(results[0].binding.referrerId, results[1].binding.referrerId); assert.equal(f.get().points, 30); f.untouched();
  } finally { f.sql.close(); }
});

test('forged token and asserted authority fields cannot select actor, role or tenant', async () => {
  const f = fixture(); try {
    for (const token of ['', 'forged']) assert.equal((await f.call(undefined, token)).status, 401);
    for (const extra of [{ userId: A }, { role: 'admin' }, { networkId: B }, { net: B }, { referrer_id: B }, { identitySource: 'admin' }]) {
      assert.equal((await f.call({ shopId: SHOP_A, referrerId: A, ...extra })).status, 400);
    }
    assert.equal(f.count(), 2); assert.equal(f.invalidated.length, 0); f.untouched();
  } finally { f.sql.close(); }
});

test('request validates bounded JSON and strict string IDs before authentication', async () => {
  const f = fixture(); try {
    for (const data of [{}, [], null, { shopId: [SHOP_A], referrerId: A }, { shopId: SHOP_A, referrerId: [A] }, { shopId: 'not-a-shop', referrerId: A }]) assert.equal((await f.call(data)).status, 400);
    assert.equal((await f.call({ shopId: SHOP_A, referrerId: 'U' + 'a'.repeat(4000) })).status, 413);
    const invalid = await handleStoreInviteBinding(new Request(PATH, { method: 'POST', body: '{' }), f.env, mapper, f.fetcher); assert.equal(invalid.status, 400);
    assert.equal(f.calls.length, 0); assert.equal(f.count(), 2);
  } finally { f.sql.close(); }
});

test('route is isolated, POST only, CORS preflight and no-store responses', async () => {
  const f = fixture(); try {
    assert.equal(await handleStoreInviteBinding(new Request(PATH + '/other'), f.env, mapper, f.fetcher), null);
    assert.equal((await f.response(undefined, '', 'OPTIONS')).status, 204);
    assert.equal((await f.response(undefined, '', 'GET')).status, 405);
    const result = await f.response(); assert.equal(result.headers.get('Cache-Control'), 'no-store'); assert.equal(result.headers.get('Access-Control-Allow-Origin'), '*');
  } finally { f.sql.close(); }
});

test('expired, unavailable and invalid LINE profiles fail without writes', async () => {
  for (const options of [{ authFailure: true }, { profile: { userId: 'fake' } }, { profile: { userId: [C] } }]) {
    const f = fixture(options); try { assert.ok([401, 503].includes((await f.call()).status)); assert.equal(f.count(), 2); f.untouched(); } finally { f.sql.close(); }
  }
});

test('wrong referrer, draft store and owner outside public catalog roles do not bind', async () => {
  const f = fixture(); try {
    assert.equal((await f.call({ shopId: SHOP_A, referrerId: B })).code, 'REFERRER_MISMATCH');
    f.sql.prepare("UPDATE store_shop_stores SET status='draft' WHERE id=?").run(SHOP_A); assert.equal((await f.call()).status, 404);
    f.sql.prepare("UPDATE store_shop_stores SET status='active' WHERE id=?").run(SHOP_A);
    for (const role of ['reward', 'staff', 'tenant', 'manager', '']) {
      f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role, A); assert.equal((await f.call()).status, 404, role);
    }
    assert.equal(f.count(), 2); f.untouched();
  } finally { f.sql.close(); }
});

test('shop owner role determines destination network server-side', async () => {
  for (const [role, network, ref, expected] of [['admin', D, E, 'admin'], ['總管', D, E, 'admin'], ['store', D, E, A], ['店長', D, E, A], ['user', D, E, D], ['用戶', '', E, E], ['user', '', '', 'admin']]) {
    const f = fixture(); try {
      f.sql.prepare('UPDATE users SET role=?,network_id=?,referrer_id=? WHERE line_id=?').run(role, network, ref, A);
      const result = await f.call(); assert.equal(result.status, 200, role); assert.equal(result.binding.referrerId, A); assert.equal(result.binding.networkId, expected); f.untouched();
    } finally { f.sql.close(); }
  }
});

test('self invitation and verified self aliases never create or change attribution', async () => {
  const f = fixture(); try {
    const before = f.get(A); assert.equal((await f.call(undefined, 'owner')).binding.status, 'self');
    f.link(D, A); assert.equal((await f.call(undefined, 'old')).binding.status, 'self');
    assert.equal(f.count(), 2); assert.deepEqual(f.get(A), before); assert.equal(f.invalidated.length, 0); f.untouched();
  } finally { f.sql.close(); }
});

test('an unambiguous verified owner alias is accepted but canonical owner is stored', async () => {
  const f = fixture(); try {
    f.link(D, A); const result = await f.call({ shopId: SHOP_A, referrerId: D });
    assert.equal(result.status, 200); assert.equal(result.binding.referrerId, A); assert.equal(f.get().referrer_id, A);
  } finally { f.sql.close(); }
});

for (const field of ['point_line_id', 'legacy_line_id', 'row_id']) {
  test(`existing actor resolved by ${field} without duplicate or alias rewrites`, async () => {
    const f = fixture(); try {
      f.user(D, { [field]: C, referrer_id: B, name: '既有會員', points: 660 }); const before = f.get(D);
      const result = await f.call(); assert.equal(result.status, 200); assert.equal(result.binding.status, 'existing'); assert.equal(result.info.userId, D);
      assert.equal(f.count(), 3); assert.deepEqual(f.get(D), before); f.untouched();
    } finally { f.sql.close(); }
  });
}

test('active identity link resolves existing old account without duplicate or link mutation', async () => {
  const f = fixture(); try {
    f.user(D, { points: 712 }); f.link(D, C); const links = f.sql.prepare('SELECT * FROM user_identity_links').all();
    const result = await f.call(); assert.equal(result.status, 200); assert.equal(result.binding.status, 'bound');
    assert.equal(f.count(), 3); assert.equal(f.get(D).points, 712); assert.equal(f.get(), undefined); assert.deepEqual(f.sql.prepare('SELECT * FROM user_identity_links').all(), links);
    assert.ok(f.invalidated.includes(`U_PROFILE_${D}`)); assert.ok(f.invalidated.includes(`U_PROFILE_${C}`)); f.untouched();
  } finally { f.sql.close(); }
});

test('new account with verified active identity link inserts once under canonical identity', async () => {
  const f = fixture(); try {
    f.link(D, E); const result = await f.call(undefined, 'old'); assert.equal(result.status, 200);
    const row = f.get(E); assert.equal(row.row_id, E); assert.equal(row.legacy_line_id, D); assert.equal(row.point_line_id, E); assert.equal(f.get(D), undefined);
    assert.equal((await f.call(undefined, 'new')).binding.status, 'existing'); assert.equal(f.count(), 3); f.untouched();
  } finally { f.sql.close(); }
});

test('concurrent old and new authenticated aliases cannot insert duplicate members', async () => {
  const f = fixture(); try {
    f.link(D, E); const results = await Promise.all([f.call(undefined, 'old'), f.call({ shopId: SHOP_B, referrerId: B }, 'new')]);
    assert.deepEqual(results.map(r => r.binding.status).sort(), ['bound', 'existing']); assert.equal(f.count(), 3); assert.equal(f.get(D), undefined); assert.ok(f.get(E)); f.untouched();
  } finally { f.sql.close(); }
});

test('multiple candidate user rows, alias collisions and chained links fail closed', async () => {
  for (const setup of [f => { f.user(C); f.user(D, { legacy_line_id: C }); }, f => { f.user(D); f.user(C); f.link(D, C); }, f => { f.link(D, C); f.link(C, E); }, f => { f.user(C, { point_line_id: D }); f.user(E, { legacy_line_id: D }); }]) {
    const f = fixture(); try {
      setup(f); const before = f.sql.prepare('SELECT * FROM users').all(); const result = await f.call();
      assert.equal(result.status, 409); assert.equal(result.code, 'IDENTITY_CONFLICT'); assert.deepEqual(f.sql.prepare('SELECT * FROM users').all(), before); assert.equal(f.invalidated.length, 0); f.untouched();
    } finally { f.sql.close(); }
  }
});

test('ambiguous owner identity fails closed even when URL referrer matches owner', async () => {
  const f = fixture(); try {
    f.user(D, { point_line_id: A }); const result = await f.call(); assert.equal(result.status, 409); assert.equal(f.get(), undefined); f.untouched();
  } finally { f.sql.close(); }
});

for (const mutate of [sql => sql.prepare("UPDATE store_shop_stores SET status='draft' WHERE id=?").run(SHOP_A), sql => sql.prepare("UPDATE users SET role='reward' WHERE line_id=?").run(A), sql => sql.prepare('UPDATE users SET network_id=? WHERE line_id=?').run(D, A), sql => sql.prepare('UPDATE store_shop_stores SET owner_uid=? WHERE id=?').run(D, SHOP_A)]) {
  test('shop or owner changed before write cannot establish stale attribution', async () => {
    const f = fixture({ beforeWrite: mutate }); try { const result = await f.call(); assert.equal(result.status, 409); assert.equal(f.get(), undefined); assert.equal(f.invalidated.length, 0); f.untouched(); } finally { f.sql.close(); }
  });
}

test('identity mapping inserted concurrently prevents duplicate actor insert', async () => {
  const f = fixture({ beforeWrite: sql => sql.prepare("INSERT INTO user_identity_links(old_line_id,new_line_id,status) VALUES(?,?,'active')").run(D, C) }); try {
    f.user(D, { referrer_id: B }); const result = await f.call(); assert.equal(result.status, 200); assert.equal(result.binding.status, 'existing'); assert.equal(result.binding.referrerId, B); assert.equal(f.get(), undefined); assert.equal(f.count(), 3); assert.equal(f.invalidated.length, 0);
  } finally { f.sql.close(); }
});

test('role upgraded concurrently is preserved and not rebound', async () => {
  const f = fixture({ beforeWrite: sql => sql.prepare("UPDATE users SET role='admin' WHERE line_id=?").run(C) }); try {
    f.user(C); const result = await f.call(); assert.equal(result.binding.status, 'existing'); assert.equal(f.get().role, 'admin'); assert.equal(f.get().referrer_id, ''); assert.equal(f.invalidated.length, 0);
  } finally { f.sql.close(); }
});

test('schema failure has no fallback insertion, card recovery or success', async () => {
  const f = fixture(); try {
    f.sql.exec('DROP TABLE user_identity_links'); const result = await f.call(); assert.equal(result.status, 503); assert.equal(result.success, false); assert.equal(f.count(), 2); assert.equal(f.invalidated.length, 0); f.untouched();
  } finally { f.sql.close(); }
});

test('cache invalidation failure does not lose committed first attribution', async () => {
  const f = fixture({ cacheFailure: true }); try {
    const result = await f.call(); assert.equal(result.status, 200); assert.equal(result.binding.status, 'bound'); assert.equal(f.get().referrer_id, A);
    assert.equal((await f.call({ shopId: SHOP_B, referrerId: B })).binding.referrerId, A); f.untouched();
  } finally { f.sql.close(); }
});

test('real canonical mapper keeps binding and info consistent for an admin-owned store', async () => {
  const f = fixture({ mapper: storeInviteProfileView }); try {
    const result = await f.call({ shopId: SHOP_B, referrerId: B });
    assert.equal(result.status, 200); assert.equal(result.binding.status, 'bound');
    assert.equal(f.get().network_id, 'admin'); assert.equal(f.get().referrer_id, B);
    assert.equal(result.info.networkId, B); assert.equal(result.binding.networkId, B);
    assert.equal(result.binding.referrerId, result.info.referrerId); assert.equal(result.info.role, 'user');
    assert.equal(result.info.source, 'store_invite'); assert.equal(result.info.profileStatus, 'incomplete');
    const repeat = await f.call(); assert.equal(repeat.binding.status, 'existing'); assert.equal(repeat.binding.networkId, B); f.untouched();
  } finally { f.sql.close(); }
});

test('effective administrator is preserved even when persisted raw role is user', async () => {
  const f = fixture({ mapper: row => ({ ...mapper(row), role: row.line_id === C ? 'admin' : row.role, networkId: 'admin' }) }); try {
    f.user(C, { role: 'user', name: 'Verified administrator', phone: '0911111111' }); const before = f.get();
    const result = await f.call(); assert.equal(result.status, 200); assert.equal(result.binding.status, 'existing'); assert.equal(result.info.role, 'admin');
    assert.equal(result.binding.networkId, 'admin'); assert.equal(result.binding.referrerId, ''); assert.deepEqual(f.get(), before);
    assert.equal(f.invalidated.length, 0); assert.equal(f.queries.some(q => /^(INSERT|UPDATE)/.test(q)), false); f.untouched();
  } finally { f.sql.close(); }
});

test('concurrent canonical-role change cannot rebind an effective administrator', async () => {
  const f = fixture({
    mapper: row => ({ ...mapper(row), role: row.name === 'Verified administrator' ? 'admin' : row.role }),
    beforeWrite: sql => sql.prepare('UPDATE users SET name=? WHERE line_id=?').run('Verified administrator', C)
  }); try {
    f.user(C); const result = await f.call(); assert.equal(result.status, 200); assert.equal(result.binding.status, 'existing');
    assert.equal(f.get().referrer_id, ''); assert.equal(f.get().network_id, 'admin'); assert.equal(f.invalidated.length, 0); f.untouched();
  } finally { f.sql.close(); }
});

test('largest supported actor and owner identity graphs remain below the D1 bind limit', async () => {
  const f = fixture(); try {
    const F = 'U' + 'f'.repeat(32), G = 'U' + '1'.repeat(32), H = 'U' + '2'.repeat(32), I = 'U' + '3'.repeat(32);
    f.sql.prepare('UPDATE users SET row_id=?,point_line_id=?,legacy_line_id=? WHERE line_id=?').run('owner-row', D, E, A); f.link(E, F);
    f.user(C, { row_id: 'actor-row', point_line_id: G, legacy_line_id: H }); f.link(H, I);
    const result = await f.call(); assert.equal(result.status, 200); assert.equal(result.binding.status, 'bound');
    assert.equal(Math.max(...f.bindingCounts), 88); assert.ok(f.bindingCounts.every(n => n <= 100)); f.untouched();
  } finally { f.sql.close(); }
});
