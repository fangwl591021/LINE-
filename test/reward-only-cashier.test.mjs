import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {isRewardOnlyRole, checkRewardOnlyAction, issueRewardScanToken, validateRewardScanToken} from '../worker/reward-only-cashier.mjs';

const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), C = 'U' + 'c'.repeat(32);
const fakeToken = 'rwd_' + 'd'.repeat(64);
const payload = (extra = {}) => ({authenticatedUserId: A, customerUserId: C, mode: 'reward', deductPoints: 0, rewardScanToken: fakeToken, ...extra});

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE users(line_id TEXT PRIMARY KEY,row_id TEXT,role TEXT)');
  sql.prepare('INSERT INTO users VALUES(?,?,?)').run(A, 'row-a', 'reward');
  sql.prepare('INSERT INTO users VALUES(?,?,?)').run(B, 'row-b', 'reward');
  t.after(() => sql.close());
  const records = new Map(), writes = [], queries = [];
  const env = {
    ACTMASTER_DB: {prepare(query) {
      assert.match(query, /^SELECT role FROM users WHERE line_id=\? OR row_id=\? LIMIT 1$/);
      return {bind(...args) { return {async first() { queries.push({query, args}); return sql.prepare(query).get(...args) || null; }}; }};
    }},
    ACTMASTER_KV: {
      async put(key, value, options) { writes.push({key, value, options}); records.set(key, JSON.parse(value)); },
      async get(key, type) { assert.equal(type, 'json'); return records.get(key) || null; }
    }
  };
  return {sql, env, records, writes, queries};
}

test('reward role is distinct and cannot be inferred from payload objects or other roles', () => {
  for (const role of ['reward', 'REWARD', ' reward ']) assert.equal(isRewardOnlyRole(role), true);
  for (const role of ['admin', 'store', 'user', 'tenant', 'staff', 'manager', '贈點用戶', '', null, undefined, {role: 'reward'}]) assert.equal(isRewardOnlyRole(role), false);
});

test('customer lookup accepts only an exact member wallet UID QR matching the requested customer', () => {
  assert.equal(checkRewardOnlyAction('getStorePointCustomer', {walletQr: C, customerUserId: C}), '');
  for (const raw of ['', '0912345678', 'https://liff.line.me/app?uid=' + C, JSON.stringify({userId: C}), ' ' + C, C + '\n', 'u' + 'c'.repeat(32), 'U' + 'c'.repeat(19), 'U' + 'c'.repeat(65), {}, null]) {
    assert.notEqual(checkRewardOnlyAction('getStorePointCustomer', {walletQr: raw, customerUserId: raw}), '');
  }
  assert.notEqual(checkRewardOnlyAction('getStorePointCustomer', {walletQr: C, customerUserId: B}), '');
  assert.notEqual(checkRewardOnlyAction('getStorePointCustomer', {customerUserId: C, scanned: true}), '');
});

test('reward-only action allowlist blocks debit, product redemption and unrelated administrative operations', () => {
  assert.equal(checkRewardOnlyAction('storeAdjustCustomerPoints', payload()), '');
  assert.equal(checkRewardOnlyAction('storeAdjustCustomerPoints', payload({productId: '', qrToken: ''})), '');
  for (const extra of [{mode: 'redeem'}, {mode: 'REWARD'}, {mode: undefined}, {deductPoints: 1}, {deductPoints: -1}, {deductPoints: '0'}, {deductPoints: null}, {deductPoints: undefined}, {productId: crypto.randomUUID()}, {productId: false}, {qrToken: 'x'}, {rewardScanToken: ''}, {rewardScanToken: C}, {customerUserId: '0912345678'}]) {
    assert.notEqual(checkRewardOnlyAction('storeAdjustCustomerPoints', payload(extra)), '', JSON.stringify(extra));
  }
  for (const action of ['getStoreCashierRequest', 'listStorePointCashierLogs']) assert.equal(checkRewardOnlyAction(action, {}), '');
  for (const action of ['getStoreRedemptionProduct', 'resolveStoreMemberProductQr', 'updateUserRole', 'adminAdjustPoints', 'deductPoints', '', null]) assert.notEqual(checkRewardOnlyAction(action, payload()), '');
  for (const invalid of [null, [], false]) assert.notEqual(checkRewardOnlyAction('storeAdjustCustomerPoints', invalid), '');
});

test('issue stores only hashed token keys with a bounded actor/customer receipt and 180-second TTL', async t => {
  const {env, writes, queries} = fixture(t);
  const before = Date.now();
  const result = await issueRewardScanToken(env, A, C);
  assert.match(result.rewardScanToken, /^rwd_[0-9a-f]{64}$/);
  assert(result.rewardScanExpiresAt >= before + 180000);
  assert(result.rewardScanExpiresAt <= Date.now() + 180000);
  assert.equal(writes.length, 1);
  assert.match(writes[0].key, /^reward_scan:v1:[0-9a-f]{64}$/);
  assert(!JSON.stringify(writes).includes(result.rewardScanToken));
  assert.deepEqual(writes[0].options, {expirationTtl: 180});
  const receipt = JSON.parse(writes[0].value);
  assert.deepEqual(Object.keys(receipt).sort(), ['actorId', 'customerId', 'expiresAt', 'issuedAt', 'version']);
  assert.equal(receipt.actorId, A);
  assert.equal(receipt.customerId, C);
  assert.equal(receipt.expiresAt - receipt.issuedAt, 180000);
  assert.deepEqual(queries[0].args, [A, A]);
  const second = await issueRewardScanToken(env, A, C);
  assert.notEqual(result.rewardScanToken, second.rewardScanToken);
  assert.notEqual(writes[0].key, writes[1].key);
});

