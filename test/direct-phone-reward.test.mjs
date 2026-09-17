import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {runCashierRequest} from '../worker/store-cashier-requests.mjs';

const source = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');
const start = source.indexOf('  async ensureCashierLedgerTable(env) {');
const end = source.indexOf('  async listStorePointCashierLogs(payload, env) {', start);
assert(start > 0 && end > start, 'extract the actual ledger and point mutation methods');
const A = 'U' + 'a'.repeat(32), C = 'U' + 'c'.repeat(32);
const payload = extra => ({authenticatedUserId: A, customerUserId: C, mode: 'reward', amount: 25,
  rewardPoints: 25, deductPoints: 0, requestId: crypto.randomUUID(), transactionId: crypto.randomUUID(), ...extra});

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0030_store_cashier_requests.sql', import.meta.url), 'utf8'));
  t.after(() => sql.close());
  const env = {ACTMASTER_DB: {prepare(query) {
    const statement = args => ({
      bind(...values) { return statement(values); },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return {results: sql.prepare(query).all(...args)}; },
      async run() { return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}}; }
    });
    return statement([]);
  }}};
  const writes = [], preparations = [];
  const point = vm.runInNewContext('({' + source.slice(start, end) + '})', {
    D1ReadModule: {
      text: value => String(value || '').trim(),
      async findUserByIdentity() { return {user: {name: 'Test Gifting Unit'}}; },
      userRow: row => row
    }
  });
  point.resolveStorePointCustomer = async () => ({customerPointUserId: C, user: {name: 'Test Member'}});
  point.ensureLocalPointWallet = async () => { preparations.push('local-wallet'); return {success: true}; };
  point.loadStorePointCashierSession = async () => ({balance: 500, motherReady: true, customerPointSource: 'mother'});
  point.queryUserPoints = async () => { throw Error('Unexpected wallet request'); };
  point.ensureMotherLineMember = async () => { throw Error('Unexpected membership request'); };
  point.insertUserPoint = async data => { writes.push(structuredClone(data)); return {success: true, data: {accepted: true}}; };
  const resolve = async () => ({customerPointUserId: C});
  const execute = (safe, before, product) => point.storeAdjustCustomerPoints(safe, env, before, product);
  return {sql, env, point, writes, preparations, resolve, execute};
}

test('direct phone gift executes real point handler and records no purchase or sales revenue', async t => {
  const {sql, env, writes, resolve, execute} = fixture(t), p = payload();
  const result = await runCashierRequest(p, env, resolve, execute);
  assert.equal(result.success, true, result.error);
  assert.equal(result.transactionStatus, 'succeeded');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].userId, C);
  assert.equal(writes[0].points, 25);
  assert.equal(writes[0].eventName, '店家贈送點數');
  assert.match(writes[0].eventContent, /來源：Test Gifting Unit；贈送 25 點；交易：/);
  assert.doesNotMatch(writes[0].eventContent, /消費|NT\$|1:1|應收/);
  assert.match(writes[0].shop_remark, /amount=0; mode=reward; rewardPoints=25/);
  assert.equal(writes[0].skipMotherMemberSetup, true);
  assert.equal(writes[0].requireConfirmedResult, true);
  const row = sql.prepare('SELECT * FROM store_point_cashier_logs').get();
  assert.equal(row.mode, 'reward');
  assert.equal(row.amount, 0);
  assert.equal(row.payable_amount, 0);
  assert.equal(row.points, 25);
  assert.equal(row.balance_before, 500);
  assert.equal(row.balance_after_estimate, 525);
  assert.equal(JSON.parse(row.point_response_json).rewardPoints, 25);
  assert.equal(result.data.amount, 0);
  assert.equal(result.data.payableAmount, 0);
  assert.equal(result.data.rewardPoints, 25);
  assert.equal(result.data.changedPoints, 25);
  assert.equal(result.data.requestedDeduction, 0);
  assert.equal(result.data.operatorFee, 0);
  assert.equal(result.data.balanceAfterEstimate, 525);
  const replay = await runCashierRequest(p, env, resolve, execute);
  assert.equal(JSON.stringify(replay), JSON.stringify(result));
  assert.equal(writes.length, 1, 'replaying the same receipt never grants twice');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM store_point_cashier_logs').get().n, 1);
});

