import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');
const start = source.indexOf('  async enrichPointRowsWithCashierLogs(');
const end = source.indexOf('  async resolvePointUserId(', start);
const tx = '11111111-1111-4111-8111-111111111111';
const otherTx = '22222222-2222-4222-8222-222222222222';
const owner = 'U' + 'a'.repeat(32);
const mother = (extra = {}) => ({id: '123', event_name: '店家消費折抵', event_content: `來源：測試店；消費 NT$100，折抵 10 點，應收 NT$90；交易：${tx}`, get_point: '-10', point_balance: '13250', created_at: '2026-09-16 21:57:34', ...extra});
const log = (extra = {}) => ({log_id: `SPC_${owner}_${tx}`, actor_user_id: owner, customer_point_user_id: owner, mode: 'redeem', amount: 100, points: -10, payable_amount: 90, created_at: '2026-09-16 13:57:35', point_response_json: JSON.stringify({pointResult: {data: {insert_id: 123, insert_row: {id: '123'}}}}), ...extra});
function fixture(logs) {
  const D1ReadModule = {
    text: (value, fallback = '') => value === undefined || value === null ? fallback : (String(value).trim() || fallback),
    all: async (_env, sql, args) => {assert.match(sql, /SELECT \*/);assert.match(sql, /WHERE customer_point_user_id = \? OR customer_user_id = \?/);assert.equal(args.join(','), `${owner},${owner}`);return logs;},
    findUserByIdentity: async () => ({user: {name: '測試店'}}),
    userRow: user => user
  };
  const methods = vm.runInNewContext('({' + source.slice(start, end) + '})', {D1ReadModule, fetch: () => {throw Error('No network or point writes allowed');}});
  const self = {...methods, ensureCashierLedgerTable: async () => true};
  return {self, read: rows => self.enrichPointRowsWithCashierLogs({ACTMASTER_DB: {}}, owner, rows)};
}
test('complete mother receipt and its local log display once; keep authoritative row unchanged', async () => {
  const row = Object.freeze(mother());
  const result = await fixture([log()]).read([row]);
  assert.equal(result.length, 1);assert.equal(result[0], row);assert.equal(result[0].created_at, '2026-09-16 21:57:34');
});
test('legacy receipt id matches without a transaction marker and can enrich a blank source', async () => {
  const result = await fixture([log({log_id: 'SPC_legacy'})]).read([mother({event_content: ''})]);
  assert.equal(result.length, 1);assert.equal(result[0].id, '123');assert.equal(result[0].point_balance, '13250');assert.match(result[0].event_content, /來源：測試店/);
});
test('exact transaction marker works without a saved mother receipt', async () => {
  assert.equal((await fixture([log({point_response_json: '{}'})]).read([mother()])).length, 1);
});
test('same amount and minute from different transactions are never collapsed', async () => {
  const a = mother(), b = mother({id: '456', event_content: mother().event_content.replace(tx, otherTx)});
  const second = log({log_id: `SPC_${owner}_${otherTx}`, point_response_json: JSON.stringify({pointResult: {data: {insert_id: 456}}})});
  const result = await fixture([log(), second]).read([a, b]);
  assert.equal(result.length, 2);assert.equal(result[0], a);assert.equal(result[1], b);
});
test('an unrelated blank-source row does not consume a log just because amount/time match', async () => {
  const result = await fixture([log()]).read([mother({id: '456', event_content: ''})]);
  assert.equal(result.length, 2);assert.equal(result.filter(row => row.localLedger).length, 1);assert.equal(result.find(row => row.id === '456').event_content, '');
});
test('conflicting receipt or transaction identifiers and amounts are not matched', async () => {
  for (const row of [mother({id: '456'}), mother({event_content: mother().event_content.replace(tx, otherTx)}), mother({get_point: '-20'})]) {
    assert.equal((await fixture([log()]).read([row])).length, 2);
  }
});
test('malformed legacy receipt is harmless and does not justify a fuzzy match', async () => {
  const result = await fixture([log({log_id: 'SPC_legacy', point_response_json: '{invalid'})]).read([mother({event_content: ''})]);
  assert.equal(result.length, 2);
});
test('local UTC timestamps become Taiwan wall time, including year rollover and explicit offsets', async () => {
  for (const [input, expected] of [
    ['2026-09-16 13:57:35', '2026-09-16 21:57:35'],
    ['2026-12-31 23:59:00', '2027-01-01 07:59:00'],
    ['2026-09-16T13:57:35Z', '2026-09-16 21:57:35'],
    ['2026-09-16T21:57:35+08:00', '2026-09-16 21:57:35'],
    ['invalid', 'invalid'], ['', '']
  ]) {
    const result = await fixture([log({created_at: input})]).read([mother({id: 'unrelated', event_content: '', get_point: 10})]);
    const local = result.find(row => row.localLedger);
    assert.equal(local.created_at, expected);assert.equal(local.createdAt, expected);
  }
});
test('sorting compares explicit instants with Taiwan wall time consistently', async () => {
  const result = await fixture([log()]).read([mother({id: 'unrelated', event_content: '', get_point: 10, created_at: '2026-09-16T14:00:00Z'})]);
  assert.equal(result[0].id, 'unrelated');assert.equal(result[1].created_at, '2026-09-16 21:57:35');
});
test('empty lists and unavailable D1 retain existing behavior', async () => {
  const {read, self} = fixture([]), rows = [mother()];
  assert.equal(await read(rows), rows);assert.equal((await read([])).length, 0);
  assert.equal(await self.enrichPointRowsWithCashierLogs({}, owner, rows), rows);
});
test('real queryUserPoints still uses the mother balance, never the display list total', async () => {
  const {self} = fixture([log()]);
  Object.assign(self, {
    pointApiKey: () => 'synthetic', resolvePointUserId: async () => owner, resolvePointUserIds: async () => [owner],
    number: value => Number(value) || 0, latestBalance: rows => Number(rows[0].point_balance), balancesByType: () => ({gift_money: 13250}),
    fetchPointPage: async () => ({data: {data: {list: [mother()], pagination: {total_pages: 1, total: 1}}}})
  });
  const result = await self.queryUserPoints({userId: owner, point_type: 'gift_money'}, {ACTMASTER_DB: {}});
  assert.equal(result.success, true);assert.equal(result.data.balance, 13250);assert.equal(result.data.list.length, 1);assert.equal(result.data.list[0].get_point, '-10');
});