test('validation permits bound reward requests and always rechecks the persisted role', async t => {
  const {env, queries} = fixture(t);
  const result = await issueRewardScanToken(env, A, C);
  const p = payload(result);
  await validateRewardScanToken(env, p);
  await validateRewardScanToken(env, p);
  assert.equal(queries.length, 3, 'issue and each validation query the authoritative role');
});

test('receipt cannot be used by a different actor or for another customer', async t => {
  const {env} = fixture(t);
  const result = await issueRewardScanToken(env, A, C);
  await assert.rejects(validateRewardScanToken(env, payload({...result, authenticatedUserId: B})), /驗證無效/);
  await assert.rejects(validateRewardScanToken(env, payload({...result, customerUserId: B})), /驗證無效/);
  await assert.rejects(validateRewardScanToken(env, payload({...result, authenticatedUserId: undefined, userId: A})), /重新登入/);
});

test('revocation, promotion and caller-supplied role flags never preserve reward-only permission', async t => {
  const {env, sql} = fixture(t);
  const result = await issueRewardScanToken(env, A, C);
  for (const role of ['user', 'admin', 'store', 'tenant', '', null]) {
    sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role, A);
    await assert.rejects(validateRewardScanToken(env, payload({...result, role: 'reward', authenticatedRole: 'reward'})), /未開放掃碼贈點/);
    await assert.rejects(issueRewardScanToken(env, A, C), /未開放掃碼贈點/);
  }
  sql.prepare('DELETE FROM users WHERE line_id=?').run(A);
  await assert.rejects(validateRewardScanToken(env, payload(result)), /未開放掃碼贈點/);
});

test('expired and malformed receipts fail even if KV has not removed them', async t => {
  const {env, records} = fixture(t);
  const result = await issueRewardScanToken(env, A, C);
  const [key, original] = records.entries().next().value;
  for (const override of [
    {issuedAt: Date.now() - 180001, expiresAt: Date.now() - 1},
    {issuedAt: Date.now() + 60000, expiresAt: Date.now() + 240000},
    {issuedAt: 'now'}, {expiresAt: Infinity}, {expiresAt: original.expiresAt + 1}, {version: 2}
  ]) {
    records.set(key, {...original, ...override});
    await assert.rejects(validateRewardScanToken(env, payload(result)), /驗證無效|已過期/);
  }
  records.clear();
  await assert.rejects(validateRewardScanToken(env, payload(result)), /驗證無效/);
});

test('valid scan receipt cannot authorize debit or product redemption payloads', async t => {
  const {env} = fixture(t);
  const result = await issueRewardScanToken(env, A, C);
  for (const extra of [{mode: 'redeem'}, {deductPoints: 100}, {productId: crypto.randomUUID()}, {qrToken: 'a'.repeat(64)}]) {
    await assert.rejects(validateRewardScanToken(env, payload({...result, ...extra})), /不可扣點/);
  }
});

test('missing bindings fail closed for issuing and validation', async t => {
  const {env} = fixture(t);
  for (const broken of [undefined, {}, {ACTMASTER_DB: env.ACTMASTER_DB}, {ACTMASTER_KV: env.ACTMASTER_KV}, {...env, ACTMASTER_DB: {}}, {...env, ACTMASTER_KV: {}}]) {
    await assert.rejects(issueRewardScanToken(broken, A, C), /暫時無法使用/);
    await assert.rejects(validateRewardScanToken(broken, payload()), /暫時無法使用/);
  }
});

test('invalid identities and forged scan tokens fail without creating receipts', async t => {
  const {env, writes} = fixture(t);
  for (const [actor, customer] of [[null, C], [A, '0912345678'], [A, 'https://example.test'], ['row-a', C], [A, {}]]) {
    await assert.rejects(issueRewardScanToken(env, actor, customer), /無法辨識/);
  }
  assert.equal(writes.length, 0);
  await assert.rejects(validateRewardScanToken(env, payload()), /驗證無效/);
  await assert.rejects(validateRewardScanToken(env, payload({rewardScanToken: 'rwd_' + 'x'.repeat(64)})), /重新掃描/);
});

test('binding read/write failures do not become permission or session fallbacks', async t => {
  const {env} = fixture(t);
  const result = await issueRewardScanToken(env, A, C);
  const brokenDB = {...env, ACTMASTER_DB: {prepare() {throw Error('private DB details');}}};
  await assert.rejects(issueRewardScanToken(brokenDB, A, C), /權限暫時無法確認/);
  await assert.rejects(validateRewardScanToken(brokenDB, payload(result)), /權限暫時無法確認/);
  const brokenRead = {...env, ACTMASTER_KV: {...env.ACTMASTER_KV, async get() {throw Error('private KV details');}}};
  await assert.rejects(validateRewardScanToken(brokenRead, payload(result)), /暫時無法使用/);
  const brokenWrite = {...env, ACTMASTER_KV: {...env.ACTMASTER_KV, async put() {throw Error('private KV details');}}};
  await assert.rejects(issueRewardScanToken(brokenWrite, A, C), /暫時無法使用/);
});
