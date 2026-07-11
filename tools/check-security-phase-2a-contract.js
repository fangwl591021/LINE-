const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const workerPath = path.join(root, 'workerbackup.js');
const worker = fs.readFileSync(workerPath, 'utf8');

function fail(message) {
  console.error(`FAIL ${message}`);
  failed.push(message);
}

function ok(message) {
  console.log(`OK ${message}`);
}

function extractActionPolicies(source) {
  const start = source.indexOf('const ACTION_POLICIES = {');
  if (start < 0) throw new Error('ACTION_POLICIES not found');
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('ACTION_POLICIES closing brace not found');
  const literal = source.slice(bodyStart, end + 1);
  return vm.runInNewContext(`(${literal})`, Object.create(null));
}

function extractDispatchCases(source) {
  const dispatchStart = source.indexOf('async function dispatchAction(action, payload, request, env)');
  if (dispatchStart < 0) throw new Error('dispatchAction not found');
  const defaultIndex = source.indexOf('default:', dispatchStart);
  if (defaultIndex < 0) throw new Error('dispatchAction default not found');
  const dispatchBody = source.slice(dispatchStart, defaultIndex);
  const cases = [];
  const caseRegex = /case\s+['"]([A-Za-z0-9_]+)['"]\s*:/g;
  let match;
  while ((match = caseRegex.exec(dispatchBody))) {
    cases.push(match[1]);
  }
  return Array.from(new Set(cases));
}

function policyAccess(name) {
  return policies[name] && policies[name].access;
}

const failed = [];
let policies = {};
let cases = [];

try {
  policies = extractActionPolicies(worker);
  ok('ACTION_POLICIES can be parsed');
} catch (err) {
  fail(err.message);
}

try {
  cases = extractDispatchCases(worker);
  ok('dispatchAction cases can be parsed');
} catch (err) {
  fail(err.message);
}

const policyNames = Object.keys(policies);
const missingPolicies = cases.filter(name => !policies[name]);
const stalePolicies = policyNames.filter(name => !cases.includes(name));

if (missingPolicies.length) fail(`dispatch actions missing policy: ${missingPolicies.join(', ')}`);
else ok(`all dispatchAction cases have policies (${cases.length})`);

if (stalePolicies.length) fail(`ACTION_POLICIES contains actions not in dispatchAction: ${stalePolicies.join(', ')}`);
else ok('ACTION_POLICIES has no stale action entries');

if (/allowed:\s*true,\s*actor:\s*null\s*}\s*;?\s*\n\s*}\s*\n\s*\n\s*let actor = await this\.getActor/.test(worker)) {
  fail('authorizeAction still has old implicit allowed true path');
} else {
  ok('authorizeAction no longer contains the old implicit allow path');
}

if (/ACTION_POLICY_NOT_FOUND/.test(worker)) ok('unknown actions are logged/rejected with ACTION_POLICY_NOT_FOUND');
else fail('ACTION_POLICY_NOT_FOUND is missing');

if (/d1IdentityFallbackActions/.test(worker)) fail('old d1IdentityFallbackActions set still exists');
else ok('old d1IdentityFallbackActions set was removed');

if (/policy\.allowD1Fallback/.test(worker) && /!actor && policy\.allowD1Fallback[\s\S]{0,120}getActorFromD1Identity/.test(worker)) {
  ok('D1 identity fallback is guarded by policy.allowD1Fallback');
} else {
  fail('D1 identity fallback is not clearly guarded by policy.allowD1Fallback');
}

if (policyAccess('repairRecentLineOAFollowPointAwards') === 'admin') ok('repairRecentLineOAFollowPointAwards is admin');
else fail('repairRecentLineOAFollowPointAwards must be admin');

for (const name of ['uploadImageToR2', 'updateCrmContact']) {
  if (policyAccess(name) && policyAccess(name) !== 'public') ok(`${name} is not public`);
  else fail(`${name} must not be public`);
}

for (const name of ['recognizeCardWithGPT4o', 'generateCardCopy', 'reviewCardSafety']) {
  if (policyAccess(name) && policyAccess(name) !== 'public') ok(`${name} is not public`);
  else fail(`${name} must not be public`);
}

const publicPolicies = policyNames.filter(name => policies[name].access === 'public');
if (publicPolicies.length) ok(`public actions are explicit (${publicPolicies.length})`);
else fail('no explicit public policies found');

const invalidAccess = policyNames.filter(name => !['public', 'authenticated', 'manager', 'admin'].includes(policies[name].access));
if (invalidAccess.length) fail(`invalid policy access values: ${invalidAccess.join(', ')}`);
else ok('all policies use known access levels');

const fallbackActions = policyNames.filter(name => policies[name].allowD1Fallback === true);
if (fallbackActions.length && fallbackActions.every(name => policies[name].access !== 'public')) {
  ok(`D1 fallback actions are explicit and non-public (${fallbackActions.length})`);
} else {
  fail('D1 fallback actions must be explicit and non-public');
}

if (failed.length) {
  console.error('\nPhase 2A security contract failed. Do not commit/deploy until fixed.');
  process.exit(1);
}

console.log('\nPhase 2A security contract passed.');
console.log(JSON.stringify({
  dispatchActionCount: cases.length,
  policyCount: policyNames.length,
  publicCount: publicPolicies.length,
  authenticatedCount: policyNames.filter(name => policies[name].access === 'authenticated').length,
  managerCount: policyNames.filter(name => policies[name].access === 'manager').length,
  adminCount: policyNames.filter(name => policies[name].access === 'admin').length,
  d1FallbackActions: fallbackActions
}, null, 2));