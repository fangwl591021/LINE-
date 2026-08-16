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

test('converts AI bounding box into a preframed manual crop rectangle', () => {
  const data = vision.manualCropData({
    detected: true,
    incomplete: false,
    cropConfidence: 0.58,
    boundingBox: { x: 0.08, y: 0.2, width: 0.84, height: 0.42 }
  }, 1000, 1600, 0.02);

  assert.ok(data);
  assert.ok(data.x < 80);
  assert.ok(data.y < 320);
  assert.ok(data.width > 840);
  assert.ok(data.height > 672);
  assert.equal(data.rotate, 0);
  assert.equal(data.scaleX, 1);
  assert.equal(data.scaleY, 1);
});

test('does not preframe incomplete or implausibly small localization', () => {
  assert.equal(vision.manualCropData({
    detected: true,
    incomplete: true,
    boundingBox: { x: 0.1, y: 0.1, width: 0.8, height: 0.4 }
  }, 1000, 1000), null);

  assert.equal(vision.manualCropData({
    detected: true,
    incomplete: false,
    boundingBox: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 }
  }, 1000, 1000), null);
});
