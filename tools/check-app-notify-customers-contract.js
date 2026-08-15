const fs = require('fs');
const assert = require('assert');
const source = fs.readFileSync('js/modules/customers.js', 'utf8');
assert.doesNotMatch(source, /\b(?:window\.)?confirm\s*\(/);
assert.match(source, /await window\.appConfirm\(`核准最高費用/);
assert.match(source, /await window\.appConfirm\('確定封存這位客戶/);
assert.match(source, /await window\.appConfirm\('確定回復這次匯入/);
console.log('customers app notification contract passed');
