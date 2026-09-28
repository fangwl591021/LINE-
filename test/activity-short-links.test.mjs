import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createActivityShareLink, handleActivityShortLink } from '../worker/activity-short-links.mjs';
import worker from '../worker-entry.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const uid = 'U' + 'a'.repeat(32), other = 'U' + 'b'.repeat(32);
const actor = { userId: uid, token: 'verified-token', networkId: 'admin', role: 'user' };
const origin = 'https://line-engine.fangwl591021.workers.dev';
const request = new Request(origin, { method: 'POST' });
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE activities(activity_id TEXT PRIMARY KEY, network_id TEXT, status TEXT);');
  sql.exec(read('migrations/0051_activity_share_links.sql'));
  sql.exec("INSERT INTO activities VALUES('ACT_test','admin','上架'),('ACT_other','tenant_b','上架')");
  const queries = [];
  const env = { ACTMASTER_DB: { prepare(query) {
    const bound = (...args) => ({
      first: async () => { queries.push(['read', query]); return sql.prepare(query).get(...args) || null; },
      run: async () => { queries.push(['write', query]); return { success: true, meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; }
    });
    return { ...bound(), bind: bound };
  } } };
  const loads = [];
  const load = async (p, _env, verified) => {
    loads.push([p, verified]);
    const row = sql.prepare('SELECT * FROM activities WHERE activity_id=?').get(p.activityId);
    if (!row || (verified.role !== 'admin' && row.network_id !== p.networkId)) return { success: false };
    return { success: true, data: { activityId: row.activity_id, networkId: row.network_id, status: row.status } };
  };
  return { sql, env, loads, queries, close: () => sql.close(), create: (p = {}, a = actor) => createActivityShareLink({ activityId: 'ACT_test', networkId: 'admin', ...p }, request, env, a, load) };
}
test('persistent short route retains activity, verified referrer and authoritative network; never arbitrary URL', async () => {
  const f = fixture(); try {
    const r = await f.create({ referrerId: other, role: 'admin', url: 'https://evil.invalid' });
    assert.equal(r.success, true); assert.match(r.data.code, /^[A-Za-z0-9_-]{16}$/);
    const response = await handleActivityShortLink(new Request(r.data.url + '?r=evil&n=other&url=https://evil.invalid'), f.env);
    assert.equal(response.status, 302);
    const target = new URL(response.headers.get('Location'));
    assert.equal(target.origin, 'https://liff.line.me'); assert.equal(target.pathname, '/1660923784-vViMTZ1y');
    assert.deepEqual(Object.fromEntries(target.searchParams), { a: 'ACT_test', r: uid, n: 'admin', v: 'a' });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.ok(r.data.url.length < target.href.length);
    assert.equal(f.loads[0][1], actor);
    assert.deepEqual(f.sql.prepare('SELECT referrer_id,network_id FROM activity_share_links').get(), { __proto__: null, referrer_id: uid, network_id: 'admin' });
  } finally { f.close(); }
});
test('concurrent and repeated generation reuse unique code; other sharers and tenants stay separate', async () => {
  const f = fixture(); try {
    const results = await Promise.all(Array.from({ length: 12 }, () => f.create()));
    assert(results.every(r => r.success)); assert.equal(new Set(results.map(r => r.data.code)).size, 1);
    assert.equal((await f.create()).data.code, results[0].data.code);
    const second = await f.create({}, { ...actor, userId: other });
    const third = await f.create({ activityId: 'ACT_other', networkId: 'tenant_b' });
    assert.equal(third.success, true); assert.notEqual(second.data.code, results[0].data.code);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM activity_share_links').get().n, 3);
    assert.equal(f.sql.prepare('SELECT network_id FROM activity_share_links WHERE code=?').get(third.data.code).network_id, 'tenant_b');
    f.sql.exec(read('migrations/0051_activity_share_links.sql'));
    assert.equal((await f.create()).data.code, results[0].data.code, 'reapplying additive migration retains issued links');
  } finally { f.close(); }
});
test('missing authentication, malformed IDs, wrong activity scope and unpublished activity cannot create links', async () => {
  const f = fixture(); try {
    for (const a of [null, { ...actor, token: '' }, { ...actor, userId: 'admin' }]) assert.equal((await f.create({}, a)).success, false);
    for (const p of [{ activityId: 'missing' }, { activityId: "x' OR 1=1" }, { networkId: '../' }, { activityId: 'ACT_other' }]) assert.equal((await f.create(p)).success, false);
    f.sql.exec("UPDATE activities SET status='下架'"); assert.equal((await f.create()).success, false);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM activity_share_links').get().n, 0);
  } finally { f.close(); }
});
test('admin selection uses saved activity network, not forged payload network', async () => {
  const f = fixture(); try {
    const r = await f.create({ activityId: 'ACT_other', networkId: 'admin' }, { ...actor, role: 'admin' });
    assert.equal(f.sql.prepare('SELECT network_id FROM activity_share_links WHERE code=?').get(r.data.code).network_id, 'tenant_b');
  } finally { f.close(); }
});
test('GET and HEAD are read-only; removed, moved, missing and bad codes fail safely; other routes untouched', async () => {
  const f = fixture(); try {
    const r = await f.create(); const writes = f.queries.filter(q => q[0] === 'write').length;
    for (const method of ['GET', 'HEAD']) {
      const res = await handleActivityShortLink(new Request(r.data.url, { method }), f.env);
      assert.equal(res.status, 302); assert.equal(await res.text(), '');
    }
    assert.equal(f.queries.filter(q => q[0] === 'write').length, writes);
    assert.equal(await handleActivityShortLink(new Request(origin + '/v1/shop'), f.env), null);
    for (const code of ['bad', 'A'.repeat(16), 'A'.repeat(17), '%22%3E']) assert.equal((await handleActivityShortLink(new Request(origin + '/a/' + code), f.env)).status, 404);
    assert.equal((await handleActivityShortLink(new Request(r.data.url, { method: 'POST' }), f.env)).status, 405);
    f.sql.exec("UPDATE activities SET status='下架' WHERE activity_id='ACT_test'");
    assert.equal((await handleActivityShortLink(new Request(r.data.url), f.env)).status, 410);
    f.sql.exec("UPDATE activities SET status='上架',network_id='moved' WHERE activity_id='ACT_test'");
    assert.equal((await handleActivityShortLink(new Request(r.data.url), f.env)).status, 410);
    f.sql.exec("DELETE FROM activities WHERE activity_id='ACT_test'");
    assert.equal((await handleActivityShortLink(new Request(r.data.url), f.env)).status, 410);
  } finally { f.close(); }
});
test('D1 failure and invalid server LIFF config never redirect or expose internal errors', async () => {
  const f = fixture(); try {
    const r = await f.create(); f.env.POINT_LIFF_ID = 'https://evil.invalid/';
    let response = await handleActivityShortLink(new Request(r.data.url), f.env);
    assert.equal(response.status, 503); assert.equal(response.headers.get('Location'), null);
    f.env.ACTMASTER_DB.prepare = () => { throw new Error('private database details'); };
    assert.equal((await f.create()).success, false);
    response = await handleActivityShortLink(new Request(r.data.url), f.env);
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private|database/);
  } finally { f.close(); }
});
test('legacy long links unchanged and restored short target enters the same activity and friend-return route', async () => {
  const f = fixture(); try {
    const context = vm.createContext({ URL, URLSearchParams, window: { location: { hash: '' } } });
    vm.runInContext(read('js/modules/activity-entry.js'), context);
    const r = await f.create(); const res = await handleActivityShortLink(new Request(r.data.url), f.env);
    const params = new URL(res.headers.get('Location')).searchParams;
    assert.equal(context.window.ActivityEntry.readTarget(params).activityId, 'ACT_test');
    params.set('point_friend', '1');
    assert.equal(context.window.ActivityEntry.readTarget(params).networkId, 'admin');
    assert.equal(params.get('r'), uid);
    assert.equal(context.window.ActivityEntry.readTarget(new URLSearchParams('a=ACT_old&r=' + other + '&n=admin&v=a')).activityId, 'ACT_old');
  } finally { f.close(); }
});
test('new creation action uses strict existing authentication, no D1 identity fallback; redirect before unrelated handlers', () => {
  const legacy = read('workerbackup.js'), entry = read('worker-entry.mjs');
  assert.match(legacy, /createActivityShareLink: \{ access: 'authenticated' \}/);
  assert.match(legacy, /case 'createActivityShareLink':[\s\S]*?createActivityShareLink\(payload, request, env, actor,[\s\S]*?D1ActivityModule.getActivityById/);
  assert(entry.indexOf('const activityLinkResponse') < entry.indexOf('const memberChatResponse'));
  assert.match(read('index.html'), /activities\.js\?v=7\.11/);
});
test('actual Worker denies forged identity without token before accessing D1', async () => {
  let reads = 0;
  const env = { ACTMASTER_DB: { prepare() { reads++; throw Error('No database access allowed'); } } };
  const res = await worker.fetch(new Request(origin, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'createActivityShareLink', payload: { activityId: 'ACT_test', userId: uid, authenticatedUserId: uid, role: 'admin' } }) }), env, {});
  assert.equal((await res.json()).success, false); assert.equal(reads, 0);
});
test('actual Worker dispatcher and existing activity reader create and resolve a verified link', async () => {
  const f = fixture(); try {
    f.sql.exec('CREATE TABLE users(line_id TEXT,row_id TEXT,role TEXT,network_id TEXT,referrer_id TEXT,name TEXT,phone TEXT); CREATE TABLE registrants(row_id TEXT,activity_id TEXT,line_id TEXT,status TEXT);');
    f.env.ACTMASTER_KV = { get: async key => key === 'AUTH_synthetic-token' ? uid : null };
    const res = await worker.fetch(new Request(origin, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'createActivityShareLink', payload: { activityId: 'ACT_test', networkId: 'admin', userId: other, role: 'admin', lineAccessToken: 'synthetic-token' } }) }), f.env, {});
    const result = await res.json(); assert.equal(result.success, true, JSON.stringify(result));
    const redirect = await worker.fetch(new Request(result.data.url), f.env, {});
    assert.equal(redirect.status, 302); assert.equal(new URL(redirect.headers.get('Location')).searchParams.get('r'), uid);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM users').get().n, 0);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM registrants').get().n, 0);
  } finally { f.close(); }
});
