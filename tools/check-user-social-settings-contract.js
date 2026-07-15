const fs = require('fs');
const path = require('path');
const { assertCacheBust } = require('./check-cache-bust-contract');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');

function fail(message) {
  console.error(`User social settings contract failed: ${message}`);
  process.exit(1);
}

try {
  assertCacheBust('js/auth.js');
} catch (e) {
  fail(e.message);
}

if (!auth.includes('window.saveUserSettings = async function(event)')) {
  fail('saveUserSettings must be defined for social and Telegram settings buttons');
}

if (!auth.includes("window.fetchAPI('updateUserProfile'")) {
  fail('saveUserSettings must persist through updateUserProfile');
}

if (!auth.includes('user-social-row')) {
  fail('social link rows must use the mobile stacked row layout');
}

if (!auth.includes('user-social-url w-full')) {
  fail('social URL input must use a full-width independent row');
}

if (!auth.includes('PROFILE_AVATAR')) {
  fail('saveUserSettings must preserve hidden profile avatar social entry');
}

console.log('User social settings contract passed.');
