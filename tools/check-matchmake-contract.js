const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const matchmake = fs.readFileSync(path.join(root, 'js', 'modules', 'matchmake.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function fail(message) {
  console.error('Matchmake contract failed:', message);
  process.exit(1);
}

if (!index.includes('match-pool-own') || !index.includes('match-pool-public')) {
  fail('matchmaking UI must expose own and public pool modes');
}
if (!index.includes('match-public-toggle-wrap')) {
  fail('public visibility toggle must be wrapped so own pool can hide it');
}

if (!matchmake.includes('window.matchmakePoolScope') || !matchmake.includes('window.setMatchmakePoolScope')) {
  fail('front-end must track and switch matchmaking pool scope');
}
if (!matchmake.includes("toggleWrap.classList.toggle('hidden', scope !== 'public')")) {
  fail('own pool must hide the public visibility toggle');
}
if (!matchmake.includes('個人配對池') || !matchmake.includes('參與公開交流池')) {
  fail('matchmaking UI labels must change with pool scope');
}

const startMatch = matchmake.match(/window\.startMatchmaking\s*=\s*async function[\s\S]*?\n\};/);
if (!startMatch) fail('startMatchmaking function not found');
if (!startMatch[0].includes('poolScope: poolScope')) {
  fail('startMatchmaking must send poolScope to the Worker');
}
if (/contacts:\s*pool\.map/.test(startMatch[0])) {
  fail('front-end must not decide the public matchmaking pool');
}

if (!worker.includes('async loadMatchmakingPool')) {
  fail('Worker must load matchmaking pools server-side');
}
if (!worker.includes("payload.poolScope === 'public' ? 'public' : 'own'")) {
  fail('Worker must normalize poolScope to own or public');
}
if (!worker.includes("LOWER(COALESCE(source_type,'')) <> 'referral_placeholder'")) {
  fail('own pool must exclude referral placeholders');
}
if (!worker.includes("LOWER(COALESCE(visibility,'')) = 'public'") ||
    !worker.includes("LOWER(COALESCE(source_type,'')) = 'self_profile'") ||
    !worker.includes('CAST(COALESCE(pool_eligible, 0) AS INTEGER) = 1')) {
  fail('public pool must require public self_profile pool eligibility');
}

console.log('Matchmake contract passed.');
