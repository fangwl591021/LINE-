import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {runCashierRequest} from '../worker/store-cashier-requests.mjs';
import {isRewardOnlyRole} from '../worker/reward-only-cashier.mjs';

const source = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');
const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), C = 'U' + 'c'.repeat(32);
const PHONE = '0912345678'; // Synthetic only; never connect these tests to production.
const object = name => {
  const found = source.match(new RegExp(`^const ${name} = \\{[\\s\\S]*?^\\};`, 'm'));
  assert.ok(found, name);
  return found[0];
};
const section = (start, end) => {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, start);
  return source.slice(first, last);
};

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(row_id TEXT, line_id TEXT PRIMARY KEY, name TEXT DEFAULT '',
    phone TEXT DEFAULT '', role TEXT DEFAULT 'user', point_line_id TEXT DEFAULT '',
    legacy_line_id TEXT DEFAULT '', identity_source TEXT DEFAULT '');
    CREATE TABLE user_identity_links(id INTEGER PRIMARY KEY, old_line_id TEXT, new_line_id TEXT,
    status TEXT, updated_at TEXT);
    CREATE TABLE card_contacts(row_id TEXT, line_id TEXT, profile_user_id TEXT, claimed_by_uid TEXT,
    name TEXT, mobile TEXT, office_phone TEXT, updated_at TEXT, created_at TEXT, source_type TEXT);`);
  sql.exec(readFileSync(new URL('../migrations/0030_store_cashier_requests.sql', import.meta.url), 'utf8'));
  t.after(() => sql.close());
  const effects = [], dbWrites = [], sessions = [];
  const env = {ACTMASTER_DB: {prepare(query) {
    const stmt = args => ({
      bind(...values) { return stmt(values); },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return {results: sql.prepare(query).all(...args)}; },
      async run() {
        dbWrites.push(query);
        return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}};
      }
    });
    return stmt([]);
  }}, ACTMASTER_KV: {async put(key, value, options) { effects.push('kv-put'); sessions.push({key, value, options}); }}};
  const context = vm.createContext({crypto, TextEncoder, URL, Date, console, isRewardOnlyRole,
    fetch: async () => { throw Error('Unexpected external API'); }});
  vm.runInContext([object('ACTION_POLICIES'), object('SecurityModule'), object('D1ReadModule'),
    'globalThis.read = D1ReadModule;', 'globalThis.point = {' + [
      section('  async resolvePointUserId(env, userId) {', '  async resolvePointUserIds(env, userId) {'),
      section('  async findCustomerByPhone(env, phoneRaw) {', '  async resolveStorePointCustomer(env, rawCustomerId) {'),
      section('  async resolveStorePointCustomer(env, rawCustomerId) {', '  async ensureCashierLedgerTable(env) {')
    ].join('\n') + '};'].join('\n'), context);
  const {point, read} = context;
  // Actual identity/phone SQL above is used; external wallet work is isolated.
  read.cardByIdentity = async () => null;
  point.queryPointBalanceFast = async payload => {
    effects.push(['wallet', payload.pointUserId]);
    return {success: true, data: {balance: 350}};
  };
  point.ensureLocalPointWallet = async (_env, id) => {
    effects.push(['index', id]);
    return {success: true};
  };
  point.ensureMotherLineMember = async payload => {
    effects.push(['mother-member', payload.LINE_user_id]);
    return {success: true};
  };
  point.number = value => Number(value || 0);
  point.motherRegistrationUrl = () => '';
  context.AdminPointModule = {async localBalance() { return 0; }};
  const member = (id = B, phone = PHONE, pointsId = '') => sql.prepare(
    'INSERT INTO users(row_id,line_id,name,phone,point_line_id) VALUES(?,?,?,?,?)'
  ).run(id, id, 'Synthetic member', phone, pointsId);
  const repair = phone => sql.prepare(
    'INSERT INTO users(row_id,line_id,name,point_line_id,identity_source) VALUES(?,?,?,?,?)'
  ).run(phone, phone, '未命名用戶', phone, 'store_point_wallet_repair');
  const lookup = (raw = PHONE, role = 'store') => point.getStorePointCustomer(
    {customerUserId: raw, authenticatedUserId: A, authenticatedRole: role}, env
  );
  return {sql, env, point, read, context, effects, dbWrites, sessions, member, repair, lookup};
}

for (const role of ['store', 'admin', 'redeem', 'reward']) {
  test(`${role} rejects an unmatched or phone-keyed repair identity before wallet work`, async t => {
    const f = fixture(t);
    for (const repaired of [false, true]) {
      if (repaired) f.repair(PHONE);
      for (const raw of [PHONE, '0912－345－678', '+886 912 345 678']) {
        const result = await f.lookup(raw, role);
        assert.equal(result.success, false);
        assert.match(result.error, /查無已綁定.*會員錢包 QR/);
        assert.equal(result.data, undefined, 'no phantom balance or canAdjust');
      }
    }
    assert.deepEqual(f.effects, []);
    assert.deepEqual(f.dbWrites, []);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM users').get().n, 1,
      'existing repair row remains untouched and no additional user is created');
  });
}

test('a phone-valued point mapping is rejected even when the profile has a valid LINE UID', async t => {
  const f = fixture(t);
  f.member(B, PHONE, PHONE);
  const result = await f.lookup();
  assert.equal(result.success, false);
  assert.deepEqual(f.effects, []);
  assert.deepEqual(f.dbWrites, []);
  assert.equal(f.sql.prepare('SELECT point_line_id FROM users').get().point_line_id, PHONE,
    'lookup never silently rewrites an identity mapping');
});

test('normal phones, formatted phones, country codes and UID QR targets keep the same member wallet', async t => {
  const f = fixture(t);
  f.member();
  for (const role of ['store', 'admin', 'redeem', 'reward']) {
    for (const raw of [PHONE, '0912-345-678', '(0912) 345 678', '+886 912 345 678', B]) {
      const result = await f.lookup(raw, role);
      assert.equal(result.success, true, result.error);
      assert.equal(result.data.customerPointUserId, B);
      assert.equal(result.data.canAdjust, true);
      assert.equal(result.data.balance, 350);
    }
  }
  assert.ok(f.effects.length > 0);
  assert.ok(f.effects.every(([, id]) => id === B));
  assert.deepEqual(f.dbWrites, []);
});

test('an existing verified phone-to-UID link is honored without creating or changing mappings', async t => {
  const f = fixture(t);
  f.member(B, '');
  f.sql.prepare('INSERT INTO user_identity_links VALUES(?,?,?,?,?)').run(1, PHONE, B, 'active', '2026-10-08');
  const result = await f.lookup();
  assert.equal(result.success, true, result.error);
  assert.equal(result.data.customerPointUserId, B);
  assert.ok(f.effects.every(([, id]) => id === B));
  assert.deepEqual(f.dbWrites, []);
});

test('valid legacy UID and explicit point UID mapping remain authoritative', async t => {
  const f = fixture(t);
  f.member(B, PHONE, C);
  f.sql.prepare('UPDATE users SET legacy_line_id=? WHERE line_id=?').run(A, B);
  for (const raw of [PHONE, A, B]) {
    const result = await f.lookup(raw);
    assert.equal(result.success, true, result.error);
    assert.equal(result.data.customerPointUserId, C);
  }
  assert.ok(f.effects.every(([, id]) => id === C));
  assert.deepEqual(f.dbWrites, []);
});

test('unbound cards and distinct members sharing a phone never acquire a wallet or automatic binding', async t => {
  const f = fixture(t);
  f.sql.prepare('INSERT INTO card_contacts(row_id,name,mobile) VALUES(?,?,?)').run('unbound-card', 'Unbound', PHONE);
  const unbound = await f.lookup();
  assert.equal(unbound.success, true);
  assert.equal(unbound.data.needsBinding, true);
  assert.equal(unbound.data.canAdjust, false);
  assert.equal(unbound.data.balance, null);
  assert.equal(unbound.data.canAutoBindPointAccount, false);
  f.member(B);
  f.member(C);
  const ambiguous = await f.lookup();
  assert.equal(ambiguous.success, false);
  assert.match(ambiguous.error, /多筆/);
  assert.deepEqual(f.effects, []);
  assert.deepEqual(f.dbWrites, []);
});

test('keyword candidates never advertise a phone-keyed identity as an adjustable member', async t => {
  const f = fixture(t);
  f.point.findStorePointCustomerCandidates = async () => ({matches: [
    {id: PHONE, kind: 'user', name: 'Repair'}, {id: B, kind: 'user', name: 'Member'}
  ]});
  const result = await f.lookup('Synthetic name');
  assert.equal(result.data.needsSelection, true);
  assert.equal(result.data.candidates[0].customerPointUserId, '');
  assert.equal(result.data.candidates[0].needsBinding, true);
  assert.equal(result.data.candidates[0].canAdjust, false);
  assert.equal(result.data.candidates[1].customerPointUserId, B);
  assert.equal(result.data.candidates[1].canAdjust, true);
  assert.deepEqual(f.effects, []);
});

test('lookup and session preparation defensively reject an invalid resolver result before side effects', async t => {
  const f = fixture(t);
  f.point.resolveStorePointCustomer = async () => ({customerPointUserId: PHONE});
  assert.equal((await f.lookup()).success, false);
  const session = await f.point.prepareStorePointCashierSession({authenticatedUserId: A, customerUserId: PHONE}, f.env);
  assert.equal(session.success, false);
  assert.match(session.error, /會員錢包 QR/);
  assert.deepEqual(f.effects, []);
  assert.deepEqual(f.dbWrites, []);
});

test('valid member session keeps the existing mother preparation and 180-second KV channel', async t => {
  const f = fixture(t);
  f.member();
  const result = await f.point.prepareStorePointCashierSession({authenticatedUserId: A, customerUserId: PHONE}, f.env);
  assert.equal(result.success, true, result.error);
  assert.equal(result.data.customerPointUserId, B);
  assert.equal(result.data.cashierReady, true);
  assert.deepEqual(f.effects, [['wallet', B], ['mother-member', B], 'kv-put']);
  assert.equal(f.sessions[0].options.expirationTtl, 180);
  assert.equal(JSON.parse(f.sessions[0].value).customerPointUserId, B);
  assert.deepEqual(f.dbWrites, []);
});

test('unmatched phone sent directly to the real cashier boundary is rejected before any transaction or points write', async t => {
  const f = fixture(t);
  f.repair(PHONE);
  const result = await runCashierRequest({authenticatedUserId: A, requestId: crypto.randomUUID(),
    customerUserId: PHONE, mode: 'reward', amount: 25, rewardPoints: 25, deductPoints: 0},
  f.env, raw => f.point.resolveStorePointCustomer(f.env, raw), async () => {
    throw Error('Invalid phone reached point transfer');
  });
  assert.equal(result.transactionStatus, 'rejected');
  assert.match(result.error, /會員錢包 QR/);
  assert.deepEqual(f.effects, []);
  assert.deepEqual(f.dbWrites, []);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM store_cashier_requests').get().n, 0);
});
