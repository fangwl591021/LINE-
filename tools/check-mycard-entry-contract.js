const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mycard = fs.readFileSync(path.join(root, 'js', 'modules', 'mycard.js'), 'utf8');

function fail(message) {
  console.error('My card entry contract failed:', message);
  process.exit(1);
}

if (!index.includes('onclick="window.openMyCardEntry(event)"')) {
  fail('my card summary must open the direct entry handler');
}
if (!index.includes('js/modules/mycard.js?v=8.37')) {
  fail('mycard.js cache-bust version must be bumped');
}
if (index.includes('編輯名片詳細文字資料')) {
  fail('duplicate detail-edit button must be removed');
}
if (!/async function openMyCardEntry/.test(mycard) || !/window\.openMyCardEntry = openMyCardEntry/.test(mycard)) {
  fail('openMyCardEntry must be implemented and exported');
}
if (!/currentCardData[\s\S]*window\.openCardDetail\(currentCardData\)/.test(mycard)) {
  fail('existing personal card must route directly to detail editor');
}
if (!/await load\(\);\s*await openMyCardDetail\(\);/.test(mycard)) {
  fail('newly generated personal card must continue directly into detail editor');
}

console.log('My card entry contract passed.');
