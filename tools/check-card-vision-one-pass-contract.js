const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cropper = fs.readFileSync(path.join(root, 'js/modules/cropper.js'), 'utf8');
const vision = fs.readFileSync(path.join(root, 'js/modules/card-vision-crop.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'js/core.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK ${message}`);
}

const visionIndex = html.indexOf('js/modules/card-vision-crop.js?v=1.0');
const cropperIndex = html.indexOf('js/modules/cropper.js?v=7.18');
ok(visionIndex >= 0 && cropperIndex > visionIndex, 'vision crop module loads before collected-card workflow');
ok(html.includes('js/core.js?v=7.30'), 'AI OCR timeout change is cache-busted');
ok(core.includes("action === 'recognizeCardWithGPT4o' ? 70000"), 'one-pass vision request has a mobile-safe timeout');
ok(cropper.includes("window.cardVisionCrop.normalizeInput(file, { maxSide: 2200"), 'mobile image is normalized before the AI request');
ok(cropper.includes("window.fetchAPI('recognizeCardWithGPT4o', { base64Image: workingImage, deferImageUpload: true }, true)"), 'collected card uses one OCR and localization request without storing the uncropped original as the card image');
ok(cropper.includes('extractOcrLocalization(ocrRes)'), 'client consumes localization from the same OCR response');
ok(cropper.includes('window.cardVisionCrop.cropDataUrl(workingImage, localization'), 'client crops from AI localization');
ok(cropper.includes("cachedOcr || await window.fetchAPI('recognizeCardWithGPT4o'"), 'manual fallback reuses completed OCR instead of charging a second vision request');
ok(cropper.includes("userId: ''"), 'collected card remains an unowned private contact');
ok(cropper.includes('config.isPrivate = true'), 'processed collected-card image stays private');
ok(vision.includes('const AUTO_CROP_CONFIDENCE = 0.72'), 'automatic crop uses conservative confidence threshold');
ok(vision.includes("method = 'perspective'"), 'four-corner agreement enables perspective correction');
ok(vision.includes("method = 'bounding-box'"), 'safe bounding-box fallback is available');
ok(worker.includes('同一次完成 OCR 與名片外框定位'), 'worker asks for OCR and localization in one vision call');
ok(worker.includes("payload.deferImageUpload === true"), 'worker defers final image storage until automatic or manual crop succeeds');
ok(worker.includes('incomplete=true') && worker.includes('clippedEdges'), 'worker explicitly rejects invented missing card edges');
ok(worker.includes('return { success: true, data: { cardData, localization, confidence } }'), 'worker keeps localization in the fetchAPI result without mixing it into stored card fields');

if (!process.exitCode) console.log('\nOne-pass AI business-card crop contract passed.');
