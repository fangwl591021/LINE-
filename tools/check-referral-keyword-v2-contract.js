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

const moduleStart = worker.indexOf('const ReferralFriendKeywordModule = {');
const nextModuleStart = worker.indexOf('const LineOAStoreSearchKeywordModule = {', moduleStart);
const moduleEnd = nextModuleStart >= 0
  ? nextModuleStart
  : worker.indexOf('// ==================== Point Service Module ====================', moduleStart);
ok(moduleStart >= 0 && moduleEnd > moduleStart, 'referral friend keyword module exists');

const moduleSource = worker.slice(moduleStart, moduleEnd);
ok(moduleSource.includes("return text === '\\u63a8\\u85a6\\u597d\\u53cb';"), 'keyword is exact 推薦好友');
ok(moduleSource.includes('const referrerId = this.text(userId);'), 'referrer id is the sender LINE OA user id');
ok(!moduleSource.includes('identity && identity.canonicalId'), 'referrer id is not replaced by identity canonical id');
ok(!moduleSource.includes('row && row.point_line_id'), 'referrer id is not replaced by point_line_id');
ok(!moduleSource.includes('D1WriteModule'), 'keyword module does not write users or cards');
ok(moduleSource.includes("point_from: 'lineoa-referral-keyword-v2'"), 'invite URL is marked as v2 referral keyword');
ok(moduleSource.includes("action: { type: 'uri', uri: inviteUrl }"), 'QR image opens invite URL');
ok(moduleSource.includes("label: '\\u5206\\u4eab'"), 'share button exists');

const handler = worker.slice(worker.indexOf('async handleWebhook(request, env, ctx)'), worker.indexOf('async isAiPaused(env, threadId)'));
ok(handler.includes('const referralFriendReplied = await ReferralFriendKeywordModule.reply(events, env);') && handler.includes('if (referralFriendReplied) return new Response'), 'referral reply ownership terminates the webhook');
console.log('\nReferral keyword v2 contract passed.');
