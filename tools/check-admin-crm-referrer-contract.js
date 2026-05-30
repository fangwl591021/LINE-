const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = ['admin.html', 'admin-v2.html'];
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');

function fail(file, message) {
  console.error(`Admin CRM referrer contract failed in ${file}: ${message}`);
  process.exit(1);
}

for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  if (!html.includes('id="crm-referrer-id"')) {
    fail(file, 'missing visible referrer UID field');
  }
  if (!html.includes("setInputValue('crm-referrer-id', readSponsorId(user))")) {
    fail(file, 'referrer UID field must be populated from readSponsorId');
  }
  if (!html.includes("referrerId: document.getElementById('crm-referrer-id')?.value || ''")) {
    fail(file, 'saved CRM payload must preserve referrerId');
  }
}

if (!worker.includes("const hasReferrerInput = ['referrerId', 'referrer_id'")) {
  console.error('Admin CRM referrer contract failed in workerbackup.js: missing explicit referrer input detection');
  process.exit(1);
}
if (!worker.includes("const canOverrideReferrer = SecurityModule.normalizeRole(payload.authenticatedRole || '') === 'admin'")) {
  console.error('Admin CRM referrer contract failed in workerbackup.js: missing admin-only referrer override gate');
  process.exit(1);
}
if (!worker.includes("existing.referrer_id && String(existing.referrer_id).trim() && !canOverrideReferrer")) {
  console.error('Admin CRM referrer contract failed in workerbackup.js: existing referrer still cannot be overridden by admin CRM');
  process.exit(1);
}

console.log('Admin CRM referrer contract passed.');
