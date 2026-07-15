const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs', 'contracts', 'line-keywords.md'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

ok(contract.includes('我的名片') && contract.includes('影音名片') && contract.includes('名片酷'), 'line keyword contract documents core keywords');

ok(worker.includes('isSimpleMyCardKeyword(event)'), 'my-card keyword detector exists');
ok(worker.includes("return text === '我的名片';"), 'my-card keyword uses exact 我的名片 match');
ok(worker.includes('async replySimpleMyCard(events, env)'), 'my-card reply handler exists');
ok(worker.includes("AND LOWER(COALESCE(source_type, '')) = 'self_profile'"), 'my-card lookup is scoped to self_profile');
ok(worker.includes('filterLineOaMyCardCandidates(await this.findMySelfCards(env, userId))'), 'my-card keyword filters self-card candidates before rendering');
ok(worker.includes("mode: 'wysiwyg-card'"), 'my-card reply exposes WYSIWYG edit entry');

ok(worker.includes('const LineOAMyVideoKeywordModule = {'), 'video-card keyword module exists');
ok(worker.includes("replace(/\\s+/g, '') === '影音名片'"), 'video-card keyword uses normalized exact match');
ok(worker.includes("sourceType: 'video_profile'"), 'video-card save uses video_profile source type');
ok(worker.includes("videoStorageKind: 'dedicated_video_card'"), 'video-card config is marked as dedicated video card');
ok(worker.includes('videoQuickReplyItems'), 'video-card reply includes quick replies');

ok(worker.includes('const LineOACardCoolKeywordModule = {'), 'AI card folder keyword module exists');
ok(worker.includes("=== '名片酷'") && worker.includes("=== 'ai名片夾'"), 'AI card folder accepts legacy and current keyword labels');
ok(worker.includes("sourceType: 'private_import'"), 'AI card folder saves OCR cards as private_import');
ok(worker.includes("visibility: 'private'"), 'AI card folder saves OCR cards private by default');
ok(worker.includes("lineId: ''") && worker.includes("profileUserId: ''"), 'AI card folder does not claim scanned-person LINE ownership');

ok(worker.includes('ReferralFriendKeywordModule.reply(events, env)'), 'referral keyword module is wired');
ok(worker.includes('const referralFriendReplied = await ReferralFriendKeywordModule.reply(events, env);'), 'referral keyword is handled explicitly');

const cardCoolCall = worker.indexOf('const cardCoolReplied = await LineOACardCoolKeywordModule.reply(events, env, ctx);');
const myCardCall = worker.indexOf('const simpleMyCardReplied = await this.replySimpleMyCard(events, env);');
const referralCall = worker.indexOf('const referralFriendReplied = await ReferralFriendKeywordModule.reply(events, env);');
const keywordRuleCall = worker.indexOf('const keywordRuleReply = await LineOAKeywordRuleModule.replyPayload(events, env);');
const gasFilterCall = worker.indexOf('const gasRawBody = keywordRuleReply ? rawBody : await this.filterAutoReplyPayload(rawBody, events, env);');
ok(cardCoolCall >= 0 && myCardCall > cardCoolCall, 'AI card folder keyword runs before my-card keyword');
ok(myCardCall >= 0 && referralCall > myCardCall, 'my-card keyword runs before referral keyword');
ok(keywordRuleCall > cardCoolCall && keywordRuleCall > myCardCall && keywordRuleCall > referralCall && gasFilterCall > keywordRuleCall, 'keyword handlers run before keyword-rule merge and GAS forwarding');

console.log('\nLINE keyword contract passed.');
