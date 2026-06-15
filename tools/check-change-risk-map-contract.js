const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK ${message}`);
}

const map = JSON.parse(read('docs/contracts/change-risk-map.json'));
const runner = read('tools/run-smoke-contracts.js');
const packageJson = JSON.parse(read('package.json'));
const lookup = read('tools/lookup-change-scope.js');
const readme = read('docs/README.md');
const protocol = read('docs/release/feature-change-protocol.md');

ok(map.schemaVersion === 'change_risk_map_v1', 'risk map schema version is explicit');
ok(map.areas && typeof map.areas === 'object', 'risk map has areas');

const requiredAreas = [
  'my-card',
  'ai-card-folder',
  'identity-ownership',
  'card-versioning',
  'line-keywords',
  'liff-routes',
  'points-ledger',
  'button-actions',
  'inbox-followup',
  'matchmake',
  'home-entry'
];

for (const key of requiredAreas) {
  const area = map.areas[key];
  ok(Boolean(area), `risk map includes ${key}`);
  if (!area) continue;
  ok(Boolean(area.label), `${key} has label`);
  ok(Array.isArray(area.keywords) && area.keywords.length > 0, `${key} has keywords`);
  ok(Array.isArray(area.docs) && area.docs.length > 0, `${key} has docs`);
  ok(Array.isArray(area.checks) && area.checks.length > 0, `${key} has checks`);
  ok(Array.isArray(area.regressionIds), `${key} has regression ids`);
  for (const doc of area.docs || []) ok(exists(doc), `${key} doc exists: ${doc}`);
  for (const check of area.checks || []) ok(exists(check), `${key} check exists: ${check}`);
}

ok(packageJson.scripts && packageJson.scripts['scope:lookup'] === 'node tools/lookup-change-scope.js', 'npm script exposes scope lookup');
ok(lookup.includes('change-risk-map.json'), 'lookup tool reads risk map');
ok(lookup.includes('Docs to read') && lookup.includes('Contract checks') && lookup.includes('Regression IDs'), 'lookup tool prints actionable output');
ok(runner.includes('tools/check-change-risk-map-contract.js'), 'risk map contract is included in full guard');
ok(readme.includes('docs/contracts/change-risk-map.json'), 'README references risk map');
ok(protocol.includes('npm run scope:lookup'), 'feature protocol references scope lookup');

if (process.exitCode) {
  console.error('\nChange risk map contract failed.');
  process.exit(process.exitCode);
}

console.log('\nChange risk map contract passed.');
