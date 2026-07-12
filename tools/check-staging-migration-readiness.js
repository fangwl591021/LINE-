const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const snapshotIndex = args.indexOf('--schema-snapshot');
if (snapshotIndex < 0 || !args[snapshotIndex + 1]) {
  console.error('Usage: node tools/check-staging-migration-readiness.js --schema-snapshot <snapshot.json>');
  process.exit(2);
}

const snapshotPath = path.resolve(root, args[snapshotIndex + 1]);
if (!fs.existsSync(snapshotPath)) {
  console.error(`BLOCKER schema snapshot not found: ${args[snapshotIndex + 1]}`);
  process.exit(2);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const migrationDir = path.join(root, 'migrations');
const productionMigrations = fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort();
const applied = Array.isArray(snapshot.migrations) ? snapshot.migrations : [];
const tables = new Set((snapshot.tables || []).map((name) => String(name)));
const indexes = new Set((snapshot.indexes || []).map((name) => String(name)));
const blockers = [];
const warnings = [];

function requireCondition(condition, message) {
  if (!condition) blockers.push(message);
  console.log(`${condition ? 'OK' : 'BLOCKER'} ${message}`);
}

function hasAny(values) {
  return values.some((value) => tables.has(value));
}

function migrationSql(name) {
  return fs.readFileSync(path.join(migrationDir, name), 'utf8');
}

function createdNames(sql, kind) {
  const pattern = kind === 'table'
    ? /CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)/gi
    : /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS\s+([A-Za-z0-9_]+)/gi;
  return [...sql.matchAll(pattern)].map((match) => match[1]);
}

function isOrderedPrefix(prefix, full) {
  return prefix.every((name, index) => full[index] === name);
}

requireCondition(snapshot.kind === 'line-staging-schema-snapshot', 'snapshot has the expected staging schema format');
requireCondition(snapshot.environment === 'staging', 'snapshot declares staging environment');
if (snapshot.verification === 'example_only') warnings.push('snapshot is an example fixture, not evidence of a live staging database');
requireCondition(tables.has('users'), 'users table exists');
requireCondition(tables.has('card_contacts'), 'card_contacts table exists');
requireCondition(tables.has('d1_migrations'), 'd1_migrations table exists');
requireCondition(hasAny(['points_ledger', 'store_point_cashier_logs', 'store_point_cashier_transactions']), 'an existing point ledger or cashier ledger exists');
requireCondition(hasAny(['point_sync_jobs', 'point_sync_event_keys']), 'a point sync queue or event-key ledger exists');
requireCondition(isOrderedPrefix(applied, productionMigrations), 'staging migration ledger is an ordered production-migration prefix with no gap');

const migration13 = '0013_point_transaction_idempotency.sql';
const migration14 = '0014_platform_admin_roles.sql';
const index13 = applied.indexOf(migration13);
const index14 = applied.indexOf(migration14);
requireCondition(!(index14 >= 0 && index13 < 0), '0014 is never applied before 0013');
requireCondition(!(index13 >= 0 && index14 >= 0) || index13 < index14, '0013 precedes 0014 when both are applied');

for (const name of [migration13, migration14]) {
  const sql = migrationSql(name);
  const isApplied = applied.includes(name);
  const tablesCreated = createdNames(sql, 'table');
  const indexesCreated = createdNames(sql, 'index');
  const existingObjects = tablesCreated.filter((value) => tables.has(value)).concat(indexesCreated.filter((value) => indexes.has(value)));
  requireCondition(isApplied || existingObjects.length === 0, `${name} does not collide with pre-existing table/index names before apply`);
  requireCondition(!isApplied || existingObjects.length === tablesCreated.length + indexesCreated.length, `${name} has all expected table/index objects when ledger says applied`);
  requireCondition(!/\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i.test(sql), `${name} is additive and does not drop or clear data`);
  requireCondition(!/U[a-fA-F0-9]{32}|09\d{8}|ADMIN_BOOTSTRAP_SECRET\s*=|MOTHER_LINE_MEMBER_API_KEY\s*=/i.test(sql), `${name} contains no hard-coded admin identity or secret`);
}

if (warnings.length) warnings.forEach((message) => console.warn(`WARNING ${message}`));
if (blockers.length) {
  console.error(`\nStaging migration readiness blocked: ${blockers.length} blocker(s).`);
  process.exit(1);
}
console.log('\nStaging migration readiness contract passed.');