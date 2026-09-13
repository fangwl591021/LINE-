import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {isRewardOnlyRole, checkRewardOnlyAction, issueRewardScanToken, validateRewardScanToken} from '../worker/reward-only-cashier.mjs';
import {runCashierRequest, getCashierRequest} from '../worker/store-cashier-requests.mjs';

const source = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');
const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), C = 'U' + 'c'.repeat(32), D = 'U' + 'd'.repeat(32);
const request = new Request('https://local.invalid/', {headers: {Authorization: 'Bearer local-test'}});
const reward = extra => ({userId: A, lineAccessToken: 'local-test', authenticatedUserId: A, authenticatedRole: 'reward', customerUserId: C, mode: 'reward', amount: 100, deductPoints: 0, requestId: crypto.randomUUID(), ...extra});

function object(name) {
  const match = source.match(new RegExp(`^const ${name} = \\{[\\s\\S]*?^\\};`, 'm'));
  assert.ok(match, 'Actual worker object exists: ' + name);
  return match[0];
}

function setup(t, role = 'reward') {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users (
    row_id TEXT,line_id TEXT PRIMARY KEY,name TEXT DEFAULT '',industry TEXT DEFAULT '',gender TEXT DEFAULT '',
    phone TEXT DEFAULT '',birthday TEXT DEFAULT '',region TEXT DEFAULT '',address TEXT DEFAULT '',socials TEXT DEFAULT '',
    role TEXT,store_id TEXT DEFAULT '',referrer_id TEXT DEFAULT '',network_id TEXT DEFAULT 'admin',tg_token TEXT DEFAULT '',
    tg_chat_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',legacy_line_id TEXT DEFAULT ''
  )`);
  sql.exec(readFileSync(new URL('../migrations/0030_store_cashier_requests.sql', import.meta.url), 'utf8'));
  sql.prepare('INSERT INTO users(row_id,line_id,role) VALUES(?,?,?)').run('row-a', A, role);
  sql.prepare('INSERT INTO users(row_id,line_id,role) VALUES(?,?,?)').run('row-b', B, 'user');
  t.after(() => sql.close());
  const records = new Map(), cacheDeletes = [], events = [];
  const env = {
    ACTMASTER_DB: {prepare(query) {
      const build = args => ({
        bind(...values) { return build(values); },
        async first() { return sql.prepare(query).get(...args) || null; },
        async all() { return {results: sql.prepare(query).all(...args)}; },
        async run() { return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}}; }
      });
      return build([]);
    }},
    ACTMASTER_KV: {
      async put(key, value) { records.set(key, value); },
      async get(key, type) { const raw = records.get(key); return raw ? (type === 'json' ? JSON.parse(raw) : raw) : null; },
      async delete(key) { cacheDeletes.push(key); records.delete(key); }
    }
  };
  const context = {console: {log() {}, warn() {}, error() {}}, crypto, TextEncoder, URL, Date,
    isRewardOnlyRole, checkRewardOnlyAction, issueRewardScanToken, validateRewardScanToken,
    runCashierRequest, getCashierRequest,
    fetch: async () => { throw Error('Unexpected external API'); }
  };
  vm.createContext(context);
  vm.runInContext([object('ACTION_POLICIES'), object('SecurityModule'), object('D1ReadModule'), object('D1WriteModule'),
    'globalThis.modules={SecurityModule,D1ReadModule,D1WriteModule,ACTION_POLICIES};'].join('\n'), context);
  const {SecurityModule: security, D1ReadModule: read, D1WriteModule: write} = context.modules;
  security.getLineUserIdFromToken = async token => token === 'local-test' ? A : '';
  read.first = async (_env, query, binds = []) => sql.prepare(query).get(...binds) || null;
  read.findUserByIdentity = async (_env, id) => ({user: sql.prepare('SELECT * FROM users WHERE line_id=? OR row_id=?').get(id, id) || null});
  write.ensureReferralPlaceholderCard = async () => null;
  const start = source.indexOf("    case 'getStorePointCustomer':");
  const end = source.indexOf("    case 'repairPointWalletSearchIndex':", start);
  assert.ok(start > 0 && end > start, 'Actual cashier dispatch block exists');
  vm.runInContext('globalThis.dispatchCashier=async function(action,payload,env){switch(action){' + source.slice(start, end) + '}}', context);
  context.PointModule = {
    async getStorePointCustomer() { return {success: true, data: {customerPointUserId: C, balance: 50}}; },
    async resolveStorePointCustomer(_env, id) { return {customerPointUserId: id}; },
    async storeAdjustCustomerPoints(safe, _env, beforeWrite) {
      await beforeWrite(safe.customerUserId);
      events.push({type: 'point-write', customer: safe.customerUserId});
      return {success: true, data: {mode: safe.mode}};
    },
    async listStorePointCashierLogs(p) { return {success: true, data: {actorId: p.authenticatedUserId}}; }
  };
  return {sql, env, security, read, write, context, events, cacheDeletes, records};
}

test('worker role normalization preserves reward without granting manager or independent store scope', t => {
  const {security, read, write} = setup(t);
  for (const raw of ['reward', 'REWARD', ' reward ']) {
    assert.equal(security.normalizeRole(raw), 'reward');
    assert.equal(read.role(raw), 'reward');
    assert.equal(write.role(raw), 'reward');
  }
  assert.equal(security.sanitizeRole(A, 'reward'), 'reward');
  assert.equal(security.canManage('reward'), false);
  assert.equal(security.effectiveNetworkId(A, 'reward', {network_id: B, referrer_id: B}), B);
  assert.equal(read.userRow({line_id: A, role: 'reward'}).roleLabel, '贈點用戶');
  for (const [raw, canonical] of [['user', 'user'], ['store', 'store'], ['tenant', 'store'], ['店長', 'store'], ['admin', 'admin'], ['總管', 'admin']]) {
    assert.equal(security.normalizeRole(raw), canonical);
    assert.equal(read.role(raw), canonical);
    assert.equal(write.role(raw), canonical);
  }
  assert.equal(security.canManage('store'), true);
  assert.equal(security.canManage('admin'), true);
});

test('authenticated reward user can access only scan/reward cashier and own receipt/log endpoints', async t => {
  const {security, env} = setup(t);
  for (const [action, extra] of [
    ['getStorePointCustomer', {walletQr: C}],
    ['storeAdjustCustomerPoints', {rewardScanToken: 'rwd_' + 'f'.repeat(64)}],
    ['getStoreCashierRequest', {}], ['listStorePointCashierLogs', {}]
  ]) {
    const p = reward(extra);
    const result = await security.authorizeAction(action, p, request, env);
    assert.equal(result.allowed, true, `${action}: ${result.error || ''}`);
    assert.equal(p.authenticatedUserId, A);
    assert.equal(p.authenticatedRole, 'reward');
  }
  for (const action of ['updateUserRole', 'adminAdjustCustomerPoints', 'saveStoreSettings', 'getStoreKnowledgeBase',
    'prepareStorePointCashierSession', 'getStoreShopRedemptionProduct', 'resolveStoreMemberProductQr', 'getActivities']) {
    const p = reward({authenticatedRole: 'admin', role: 'admin'});
    const result = await security.authorizeAction(action, p, request, env);
    assert.equal(result.allowed, false, action);
    assert.equal(p.authenticatedRole, 'reward');
  }
  for (const extra of [{mode: 'redeem'}, {deductPoints: 1}, {productId: crypto.randomUUID()}, {qrToken: 'f'.repeat(64)}]) {
    assert.equal((await security.authorizeAction('storeAdjustCustomerPoints', reward({rewardScanToken: 'rwd_' + 'f'.repeat(64), ...extra}), request, env)).allowed, false);
  }
  assert.equal((await security.authorizeAction('getStorePointCustomer', reward(), request, env)).allowed, false);
});

test('payload role and tokenless D1 identity fallback cannot create reward authority', async t => {
  const {security, env, sql} = setup(t);
  const anonymous = new Request('https://local.invalid/');
  for (const action of ['getStorePointCustomer', 'storeAdjustCustomerPoints', 'getStoreCashierRequest', 'listStorePointCashierLogs']) {
    const result = await security.authorizeAction(action, reward({lineAccessToken: '', walletQr: C, rewardScanToken: 'rwd_' + 'f'.repeat(64)}), anonymous, env);
    assert.equal(result.allowed, false, action);
    const invalidToken = await security.authorizeAction(action, reward({lineAccessToken: 'invalid-token', walletQr: C, rewardScanToken: 'rwd_' + 'f'.repeat(64)}), anonymous, env);
    assert.equal(invalidToken.allowed, false, action + ' must not recover an invalid token through D1 identity');
  }
  sql.prepare('UPDATE users SET role=? WHERE line_id=?').run('user', A);
  for (const action of ['getStorePointCustomer', 'storeAdjustCustomerPoints']) {
    assert.equal((await security.authorizeAction(action, reward({authenticatedRole: 'reward', role: 'reward', walletQr: C, rewardScanToken: 'rwd_' + 'f'.repeat(64)}), request, env)).allowed, false);
  }
});

test('existing manager cashier authorization remains unchanged', async t => {
  const {security, env} = setup(t, 'store');
  for (const action of ['getStorePointCustomer', 'prepareStorePointCashierSession', 'storeAdjustCustomerPoints', 'getStoreShopRedemptionProduct', 'resolveStoreMemberProductQr', 'listStorePointCashierLogs']) {
    assert.equal((await security.authorizeAction(action, reward({mode: 'redeem', deductPoints: 10}), request, env)).allowed, true, action);
  }
  assert.equal((await security.authorizeAction('updateUserRole', reward({targetUserId: B, newRole: 'reward'}), request, env)).allowed, false);
});

test('public/profile upserts cannot grant reward and cannot escalate or erase existing reward role', async t => {
  const {sql, env, write} = setup(t);
  for (const data of [{userId: B, role: 'reward'}, {userId: B, profile: {userId: B, role: 'reward'}}, {userId: D, role: 'reward', authenticatedRole: 'admin'}]) {
    const result = await write.upsertUser(data, env);
    assert.equal(result.success, true);
    assert.equal(sql.prepare('SELECT role FROM users WHERE line_id=?').get(data.userId).role, 'user');
  }
  for (const requestedRole of ['store', 'admin', 'user', undefined]) {
    const result = await write.upsertUser({userId: A, role: requestedRole, name: 'updated'}, env);
    assert.equal(result.success, true);
    assert.equal(sql.prepare('SELECT role FROM users WHERE line_id=?').get(A).role, 'reward');
    assert.equal(result.data.info.role, 'reward');
  }
});

test('authorized CRM role editor persists reward then revokes it without granting admin', async t => {
  const {security, env, write, sql, cacheDeletes} = setup(t, 'store');
  security.getActor = async () => ({userId: C, role: 'admin', networkId: 'admin', token: 'local-test'});
  for (const nextRole of ['reward', 'user', 'store', 'reward']) {
    const p = {userId: C, targetUserId: B, newRole: nextRole};
    assert.equal((await security.authorizeAction('updateUserRole', p, request, env)).allowed, true);
    assert.equal((await write.updateUserRole(p, env)).success, true);
    assert.equal(sql.prepare('SELECT role FROM users WHERE line_id=?').get(B).role, nextRole);
  }
  assert(cacheDeletes.includes('U_PROFILE_' + B));
  assert.equal((await write.updateUserRole({targetUserId: B, newRole: 'admin'}, env)).success, false);
  assert.equal(sql.prepare('SELECT role FROM users WHERE line_id=?').get(B).role, 'reward');
});

test('reward profile cannot acquire manager authority by copying protected administrator personal fields', async t => {
  const {security, write, sql, env} = setup(t);
  const protectedAccount = security.hardAdminAccounts[0];
  assert(!protectedAccount.ids.includes(A));
  const result = await write.upsertUser({userId: A, role: 'store', name: protectedAccount.names[0], phone: protectedAccount.phones[0]}, env);
  assert.equal(result.success, true);
  assert.equal(sql.prepare('SELECT role FROM users WHERE line_id=?').get(A).role, 'reward');
  assert.equal(result.data.info.role, 'reward');
  const actor = await security.getActor(reward(), request, env);
  assert.equal(actor.role, 'reward');
});

test('weak name/phone identity recovery cannot copy reward permission to a different LINE account', async t => {
  const {read, sql, env} = setup(t);
  sql.prepare('UPDATE users SET name=?,phone=? WHERE line_id=?').run('Recovery Person', '0900000000', A);
  const result = await read.linkUserIdentity({oldUserId: A, newUserId: D, authenticatedUserId: D, name: 'Recovery Person', phone: '0900000000'}, env);
  assert.equal(result.success, false);
  assert.match(result.error, /管理員/);
  assert.equal(sql.prepare('SELECT role FROM users WHERE line_id=?').get(D), undefined);
  assert.equal(sql.prepare('SELECT role FROM users WHERE line_id=?').get(A).role, 'reward');
});

test('identity recovery does not replace an existing reward account with an old store role', async t => {
  const {read, sql, env} = setup(t);
  sql.prepare('UPDATE users SET role=? WHERE line_id=?').run('store', B);
  const result = await read.linkUserIdentity({oldUserId: B, newUserId: A, authenticatedUserId: A}, env);
  assert.equal(result.success, true);
  assert.equal(result.data.info.role, 'reward');
  assert.equal(sql.prepare('SELECT role FROM users WHERE line_id=?').get(A).role, 'reward');
});

test('cashier lookup issues receipt for the resolved canonical customer, not the submitted identity', async t => {
  const {context, env, records} = setup(t);
  const result = await context.dispatchCashier('getStorePointCustomer', reward({customerUserId: B, walletQr: B}), env);
  assert.equal(result.success, true);
  assert.match(result.data.rewardScanToken, /^rwd_[0-9a-f]{64}$/);
  const receipt = JSON.parse(records.values().next().value);
  assert.equal(receipt.actorId, A);
  assert.equal(receipt.customerId, C);
  await validateRewardScanToken(env, reward({rewardScanToken: result.data.rewardScanToken}));
  await assert.rejects(validateRewardScanToken(env, reward({customerUserId: B, rewardScanToken: result.data.rewardScanToken})), /驗證無效/);
});

test('unresolved, ambiguous or blocked customer lookup does not issue reward receipt', async t => {
  const {context, env, records} = setup(t);
  for (const response of [
    {success: false, error: 'unknown'}, {success: true, data: {}},
    {success: true, data: {customerPointUserId: C, canAdjust: false}},
    {success: true, data: {customerPointUserId: C, needsBinding: true}},
    {success: true, data: {customerPointUserId: C, needsSelection: true}},
    {success: true, data: {customerPointUserId: '0912345678'}}
  ]) {
    context.PointModule.getStorePointCustomer = async () => structuredClone(response);
    const result = await context.dispatchCashier('getStorePointCustomer', reward({walletQr: C}), env);
    assert.equal(result.data?.rewardScanToken, undefined);
    assert.equal(records.size, 0);
  }
});

test('reward submit validates before the wallet handler, keeps request idempotency and replays expired receipts safely', async t => {
  const {context, env, events, records, sql} = setup(t);
  const token = await issueRewardScanToken(env, A, C);
  const p = reward(token);
  const result = await context.dispatchCashier('storeAdjustCustomerPoints', p, env);
  assert.equal(result.success, true, result.error);
  assert.equal(events.length, 1);
  assert.equal(events[0].customer, C);
  assert.equal(sql.prepare('SELECT status FROM store_cashier_requests WHERE request_id=?').get(p.requestId).status, 'succeeded');
  const [key, raw] = records.entries().next().value;
  const now = Date.now();
  records.set(key, JSON.stringify({...JSON.parse(raw), issuedAt: now - 180001, expiresAt: now - 1}));
  const replay = await context.dispatchCashier('storeAdjustCustomerPoints', p, env);
  assert.equal(replay.success, true);
  assert.equal(events.length, 1, 'same request does not grant again');
  const queried = await context.dispatchCashier('getStoreCashierRequest', p, env);
  assert.equal(queried.success, true, 'receipt query still works after token expiry');
  assert.equal((await context.dispatchCashier('getStoreCashierRequest', {...p, authenticatedUserId: B}, env)).success, false);
});

test('invalid, revoked and changed canonical receipt cannot reach wallet preparation', async t => {
  const {context, env, sql} = setup(t);
  let calls = 0;
  context.PointModule.storeAdjustCustomerPoints = async () => { calls++; throw Error('should not reach wallet'); };
  const token = await issueRewardScanToken(env, A, C);
  const invalid = await context.dispatchCashier('storeAdjustCustomerPoints', reward({rewardScanToken: 'rwd_' + 'f'.repeat(64)}), env);
  assert.equal(invalid.success, false);
  assert.equal(calls, 0);
  sql.prepare('UPDATE users SET role=? WHERE line_id=?').run('user', A);
  const revoked = await context.dispatchCashier('storeAdjustCustomerPoints', reward(token), env);
  assert.equal(revoked.success, false);
  assert.equal(calls, 0);
  sql.prepare('UPDATE users SET role=? WHERE line_id=?').run('reward', A);
  context.PointModule.resolveStorePointCustomer = async () => ({customerPointUserId: D});
  const changed = await context.dispatchCashier('storeAdjustCustomerPoints', reward(token), env);
  assert.equal(changed.success, false);
  assert.equal(calls, 0);
});

test('role revoked during wallet preparation is rechecked at beforeWrite and produces no point execution', async t => {
  const {context, env, sql, events} = setup(t);
  const token = await issueRewardScanToken(env, A, C);
  context.PointModule.storeAdjustCustomerPoints = async (safe, _env, beforeWrite) => {
    sql.prepare('UPDATE users SET role=? WHERE line_id=?').run('user', A);
    await beforeWrite(safe.customerUserId);
    events.push({type: 'point-write'});
    return {success: true};
  };
  const p = reward(token);
  const result = await context.dispatchCashier('storeAdjustCustomerPoints', p, env);
  assert.equal(result.success, false);
  assert.match(result.error, /未開放掃碼贈點/);
  assert.equal(events.length, 0);
  assert.equal(sql.prepare('SELECT status FROM store_cashier_requests WHERE request_id=?').get(p.requestId).status, 'failed');
});

test('customer identity changed at beforeWrite is rejected before points are sent', async t => {
  const {context, env, events} = setup(t);
  const token = await issueRewardScanToken(env, A, C);
  context.PointModule.storeAdjustCustomerPoints = async (_safe, _env, beforeWrite) => {
    await beforeWrite(D);
    events.push({type: 'point-write'});
    return {success: true};
  };
  const result = await context.dispatchCashier('storeAdjustCustomerPoints', reward(token), env);
  assert.equal(result.success, false);
  assert.equal(events.length, 0);
});

test('existing store cashier still supports reward and redeem without reward-only receipts', async t => {
  const {context, env, events} = setup(t, 'store');
  for (const mode of ['reward', 'redeem']) {
    const result = await context.dispatchCashier('storeAdjustCustomerPoints', reward({authenticatedRole: 'store', mode, deductPoints: mode === 'redeem' ? 10 : 0}), env);
    assert.equal(result.success, true, result.error);
  }
  assert.equal(events.length, 2);
});

test('actual cashier log handler restricts reward scope to verified actor despite supplied user/role fields', async t => {
  const {context, env, read} = setup(t);
  const first = source.indexOf('  async listStorePointCashierLogs(payload, env) {');
  const last = source.indexOf('  async repairPointWalletSearchIndex(payload, env) {', first);
  assert(first > 0 && last > first);
  vm.runInContext('globalThis.actualLogHandler=({' + source.slice(first, last) + '}).listStorePointCashierLogs;', context);
  let captured;
  read.all = async (_env, query, binds) => { captured = {query, binds: Array.from(binds)}; return []; };
  const result = await context.actualLogHandler.call({ensureCashierLedgerTable: async () => {}}, reward({userId: B, role: 'admin', limit: 1000}), env);
  assert.equal(result.success, true);
  assert.equal(result.data.scope, 'own_store');
  assert.match(captured.query, /WHERE actor_user_id = \?/);
  assert.deepEqual(captured.binds, [A, 50]);
});