test('actual point handler rejects invalid direct gift markers before wallet preparation or writes', async t => {
  const {env, point, preparations, writes} = fixture(t);
  for (const extra of [
    {rewardPoints: -1}, {rewardPoints: 0}, {rewardPoints: 1.5}, {rewardPoints: '25'},
    {rewardPoints: null}, {rewardPoints: NaN}, {rewardPoints: Infinity}, {rewardPoints: true},
    {rewardPoints: 1000001, amount: 1000001}, {amount: 26}, {amount:25.5},
    {mode: 'redeem'}, {mode: 'add'}, {mode: 'earn'}, {deductPoints: 1}, {deductPoints: '0'},
    {deductPoints: undefined}, {productId: crypto.randomUUID()}, {qrToken: 'f'.repeat(64)}
  ]) {
    const result = await point.storeAdjustCustomerPoints(payload(extra), env, async () => {});
    assert.equal(result.success, false, JSON.stringify(extra));
  }
  assert.equal((await point.storeAdjustCustomerPoints(payload(), env, async () => {}, {title: 'Product'})).success, false);
  assert.deepEqual(preparations, []);
  assert.deepEqual(writes, []);
});

test('direct gift valid limits remain exact integers without conversion to spend', async t => {
  const {env, point, writes} = fixture(t);
  for (const points of [1, 1000000]) {
    const result = await point.storeAdjustCustomerPoints(payload({rewardPoints: points, amount: points}), env, async actual => assert.equal(actual, C));
    assert.equal(result.success, true, result.error);
    assert.equal(result.data.points, points);
    assert.equal(result.data.rewardPoints, points);
    assert.equal(result.data.amount, 0);
    assert.equal(result.data.payableAmount, 0);
  }
  assert.deepEqual(writes.map(row => row.points), [1, 1000000]);
});

test('direct gift preserves mandatory write-boundary guard and failure does not record a successful ledger', async t => {
  const {env, point, writes, sql} = fixture(t);
  assert.equal((await point.storeAdjustCustomerPoints(payload(), env)).success, false);
  await assert.rejects(point.storeAdjustCustomerPoints(payload(), env, async () => { throw Error('revoked before write'); }), /revoked before write/);
  assert.deepEqual(writes, []);
  point.insertUserPoint = async () => ({success: false, error: 'provider refused'});
  assert.equal((await point.storeAdjustCustomerPoints(payload(), env, async () => {})).success, false);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='store_point_cashier_logs'").get().n, 0);
});

test('direct gift lost provider response keeps same-request replay and new attempts locked without a second gift', async t => {
  const {env, point, writes, resolve, execute, sql} = fixture(t), p = payload();
  point.insertUserPoint = async data => { writes.push(data); throw Error('provider response lost'); };
  const result = await runCashierRequest(p, env, resolve, execute);
  assert.equal(result.transactionStatus, 'unknown');
  assert.equal(writes.length, 1);
  assert.equal((await runCashierRequest(p, env, resolve, execute)).transactionStatus, 'unknown');
  assert.equal((await runCashierRequest(payload(), env, resolve, execute)).success, false);
  assert.equal(writes.length, 1);
  assert.equal(sql.prepare('SELECT status FROM store_cashier_requests').get().status, 'unknown');
});

test('legacy consumption rewards and redemptions keep their names, calculation and sale amounts', async t => {
  const {env, point, writes, sql} = fixture(t);
  for (const [mode, deduction, points, payable, eventName] of [
    ['reward', 0, 100, 100, '店家消費贈點'], ['redeem', 10, -10, 90, '店家消費折抵']
  ]) {
    const p = payload({mode, amount: 100, deductPoints: deduction});
    delete p.rewardPoints;
    const result = await point.storeAdjustCustomerPoints(p, env, async actual => assert.equal(actual, C));
    assert.equal(result.success, true, result.error);
    assert.equal(result.data.amount, 100);
    assert.equal(result.data.payableAmount, payable);
    assert.equal(result.data.points, points);
    assert.equal(result.data.rewardPoints, undefined);
    assert.equal(result.data.eventName, eventName);
    assert.match(result.data.eventContent, /消費 NT\$100/);
    const row = sql.prepare('SELECT * FROM store_point_cashier_logs WHERE log_id=?').get(result.data.ledgerId);
    assert.equal(row.amount, 100);
    assert.equal(row.payable_amount, payable);
    assert.equal(row.points, points);
    assert.equal(JSON.parse(row.point_response_json).rewardPoints, undefined);
  }
  assert.deepEqual(writes.map(row => row.points), [100, -10]);
});
