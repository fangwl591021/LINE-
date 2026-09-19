import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleStoreAdmin } from '../worker/store-admin.mjs';
import { storeInviteProfileView } from '../workerbackup.js';

const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), C = 'U' + 'c'.repeat(32), D = 'U' + 'd'.repeat(32), E = 'U' + 'e'.repeat(32);
const HARD_ADMIN = 'Uf729764dbb5b652a5a90a467320bea29';
const PATH = 'https://worker.test/v1/store-shop/admin/stores';
const shopId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const mapper = row => ({ role: row.line_id === A && row.name === '已驗證管理員' ? 'admin' : 'user' });

test('authenticated admin merges ownerless partner pages and totals without identity or point changes',async()=>{
  const f=fixture();try{
    f.sql.exec(readFileSync(new URL('../migrations/0019_point_redemption_partner_directory.sql',import.meta.url),'utf8'));
    for(let n=1;n<=25;n++)f.sql.prepare("INSERT INTO point_redemption_partners(partner_handle,name,description,cover_image_url,phone,status) VALUES (?,?,?,?,?,'active')").run('partner_'+String(n).padStart(32,'a'),'代建店家'+n,'提供專業服務與商品，歡迎來電預約洽詢。','https://img.test/a.jpg','0911222333');
    const before=f.snapshot();let next='',shops=[];
    do{const result=await f.call(next?'after='+next:'');assert.equal(result.status,200);assert.deepEqual(result.summary,{total:29,active:28,draft:1});assert.equal(result.filtered_total,29);shops.push(...result.shops);next=result.next;}while(next);
    assert.equal(shops.length,29);assert.equal(new Set(shops.map(row=>row.id)).size,29);assert.equal(shops.filter(row=>row.listing_only===1&&row.public_visible).length,25);assert.deepEqual(f.snapshot(),before);
    assert.equal((await f.call('','reward')).status,403);
  }finally{f.sql.close();}
});

function fixture(options = {}) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT NOT NULL UNIQUE,legacy_line_id TEXT NOT NULL DEFAULT '',point_line_id TEXT NOT NULL DEFAULT '',role TEXT DEFAULT 'user',name TEXT DEFAULT '',phone TEXT DEFAULT '',points INTEGER DEFAULT 0,socials TEXT DEFAULT '',tg_token TEXT DEFAULT 'SECRET');
    CREATE TABLE user_identity_links(id INTEGER PRIMARY KEY AUTOINCREMENT,old_line_id TEXT NOT NULL DEFAULT '',new_line_id TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active');
    CREATE UNIQUE INDEX old_identity ON user_identity_links(old_line_id) WHERE old_line_id!='';
    CREATE UNIQUE INDEX new_identity ON user_identity_links(new_line_id) WHERE new_line_id!='';`);
  sql.exec(readFileSync(new URL('../migrations/0029_store_shop_catalog.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0035_store_product_purchase_mode.sql', import.meta.url), 'utf8'));
  const queries = [], calls = [], sessions = [], mapped = [];
  function user(uid, values = {}) {
    const data = { row_id: uid, line_id: uid, ...values }, keys = Object.keys(data);
    sql.prepare(`INSERT INTO users(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(data));
  }
  user(A, { role: 'user', name: '已驗證管理員', phone: '0900000000' });
  user(B, { role: 'store', name: '店長乙' });
  user(C, { role: 'user', name: '一般會員丙' });
  user(D, { role: 'reward', name: '贈點丁' });
  function store(n, owner = B, values = {}) {
    const data = { id: shopId(n), owner_uid: owner, name: `店家 ${n}`, status: 'active', updated_at: '2026-09-14T00:00:00Z', ...values }, keys = Object.keys(data);
    sql.prepare(`INSERT INTO store_shop_stores(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(data));
    return data.id;
  }
  function product(n, shop = shopId(1), values = {}) {
    const data = { id: shopId(n + 1000), shop_id: shop, title: `商品 ${n}`, price_cents: 100, status: 'active', updated_at: '2026-09-14T00:00:00Z', request_key: `key${n}`, ...values }, keys = Object.keys(data);
    sql.prepare(`INSERT INTO store_shop_products(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(data));
  }
  store(1, B, { name: '茶飲店', category: '食', phone: '0900123456', address: '新北市' });
  store(2, C, { name: '私人工作室', status: 'draft' });
  store(3, D, { name: '原店長的店' });
  store(4, E, { name: '失去店長資料的店' });
  product(1); product(2, undefined, { purchase_mode: 'online' }); product(3, undefined, { status: 'draft', purchase_mode: 'online' }); product(4, undefined, { status: 'archived', purchase_mode: 'online' });
  const db = {
    withSession(constraint) { sessions.push(constraint); return this; },
    prepare(query) {
      assert.match(query, /^SELECT\b/);
      assert.doesNotMatch(query, /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|PRAGMA|points_ledger|store_commerce|cards|orders|registrants|bank)\b/i);
      function statement(args = []) {
        return {
          query, args,
          bind(...values) { assert.ok(values.length <= 100); return statement(values); },
          async all() { queries.push({ query, args }); return { success: !options.failedResult, results: sql.prepare(query).all(...args) }; }
        };
      }
      return statement();
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.all())); }
  };
  const env = { ACTMASTER_DB: db, ACTMASTER_KV: new Proxy({}, { get() { throw new Error('Unexpected KV access'); } }) };
  const fetcher = async (url, init) => {
    calls.push({ url, init }); assert.equal(url, 'https://api.line.me/v2/profile'); assert.ok(init.signal instanceof AbortSignal); assert.equal(init.redirect, 'error');
    if (options.authFailure) throw new Error('upstream secret failure');
    if (options.authResponse) return options.authResponse();
    const token = init.headers.Authorization.slice(7), uid = { admin: A, store: B, user: C, reward: D, alias: E, canonical: HARD_ADMIN }[token];
    return uid ? Response.json({ userId: uid, displayName: '不可信的 LINE 名稱', ...(options.profile || {}) }) : new Response('', { status: 401 });
  };
  const roleMapper = row => { mapped.push(row); return (options.mapper || mapper)(row); };
  async function response(query = '', token = 'admin', method = 'GET', headers = {}) {
    return handleStoreAdmin(new Request(PATH + (query ? '?' + query : ''), { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }), env, roleMapper, fetcher);
  }
  async function call(...args) { const result = await response(...args); return { status: result.status, ...(result.status === 204 ? {} : await result.json()) }; }
  const link = (old, current, status = 'active') => sql.prepare('INSERT INTO user_identity_links(old_line_id,new_line_id,status) VALUES(?,?,?)').run(old, current, status);
  const snapshot = () => ['users', 'user_identity_links', 'store_shop_stores', 'store_shop_products'].map(table => sql.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
  return { sql, db, env, fetcher, roleMapper, calls, queries, sessions, mapped, user, store, product, link, response, call, snapshot };
}

