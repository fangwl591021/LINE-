const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function fail(message) {
  console.error('Check-in display contract failed:', message);
  process.exit(1);
}

const claimMatch = auth.match(/window\.claimDailyPointCheckin\s*=\s*async function[\s\S]*?\n\};/);
if (!claimMatch) fail('claimDailyPointCheckin function not found');
const claim = claimMatch[0];

if (claim.includes("'已簽到'") || claim.includes('"已簽到"')) {
  fail('daily check-in button must not show 已簽到');
}
if (!claim.includes('\\u5df2\\u8d08\\u9001') || !claim.includes('showPointAwardCelebration')) {
  fail('daily check-in success must show awarded points with popup/toast');
}
if (!/btn\.disabled\s*=\s*false/.test(claim)) {
  fail('daily check-in button should be restored instead of left disabled');
}
if (!claim.includes('oldHtml') || !claim.includes('btn.innerHTML = oldHtml')) {
  fail('daily check-in button must restore original innerHTML');
}
if (/btn\.textContent\s*=\s*oldText/.test(claim)) {
  fail('daily check-in button must not restore with textContent only');
}
if (!index.includes('js/auth.js?v=10.28')) {
  fail('auth.js cache-bust version must be bumped');
}

console.log('Check-in display contract passed.');
