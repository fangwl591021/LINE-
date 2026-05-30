const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'tools', 'preview-identity-repair.ps1'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs', 'identity-repair-dry-run.md'), 'utf8');

const forbiddenWrites = [
  /Invoke-D1Query(?:Safe)?\s+"[^"]*\bUPDATE\b/i,
  /Invoke-D1Query(?:Safe)?\s+"[^"]*\bINSERT\b/i,
  /Invoke-D1Query(?:Safe)?\s+"[^"]*\bDELETE\b/i,
  /Invoke-D1Query(?:Safe)?\s+"[^"]*\bDROP\b/i,
  /Invoke-D1Query(?:Safe)?\s+"[^"]*\bALTER\b/i,
  /Invoke-D1Query(?:Safe)?\s+@"[\s\S]*?\bUPDATE\b[\s\S]*?"@/i,
  /Invoke-D1Query(?:Safe)?\s+@"[\s\S]*?\bINSERT\b[\s\S]*?"@/i,
  /Invoke-D1Query(?:Safe)?\s+@"[\s\S]*?\bDELETE\b[\s\S]*?"@/i,
  /Invoke-D1Query(?:Safe)?\s+@"[\s\S]*?\bDROP\b[\s\S]*?"@/i,
  /Invoke-D1Query(?:Safe)?\s+@"[\s\S]*?\bALTER\b[\s\S]*?"@/i
];

const requiredTables = [
  'users',
  'card_contacts',
  'user_identity_links',
  'point_awards',
  'inbox_items',
  'personal_tasks',
  'registrants'
];

const checks = [
  {
    name: 'dry-run script is read-only',
    pass: forbiddenWrites.every(pattern => !pattern.test(script))
  },
  {
    name: 'dry-run requires OldId and CanonicalId',
    pass: /\[string\]\$OldId/.test(script) && /\[string\]\$CanonicalId/.test(script)
  },
  {
    name: 'dry-run reports zero writes',
    pass: /writes\s*=\s*0/.test(script) && /mode\s*=\s*"dry-run"/.test(script)
  },
  {
    name: 'dry-run checks important tables',
    pass: requiredTables.every(table => script.includes(table))
  },
  {
    name: 'dry-run warns about self profile and CRM card ambiguity',
    pass: /self_profile/.test(script) && /non-self CRM cards/.test(script)
  },
  {
    name: 'dry-run docs state it is read-only',
    pass: /read-only/.test(docs) && /does not update/.test(docs)
  }
];

const failed = checks.filter(check => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? 'OK' : 'FAIL'} ${check.name}`);
}

if (failed.length) {
  console.error('\nIdentity repair dry-run contract failed.');
  process.exit(1);
}

console.log('\nIdentity repair dry-run contract passed.');
