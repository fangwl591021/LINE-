const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

function expect(condition, message) {
  if (!condition) {
    console.error(`Admin customer import monitor contract failed: ${message}`);
    process.exit(1);
  }
}

const actions = [
  'getAdminCustomerImportOverview',
  'listAdminCustomerImportBatches',
  'getAdminCustomerImportBatchSummary'
];

for (const action of actions) {
  expect(worker.includes(`${action}: { access: 'admin' }`), `${action} must be admin-only`);
  expect(worker.includes(`case '${action}':`), `${action} must be routed`);
  expect(admin.includes(`'${action}'`), `${action} must be used by admin.html`);
}

const start = worker.indexOf('const AdminCustomerImportMonitorModule = {');
const end = worker.indexOf('const D1AnnouncementModule = {', start);
expect(start >= 0 && end > start, 'isolated admin monitor module must exist');
const monitor = worker.slice(start, end);

expect(monitor.includes('COUNT(*) AS total_customers'), 'overview must aggregate customer count');
expect(monitor.includes('FROM customer_import_batches'), 'monitor must read import batches');
expect(monitor.includes('GROUP BY COALESCE'), 'detail must aggregate safe error codes');
expect(monitor.includes('customer_tag_analysis_settings'), 'monitor must show AI kill-switch settings');
expect(monitor.includes('customer_tag_analysis_batches'), 'monitor must show AI cost aggregates');
expect(!/SELECT\s+\*\s+FROM\s+customer_records/i.test(monitor), 'monitor must not fetch customer records');
for (const privateField of ['normalized_json', 'normalized_mobile', 'normalized_email', 'mobile', 'email', 'address', 'birthday', 'notes']) {
  expect(!new RegExp(`\\b${privateField}\\b`, 'i').test(monitor), `monitor must not expose ${privateField}`);
}

expect(admin.includes("switchTab('customer-imports')"), 'admin sidebar must expose customer import monitor');
expect(admin.includes('id="tab-customer-imports"'), 'admin customer import tab must exist');
expect(admin.includes('唯讀'), 'admin UI must label the monitor read-only');
expect(admin.includes('不顯示用戶客戶的電話、Email、地址、生日或備註'), 'admin UI must explain privacy boundary');
expect(!admin.includes('rollbackAdminCustomerImport') && !admin.includes('deleteAdminCustomerImport'), 'admin monitor must not add cross-user mutation controls');

console.log('Admin customer import monitor contract passed.');
