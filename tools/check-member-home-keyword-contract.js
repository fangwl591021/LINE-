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

const moduleStart = worker.indexOf('const MemberHomeKeywordModule = {');
const nextModuleStart = worker.indexOf('const LineOAStoreSearchKeywordModule = {', moduleStart);
ok(moduleStart >= 0 && nextModuleStart > moduleStart, 'member home keyword module exists');

const moduleSource = worker.slice(moduleStart, nextModuleStart);
ok(moduleSource.includes("return text === '\\u6703\\u54e1\\u4e3b\\u9801';"), 'keyword is exact member homepage');
ok(moduleSource.includes('ReferralFriendKeywordModule.resolveContext(env, userId)'), 'member home resolves current LINE sender context');
ok(moduleSource.includes('ReferralFriendKeywordModule.buildInviteUrl(context, env)'), 'member home uses same invite URL builder as referral QR');
ok(!moduleSource.includes('D1WriteModule'), 'member home keyword does not write card or user data');
ok(moduleSource.includes("label: '\\u958b\\u555f\\u6703\\u54e1\\u4e3b\\u9801'"), 'member home reply has open button');

const memberHomeCall = worker.indexOf('const memberHomeReplied = await MemberHomeKeywordModule.reply(events, env);');
const gasCall = worker.indexOf('const gasRawBody = await this.filterAutoReplyPayload(rawBody, events, env);');
ok(memberHomeCall >= 0 && gasCall > memberHomeCall, 'member home keyword is handled before GAS forwarding');

console.log('\nMember home keyword contract passed.');
