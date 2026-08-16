const fs = require('fs');
const assert = require('assert');
const source = fs.readFileSync('js/modules/inbox.js', 'utf8');
assert.doesNotMatch(source, /\bconfirm\s*\(/);
assert.doesNotMatch(source, /\bprompt\s*\(/);
assert.match(source, /await window\.appConfirm\(/);
assert.match(source, /window\.redeemInboxCoupon\s*=\s*async function/);
console.log('inbox app notification contract passed');
