const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const mycard = fs.readFileSync(path.join(root, 'js', 'modules', 'mycard.js'), 'utf8');

function fail(message) {
  console.error('My card entry contract failed:', message);
  process.exit(1);
}

if (!index.includes('onclick="window.openMyCardEntry(event)"')) {
  fail('my card summary must open the direct entry handler');
}
if (!index.includes('js/modules/mycard.js?v=8.50')) {
  fail('mycard.js cache-bust version must be bumped');
}
if (!index.includes('js/auth.js?v=10.31')) {
  fail('auth.js cache-bust version must be bumped');
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
if (/bindOnce\(document,\s*['"]click['"],\s*['"]#btn-save-my-ecard['"]/.test(mycard)) {
  fail('personal card save button must not be bound twice');
}
if (!/dataset\.myEcardSaving/.test(mycard)) {
  fail('personal card save must guard against duplicate submissions');
}
if (!mycard.includes('copyMyCardUrlVariant') || !mycard.includes('網址取用資訊')) {
  fail('WYSIWYG editor must expose copy labels for card URLs');
}
if (!mycard.includes('三按鈕操作') || !mycard.includes('傳送操作') || !mycard.includes('分享操作') || !mycard.includes('WEB版網址')) {
  fail('WYSIWYG editor must include all four URL copy labels');
}
if (!mycard.includes('webCardId=') || !mycard.includes('appendSendMode(baseUrl)') || !mycard.includes('appendShareMode(baseUrl)')) {
  fail('copy URL variants must separate WEB display, current chat send, and LINE picker share');
}
if (!auth.includes('renderStandaloneWebCardPage') || !auth.includes("initialUrlParams.get('webCardId')") || !auth.includes('handleAutoSendCardEntry') || !auth.includes('liff.sendMessages')) {
  fail('WEB card URL must render without LIFF login');
}

console.log('My card entry contract passed.');
