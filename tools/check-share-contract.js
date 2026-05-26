const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const authPath = path.join(root, 'js', 'auth.js');
const auth = fs.readFileSync(authPath, 'utf8');

function fail(message) {
  console.error('Share contract failed:', message);
  process.exit(1);
}

const match = auth.match(/window\.shareCardFromLink\s*=\s*async function[\s\S]*?\n\};/);
if (!match) fail('shareCardFromLink function not found');

const body = match[0];

if (!body.includes('buildLocalECardFlexMessage')) {
  fail('shareCardFromLink must use local Flex builder before Worker fallback');
}

if (/sharePlainCardViewUrl\s*\(/.test(body)) {
  fail('shareCardFromLink must not fall back to plain text URL sharing');
}

if (/fallback to URL/.test(body)) {
  fail('shareCardFromLink must not log or use URL fallback');
}

if (!body.includes('triggerFlexSharing')) {
  fail('shareCardFromLink must still open LINE shareTargetPicker through triggerFlexSharing');
}

if (!auth.includes('async function handleAutoShareCardEntry')) {
  fail('auto share entry handler must exist');
}

const domReady = auth.match(/document\.addEventListener\('DOMContentLoaded', async \(\) => \{[\s\S]*?\n\}\);/);
if (!domReady) fail('DOMContentLoaded auth flow not found');

const domReadyBody = domReady[0];
const autoShareIndex = domReadyBody.indexOf('handleAutoShareCardEntry(shareCardId, refId, netId)');
const checkUserIndex = domReadyBody.indexOf("window.fetchAPI('checkUser'");
if (autoShareIndex === -1) {
  fail('shareCardId auto-share must call handleAutoShareCardEntry');
}
if (checkUserIndex === -1) {
  fail('checkUser call not found');
}
if (autoShareIndex > checkUserIndex) {
  fail('shareCardId auto-share must run before checkUser');
}

console.log('Share contract passed.');
