const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

ok(/<label[^>]*>[\s\S]*?<input type="file" id="cameraInput" accept="image\/\*" capture="environment" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/m.test(html), 'collected-card photo surface directly contains the native rear-camera input');
ok(/<label[^>]*>[\s\S]*?<input type="file" id="myCameraInput" accept="image\/\*" capture="environment" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/m.test(html), 'my-card photo surface directly contains the native rear-camera input');
ok(html.includes("document.getElementById('galleryInput').click()"), 'collected-card album button keeps the existing gallery picker');
ok(html.includes("document.getElementById('myGalleryInput').click()"), 'my-card album button keeps the existing gallery picker');
ok(!html.includes('business-card-camera-modal'), 'failed black in-page camera modal is removed');
ok(!html.includes('js/modules/business-card-camera.js'), 'failed getUserMedia camera module is not loaded');
ok(!html.includes('navigator.mediaDevices.getUserMedia'), 'main page does not request WebView camera permission');
ok(html.includes('onchange="window.recognizeCard(this)"'), 'collected-card native input keeps existing crop and OCR');
ok(html.includes('onchange="window.recognizeMyCard(this)"'), 'my-card native input keeps existing crop and OCR');

console.log('\nNative LIFF business-card camera contract passed.');
