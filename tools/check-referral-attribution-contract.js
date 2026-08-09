const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8');
const crm = fs.readFileSync(path.join(root, 'js', 'modules', 'crm.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');

function block(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, `missing source block: ${startText}`);
  return source.slice(start, end);
}

const urlBuilders = block(
  config,
  'window.buildPointLiffUrl = function(params)',
  '// 舊版模組大量使用'
);
const context = {
  window: { POINT_LIFF_ID: '1660923784-test' },
  URLSearchParams
};
vm.runInNewContext(`const POINT_LIFF_ID = '1660923784-test';\n${urlBuilders}`, context);

const inviteUrl = new URL(context.window.buildMemberInviteUrl({
  ref: 'U_REFERRER',
  net: 'STORE_NETWORK',
  via: 'STORE_U_REFERRER',
  point_friend: '1',
  point_from: 'lineoa-referral-keyword-v2',
  from: 'business-engine'
}));

assert.equal(inviteUrl.origin, 'https://liff.line.me');
assert.equal(inviteUrl.pathname, '/1660923784-test');
assert.equal(inviteUrl.searchParams.get('ref'), 'U_REFERRER');
assert.equal(inviteUrl.searchParams.get('net'), 'STORE_NETWORK');
assert.equal(inviteUrl.searchParams.get('via'), 'STORE_U_REFERRER');
assert.equal(inviteUrl.searchParams.get('point_friend'), '1');
assert.equal(inviteUrl.searchParams.get('point_from'), 'lineoa-referral-keyword-v2');
assert.equal(inviteUrl.searchParams.get('from'), 'business-engine');
assert.ok(!inviteUrl.href.includes('aiwe.cc/index.php/short_url/963'));

const homeBuilder = block(home, 'window.buildHomeInviteUrl = function()', 'window.openProfileRegistrationPanel');
assert.ok(homeBuilder.includes('buildMemberInviteUrl(inviteParams)'), 'home invite must pass attribution parameters');
for (const field of ['ref:', 'net:', 'via:', "point_friend: '1'", "point_from: 'lineoa-referral-keyword-v2'"]) {
  assert.ok(homeBuilder.includes(field), `home invite missing ${field}`);
}

const crmBuilder = block(crm, 'window.showInviteLink = function()', 'window.closeInviteModal');
assert.ok(crmBuilder.includes('buildMemberInviteUrl(inviteParams)'), 'CRM invite must pass attribution parameters');
for (const field of ['ref:', 'net:', 'via:']) {
  assert.ok(crmBuilder.includes(field), `CRM invite missing ${field}`);
}

assert.ok(auth.includes("const refId = urlParams.get('ref') || '';"), 'auth must read referral id');
assert.ok(auth.includes('if (refId) writeFirstReferral(window.currentUserProfile.userId, refId, netId);'), 'auth must lock first referral');
assert.ok(auth.includes('referrerId: referral.referrerId'), 'registration must submit the resolved referrer');
assert.ok(worker.includes("existing.referrer_id && String(existing.referrer_id).trim() && !canOverrideReferrer"), 'server must preserve existing referral attribution');
assert.ok(worker.includes('FIRST_SHARE_TOUCH_'), 'share visit first-touch tracking must remain enabled');
assert.ok(worker.includes("source: 'share_visit'"), 'share visit must preserve its source record');

console.log('Referral attribution contract passed.');
