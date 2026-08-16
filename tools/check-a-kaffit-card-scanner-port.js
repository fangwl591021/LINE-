const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'js/modules/a-kaffit-card-scanner');
const required = [
  'card-scanner-v2.js',
  'card-scanner-v2-runtime.js',
  'card-scanner-v2-resolution.js',
  'card-scanner-v2-border-fallback.js',
  'card-scanner-v2-text-guided.js',
  'card-scanner-v2-gate.js',
  'card-scanner-v2-upload.js'
];

for (const file of required) {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) {
    console.error(`FAIL missing imported A-kaffit scanner file: ${file}`);
    process.exit(1);
  }
}

const gate = fs.readFileSync(path.join(dir, 'card-scanner-v2-gate.js'), 'utf8');
const runtime = fs.readFileSync(path.join(dir, 'card-scanner-v2-runtime.js'), 'utf8');
const resolution = fs.readFileSync(path.join(dir, 'card-scanner-v2-resolution.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'js/modules/a-kaffit-card-scanner-adapter.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const checks = [
  [gate.includes("scanBusinessCardImage(file)"), 'A-kaffit local gate remains available as fallback runtime'],
  [gate.includes("CARD_RETAKE_REQUIRED"), 'retake gate preserved'],
  [gate.includes("manualCrop(file,reason)"), 'manual crop fallback preserved'],
  [runtime.includes("chooseCandidate(analysisImage)"), 'multi-detector local fallback preserved'],
  [runtime.includes("warpPerspective"), 'perspective correction preserved'],
  [resolution.includes("workingLongEdge:2200"), 'A-kaffit working resolution preserved'],
  [resolution.includes("analysisLongEdge:1280"), 'A-kaffit analysis resolution preserved'],
  [adapter.includes("AI 正在同一次完成 OCR 與名片四角定位"), 'LINE entry uses one Vision call for OCR and localization'],
  [adapter.includes("extractLocalization(ocrRes)"), 'LINE entry consumes localization from the same OCR response'],
  [adapter.includes("window.cardVisionCrop.cropDataUrl(workingImage, localization"), 'LINE entry crops only after Vision localization'],
  [adapter.includes("openCollectedCardCropperFromDataUrl')(workingImage, ocrRes)"), 'low-confidence manual fallback reuses completed OCR'],
  [!adapter.includes("processBusinessCardImage(file)"), 'local V2 gate is not the primary LINE entry'],
  [html.includes('<script type="module" src="js/modules/a-kaffit-card-scanner-adapter.js?v=1.0"></script>'), 'A-kaffit Vision V3 adapter is loaded by LINE page']
];

for (const [ok, label] of checks) {
  if (!ok) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
  console.log(`OK ${label}`);
}

console.log('A-kaffit Vision V3 primary-flow contract passed.');
