const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'tools', 'diagnose-identity.js'), 'utf8');
const psScript = fs.readFileSync(path.join(root, 'tools', 'diagnose-identity.ps1'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs', 'identity-diagnostic.md'), 'utf8');

const requiredSqlFields = [
  'line_id',
  'row_id',
  'legacy_line_id',
  'point_line_id',
  'referrer_id',
  'network_id',
  'owner_user_id',
  'creator_id',
  'profile_user_id',
  'source_type',
  'receiver_user_id',
  'sender_user_id',
  'user_id'
];

const checks = [
  {
    name: 'diagnostic script exists as read-only D1 query tool',
    pass: /wrangler['"],\s*'d1'/.test(script) && !/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b/i.test(script)
  },
  {
    name: 'diagnostic supports remote D1 by default',
    pass: /const remote = !args\.includes\('--local'\)/.test(script)
  },
  {
    name: 'diagnostic collects identity aliases',
    pass: /function collectAliases/.test(script) && /point_line_id/.test(script) && /legacy_line_id/.test(script)
  },
  {
    name: 'diagnostic inspects users cards awards inbox and tasks',
    pass: /FROM users/.test(script) &&
      /FROM card_contacts/.test(script) &&
      /FROM point_awards/.test(script) &&
      /FROM inbox_items/.test(script) &&
      /FROM personal_tasks/.test(script)
  },
  {
    name: 'diagnostic documents usage',
    pass: /diagnose-identity\.ps1/.test(docs) && /Do not use this tool to merge/.test(docs)
  },
  {
    name: 'diagnostic covers core identity fields',
    pass: requiredSqlFields.every(field => script.includes(field))
  },
  {
    name: 'PowerShell diagnostic is available for Windows operators',
    pass: /param\(/.test(psScript) &&
      /Invoke-D1Query/.test(psScript) &&
      /npx\.cmd/.test(psScript) &&
      requiredSqlFields.every(field => psScript.includes(field))
  }
];

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'OK' : 'FAIL'} ${check.name}`);
}

if (failed.length) {
  console.error('\nIdentity diagnostic contract failed.');
  process.exit(1);
}

console.log('\nIdentity diagnostic contract passed.');
