import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const uid = suffix => `U${suffix.repeat(32)}`;

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(`CREATE TABLE point_awards (
    award_id TEXT PRIMARY KEY, user_id TEXT, card_id TEXT, award_type TEXT,
    points INTEGER, point_type TEXT, status TEXT, response_json TEXT, updated_at TEXT,
    UNIQUE(user_id, card_id, award_type)
  )`);
  const db = { prepare(query) {
    return { bind(...values) { return {
      async run() { return { meta: { changes: sql.prepare(query).run(...values).changes } }; },
      async first() { return sql.prepare(query).get(...values); }
    }; } };
  } };
  const credits = [];
  const points = {
    ensureAwardTable: async () => {},
    resolvePointUserId: async (_env, id) => id,
    ensureMotherLineMember: async () => ({ success: true }),
    insertUserPoint: async payload => { credits.push(payload); return { success: true, data: {} }; }
  };
  const scope = { PointModule: points, D1ReadModule: { first: (env, query, args) => env.ACTMASTER_DB.prepare(query).bind(...args).first() } };
  const methods = vm.runInNewContext('({' +
    extract('  followAwardPoints(env)', '  async ensureLineOAPointBinding') +
    extract('  async awardLineOAFollowPoints', '  async handleFollowPointOnboarding') +
    '})', scope);
  methods.text = String;
  return { sql, db, credits, methods };
}

test('follow reward uses 600 by default and configured deployment amount', t => {
  const f = fixture(t);
  assert.match(config, /^LINE_OA_FOLLOW_POINTS\s*=\s*"600"\s*$/m);
  assert.equal(f.methods.followAwardPoints({}), 600);
  assert.equal(f.methods.followAwardPoints({ LINE_OA_FOLLOW_POINTS: '600' }), 600);
  assert.equal(f.methods.followAwardPoints({ POINT_FOLLOW_POINTS: '300' }), 300);
  assert.equal(f.methods.followAwardPoints({ LINE_OA_FOLLOW_POINTS: '0' }), 0);
});

test('new follow is credited once; old sent and queued 300 stay untouched', async t => {
  const f = fixture(t);
  const insert = f.sql.prepare("INSERT INTO point_awards VALUES (?, ?, 'line_oa_follow', 'line_oa_follow', 300, 'gift_money', ?, '{}', CURRENT_TIMESTAMP)");
  insert.run('old-sent', uid('a'), 'sent');
  insert.run('old-pending', uid('b'), 'pending_sync');
  const env = { ACTMASTER_DB: f.db, LINE_OA_FOLLOW_POINTS: '600' };
  await Promise.all([f.methods.awardLineOAFollowPoints(env, uid('c')), f.methods.awardLineOAFollowPoints(env, uid('c'))]);
  await f.methods.awardLineOAFollowPoints(env, uid('a'));
  await f.methods.awardLineOAFollowPoints(env, uid('b'));
  assert.equal(f.credits.length, 1);
  assert.equal(f.credits[0].points, 600);
  assert.equal(f.credits[0].pointType, 'gift_money');
  assert.deepEqual(f.sql.prepare('SELECT award_id, points, status FROM point_awards WHERE award_id LIKE ? ORDER BY award_id').all('old-%').map(row => ({ ...row })), [
    { award_id: 'old-pending', points: 300, status: 'pending_sync' },
    { award_id: 'old-sent', points: 300, status: 'sent' }
  ]);
});

test('a legacy queued follow sends its saved 300 amount after the rule changes', async () => {
  const sent = [];
  const sync = vm.runInNewContext('({' + extract('  async processJob(job, env)', '  async process(payload, env)') + '})', {
    PointModule: { insertUserPoint: async payload => { sent.push(payload); return { success: true, data: {} }; } }
  });
  Object.assign(sync, {
    number: Number, text: String, eventName: () => 'follow', eventContent: () => 'follow',
    updateJob: async () => {}
  });
  const result = await sync.processJob({ jobId: 'old-job', lineUserId: uid('a'), source: 'line_oa_follow', points: 300 }, { LINE_OA_FOLLOW_POINTS: '600' });
  assert.equal(result.success, true);
  assert.equal(sent[0].points, 300);
  assert.equal(sent[0].requireConfirmedResult, true);
});
