const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'migrations', '0016_customer_import_foundation.sql'), 'utf8');
const moduleSource = fs.readFileSync(path.join(root, 'worker', 'customer-import.mjs'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');
const customers = fs.readFileSync(path.join(root, 'js', 'modules', 'customers.js'), 'utf8');

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
expect(moduleSource.includes("if (nextDecision === 'create') return 'create'"), 'new preview rows must not inherit the duplicate skip resolution');
expect(moduleSource.includes("requested === 'fill_blanks' ? 'fill_blanks' : 'skip'"), 'duplicate rows must only allow skip or fill-blanks resolution');
expect(moduleSource.includes('applied_customer_version'), 'rollback must be version aware');
expect(!/\b(?:INSERT\s+INTO|UPDATE)\s+card_contacts\b/i.test(moduleSource), 'customer import must not write business cards');
expect(worker.startsWith("import { CustomerImportModule } from './worker/customer-import.mjs';"), 'worker must import customer module');
for (const action of ['listCustomers','saveCustomer','archiveCustomer','createCustomerImportBatch','suggestCustomerImportMapping','previewCustomerImportRows','commitCustomerImportBatch','getCustomerImportBatch','rollbackCustomerImportBatch']) {
  expect(worker.includes(`${action}: { access: 'authenticated'`), `${action} must be authenticated`);
  expect(worker.includes(`case '${action}':`), `${action} must be routed`);
}
expect(index.includes('id="page-customers"'), 'My customers page must exist');
expect(index.includes("window.goPage('customers')"), 'home entry must open My customers');
expect(index.includes('xlsx-0.20.3/package/dist/xlsx.full.min.js'), 'spreadsheet parser must use the pinned official browser build');
expect(index.includes('js/modules/customers.js?v=1.1'), 'customer controller must be loaded with the current cache-bust');
expect(navigation.includes("page === 'customers'") && navigation.includes('window.initCustomersPage'), 'navigation must initialize the customer page');
for (const marker of ['LIMITS', 'fileBytes: 5 * 1024 * 1024', 'rows: 500', "['xlsx','xls','csv']", 'previewCustomerImportRows', 'confirmAuthority: true', 'customer-authority-confirm', 'rollbackCustomerImportBatch']) {
  expect(customers.includes(marker), `customer UI must include ${marker}`);
}
expect(customers.includes('maskedAiSample'), 'AI samples must be de-identified before upload');
expect(customers.includes('suggestCustomerImportMapping'), 'customer UI must request AI mapping suggestions');
expect(worker.includes("warning: 'AI_MAPPING_FALLBACK'"), 'AI mapping must have a deterministic fallback');
expect(core.includes("'previewCustomerImportRows'") && core.includes("'commitCustomerImportBatch'"), 'customer preview and commit must use the bounded long-request timeout');
expect(core.includes('? 10000') && core.includes('? 60000 : 18000'), 'customer long-request timeout must not change unrelated API limits');
expect(worker.includes("confidence === 'high'") || customers.includes("confidence === 'high'"), 'AI mapping must expose confidence');
expect(customers.includes('window.downloadCustomerTemplate'), 'customer template download must exist');
expect(customers.indexOf("previewCustomerImportRows") < customers.indexOf("commitCustomerImportBatch"), 'preview must precede commit');
expect(!customers.includes("saveCard") && !customers.includes("card_contacts"), 'customer UI must not write business cards');

console.log('Customer import contract passed.');
