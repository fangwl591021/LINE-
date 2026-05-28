const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const cardmaster = fs.readFileSync(path.join(root, 'js', 'modules', 'cardmaster.js'), 'utf8');

function fail(message) {
  console.error('Cardmaster public readiness contract failed:', message);
  process.exit(1);
}

[
  'function validateCardPublicReadiness',
  'function isPlaceholderImage',
  'function isValidPublicButton',
  'window.validateCardPublicReadiness = validateCardPublicReadiness',
  '公開交流池需要先通過 AI 體檢',
  '圖片',
  '標題',
  '說明',
  '按鈕'
].forEach((needle) => {
  if (!cardmaster.includes(needle)) fail(`missing public readiness guard: ${needle}`);
});

if (!/desc\.length\s*<\s*8/.test(cardmaster)) {
  fail('description must have a minimum useful length before public opt-in');
}
if (!/buttons\.some\(function\(button\)\s*\{\s*return !isValidPublicButton\(button\);/.test(cardmaster)) {
  fail('all configured buttons must have valid label and URI');
}
if (!/reviewCard\(card,\s*\{\s*render:\s*true\s*\}\)/.test(cardmaster)) {
  fail('public opt-in must still run AI review after readiness checks');
}

console.log('Cardmaster public readiness contract passed.');
