const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cropper = fs.readFileSync(path.join(root, 'js', 'modules', 'cropper.js'), 'utf8');

function fail(message) {
  console.error('Own card upload contract failed:', message);
  process.exit(1);
}

if (!index.includes('名片酷請用來掃描客戶或合作夥伴')) {
  fail('card scan page must warn that Card Cool is for customers/partners');
}
if (!index.includes('window.openMyCardEntry ? window.openMyCardEntry(event)')) {
  fail('card scan page must offer a direct personal-card entry');
}
if (!index.includes('js/modules/cropper.js?v=7.14')) {
  fail('cropper.js cache-bust version must be bumped');
}

if (!/function looksLikeOwnCardUpload/.test(cropper)) {
  fail('general card upload must detect likely self-card scans');
}
if (!/function buildSelfProfileCardPayload/.test(cropper)) {
  fail('general card upload must be able to build a self_profile payload');
}
if (!cropper.includes("sourceType: 'self_profile'")) {
  fail('self-card reroute must save with sourceType self_profile');
}
if (!cropper.includes("'LINE ID': userId") || !cropper.includes('lineId: userId')) {
  fail('self-card reroute must bind the card to the current LINE user');
}
if (!cropper.includes("userId: ''")) {
  fail('normal Card Cool scan path must remain a non-owner CRM import');
}
if (!cropper.includes('window.confirm')) {
  fail('self-card reroute must ask before changing the save destination');
}

console.log('Own card upload contract passed.');
