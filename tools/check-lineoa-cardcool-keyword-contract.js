const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

const moduleStart = worker.indexOf('const LineOACardCoolKeywordModule = {');
const moduleEnd = worker.indexOf('// ==================== Point Service Module ====================', moduleStart);
ok(moduleStart >= 0 && moduleEnd > moduleStart, 'LINE OA card cool keyword module exists');

const moduleSource = worker.slice(moduleStart, moduleEnd);
ok(moduleSource.includes("=== '名片酷'"), 'keyword is exact 名片酷');
ok(moduleSource.includes('lineoa_cardcool_sides'), 'side selector postback is isolated');
ok(moduleSource.includes("label: '一面'"), 'one-side quick reply exists');
ok(moduleSource.includes("label: '二面'"), 'two-side quick reply exists');
ok(moduleSource.includes("action: { type: 'camera'"), 'camera quick reply exists');
ok(moduleSource.includes("action: { type: 'cameraRoll'"), 'camera roll quick reply exists');
ok(moduleSource.includes('api-data.line.me/v2/bot/message'), 'LINE image content is fetched from Messaging API');
ok(moduleSource.includes('AIModule.recognizeBusinessCardImages'), 'OCR path uses isolated business-card recognizer');
ok(moduleSource.includes('startLoadingAnimation'), 'image upload starts LINE loading animation');
ok(moduleSource.includes('processImagesAndPushReview'), 'final OCR processing runs in background review job');
ok(moduleSource.includes("mode: 'cardcool-review'"), 'review LIFF URL is generated after OCR');
ok(moduleSource.includes('confirmReviewDraft'), 'review confirmation saves final card');
ok(moduleSource.includes("sourceType: 'private_import'"), 'saved OCR card stays in private import pool');
ok(moduleSource.includes("visibility: 'private'"), 'saved OCR card is private by default');
ok(moduleSource.includes("lineId: ''") && moduleSource.includes("profileUserId: ''"), 'OCR import does not claim the scanned person LINE ownership');
ok(moduleSource.includes('D1WriteModule.upsertCard'), 'recognized business card is saved through D1 card path');
ok(!moduleSource.includes('????'), 'card cool replies do not contain garbled fallback text');

const aiStart = worker.indexOf('async recognizeBusinessCardImages(payload, env)');
const aiEnd = worker.indexOf('\n  parseJsonObject(text)', aiStart);
ok(aiStart >= 0 && aiEnd > aiStart, 'isolated OCR recognizer exists');
const aiSource = worker.slice(aiStart, aiEnd);
ok(aiSource.includes('isBusinessCard'), 'OCR recognizer requires business-card validation');
ok(aiSource.includes('NON_BUSINESS_CARD'), 'non-card images are rejected');
ok(aiSource.includes('Missing image data'), 'OCR recognizer validates image input');
ok(worker.includes('normalizePhoneForTel') && worker.includes('886') && worker.includes('86'), 'OCR recognizer normalizes international phone codes');

const cardCoolCall = worker.indexOf('const cardCoolReplied = await LineOACardCoolKeywordModule.reply(events, env, ctx);');
const myCardCall = worker.indexOf('const simpleMyCardReplied = await this.replySimpleMyCard(events, env);');
const gasCall = worker.indexOf('const gasRawBody = await this.filterAutoReplyPayload(rawBody, events, env);');
ok(cardCoolCall >= 0 && myCardCall > cardCoolCall, 'card cool keyword runs before my-card keyword');
ok(gasCall > cardCoolCall, 'card cool keyword runs before GAS forwarding');

console.log('\nLINE OA card cool keyword contract passed.');
