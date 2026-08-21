import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');

test('matchmaking reasons use concrete public industry service or trait evidence', () => {
  assert.match(worker, /recommendationEvidenceReason\(query, contact, businessIntent = \{\}\)/);
  assert.match(worker, /\['服務項目', contact\.Services\]/);
  assert.match(worker, /\['行業', contact\.Industry\]/);
  assert.match(worker, /\['公開特質', contact\.Traits\]/);
  assert.match(worker, /您的需求「\$\{primary\.matched\}」與對方的\$\{primary\.label\}/);
  assert.match(worker, /可據此判斷是否符合您的合作需求/);
});

test('AI ranking receives explicit evidence fields and cannot use card recency as a reason', () => {
  assert.match(worker, /行業: \$\{c\.Industry \|\| '無'\}/);
  assert.match(worker, /服務項目: \$\{c\.Services \|\| '無'\}/);
  assert.match(worker, /公開特質: \$\{c\.Traits \|\| '無'\}/);
  assert.match(worker, /禁止以新名片、最近新增、最近加入、資料完整度或公開資格作為推薦理由/);
  assert.match(worker, /reason: evidence\.reason/);
  assert.doesNotMatch(worker, /reason:\s*hitCount\s*\?/);
});

test('local fallback keeps the same evidence-based reason authority', () => {
  assert.match(worker, /localMatchmakingFallback\(query, contacts, businessIntent = \{\}\)/);
  assert.match(worker, /this\.recommendationEvidenceReason\(query, contact, businessIntent\)/);
  assert.match(worker, /this\.localMatchmakingFallback\(effectiveQuery, safeContacts, businessIntent\)/);
});
