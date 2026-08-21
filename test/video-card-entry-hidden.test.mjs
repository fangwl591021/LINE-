import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mycard = readFileSync(new URL('../js/modules/mycard.js', import.meta.url), 'utf8');
const ecard = readFileSync(new URL('../js/modules/ecard.js', import.meta.url), 'utf8');

test('video-card UI entries are hidden without removing video functionality', () => {
  assert.match(index, /id="btn-open-my-video-card"[^>]*hidden aria-hidden="true" tabindex="-1"/);
  assert.match(index, /id="btn-open-ecard-video-card"[^>]*hidden aria-hidden="true" tabindex="-1"/);
  assert.match(index, /id="btn-open-my-video-card"[^>]*style="display:none!important"/);
  assert.match(index, /id="btn-open-ecard-video-card"[^>]*style="display:none!important"/);
  assert.match(index, /id="my-video-card-settings"/);
  assert.match(index, /id="ecard-video-card-settings"/);
  assert.match(mycard, /function openMyCardVideoFlow/);
  assert.match(mycard, /window\.openMyCardVideoFlow = openMyCardVideoFlow/);
  assert.match(ecard, /window\.openECardVideoFlow = function/);
  assert.doesNotMatch(mycard, /removeAttribute\(['"]hidden['"]\)/);
  assert.doesNotMatch(ecard, /removeAttribute\(['"]hidden['"]\)/);
  assert.doesNotMatch(mycard, /\{ value: 'video', label: '影音' \}/);
  assert.match(mycard, /grid grid-cols-3 gap-1/);
  assert.match(index, /js\/modules\/mycard\.js\?v=8\.85/);
});
