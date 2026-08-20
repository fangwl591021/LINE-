import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mycard = readFileSync(new URL('../js/modules/mycard.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('home My Card opens the current WYSIWYG editor instead of the legacy detail view', () => {
  const start = mycard.indexOf('async function openMyCardEntry');
  const end = mycard.indexOf('function getCardRowId', start);
  const entry = mycard.slice(start, end);

  assert.match(entry, /currentCardData = await resolveCurrentUserCard\(true\)/);
  assert.match(entry, /await openMyCardWysiwyg\(evt\)/);
  assert.doesNotMatch(entry, /openCardDetail/);
  assert.match(index, /js\/modules\/mycard\.js\?v=8\.81/);
});
