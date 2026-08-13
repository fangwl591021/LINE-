const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'js/navigation.js'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

ok(/<label[^>]*>(?:(?!<\/label>)[\s\S])*?<input type="file" id="cameraInput" accept="image\/\*" capture="environment" hidden/m.test(html), 'collected-card photo label directly owns the native rear-camera input');
ok(/<label[^>]*>(?:(?!<\/label>)[\s\S])*?<input type="file" id="myCameraInput" accept="image\/\*" capture="environment" hidden/m.test(html), 'my-card photo label directly owns the native rear-camera input');
ok(!html.includes("onclick=\"document.getElementById('cameraInput').click()\""), 'collected-card camera does not use a synthetic input click');
ok(!html.includes("onclick=\"document.getElementById('myCameraInput').click()\""), 'my-card camera does not use a synthetic input click');
ok(!/<label[^>]*>[\s\S]*?<input type="file" id="(?:my)?CameraInput"[^>]*class="absolute inset-0/m.test(html), 'camera inputs are not transparent overlays that Android treats as generic uploads');
ok(html.includes("document.getElementById('galleryInput').click()"), 'collected-card album button keeps the existing gallery picker');
ok(html.includes("document.getElementById('myGalleryInput').click()"), 'my-card album button keeps the existing gallery picker');
ok(!html.includes('business-card-camera-modal'), 'failed black in-page camera modal is removed');
ok(!html.includes('js/modules/business-card-camera.js'), 'failed getUserMedia camera module is not loaded');
ok(!html.includes('navigator.mediaDevices.getUserMedia'), 'main page does not request WebView camera permission');
ok(html.includes('onchange="window.recognizeCard(this)"'), 'collected-card native input keeps existing crop and OCR');
ok(html.includes('onchange="window.recognizeMyCard(this)"'), 'my-card native input keeps existing crop and OCR');


ok(html.includes('js/navigation.js?v=7.92'), 'camera input refresh navigation is cache-busted');
ok(navigation.includes("refreshNativeBusinessCardCameraInput(inputId)"), 'navigation can recreate a fresh native camera input');
ok(navigation.includes("fresh.setAttribute('capture', 'environment')"), 'fresh camera input explicitly requests the rear camera');
ok(navigation.includes("current.replaceWith(fresh)"), 'stale startup camera input is replaced after page entry');
ok(navigation.includes("page === 'card') window.refreshBusinessCardCameraInputs('collected')"), 'collected-card camera input refreshes when its page opens');
ok(navigation.includes("page === 'admin-settings') window.refreshBusinessCardCameraInputs('mycard')"), 'my-card camera input refreshes when its page opens');

console.log('\nNative LIFF business-card camera contract passed.');
