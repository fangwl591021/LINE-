const fs = require('fs');
const assert = require('assert');
const files = [
  'js/modules/purchase.js',
  'js/modules/home.js',
  'js/modules/ecard.js',
  'js/modules/mycard.js',
  'js/auth.js'
];
const source = Object.fromEntries(files.map(f => [f, fs.readFileSync(f, 'utf8')]));

assert.doesNotMatch(source['js/modules/purchase.js'], /\b(?:window\.)?confirm\s*\(/);
assert.doesNotMatch(source['js/modules/purchase.js'], /\bwindow\.prompt\s*\(/);
assert.match(source['js/modules/purchase.js'], /await window\.appConfirm\(/);
assert.match(source['js/modules/purchase.js'], /await window\.appPrompt\(/);

assert.doesNotMatch(source['js/modules/home.js'], /window\.confirm\s*\(/);
assert.ok((source['js/modules/home.js'].match(/await window\.appConfirm\(/g) || []).length >= 2);

assert.doesNotMatch(source['js/modules/ecard.js'], /window\.prompt\s*\(/);
assert.match(source['js/modules/ecard.js'], /await window\.appPrompt\(/);

assert.doesNotMatch(source['js/modules/mycard.js'], /window\.prompt\s*\(/);
assert.ok((source['js/modules/mycard.js'].match(/window\.appPrompt\(/g) || []).length >= 3);

assert.doesNotMatch(source['js/auth.js'], /window\.prompt\s*\(/);
assert.match(source['js/auth.js'], /await window\.appPrompt\(/);

console.log('frontend app notification sweep contract passed');
