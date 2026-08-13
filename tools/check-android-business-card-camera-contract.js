const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const camera = fs.readFileSync(path.join(root, 'js/modules/business-card-camera.js'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

ok(html.includes("window.openBusinessCardCamera('collected', event)"), 'collected-card photo button uses the platform-aware camera dispatcher');
ok(html.includes("window.openBusinessCardCamera('mycard', event)"), 'my-card photo button uses the platform-aware camera dispatcher');
ok(html.includes('id="cameraInput" accept="image/*" capture="environment"'), 'collected-card native camera input remains available for iOS and external browsers');
ok(html.includes('id="myCameraInput" accept="image/*" capture="environment"'), 'my-card native camera input remains available for iOS and external browsers');
ok(html.includes("document.getElementById('galleryInput').click()"), 'collected-card album button keeps the existing gallery picker');
ok(html.includes("document.getElementById('myGalleryInput').click()"), 'my-card album button keeps the existing gallery picker');
ok(html.includes('id="business-card-camera-modal"'), 'Android LIFF camera modal exists');
ok(html.includes('首次使用請在系統提示選擇「允許」'), 'permission copy asks for a one-tap system approval');
ok(html.includes('id="business-card-camera-retry"'), 'permission failure offers a retry action');
ok(html.includes('onclick="window.useBusinessCardGallery()"'), 'permission failure offers the gallery fallback');
ok(/js\/modules\/business-card-camera\.js\?v=2\.0/.test(html), 'platform-aware camera module is cache-busted');

[
  '/Android/i.test(userAgent)',
  'window.liff?.isInClient?.()',
  '/\\bLine\\/[\\d.]+/i.test(userAgent)',
  'if (!isAndroidLineClient())',
  'cameraInput(state.target)?.click()',
  'navigator.mediaDevices.getUserMedia',
  "facingMode: { exact: 'environment' }",
  "facingMode: { ideal: 'environment' }",
  'canvas.toBlob',
  'window.recognizeMyCard?.(virtualInput)',
  'window.recognizeCard?.(virtualInput)',
  'window.retryBusinessCardCamera',
  'window.useBusinessCardGallery'
].forEach((needle) => ok(camera.includes(needle), `camera module contains ${needle}`));

ok(!camera.includes('請到 Android'), 'camera errors do not instruct users to open Android settings');
ok(!camera.includes('權限設定'), 'camera errors do not require manual permission settings');
ok(!camera.includes('liff.scanCode'), 'business-card photography does not misuse the QR scanner API');

console.log('\nAndroid LIFF business-card camera contract passed.');
