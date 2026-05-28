const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = ['admin.html', 'admin-v2.html'];

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

console.log('Admin CRM referrer contract passed.');
