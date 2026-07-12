const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
let failures = 0;

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    failures += 1;
    return;
  }
  console.log(`OK ${message}`);
}

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return '';
}

function branchFor(handler, resultName) {
  const match = handler.match(new RegExp(`const\\s+${resultName}\\s*=\\s*await[\\s\\S]*?;\\s*if\\s*\\(\\s*${resultName}\\s*\\)\\s*return new Response\\('OK', \\{ status: 200 \\}\\);`));
  return match ? match[0] : '';
}

const handler = functionBody(worker, 'async handleWebhook(request, env, ctx)');
ok(!!handler, 'webhook handler is available for ownership verification');

const owners = [
  ['我的名片', 'simpleMyCardReplied'],
  ['名片酷', 'cardCoolReplied'],
  ['推薦好友', 'referralFriendReplied']
];

for (const [keyword, resultName] of owners) {
  const branch = branchFor(handler, resultName);
  ok(!!branch, `${keyword}: a handled reply owns the event and exits the webhook`);
  ok((branch.match(/this\.replyLine\(/g) || []).length === 0, `${keyword}: ownership branch does not issue a second reply itself`);
}

const ownedBranchCount = owners.filter(([, resultName]) => !!branchFor(handler, resultName)).length;
ok(ownedBranchCount === owners.length, 'dedicated keywords each have exactly one ownership exit path');

const genericForward = handler.match(/const gasRawBody = keywordRuleReply \? rawBody : await this\.filterAutoReplyPayload\(rawBody, events, env\);[\s\S]*?const gasResult = await this\.forwardToGas\(gasRawBody, env\);/);
ok(!!genericForward, 'ordinary text still proceeds through the auto-reply forwarding path');

const upstreamBranch = handler.match(/if \(forwardReplyPayload\) \{([\s\S]*?)return new Response\('OK', \{ status: 200 \}\);\s*\}/);
ok(!!upstreamBranch, 'upstream reply payload has a terminating ownership branch');
ok((upstreamBranch?.[1].match(/this\.replyLine\(/g) || []).length === 1, 'upstream reply payload is consumed by one reply API call');

const ownedPrefixes = owners.map(([, resultName]) => branchFor(handler, resultName));
ok(ownedPrefixes.every((branch) => !branch.includes('forwardToGas(')), 'dedicated keyword ownership never reaches auto-reply forwarding');
ok(ownedPrefixes.every((branch) => !branch.includes('filterAutoReplyPayload(')), 'dedicated keyword ownership never re-enters auto-reply filtering');

if (failures) process.exit(1);
console.log('\nKeyword reply ownership semantic contract passed.');