test('canonical admin sees all stores including drafts, ineligible and missing owners, with narrow data and no writes', async () => {
  const f = fixture(); try {
    const before = f.snapshot(), result = await f.call();
    assert.equal(result.status, 200); assert.equal(result.success, true); assert.equal(result.shops.length, 4); assert.equal(result.next, '');
    assert.deepEqual(result.summary, { total: 4, active: 3, draft: 1 }); assert.equal(result.filtered_total, 4);
    assert.deepEqual(result.shops.map(shop => shop.public_visible), [true, false, false, false]);
    assert.equal(result.shops[1].owner_name, '一般會員丙'); assert.equal(result.shops[2].owner_role, 'reward'); assert.equal(result.shops[3].owner_name, '');
    assert.deepEqual(Object.keys(result.shops[0]).sort(), ['id', 'name', 'category', 'status', 'address', 'phone', 'owner_uid', 'owner_name', 'owner_role', 'product_count', 'active_product_count', 'online_product_count', 'public_visible'].sort());
    assert.equal(result.shops[0].product_count, 3); assert.equal(result.shops[0].active_product_count, 2); assert.equal(result.shops[0].online_product_count, 1);
    assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.sessions, ['first-primary']); assert.ok(f.mapped.length > 0);
    assert.deepEqual(Object.keys(f.mapped[0]).sort(), ['row_id', 'line_id', 'legacy_line_id', 'point_line_id', 'role', 'name', 'phone'].sort());
    assert.doesNotMatch(JSON.stringify(result), /SECRET|tg_token|socials|points|buyer|bank|address_private/);
  } finally { f.sql.close(); }
});

for (const token of ['store', 'user', 'reward', 'alias']) test(`${token} cannot read the admin directory or trigger shop queries`, async () => {
  const f = fixture(); try {
    const result = await f.call('', token); assert.equal(result.status, 403); assert.equal(result.code, 'ADMIN_REQUIRED');
    assert.ok(f.queries.every(({ query }) => !query.includes('store_shop'))); assert.equal(result.shops, undefined);
  } finally { f.sql.close(); }
});

test('raw admin and browser role/user claims do not grant admin authority', async () => {
  const f = fixture({ mapper: storeInviteProfileView }); try {
    f.sql.prepare("UPDATE users SET role='admin' WHERE line_id=?").run(C);
    assert.equal((await f.call('', 'user', 'GET', { 'X-User-Id': HARD_ADMIN, 'X-Role': 'admin' })).status, 403);
    for (const query of ['role=admin', `userId=${HARD_ADMIN}`, `actorUserId=${HARD_ADMIN}`, `networkId=admin`, 'pageSize=1000']) assert.equal((await f.call(query, 'user')).status, 400);
    assert.ok(f.queries.every(({ query }) => !query.includes('store_shop')));
  } finally { f.sql.close(); }
});

