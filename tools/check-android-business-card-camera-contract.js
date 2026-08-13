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

ok(/<label[^>]*>[\s\S]*?<input type="file" id="cameraInput" accept="image\/\*" capture="environment" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/m.test(html), 'collected-card photo surface contains the native rear-camera input');
ok(/<label[^>]*>[\s\S]*?<input type="file" id="myCameraInput" accept="image\/\*" capture="environment" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/m.test(html), 'my-card photo surface contains the native rear-camera input');
ok(html.includes("document.getElementById('galleryInput').click()"), 'collected-card album button keeps the gallery picker');
ok(html.includes("document.getElementById('myGalleryInput').click()"), 'my-card album button keeps the gallery picker');
ok(!html.includes("document.getElementById('cameraInput').click()"), 'collected-card camera no longer depends on a synthetic click');
ok(!html.includes("document.getElementById('myCameraInput').click()"), 'my-card camera no longer depends on a synthetic click');
ok(!html.includes('navigator.mediaDevices.getUserMedia'), 'page does not require LINE in-page camera permission');
ok(!html.includes('business-card-camera-modal'), 'page does not include the extra in-page camera modal');
ok(!html.includes('js/modules/business-card-camera.js'), 'page does not load the in-page camera module');
ok(html.includes('onchange="window.recognizeCard(this)"'), 'collected-card native input keeps the existing crop and OCR path');
ok(html.includes('onchange="window.recognizeMyCard(this)"'), 'my-card native input keeps the existing crop and OCR path');

console.log('\nAndroid business-card camera contract passed.');
