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
ok(worker.includes('async findMySelfCards(env, userId)'), 'multiple self-profile card lookup exists');
ok(worker.includes('async findMySelfCardByRowId(env, userId, rowId)'), 'postback-selected self card lookup exists');
ok(worker.includes('isLineOaMyCardCandidate(row)'), 'LINE OA my-card candidate filter exists');
ok(worker.includes("if (!rowId.startsWith('CARD_')) return false;"), 'old numeric mother-site row ids are excluded from LINE OA my-card selector');
ok(worker.includes('return !!(name && company && imageUrl);'), 'unbound generated cards without company are excluded from LINE OA my-card selector');
ok(worker.includes('filterLineOaMyCardCandidates(await this.findMySelfCards(env, userId))'), 'my-card keyword filters mother-site leftovers before rendering');
ok(worker.includes("AND LOWER(COALESCE(source_type, '')) = 'self_profile'"), 'my-card lookup only reads self-profile cards');
ok(worker.includes("return list.filter(row => this.isLineOaMyCardCandidate(row));"), 'my-card selector never falls back to private-import cards');
ok(worker.includes('async replySimpleMyCard(events, env)'), 'my-card keyword reply handler exists');
ok(worker.includes('await this.findMySelfCards(env, userId)'), 'reply handler checks existing self cards first');
ok(worker.includes('existingCards.length > 1'), 'multiple self cards render a selector first');
ok(worker.includes('buildMyCardSelectorFlex(existingCards, userId, env)'), 'multiple self cards use selector flex');
ok(worker.includes('myCardPostbackRowId(event)'), 'my-card selector uses postback trigger');
ok(worker.includes("action: 'lineoa_mycard_select'"), 'selector buttons send my-card select postback');
ok(worker.includes('this.buildExistingMyCardFlex(selectedCard, userId, env)'), 'selected card postback renders stored card flex');
ok(worker.includes('? this.buildExistingMyCardFlex(existingCards[0], userId, env)'), 'single existing card renders stored card flex');
ok(/:\s*this\.buildSimpleMyCardFlex\(profile,\s*userId,\s*env\)/.test(worker), 'missing card falls back to template flex');
ok(worker.includes('quickReply') && worker.includes("mode: 'wysiwyg-card'") && worker.includes('myCardQuickReplyItems'), 'reply includes WYSIWYG edit entry');
ok(worker.includes('myCardShowPostbackRowId(event)') && worker.includes("action: 'lineoa_mycard_show'"), 'reply includes show-card postback entry');

const myCardCall = worker.indexOf('const simpleMyCardReplied = await this.replySimpleMyCard(events, env);');
const referralCall = worker.indexOf('const referralFriendReplied = await ReferralFriendKeywordModule.reply(events, env);');
const gasCall = worker.indexOf('const gasRawBody = await this.filterAutoReplyPayload(rawBody, events, env);');
ok(myCardCall >= 0 && referralCall > myCardCall && gasCall > myCardCall, 'my-card keyword is handled before referral and GAS forwarding');

console.log('\nLINE OA my-card keyword contract passed.');
