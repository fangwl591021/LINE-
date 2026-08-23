const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('migrations/0027_incremental_matchmaking_cache.sql');
const worker = read('workerbackup.js');
const frontend = read('js/modules/matchmake.js');
const index = read('index.html');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

[
  'CREATE TABLE IF NOT EXISTS ai_match_pair_cache',
  'requester_user_id TEXT NOT NULL',
  'pool_scope TEXT NOT NULL',
  'intent_hash TEXT NOT NULL',
  'candidate_card_row_id TEXT NOT NULL',
  'candidate_version TEXT NOT NULL',
  'PRIMARY KEY (requester_user_id, pool_scope, intent_hash, candidate_card_row_id)'
].forEach(value => ok(migration.includes(value), `incremental migration includes ${value}`));
ok(!/INSERT\s+INTO\s+ai_match_pair_cache/i.test(migration), 'migration never seeds production match data');

[
  'async matchmakingDigest(value)',
  'matchmakingCandidateSnapshot(contact)',
  'loadIncrementalMatchCache',
  'saveIncrementalMatchCache',
  "version: 'incremental-v1'",
  'const pendingContacts = pending.map(item => item.contact)',
  'const contactsList = pendingContacts.map',
  'cached: true',
  'aiUsed: false',
  "SecurityModule.checkRateLimit(requesterUserId, 'matchmakeContacts'",
  'await env.ACTMASTER_DB.batch(statements)'
].forEach(value => ok(worker.includes(value), `Worker incremental matchmaking includes ${value}`));
ok(!worker.includes("const aiActions = ['recognizeCardWithGPT4o', 'matchmakeContacts'"), 'cache hits bypass the global AI rate limiter');
ok(worker.includes('LOWER(COALESCE(ai_review_status, \'passed\')) = \'passed\''), 'public pool is revalidated before cache reuse');

ok(!frontend.includes('if (currentUsage >= limit)'), 'frontend allows the Worker to return a free cache hit');
ok(frontend.includes('res?.aiUsed !== false'), 'frontend only counts a real AI run');
ok(frontend.includes('本次未啟動 AI'), 'frontend explains reused results');
ok(index.includes('js/modules/matchmake.js?v=7.12'), 'incremental frontend is cache-busted');

console.log('\nIncremental matchmaking contract passed.');
