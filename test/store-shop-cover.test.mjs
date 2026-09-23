import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = readFileSync(new URL('../css/store-shop.css', import.meta.url), 'utf8');
const front = readFileSync(new URL('../js/modules/store-shop.js', import.meta.url), 'utf8');
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const properties = selector => Object.fromEntries(rules
  .filter(([, candidate]) => candidate.trim() === selector)
  .flatMap(([, , declaration]) => declaration.split(';').filter(Boolean).map(item => item.split(':').map(value => value.trim()))));

test('only the store cover gets the 800 by 533 recommendation beside its upload control', () => {
  const hintLine = front.split('\n').find(line => line.includes('data-shop-cover-guide'));
  assert.ok(hintLine);
  assert.ok(hintLine.includes('[data-form="store"] .shop-image-field>p'));
  assert.ok(hintLine.includes("insertAdjacentHTML('afterend'"));
  assert.match(hintLine, /800 × 533 px（約 3:2 橫式）/);
  assert.match(hintLine, /滿版置中裁切/);
  assert.match(hintLine, /重要文字與主體請置中並預留四周邊界/);
  assert.match(hintLine, /上傳原圖仍完整保留/);
  assert.equal(front.match(/data-shop-cover-guide/g).length, 1);
  const entry = readFileSync(new URL('../js/modules/store-shop-entry.js', import.meta.url), 'utf8');
  const publicHtml = readFileSync(new URL('../store-shop.html', import.meta.url), 'utf8');
  assert.ok(entry.includes('js/modules/store-shop.js?v=47'));
  assert.ok(publicHtml.includes('js/modules/store-shop.js?v=47'));
});

test('shop introduction fills the card at 16:9 with a bounded desktop height and centered cropping', () => {
  const p = properties('.shop-lifestyle .shop-store-intro>img');
  assert.equal(p.width, '100%');
  assert.equal(p.height, 'auto');
  assert.equal(p['aspect-ratio'], '16/9');
  assert.equal(p['max-height'], '360px');
  assert.equal(p['object-fit'], 'cover');
  assert.equal(p['object-position'], 'center');
  assert.match(front, /<article class="shop-store-intro">\$\{photo\(s\.image_url,true\)\}/);
});

test('public shop cards crop consistently inside their existing 4:3 frames', () => {
  const p = properties('.shop-lifestyle .shop-discovery-grid article>img');
  assert.equal(p['aspect-ratio'], '4/3');
  assert.equal(p['object-fit'], 'cover');
  assert.equal(p['object-position'], 'center');
  assert.equal(p.height, 'auto');
  assert.match(front, /result\.shops\.map\(s=>`<article>\$\{photo\(s\.image_url\)\}/);
});

test('cropping remains limited to shop introduction, discovery covers, and decorative hero art', () => {
  const allowed = new Set([
    '.shop-lifestyle .shop-lifestyle-scene',
    '.shop-lifestyle .shop-store-intro>img',
    '.shop-lifestyle .shop-discovery-grid article>img'
  ]);
  const cropped = rules.filter(([, , declaration]) => /object-fit:\s*cover/.test(declaration));
  assert.equal(cropped.length, allowed.size);
  for (const [, selector] of cropped) assert.ok(allowed.has(selector.trim()), selector);
});

test('product cards, product details, uploaded images, and DM retain the full original image', () => {
  assert.equal(properties('.shop-lifestyle .shop-product-image img')['object-fit'], 'contain');
  assert.equal(properties('.store-shop article>img')['object-fit'], 'contain');
  assert.equal(properties('.store-shop img')['object-fit'], 'contain');
  assert.equal(properties('.store-shop .shop-upload-preview img').height, 'auto');
  assert.match(front, /context\.drawImage\(image,0,0,canvas\.width,canvas\.height\)/);
  assert.match(front, /<article class="shop-product-detail">\$\{photo\(p\.image_url\)\}/);
});