test('actual canonical mapper authorizes existing hard-admin identity; reward-only override remains denied', async () => {
  const f = fixture({ mapper: storeInviteProfileView }); try {
    f.user(HARD_ADMIN, { name: '方萬隆', role: 'user', phone: '0900000000' });
    assert.equal((await f.call('', 'canonical')).status, 200);
    f.sql.prepare("UPDATE users SET role='reward' WHERE line_id=?").run(HARD_ADMIN);
    assert.equal((await f.call('', 'canonical')).status, 403);
  } finally { f.sql.close(); }
});

test('missing and invalid Bearer credentials never query the database', async () => {
  const f = fixture(); try {
    for (const token of ['', 'forged', 'x'.repeat(4097)]) assert.equal((await f.call('', token)).status, 401);
    assert.equal(f.queries.length, 0);
  } finally { f.sql.close(); }
});

for (const field of ['row_id', 'legacy_line_id', 'point_line_id']) test(`persisted ${field} alias resolves the canonical admin row`, async () => {
  const f = fixture(); try {
    f.sql.prepare(`UPDATE users SET ${field}=? WHERE line_id=?`).run(E, A);
    assert.equal((await f.call('', 'alias')).status, 200); assert.equal(f.mapped[0].line_id, A);
  } finally { f.sql.close(); }
});

test('one active identity link works in either direction, while inactive mappings do not grant access', async () => {
  for (const [old, current, status, expected] of [[E, A, 'active', 200], [A, E, 'active', 200], [E, A, 'inactive', 403]]) {
    const f = fixture(); try { f.link(old, current, status); assert.equal((await f.call('', 'alias')).status, expected); } finally { f.sql.close(); }
  }
});

test('ambiguous direct/alias rows cannot borrow an admin privilege', async () => {
  const f = fixture(); try {
    f.user(E, { name: '不同會員' }); f.sql.prepare('UPDATE users SET point_line_id=? WHERE line_id=?').run(E, A);
    const result = await f.call('', 'alias'); assert.equal(result.status, 409); assert.equal(f.mapped.length, 0);
  } finally { f.sql.close(); }
});

test('multiple identity links, linked separate rows and self-links are rejected', async () => {
  for (const setup of [f => { f.link(E, A); f.link(A, B); }, f => { f.link(E, A); f.user(E); }, f => f.link(A, A)]) {
    const f = fixture(); try { setup(f); assert.equal((await f.call()).status, 409); assert.equal(f.mapped.length, 0); } finally { f.sql.close(); }
  }
});

test('identity aliases reveal second-hop conflicts before canonical role mapping', async () => {
  const f = fixture(); try {
    f.sql.prepare('UPDATE users SET legacy_line_id=? WHERE line_id=?').run(E, A); f.link(E, B);
    assert.equal((await f.call()).status, 409); assert.equal(f.mapped.length, 0);
  } finally { f.sql.close(); }
});

test('search matches shop name, category, address, shop phone and owner name literally', async () => {
  const f = fixture(); try {
    for (const q of ['茶飲', '食', '新北', '0900123', '店長乙']) {
      const result = await f.call('q=' + encodeURIComponent(q)); assert.equal(result.shops.length, 1); assert.equal(result.shops[0].id, shopId(1)); assert.equal(result.filtered_total, 1); assert.equal(result.summary.total, 4);
    }
    const draft = await f.call('status=draft'); assert.equal(draft.shops.length, 1); assert.equal(draft.shops[0].status, 'draft'); assert.equal(draft.filtered_total, 1); assert.equal(draft.summary.total, 4);
    assert.equal((await f.call('status=active')).filtered_total, 3);
    assert.equal((await f.call('status=draft&q=' + encodeURIComponent('茶飲'))).filtered_total, 0);
  } finally { f.sql.close(); }
});

test('SQL injection strings and wildcard characters are literal search values', async () => {
  const f = fixture(); try {
    for (const q of ["' OR 1=1 --", '%', '_', '\\']) assert.equal((await f.call('q=' + encodeURIComponent(q))).filtered_total, 0);
    assert.equal((await f.call()).summary.total, 4);
    assert.ok(f.queries.every(({ query }) => !query.includes("' OR 1=1 --")));
  } finally { f.sql.close(); }
});

