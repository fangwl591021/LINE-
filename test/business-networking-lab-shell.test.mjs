import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const lab = readFileSync(new URL('../js/modules/business-networking-lab.js', import.meta.url), 'utf8');

test('business assistant exposes an isolated networking lab shell', () => {
  assert.match(index, /openBusinessNetworkingLab \? window\.openBusinessNetworkingLab\(\) : window\.openHomeLowerPanel\?\.\('assistant'\)/);
  assert.match(index, /js\/modules\/business-networking-lab\.js\?v=1\.0/);
  assert.match(lab, /交流合作實驗區/);
  assert.match(lab, /今日建議/);
  assert.match(lab, /私人人脈/);
  assert.match(lab, /公開交流/);
  assert.match(lab, /企業合作/);
  assert.match(lab, /查看原有今日跟進建議/);
  assert.match(lab, /window\.openHomeLowerPanel\?\.\('assistant'\)/);
});

test('networking lab shell preserves authority boundaries and has no backend execution', () => {
  assert.match(lab, /不會公開資料、寫入資料或傳送訊息/);
  assert.match(lab, /自己的可以公開；別人的不可以/);
  assert.match(lab, /收藏的別人名片永遠屬於私人資料/);
  assert.match(lab, /經驗證企業代表/);
  assert.doesNotMatch(lab, /fetchAPI\s*\(/);
  assert.doesNotMatch(lab, /updateCard|saveBusinessIntent|startMatchmaking/);
});
