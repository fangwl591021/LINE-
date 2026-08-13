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

ok(html.includes("window.openBusinessCardCamera('collected', event)"), 'collected-card photo button opens the in-page camera');
ok(html.includes("window.openBusinessCardCamera('mycard', event)"), 'my-card photo button opens the in-page camera');
ok(html.includes("document.getElementById('galleryInput').click()"), 'collected-card album button keeps the gallery picker');
ok(html.includes("document.getElementById('myGalleryInput').click()"), 'my-card album button keeps the gallery picker');
ok(!html.includes("onclick=\"document.getElementById('cameraInput').click()\""), 'collected-card photo button no longer opens a file picker');
ok(!html.includes("onclick=\"document.getElementById('myCameraInput').click()\""), 'my-card photo button no longer opens a file picker');
ok(html.includes('id="business-card-camera-modal"'), 'camera preview modal exists');
ok(html.includes('id="business-card-camera-video"'), 'camera video preview exists');
ok(html.includes('id="business-card-camera-shutter"'), 'camera shutter exists');
ok(/js\/modules\/business-card-camera\.js\?v=\d+\.\d+/.test(html), 'camera module uses a cache-busted script URL');

[
  'navigator.mediaDevices.getUserMedia',
  "facingMode: { exact: 'environment' }",
  "facingMode: { ideal: 'environment' }",
  "canvas.toBlob",
  "window.recognizeMyCard?.(virtualInput)",
  "window.recognizeCard?.(virtualInput)",
  "window.closeBusinessCardCamera",
  "window.addEventListener('pagehide', stopStream)"
].forEach((needle) => ok(camera.includes(needle), `camera module contains ${needle}`));

ok(!camera.includes("document.getElementById('cameraInput').click()"), 'camera module does not fall back to the collected-card upload picker');
ok(!camera.includes("document.getElementById('myCameraInput').click()"), 'camera module does not fall back to the my-card upload picker');

console.log('\nAndroid business-card camera contract passed.');
