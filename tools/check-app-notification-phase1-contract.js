const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('index.html', 'utf8');
const notify = fs.readFileSync('js/app-notify.js', 'utf8');
const cards = fs.readFileSync('js/modules/cards.js', 'utf8');

const notifyIndex = html.indexOf('js/app-notify.js');
const coreIndex = html.indexOf('js/core.js');
const cardsIndex = html.indexOf('js/modules/cards.js');
assert.ok(notifyIndex >= 0, 'index must load js/app-notify.js');
assert.ok(coreIndex > notifyIndex, 'app-notify must load before core.js');
assert.ok(cardsIndex > notifyIndex, 'app-notify must load before cards.js');

assert.match(notify, /window\.appNotice\s*=/);
assert.match(notify, /window\.appConfirm\s*=/);
assert.match(notify, /window\.appPrompt\s*=/);
assert.match(notify, /window\.alert\s*=/);
assert.doesNotMatch(notify, /window\.confirm\s*=\s*async/);
assert.doesNotMatch(notify, /window\.prompt\s*=\s*async/);
assert.doesNotMatch(notify, /hostname|document\.domain|workers\.dev/i);

assert.doesNotMatch(cards, /(^|[^.\w])confirm\s*\(/m);
assert.doesNotMatch(cards, /window\.prompt\s*\(/);
assert.match(cards, /await\s+window\.appConfirm\s*\(/);
assert.match(cards, /await\s+window\.appPrompt\s*\(/);

console.log('app notification phase 1 contract: OK');
