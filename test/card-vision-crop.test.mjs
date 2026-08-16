import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const vision = require('../js/modules/card-vision-crop.js');

test('normalizes untrusted vision localization values', () => {
  const value = vision.normalizeLocalization({
    detected: true,
    incomplete: false,
    cropConfidence: 5,
    boundingBox: { x: -1, y: 0.2, width: 3, height: 0.5 },
    corners: [{ x: -1, y: 0 }, { x: 1, y: -2 }, { x: 2, y: 1 }, { x: 0, y: 3 }],
    clippedEdges: ['left', 'invalid']
  });
  assert.equal(value.cropConfidence, 1);
  assert.deepEqual(value.boundingBox, { x: 0, y: 0.2, width: 1, height: 0.5 });
  assert.deepEqual(value.clippedEdges, ['left']);
});

test('orders four corners clockwise from top-left', () => {
  const ordered = vision.orderQuad([
    { x: 95, y: 60 },
    { x: 5, y: 5 },
    { x: 10, y: 65 },
    { x: 100, y: 10 }
  ]);
  assert.deepEqual(ordered, [
    { x: 5, y: 5 },
    { x: 100, y: 10 },
    { x: 95, y: 60 },
    { x: 10, y: 65 }
  ]);
});

test('builds stable perspective coefficients for a rectangular card', () => {
  const coefficients = vision.perspectiveCoefficients([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 60 },
    { x: 0, y: 60 }
  ]);
  assert.equal(coefficients.length, 8);
  assert.ok(coefficients.every(Number.isFinite));
});

test('keeps A-kaffit conservative automatic crop threshold', () => {
  assert.equal(vision.AUTO_CROP_CONFIDENCE, 0.72);
});
