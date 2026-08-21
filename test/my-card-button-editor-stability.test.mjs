import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mycard = readFileSync(new URL('../js/modules/mycard.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function section(startMarker, endMarker) {
  const start = mycard.indexOf(startMarker);
  const end = mycard.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return mycard.slice(start, end);
}

test('button editor preserves each visible row before structural changes', () => {
  assert.match(mycard, /data-my-v1-button-index=/);
  assert.match(mycard, /data-my-v1-button-field="l"/);
  assert.match(mycard, /data-my-v1-button-field="u"/);

  const add = section('function addV1Button', 'function updateButton');
  const remove = section('function removeButton', 'function moveButton');
  const move = section('function moveButton', 'function updatePreview');
  const save = section('async function saveMyECardConfig', 'function buildCurrentShareConfig');

  assert.match(add, /syncButtonEditorDrafts\(\);[\s\S]*myEcardButtons\.push/);
  assert.match(remove, /syncButtonEditorDrafts\(\);[\s\S]*myEcardButtons\.splice/);
  assert.match(move, /syncButtonEditorDrafts\(\);[\s\S]*myEcardButtons\.splice/);
  assert.match(save, /syncButtonEditorDrafts\(\);/);
});

test('save validation never silently compacts button rows', () => {
  const normalize = section('function normalizeMyCardButtonsForSave', 'function normalizeId');
  assert.match(normalize, /buttons\.slice\(0, 4\)\.map/);
  assert.doesNotMatch(normalize, /normalizeMyCardButtons\(buttons\)/);
  assert.match(normalize, /顆按鈕是空白的，請使用刪除按鈕移除/);
  assert.match(index, /js\/modules\/mycard\.js\?v=8\.85/);
});
