import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mycard = readFileSync(new URL('../js/modules/mycard.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('../js/modules/home.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('home My Card opens the shared full card-detail page', () => {
  const start = mycard.indexOf('async function openMyCardEntry');
  const end = mycard.indexOf('function getCardRowId', start);
  const entry = mycard.slice(start, end);

  assert.match(entry, /currentCardData = await resolveCurrentUserCard\(true\)/);
  assert.match(entry, /window\.openCardDetail\(currentCardData\)/);
  assert.doesNotMatch(entry, /openMyCardWysiwyg/);
  assert.match(home, /window\.openMyCardSettings = function\(evt\)[\s\S]*return window\.openMyCardEntry\(evt\)/);
  assert.match(index, /id="home-my-card-button" onclick="window\.openMyCardEntry \? window\.openMyCardEntry\(event\)/);
  assert.match(index, /<details id="details-my-ecard"[\s\S]*?<summary onclick="window\.openMyCardEntry\(event\)"/);
  assert.match(index, /js\/modules\/mycard\.js\?v=8\.86/);
  assert.match(index, /js\/modules\/home\.js\?v=7\.94/);
  assert.match(mycard, /await load\(\);\s*await openMyCardDetail\(\);/);
});
