const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs', 'stability-foundation.md'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'tools', 'run-smoke-contracts.js'), 'utf8');

const checks = [
  {
    name: 'FeatureFlagModule exists in Worker',
    pass: /const FeatureFlagModule\s*=\s*\{/.test(worker)
  },
  {
    name: 'FeatureFlagModule supports enabled helper',
    pass: /enabled\(env,\s*name,\s*defaultValue\s*=\s*false\)/.test(worker)
  },
  {
    name: 'FeatureFlagModule supports snapshot helper',
    pass: /snapshot\(env\)[\s\S]*FEATURE_HOME_UI_V2[\s\S]*FEATURE_THIRD_POINT_WEBHOOK/.test(worker)
  },
  {
    name: 'LINE webhook route remains unchanged',
    pass: /url\.pathname === '\/webhook\/line' \|\| url\.pathname === '\/line-webhook'/.test(worker)
  },
  {
    name: 'third point webhook is on a separate route',
    pass: /url\.pathname === '\/point-webhook' \|\| url\.pathname === '\/webhook\/points'/.test(worker)
  },
  {
    name: 'stability document records identity contract',
    pass: /Identity contract/.test(docs) && /line_id/.test(docs) && /point_line_id/.test(docs)
  },
  {
    name: 'smoke runner exists and blocks on failed checks',
    pass: /spawnSync/.test(runner) && /process\.exit\(1\)/.test(runner)
  }
];

const failed = checks.filter(check => !check.pass);

for (const check of checks) {
  console.log(`${check.pass ? 'OK' : 'FAIL'} ${check.name}`);
}

if (failed.length) {
  console.error('\nStability foundation contract failed.');
  process.exit(1);
}

console.log('\nStability foundation contract passed.');
