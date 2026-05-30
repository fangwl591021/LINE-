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

ok(worker.includes('isSimpleMyCardKeyword(event)'), 'LINE OA my-card keyword detector exists');
ok(worker.includes("return text === '我的名片';"), 'my-card keyword is exact 我的名片');
ok(worker.includes('async findMySelfCard(env, userId)'), 'self-profile card lookup exists');
ok(worker.includes("CASE WHEN source_type = 'self_profile' THEN 0 ELSE 1 END"), 'self-profile cards are prioritized');
ok(worker.includes('async replySimpleMyCard(events, env)'), 'my-card keyword reply handler exists');
ok(worker.includes('const existingCard = await this.findMySelfCard(env, userId);'), 'reply handler checks existing self card first');
ok(worker.includes('? this.buildExistingMyCardFlex(existingCard, userId, env)'), 'existing card renders stored card flex');
ok(worker.includes(': this.buildSimpleMyCardFlex(profile, userId, env);'), 'missing card falls back to template flex');
ok(worker.includes('quickReply') && worker.includes('quickly') && worker.includes("mode: 'my-card'"), 'reply includes quick edit entry');

const myCardCall = worker.indexOf('const simpleMyCardReplied = await this.replySimpleMyCard(events, env);');
const referralCall = worker.indexOf('const referralFriendReplied = await ReferralFriendKeywordModule.reply(events, env);');
const gasCall = worker.indexOf('const gasRawBody = await this.filterAutoReplyPayload(rawBody, events, env);');
ok(myCardCall >= 0 && referralCall > myCardCall && gasCall > myCardCall, 'my-card keyword is handled before referral and GAS forwarding');

console.log('\nLINE OA my-card keyword contract passed.');
