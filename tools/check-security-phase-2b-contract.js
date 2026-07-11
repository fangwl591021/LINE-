const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const workerPath = path.join(root, 'workerbackup.js');
const worker = fs.readFileSync(workerPath, 'utf8');
const failed = [];

function fail(message) {
  console.error(`FAIL ${message}`);
  failed.push(message);
}

function ok(message) {
  console.log(`OK ${message}`);
}

function extractObjectLiteral(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${marker} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return source.slice(bodyStart, i + 1);
  }
  throw new Error(`${marker} closing brace not found`);
}

function extractFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`${signature} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return source.slice(bodyStart + 1, i);
  }
  throw new Error(`${signature} closing brace not found`);
}

function extractModuleFunctionBody(source, moduleName, functionName) {
  const moduleStart = source.indexOf(`const ${moduleName} = {`);
  if (moduleStart < 0) throw new Error(`${moduleName} not found`);
  const functionStart = source.indexOf(`async ${functionName}(`, moduleStart);
  if (functionStart < 0) throw new Error(`${moduleName}.${functionName} not found`);
  return extractFunctionBody(source.slice(functionStart), `async ${functionName}(`);
}

let policies = {};
try {
  policies = vm.runInNewContext(`(${extractObjectLiteral(worker, 'const ACTION_POLICIES = {')})`, Object.create(null));
  ok('ACTION_POLICIES can be parsed');
} catch (err) {
  fail(err.message);
}

let fallbackActions = [];
try {
  fallbackActions = Object.keys(policies).filter(name => policies[name].allowD1Fallback === true);
  ok(`D1 fallback actions parsed (${fallbackActions.length})`);
} catch (err) {
  fail(`D1 fallback action scan failed: ${err.message}`);
}

for (const name of ['saveCard', 'updateCard', 'getCardContacts', 'getCardHarvestContacts', 'getCrmContacts', 'updateCrmContact']) {
  if (policies[name] && policies[name].allowD1Fallback !== true) ok(`${name} does not allow D1 fallback`);
  else fail(`${name} must not allow D1 fallback in Phase 2B`);
}

for (const name of ['updateActivity', 'saveStoreSettings', 'saveStoreKnowledgeBase', 'adminSyncBoundCardUser', 'getLineOAChatMonitor', 'getLineOAChatAudience', 'getLineOAChatCrm', 'uploadLineOAAsset', 'sendLineOAChatReply', 'updateLineOAChatThread']) {
  if (policies[name] && policies[name].allowD1Fallback !== true) ok(`${name} high-risk fallback removed`);
  else fail(`${name} must not keep D1 fallback`);
}

let actorFallbackBody = '';
try {
  actorFallbackBody = extractModuleFunctionBody(worker, 'SecurityModule', 'getActorFromD1Identity');
  ok('getActorFromD1Identity body can be parsed');
} catch (err) {
  fail(err.message);
}

if (/trustedD1FallbackSources/.test(worker) && /trustedD1FallbackSource/.test(worker)) ok('D1 fallback requires a trusted source marker');
else fail('D1 fallback trusted source marker is missing');

const forbiddenActorFallbackFields = [
  ['payload.targetUserId', /payload\.targetUserId/],
  ['payload.pointUserId', /payload\.pointUserId/],
  ['payload.pt_uid', /payload\.pt_uid/],
  ['payload.userId', /payload\.userId/],
  ['payload.lineId', /payload\.lineId/],
  ['payload.LINE_user_id', /payload\.LINE_user_id/],
  ['payload.ownerUserId', /payload\.ownerUserId/],
  ['payload.creatorId', /payload\.creatorId/],
  ['data.pointUserId', /data\.pointUserId/],
  ['data.pt_uid', /data\.pt_uid/],
  ['data.userId', /data\.userId/],
  ['data.lineId', /data\.lineId/],
  ['data.LINE_user_id', /data\.LINE_user_id/],
  ["data['LINE ID']", /data\[['"]LINE ID['"]\]/],
  ['data.ownerUserId', /data\.ownerUserId/],
  ['data.creatorId', /data\.creatorId/],
  ["data['建檔者ID']", /data\[['"]建檔者ID['"]\]/]
];
for (const [label, pattern] of forbiddenActorFallbackFields) {
  if (pattern.test(actorFallbackBody)) fail(`getActorFromD1Identity still trusts resource/target field ${label}`);
}
if (!failed.some(msg => msg.includes('getActorFromD1Identity still trusts'))) ok('getActorFromD1Identity does not trust target/resource identity fields');

let upsertBody = '';
try {
  upsertBody = extractModuleFunctionBody(worker, 'D1WriteModule', 'upsertCard');
  ok('D1WriteModule.upsertCard body can be parsed');
} catch (err) {
  fail(err.message);
}

if (/const actorId = this\.text\(payload\.authenticatedUserId\)/.test(upsertBody)) ok('upsertCard actor comes only from authenticatedUserId');
else fail('upsertCard must use authenticatedUserId as the actor source');

if (/payload\.authenticatedUserId \|\| payload\.userId/.test(upsertBody)) fail('upsertCard still falls back from authenticatedUserId to userId');
else ok('upsertCard does not fallback to payload.userId for actor');

if (/identityIdsForUser\(env, actorId\)/.test(upsertBody) && /isResourceOwner/.test(upsertBody)) ok('upsertCard checks canonical actor identities against stored resource identity');
else fail('upsertCard must check canonical actor identity ownership');

for (const field of ['line_id', 'creator_id', 'owner_user_id', 'profile_user_id', 'source_type', 'visibility', 'pool_eligible', 'ai_review_status', 'network_id']) {
  const pattern = new RegExp(`card\\.${field}\\s*=\\s*this\\.text\\(existing\\.${field}|card\\.${field}\\s*=\\s*existing\\.${field}`);
  if (pattern.test(upsertBody) || field === 'pool_eligible' && /card\.pool_eligible\s*=\s*existing\.pool_eligible/.test(upsertBody)) ok(`upsertCard preserves existing ${field}`);
  else fail(`upsertCard must preserve existing ${field}`);
}

const ownerCheckSlice = upsertBody.slice(upsertBody.indexOf('const existing ='), upsertBody.indexOf('const rawAwardUserId'));
if (/name|phone|mobile|office_phone|company_name/.test(ownerCheckSlice)) fail('upsertCard ownership check must not use name/phone/company fields');
else ok('upsertCard ownership check does not use name/phone/company fields');

if (/access\.sourceType === 'private_import'/.test(upsertBody) && /access\.ownerUserId = ''/.test(upsertBody)) ok('private import creation does not auto-own unbound scanned cards');
else fail('private import creation must not auto-own unbound scanned cards');

let getCardContactsBody = '';
let getCardHarvestBody = '';
let getCrmContactsBody = '';
let updateCrmBody = '';
try {
  getCardContactsBody = extractModuleFunctionBody(worker, 'D1ReadModule', 'getCardContacts');
  getCardHarvestBody = extractModuleFunctionBody(worker, 'D1ReadModule', 'getCardHarvestContacts');
  getCrmContactsBody = extractModuleFunctionBody(worker, 'D1ReadModule', 'getCrmContacts');
  updateCrmBody = extractModuleFunctionBody(worker, 'D1ReadModule', 'updateCrmContact');
  ok('card/CRM D1 read bodies can be parsed');
} catch (err) {
  fail(err.message);
}

for (const [name, body] of [['getCardContacts', getCardContactsBody], ['getCardHarvestContacts', getCardHarvestBody], ['getCrmContacts', getCrmContactsBody], ['updateCrmContact', updateCrmBody]]) {
  if (/this\.text\(payload\.authenticatedUserId\)/.test(body)) ok(`${name} uses authenticatedUserId for actor`);
  else fail(`${name} must use authenticatedUserId for actor`);
  if (/payload\.authenticatedUserId \|\| payload\.userId/.test(body)) fail(`${name} still falls back to payload.userId`);
}

if (/role === 'store'/.test(getCrmContactsBody) && /c\.network_id = \?/.test(getCrmContactsBody) && /authenticatedNetworkId/.test(getCrmContactsBody)) ok('getCrmContacts scopes store managers to authenticated tenant network');
else fail('getCrmContacts must scope store managers to authenticated tenant network');

if (/isStoreManager/.test(updateCrmBody) && /row\.network_id/.test(updateCrmBody) && /isResourceOwner/.test(updateCrmBody)) ok('updateCrmContact enforces tenant manager or resource owner');
else fail('updateCrmContact must enforce tenant manager or resource owner');

if (failed.length) {
  console.error('\nPhase 2B security contract failed. Do not commit/deploy until fixed.');
  process.exit(1);
}

console.log('\nPhase 2B security contract passed.');
console.log(JSON.stringify({
  d1FallbackCount: fallbackActions.length,
  d1FallbackActions: fallbackActions,
  highRiskFallbackRemoved: true
}, null, 2));