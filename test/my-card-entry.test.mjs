import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mycard = readFileSync(new URL('../js/modules/mycard.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('../js/modules/home.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('home My Card restores the original settings-section route', () => {
  const start = mycard.indexOf('async function openMyCardEntry');
  const end = mycard.indexOf('function getCardRowId', start);
  const entry = mycard.slice(start, end);

  assert.match(entry, /window\.openMyCardSettings\(\)/);
  assert.match(home, /window\.openMyCardSettings = function\(\) \{\s*openSettingsSection_\('details-my-ecard'\)/);
  assert.doesNotMatch(entry, /openCardDetail|openMyCardWysiwyg/);
  assert.match(index, /id="home-my-card-button" onclick="window\.openMyCardSettings \? window\.openMyCardSettings\(\)/);
  assert.match(index, /<details id="details-my-ecard"[\s\S]*?<summary class="font-bold/);
  assert.match(index, /group-open:rotate-180[\s\S]*?expand_more/);
  assert.match(index, /js\/modules\/mycard\.js\?v=8\.82/);
  assert.match(index, /js\/modules\/home\.js\?v=7\.86/);
  assert.match(mycard, /await load\(\);\s*focusMyECardSection\(\);/);
});