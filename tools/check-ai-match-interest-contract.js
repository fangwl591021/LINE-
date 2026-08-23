const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migration = read('migrations/0026_ai_match_interests.sql');
const service = read('worker/match-interest.mjs');
const entry = read('worker-entry.mjs');
const matchmake = read('js/modules/matchmake.js');
const home = read('js/modules/home.js');
const index = read('index.html');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

function includesAll(source, needles, message) {
  const missing = needles.filter(needle => !source.includes(needle));
  ok(!missing.length, `${message}${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);
}

includesAll(migration, [
  'CREATE TABLE IF NOT EXISTS ai_match_interests',
  'sender_user_id TEXT NOT NULL',
  'target_card_row_id TEXT NOT NULL',
  'target_owner_user_id TEXT NOT NULL',
  'UNIQUE(sender_user_id, target_card_row_id)',
  'idx_ai_match_interests_target_owner'
], 'AI match interest migration is additive and unique per member and target');

includesAll(service, [
  "actor?.userId",
  "LOWER(COALESCE(visibility, '')) = 'public'",
  "LOWER(COALESCE(source_type, '')) = 'self_profile'",
  'CAST(COALESCE(pool_eligible, 0) AS INTEGER) = 1',
  "LOWER(COALESCE(ai_review_status, 'passed')) = 'passed'",
  'AI_MATCH_INTEREST_SELF_NOT_ALLOWED',
  'COUNT(DISTINCT i.sender_user_id)',
  'eligibleForAiInterest'
], 'service validates a public reviewed target, blocks self-interest, and returns only aggregate inbound count');
ok(!service.includes('payload?.userId'), 'service never trusts a sender user id from payload');
ok(!service.includes('payload?.senderUserId'), 'service never trusts a sender identity from payload');
ok(!service.includes('sender_user_id AS') && !service.includes('SELECT sender_user_id,'), 'summary never returns interested member identities');

includesAll(entry, [
  "import { MatchInterestModule } from './worker/match-interest.mjs'",
  'MATCH_INTEREST_ACTIONS',
  'authenticatedActor(request, payload || {}, env)',
  "action === 'toggleAiMatchInterest'",
  "action === 'getAiMatchInterestStates'",
  "action === 'getAiMatchInterestSummary'"
], 'Worker entry authenticates and dispatches all AI interest actions');

includesAll(matchmake, [
  "poolScope === 'public'",
  'data-ai-match-interest-card',
  'window.toggleAiMatchInterest',
  "window.fetchAPI('toggleAiMatchInterest'",
  "window.fetchAPI('getAiMatchInterestStates'",
  '對方只會看到人數'
], 'public AI results expose a private identity-safe interest toggle');

includesAll(index, [
  'id="home-ai-match-interest-summary"',
  'id="home-ai-match-interest-title"',
  'js/modules/matchmake.js?v=7.10',
  'js/modules/home.js?v=7.92'
], 'homepage includes a cache-busted AI interest summary');
includesAll(home, [
  "window.fetchAPI('getAiMatchInterestSummary'",
  '有 ' + "' + count + '" + ' 人對你感興趣',
  'eligibleForAiInterest',
  "window.matchmakePoolScope = 'public'",
  "params.get('simulateAiInterest')",
  'window.readActmasterInitialParams',
  'Math.min(99, Math.floor(raw))',
  'TONYFANG 模擬預覽，不影響真實關注數'
], 'homepage shows aggregate count or a safe eligibility prompt');
ok(!home.includes("window.fetchAPI('toggleAiMatchInterest', { targetCardRowId: 'TONYFANG'"), 'TONYFANG preview never creates an interest event');

console.log('\nAI match interest contract passed.');
