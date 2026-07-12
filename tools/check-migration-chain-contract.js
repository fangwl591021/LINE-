const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationDir = path.join(root, 'migrations');
const fixturePath = path.join(root, 'tools', 'fixtures', 'local-d1', '0000_clean_rebuild_baseline.sql');
const files = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();
let failures = 0;

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    failures += 1;
    return;
  }
  console.log(`OK ${message}`);
}

ok(fs.existsSync(fixturePath), 'local-only 0000 baseline fixture exists outside production migrations');
ok(!files.some((file) => file.startsWith('0000_')), 'production migrations do not contain the local-only 0000 fixture');
ok(files.length > 0 && files[0] === '0001_core_schema.sql', 'production migration chain begins at 0001_core_schema.sql');
ok(new Set(files).size === files.length, 'production migration filenames are unique');

const prefixes = files.map((file) => file.slice(0, 4));
ok(prefixes.filter((prefix, index) => prefixes.indexOf(prefix) !== index).every((prefix) => prefix === '0002'), 'only documented legacy 0002 prefix is duplicated');
ok(files.includes('0013_point_transaction_idempotency.sql') && files.includes('0014_platform_admin_roles.sql'), 'latest production point and platform-role migrations are present');

const fixture = fs.existsSync(fixturePath) ? fs.readFileSync(fixturePath, 'utf8') : '';
const productionSql = files.map((file) => fs.readFileSync(path.join(migrationDir, file), 'utf8')).join('\n');
ok(/CREATE TABLE IF NOT EXISTS users/i.test(fixture), 'fixture supplies legacy users table required before production migrations');
ok(/CREATE TABLE IF NOT EXISTS card_contacts/i.test(fixture), 'fixture supplies legacy card_contacts table required before production migrations');
ok(/CREATE TABLE IF NOT EXISTS users/i.test(fixture) && /CREATE INDEX IF NOT EXISTS idx_users_/i.test(productionSql), 'fixture baseline precedes production indexes that depend on users');
ok(/store_point_cashier_transactions/.test(productionSql), 'production chain includes cashier ledger schema');
ok(/platform_admin_roles/.test(productionSql) && /platform_admin_role_audit/.test(productionSql) && /platform_admin_bootstrap_state/.test(productionSql), 'production chain includes platform admin role schema');
ok(!/U[a-fA-F0-9]{32}|09\d{8}|AIza|sk-/.test(productionSql), 'production migrations contain no known sensitive values');

if (failures) process.exit(1);
console.log('\nMigration chain contract passed.');