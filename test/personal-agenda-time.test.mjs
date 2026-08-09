import assert from 'node:assert/strict';
import {
  isTaipeiLocalDateTime,
  normalizeTaipeiDateTime,
  taipeiDateTimeEpoch
} from '../worker/personal-agenda-time.mjs';

assert.equal(normalizeTaipeiDateTime('2026-08-10T09:00'), '2026-08-10T09:00');
assert.equal(normalizeTaipeiDateTime('2026-08-10 09:00'), '2026-08-10T09:00');
assert.equal(normalizeTaipeiDateTime('2026-08-10T09:00:59'), '2026-08-10T09:00');
assert.equal(normalizeTaipeiDateTime('2026-08-10T01:00:00Z'), '2026-08-10T09:00');
assert.equal(normalizeTaipeiDateTime('2026-08-10T09:00:00+08:00'), '2026-08-10T09:00');
assert.equal(normalizeTaipeiDateTime('2026-02-30T09:00'), '');
assert.equal(normalizeTaipeiDateTime('not-a-date'), '');
assert.equal(isTaipeiLocalDateTime('2026-08-10T09:00'), true);
assert.equal(isTaipeiLocalDateTime('2026-02-30T09:00'), false);
assert.equal(taipeiDateTimeEpoch('2026-08-10T10:00') > taipeiDateTimeEpoch('2026-08-10T09:00'), true);

console.log('Personal agenda time normalization tests passed.');
