const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function fail(message) {
  console.error(`Local GPT key visibility contract failed: ${message}`);
  process.exit(1);
}

const match = html.match(/<details id="details-local-gpt-key" class="([^"]*)"/);
if (!match) {
  fail('missing details-local-gpt-key block');
}

if (!match[1].split(/\s+/).includes('hidden')) {
  fail('details-local-gpt-key must stay hidden from settings page');
}

console.log('Local GPT key visibility contract passed.');
