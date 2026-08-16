const fs = require('fs');

const read = (path) => fs.readFileSync(path, 'utf8');
const adapter = read('js/modules/a-kaffit-card-scanner-adapter.js');
const crop = read('js/modules/a-kaffit-vision-v3-crop.js');
const worker = read('worker-entry.mjs');
const imageRuntime = read('worker/a-kaffit-card-image-processing.mjs');
const migration = read('migrations/0025_a_kaffit_card_image_processing.sql');
const html = read('index.html');
const legacy = read('workerbackup.js');

function ok(condition, label) {
  if (!condition) {
    console.error('FAIL', label);
    process.exit(1);
  }
  console.log('OK', label);
}

ok(!fs.existsSync('migrations/0020_a_kaffit_card_image_processing.sql'), 'no duplicate migration slot');
ok(migration.includes('CREATE TABLE IF NOT EXISTS card_image_processing'), 'A-kaffit image-job table exists');
ok(migration.includes("status TEXT NOT NULL DEFAULT 'uploaded'"), 'image-job states preserved');
ok(imageRuntime.includes('card-images/${userId}/${id}/original-${side}'), 'A-kaffit original R2 key policy preserved');
ok(imageRuntime.includes('processed-${row.side}'), 'A-kaffit processed R2 key policy preserved');

ok(adapter.includes('async function compressCardImage(file)'), 'A-kaffit compression entry preserved');
ok(adapter.includes('[1600, 1280, 1024, 800, 640, 512]'), 'A-kaffit compression resolutions preserved');
ok(adapter.includes('[0.84, 0.72, 0.60, 0.48, 0.36]'), 'A-kaffit WebP quality ladder preserved');
ok(adapter.includes('async function prepareBusinessCardImage'), 'prepareBusinessCardImage preserved');
ok(adapter.indexOf('prepareBusinessCardImage(file') < adapter.indexOf("fetchAPI('recognizeCardWithGPT4o'"), 'image job happens before OCR');
ok((adapter.match(/fetchAPI\('recognizeCardWithGPT4o'/g) || []).length === 1, 'primary flow has exactly one OCR Vision call');
ok(adapter.includes("import { cropByVisionLocalization, normalizedVisionLocalization } from './a-kaffit-vision-v3-crop.js'"), 'A-kaffit Vision V3 crop is primary crop runtime');
ok(!adapter.includes('cardVisionCrop'), 'legacy LINE crop runtime is not used by primary adapter');
ok(adapter.includes('送出名片'), 'A-kaffit send-before-OCR draft step preserved');
ok(adapter.includes('確認名片資料'), 'A-kaffit review-before-save step preserved');
ok(adapter.indexOf('showReview()') < adapter.lastIndexOf("fetchAPI('saveCard'"), 'review precedes final save');
ok(adapter.includes('workerApiUrl'), 'GitHub Pages transport uses Worker API base');
ok(adapter.includes("workerApiUrl('/v1/card-images')"), 'original image job uses Worker API URL');
ok(adapter.includes("workerApiUrl('/v1/card-images/'+encodeURIComponent(jobId)+'/result')"), 'processed image job uses Worker API URL');

ok(crop.includes('localization.cropConfidence<0.72'), 'A-kaffit Vision V3 confidence threshold preserved');
ok(crop.includes('boxIou>=0.72'), 'A-kaffit corner/bbox agreement preserved');
ok(crop.includes('centerDelta<=0.06'), 'A-kaffit center agreement preserved');
ok(crop.includes('ratioAgreement<=1.22'), 'A-kaffit ratio agreement preserved');
ok(!/BOTTOM_TRIM|shift-down|shift down|manual crop hint downward/i.test(crop + '\n' + adapter), 'no invented trim or shift logic');

ok(worker.includes("createCardImageJob, saveCardImageResult"), 'Worker image-job routes are wired');
ok(worker.includes("pathname === '/v1/card-images'"), 'Worker original image route exists');
ok(worker.includes('const resultMatch = url.pathname.match') && (worker.includes("'/result'") || worker.includes('/result$/')), 'Worker processed result route exists');
ok(worker.includes("request.method === 'OPTIONS'"), 'cross-origin preflight is handled');
ok(worker.includes('X-Card-File-Size, X-Card-Side, X-Card-Purpose'), 'A-kaffit image-job headers allowed by CORS');
ok(html.includes('a-kaffit-card-scanner-adapter.js?v=3.0'), 'full workflow adapter cache-bust is active');

ok(legacy.includes('boundingBox 必須只包住真實名片，不可包入桌面、手掌、鍵盤或其他背景'), 'OCR prompt matches A-kaffit background exclusion rule');
ok(legacy.includes('incomplete=true') && legacy.includes('clippedEdges'), 'OCR prompt preserves incomplete-card contract');

console.log('A-kaffit full card workflow contract passed.');
