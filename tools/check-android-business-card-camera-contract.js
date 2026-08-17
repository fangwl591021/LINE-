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

ok(html.includes('id="collected-card-camera-label"'), 'collected-card page provides a native camera label mount point');
ok(html.includes('id="my-card-camera-label"'), 'my-card page provides a native camera label mount point');
ok(!html.includes('id="cameraInput"'), 'collected-card camera input does not exist in hidden startup HTML');
ok(!html.includes('id="myCameraInput"'), 'my-card camera input does not exist in hidden startup HTML');
ok(!html.includes("onclick=\"document.getElementById('cameraInput').click()\""), 'collected-card camera does not use a synthetic input click');
ok(!html.includes("onclick=\"document.getElementById('myCameraInput').click()\""), 'my-card camera does not use a synthetic input click');
ok(html.includes("document.getElementById('galleryInput').click()"), 'collected-card album button keeps the existing gallery picker');
ok(html.includes("document.getElementById('myGalleryInput').click()"), 'my-card album button keeps the existing gallery picker');
ok(!html.includes('business-card-camera-modal'), 'failed black in-page camera modal is removed');
ok(!html.includes('js/modules/business-card-camera.js'), 'failed getUserMedia camera module is not loaded');
ok(!html.includes('navigator.mediaDevices.getUserMedia'), 'main page does not request WebView camera permission');
ok(navigation.includes("'cameraInput', 'recognizeCard'"), 'collected-card native input keeps existing crop and OCR');
ok(navigation.includes("'myCameraInput', 'recognizeMyCard'"), 'my-card native input keeps existing crop and OCR');
ok(/js\/navigation\.js\?v=7\.(?:94|95|96|97|98)/.test(html), 'camera input mount navigation is cache-busted');
ok(navigation.includes("mountNativeBusinessCardCameraInput(labelId, inputId, handlerName)"), 'navigation mounts camera only after its page is visible');
ok(navigation.includes("document.createElement('input')"), 'visible page creates a genuinely new file input');
ok(navigation.includes("fresh.capture = 'environment'"), 'fresh camera input explicitly requests the rear camera');
ok(navigation.includes("fresh.onchange = function(event)"), 'fresh camera input binds its OCR handler directly like klinkweb');
ok(navigation.includes("label.appendChild(fresh)"), 'camera input is appended to the already rendered label');
ok(navigation.includes("page === 'card') window.refreshBusinessCardCameraInputs('collected')"), 'collected-card camera input mounts when its page opens');
ok(navigation.includes("page === 'admin-settings') window.refreshBusinessCardCameraInputs('mycard')"), 'my-card camera input mounts when its page opens');
ok(!navigation.includes("refreshBusinessCardCameraBeforeNativeClick"), 'camera input is not replaced during the user press');
ok(!navigation.includes("fresh.click()"), 'camera mount never opens the chooser with a synthetic click');

console.log('\nNative LIFF business-card camera contract passed.');
