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

console.log('Share contract passed.');
