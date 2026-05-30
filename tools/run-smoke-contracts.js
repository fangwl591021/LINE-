const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const node = process.execPath;

const foundationChecks = [
  'tools/check-stability-foundation-contract.js',
  'tools/check-route-contract.js',
  'tools/check-identity-diagnostic-contract.js',
  'tools/check-identity-repair-dry-run-contract.js',
  'tools/check-identity-bridge-contract.js',
  'tools/check-hard-admin-upsert-contract.js',
  'tools/check-lineoa-mycard-keyword-contract.js',
  'tools/check-referral-keyword-v2-contract.js'
];

const fullChecks = [
  'tools/check-stability-foundation-contract.js',
  'tools/check-route-contract.js',
  'tools/check-identity-diagnostic-contract.js',
  'tools/check-identity-repair-dry-run-contract.js',
  'tools/check-hard-admin-upsert-contract.js',
  'tools/check-lineoa-mycard-keyword-contract.js',
  'tools/check-referral-keyword-v2-contract.js',
  'tools/check-auth-contract.js',
  'tools/check-share-contract.js',
  'tools/check-inbox-recipient-scope-contract.js',
  'tools/check-mycard-entry-contract.js',
  'tools/check-own-card-upload-contract.js',
  'tools/check-matchmake-contract.js',
  'tools/check-admin-crm-referrer-contract.js'
];

const requested = process.argv.slice(2);
const checks = requested.includes('--full')
  ? fullChecks
  : requested.length
    ? requested.filter(arg => arg !== '--full')
    : foundationChecks;
let failed = false;

for (const relativePath of checks) {
  const scriptPath = path.resolve(root, relativePath);
  console.log(`\n== ${relativePath} ==`);
  const result = spawnSync(node, [scriptPath], {
    cwd: root,
    stdio: 'inherit',
    shell: false
  });
  if (result.status !== 0) {
    failed = true;
    console.error(`FAILED ${relativePath}`);
  }
}

if (failed) {
  console.error('\nSmoke contracts failed. Do not deploy this build.');
  process.exit(1);
}

console.log('\nSmoke contracts passed.');
