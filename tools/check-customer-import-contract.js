const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'migrations', '0016_customer_import_foundation.sql'), 'utf8');
const moduleSource = fs.readFileSync(path.join(root, 'worker', 'customer-import.mjs'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');

function expect(condition, message) {
  if (!condition) {
    console.error(`Customer import contract failed: ${message}`);
    process.exit(1);
  }
}

for (const table of ['customer_records', 'customer_import_batches', 'customer_import_rows', 'customer_contact_links']) {
  expect(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist`);
}
expect(/network_id\s+TEXT\s+NOT\s+NULL/i.test(migration), 'records must be tenant scoped');
expect(/owner_user_id\s+TEXT\s+NOT\s+NULL/i.test(migration), 'records must be owner scoped');
expect(/is_private\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+1/i.test(migration), 'imports must default private');
expect(/is_public\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/i.test(migration), 'imports must default non-public');
expect(moduleSource.includes('payload.authenticatedUserId'), 'owner must come from authenticated context');
expect(moduleSource.includes('payload.authenticatedNetworkId'), 'tenant must come from authenticated context');
expect(moduleSource.includes('AUTHORITY_CONFIRMATION_REQUIRED'), 'commit must require explicit authority confirmation');
expect(moduleSource.includes("status='previewed'"), 'commit must consume previewed rows only');
expect(moduleSource.includes('normalized_mobile = ?') && moduleSource.includes('normalized_email = ?'), 'dedupe must use normalized stable keys');
expect(moduleSource.includes('DUPLICATE_IN_BATCH'), 'preview must detect duplicate rows inside one batch');
expect(moduleSource.includes('DUPLICATE_CHANGED_AFTER_PREVIEW'), 'commit must recheck duplicates after preview');
expect(moduleSource.includes('applied_customer_version'), 'rollback must be version aware');
expect(!/\b(?:INSERT\s+INTO|UPDATE)\s+card_contacts\b/i.test(moduleSource), 'customer import must not write business cards');
expect(worker.startsWith("import { CustomerImportModule } from './worker/customer-import.mjs';"), 'worker must import customer module');
for (const action of ['listCustomers','saveCustomer','archiveCustomer','createCustomerImportBatch','previewCustomerImportRows','commitCustomerImportBatch','getCustomerImportBatch','rollbackCustomerImportBatch']) {
  expect(worker.includes(`${action}: { access: 'authenticated'`), `${action} must be authenticated`);
  expect(worker.includes(`case '${action}':`), `${action} must be routed`);
}

console.log('Customer import contract passed.');
