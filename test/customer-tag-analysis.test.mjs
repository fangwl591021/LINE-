import assert from 'node:assert/strict';
import { calculateCostMicrousd, isTaipeiOffPeak } from '../worker/customer-tag-analysis.mjs';

const price = {
  input_price_microusd_per_million: 5_000_000,
  output_price_microusd_per_million: 15_000_000
};

assert.equal(calculateCostMicrousd(1_000_000, 0, price), 5_000_000);
assert.equal(calculateCostMicrousd(0, 1_000_000, price), 15_000_000);
assert.equal(calculateCostMicrousd(500, 200, price), 5_500);
assert.equal(isTaipeiOffPeak(new Date('2026-08-05T18:15:00.000Z'), 2, 5), true);
assert.equal(isTaipeiOffPeak(new Date('2026-08-05T21:00:00.000Z'), 2, 5), false);

console.log('Customer tag analysis cost and off-peak tests passed.');
