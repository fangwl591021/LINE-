const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');

function extractSet(name) {
  const match = worker.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) return new Set();
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]));
}

function extractCases() {
  return new Set([...worker.matchAll(/case '([^']+)'/g)].map(item => item[1]));
}

function section(name) {
  const match = worker.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`));
  return match ? match[0] : '';
}

const adminOnly = extractSet('adminOnly');
const managerOnly = extractSet('managerOnly');
const ownTokenRequired = extractSet('ownTokenRequired');
const d1Fallback = extractSet('d1IdentityFallbackActions');
const cases = extractCases();
const explicitlyClassified = new Set([...adminOnly, ...managerOnly, ...ownTokenRequired]);
const unclassified = [...cases].filter(action => !explicitlyClassified.has(action)).sort();
const pointModule = section('PointModule');
const securityModule = section('SecurityModule');

const checks = [
  {
    severity: 'Critical',
    name: 'Action authorization is deny-by-default',
    pass: !/return\s*\{\s*allowed:\s*true,\s*actor:\s*null\s*\}/.test(securityModule),
    detail: 'authorizeAction currently allows actions not listed in adminOnly, managerOnly, or ownTokenRequired.'
  },
  {
    severity: 'Critical',
    name: 'Every dispatch action is explicitly classified',
    pass: unclassified.length === 0,
    detail: `Unclassified actions: ${unclassified.join(', ')}`
  },
  {
    severity: 'Critical',
    name: 'D1 identity fallback does not trust client-supplied userId for actor creation',
    pass: !/payload\.userId/.test(securityModule) && !/payload\.targetUserId/.test(securityModule),
    detail: 'getActorFromD1Identity reads payload userId/targetUserId and can create tokenless actors.'
  },
  {
    severity: 'High',
    name: 'Unauthenticated users cannot modify cards via D1 identity fallback',
    pass: !d1Fallback.has('saveCard') && !d1Fallback.has('updateCard'),
    detail: 'saveCard/updateCard are present in d1IdentityFallbackActions.'
  },
  {
    severity: 'High',
    name: 'A tenant cannot access another tenant CRM through tokenless D1 fallback',
    pass: !d1Fallback.has('getCrmContacts'),
    detail: 'getCrmContacts is present in d1IdentityFallbackActions; tenant ownership is not enforced at authorizeAction.'
  },
  {
    severity: 'High',
    name: 'General member cannot call admin actions',
    pass: adminOnly.has('updateUserRole') &&
      adminOnly.has('adminAdjustCustomerPoints') &&
      adminOnly.has('getLineOAChatCrm') &&
      /adminOnly\.has\(action\)\s*&&\s*actor\.role\s*!==\s*'admin'/.test(securityModule),
    detail: 'Admin action set and role gate must remain present.'
  },
  {
    severity: 'Critical',
    name: 'Store cashier submit has request-level idempotency',
    pass: /idempotencyKey|clientRequestId|requestId/.test(pointModule) &&
      /storeAdjustCustomerPoints[\s\S]*idempotencyKey|storeAdjustCustomerPoints[\s\S]*clientRequestId|storeAdjustCustomerPoints[\s\S]*requestId/.test(pointModule),
    detail: 'storeAdjustCustomerPoints does not expose a request idempotency key.'
  },
  {
    severity: 'Critical',
    name: 'Cashier session is consumed after successful submit',
    pass: /delete\([^)]*cashierSession|consumed|used_at|consumeStorePointCashierSession/.test(pointModule),
    detail: 'No static evidence that cashierSessionId is single-use.'
  },
  {
    severity: 'High',
    name: 'Frontend userId alone cannot grant authority',
    pass: !/payload\.authenticatedUserId\s*=\s*user\.userId/.test(securityModule),
    detail: 'Special D1 fallback branches write authenticatedUserId from payload-resolved identity.'
  }
];

let failed = false;
for (const check of checks) {
  const status = check.pass ? 'OK' : 'FAIL';
  console.log(`${status} [${check.severity}] ${check.name}`);
  if (!check.pass) {
    failed = true;
    console.log(`  ${check.detail}`);
  }
}

if (failed) {
  console.error('\nSecurity Phase 1 contract found unresolved risks. This is expected before Phase 2 remediation; do not deploy as a security fix.');
  process.exit(1);
}

console.log('\nSecurity Phase 1 contract passed.');
