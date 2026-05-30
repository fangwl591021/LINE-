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

ok(worker.includes('const ReferralFriendKeywordModule = {'), 'referral keyword module is isolated');
ok(worker.includes("return text === '\\u63a8\\u85a6\\u597d\\u53cb'"), 'keyword is exactly 推薦好友');
ok(worker.includes("point_from: 'lineoa-referral-keyword'"), 'invite link records keyword source');
ok(worker.includes("point_friend: '1'"), 'invite link carries point friend marker');
ok(worker.includes('ref: context.referrerId'), 'invite link carries referrer id');
ok(worker.includes('net: context.networkId'), 'invite link carries network id');
ok(worker.includes('quickchart.io/qr?text='), 'reply includes QR image');
ok(worker.includes('https://line.me/R/msg/text/?'), 'reply includes LINE share button url');
ok(worker.indexOf('ReferralFriendKeywordModule.reply(events, env)') < worker.indexOf('this.forwardToGas(gasRawBody, env)'), 'keyword replies before GAS forwarding');
ok(worker.indexOf('ReferralFriendKeywordModule.reply(events, env)') < worker.indexOf('this.replySimpleMyCard(events, env)'), 'referral keyword is separate from my-card keyword flow');

console.log('\nReferral keyword contract passed.');