test('fixed 20-item keyset pages have no duplicates and filtered totals ignore the cursor', async () => {
  const f = fixture(); try {
    for (let i = 5; i <= 47; i++) f.store(i, 'fixture-owner-' + i);
    const first = await f.call(), second = await f.call('after=' + first.next), third = await f.call('after=' + second.next);
    assert.equal(first.shops.length, 20); assert.equal(second.shops.length, 20); assert.equal(third.shops.length, 7); assert.equal(third.next, '');
    assert.equal(first.next, shopId(20)); assert.equal(second.next, shopId(40));
    assert.equal(new Set([...first.shops, ...second.shops, ...third.shops].map(shop => shop.id)).size, 47);
    assert.deepEqual([first.filtered_total, second.filtered_total, third.filtered_total], [47, 47, 47]);
  } finally { f.sql.close(); }
});

test('empty directory has stable zero totals and empty pagination', async () => {
  const f = fixture(); try {
    f.sql.exec('DELETE FROM store_shop_products; DELETE FROM store_shop_stores;');
    const result = await f.call(); assert.equal(result.status, 200); assert.deepEqual(result.summary, { total: 0, active: 0, draft: 0 }); assert.equal(result.filtered_total, 0); assert.deepEqual(result.shops, []); assert.equal(result.next, '');
  } finally { f.sql.close(); }
});

test('public visibility uses exact existing catalog eligibility, including case handling but not trimmed roles', async () => {
  const f = fixture(); try {
    for (const role of ['store', '店長', 'admin', '總管', 'user', '用戶', 'STORE', 'reward', 'tenant', ' store ']) {
      f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role, B);
      const result = await f.call(); assert.equal(result.shops[0].public_visible, ['store', '店長', 'admin', '總管', 'user', '用戶', 'STORE'].includes(role), role);
    }
  } finally { f.sql.close(); }
});

test('invalid, duplicate and oversized query parameters reject before identity lookups', async () => {
  const f = fixture(); try {
    for (const q of ['q=' + 'a'.repeat(81), 'status=archived', 'after=bad', 'q=a&q=b', 'status=active&status=draft', 'after=' + shopId(1) + '&after=' + shopId(2)]) assert.equal((await f.call(q)).status, 400);
    assert.equal(f.calls.length, 0); assert.equal(f.queries.length, 0);
  } finally { f.sql.close(); }
});

test('route isolation, read-only methods, no-store and CORS preflight', async () => {
  const f = fixture(); try {
    assert.equal(await handleStoreAdmin(new Request(PATH + '/extra'), f.env, f.roleMapper, f.fetcher), null);
    assert.equal((await f.response('', '', 'OPTIONS')).status, 204);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) assert.equal((await f.response('', '', method)).status, 405);
    assert.equal(f.calls.length, 0); assert.equal(f.queries.length, 0);
    const response = await f.response(); assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*'); assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  } finally { f.sql.close(); }
});

test('invalid LINE profile, oversized bodies, upstream errors and malformed JSON fail closed', async () => {
  for (const [options, expected] of [
    [{ authFailure: true }, 503], [{ profile: { userId: 'admin' } }, 401], [{ profile: { userId: [A] } }, 401],
    [{ authResponse: () => new Response('', { status: 500 }) }, 503], [{ authResponse: () => new Response('', { status: 403 }) }, 401],
    [{ authResponse: () => new Response('{') }, 503], [{ authResponse: () => Response.json({ userId: A, data: 'x'.repeat(8192) }) }, 503],
    [{ authResponse: () => new Response('{}', { headers: { 'Content-Length': '10000' } }) }, 503]
  ]) {
    const f = fixture(options); try { const result = await f.call(); assert.equal(result.status, expected); assert.equal(f.queries.length, 0); assert.doesNotMatch(JSON.stringify(result), /secret failure|SQL/); } finally { f.sql.close(); }
  }
});

test('schema and mapper failures never return a partial directory or expose internals', async () => {
  for (const table of ['user_identity_links', 'users', 'store_shop_products', 'store_shop_stores']) {
    const f = fixture(); try {
      f.sql.exec('PRAGMA foreign_keys=OFF'); f.sql.exec(`DROP TABLE ${table}`);
      const result = await f.call(); assert.equal(result.status, 503); assert.equal(result.shops, undefined); assert.doesNotMatch(JSON.stringify(result), /no such table|SELECT|users|store_shop/);
    } finally { f.sql.close(); }
  }
  for (const options of [{ failedResult: true }, { mapper() { throw new Error('private internals'); } }]) {
    const f = fixture(options); try { const result = await f.call(); assert.equal(result.status, 503); assert.doesNotMatch(JSON.stringify(result), /private internals/); } finally { f.sql.close(); }
  }
});

test('without session support the same read-only permission boundary remains enforced', async () => {
  const f = fixture(); try { delete f.db.withSession; assert.equal((await f.call()).status, 200); assert.equal((await f.call('', 'store')).status, 403); } finally { f.sql.close(); }
});
