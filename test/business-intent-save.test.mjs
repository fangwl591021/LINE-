import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const intent = readFileSync(new URL('../js/modules/business-intent.js', import.meta.url), 'utf8');

test('business intent save controls remain visible above mobile navigation', () => {
  assert.match(index, /business-intent\.js\?v=1\.3/);
  assert.match(intent, /id="business-intent-actions" class="fixed bottom-\[84px\]/);
  assert.match(intent, /pb-36 bg-white space-y-4/);
  assert.match(intent, /id="business-intent-save"/);
});

test('business intent resolves the authoritative own card before saving', () => {
  assert.match(intent, /function resolveOwnCard\(card\)/);
  assert.match(intent, /getRowId\(card\) === getRowId\(ownCard\)\) return ownCard/);
  assert.match(intent, /getRowId\(card\) === getRowId\(ownCard\)\) return true/);
  assert.match(intent, /fetchAPI\('updateCard', \{ rowId, data: \{ '自訂名片設定': serialized \} \}, true\)/);
});

test('business intent survives stale card aliases and in-memory card list replacement', () => {
  assert.match(intent, /configs\.find\(config => config\.businessIntent/);
  assert.match(intent, /function syncSavedConfig\(rowId, serialized\)/);
  assert.match(intent, /card\['電子名片設定'\] = serialized/);
  assert.match(intent, /card\.customConfig = serialized/);
  assert.match(intent, /card\.custom_config = serialized/);
  assert.match(intent, /\[window\.allCards, window\.myCards\]\.forEach/);
  assert.match(intent, /const confirmedSerialized = savedCard\['自訂名片設定'\]/);
  assert.match(intent, /伺服器未保留業務需求/);
  assert.doesNotMatch(intent, /savedCard\.custom_config \|\| serialized/);
});

test('business intent save exposes progress and readable errors', () => {
  assert.match(intent, /button\.textContent = '儲存中\.\.\.'/);
  assert.match(intent, /業務需求已儲存，AI 配對會使用這些資料/);
  assert.match(intent, /業務需求儲存失敗：/);
  assert.match(intent, /return null/);
});
