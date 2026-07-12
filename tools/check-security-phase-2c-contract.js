const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations', '0013_point_transaction_idempotency.sql'), 'utf8');
const failed = [];

function ok(message) {
  console.log(`OK ${message}`);
}

function fail(message) {
  console.error(`FAIL ${message}`);
  failed.push(message);
}

function expect(pattern, message) {
  if (pattern.test(worker) || pattern.test(migration)) ok(message);
  else fail(message);
}

function extractObjectLiteral(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${marker} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return source.slice(bodyStart, i + 1);
  }
  throw new Error(`${marker} closing brace not found`);
}

function extractFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`${signature} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return source.slice(bodyStart + 1, i);
  }
  throw new Error(`${signature} closing brace not found`);
}

function extractModuleFunctionBody(source, moduleName, functionName) {
  const moduleStart = source.indexOf(`const ${moduleName} = {`);
  if (moduleStart < 0) throw new Error(`${moduleName} not found`);
  const functionStart = source.indexOf(`async ${functionName}(`, moduleStart);
  if (functionStart < 0) throw new Error(`${moduleName}.${functionName} not found`);
  return extractFunctionBody(source.slice(functionStart), `async ${functionName}(`);
}

let policies = {};
try {
  policies = vm.runInNewContext(`(${extractObjectLiteral(worker, 'const ACTION_POLICIES = {')})`, Object.create(null));
  ok('ACTION_POLICIES parses');
} catch (err) {
  fail(err.message);
}

const publicActions = Object.keys(policies).filter(name => policies[name].access === 'public');
if (publicActions.length === 11) ok('Phase 2C did not add public actions');
else fail(`public action count changed to ${publicActions.length}`);

let storeAdjustBody = '';
try {
  storeAdjustBody = extractModuleFunctionBody(worker, 'PointModule', 'storeAdjustCustomerPoints');
  ok('storeAdjustCustomerPoints body can be parsed');
} catch (err) {
  fail(err.message);
}

if (/normalizeIdempotencyKey\(payload/.test(storeAdjustBody) && /idempotencyKey/.test(storeAdjustBody)) ok('storeAdjustCustomerPoints normalizes an idempotency key');
else fail('storeAdjustCustomerPoints must normalize a request-level idempotency key');

if (/reserveStorePointTransaction\(env/.test(storeAdjustBody)) ok('storeAdjustCustomerPoints reserves a D1 transaction before point mutation');
else fail('storeAdjustCustomerPoints must reserve a D1 transaction');

if (/reservedTransaction\.replay/.test(storeAdjustBody) && /return reservedTransaction\.response/.test(storeAdjustBody)) ok('same idempotency key replays the first success response');
else fail('same idempotency key must replay the first success response');

if (/IDEMPOTENCY_CONFLICT/.test(worker) && /requestFingerprint/.test(worker)) ok('same idempotency key with different request fingerprint is rejected');
else fail('idempotency conflict protection is missing');

expect(/CREATE TABLE IF NOT EXISTS store_point_cashier_sessions/, 'cashier session D1 table exists');
expect(/status TEXT NOT NULL DEFAULT 'prepared'/, 'cashier session has explicit status');
expect(/expires_at TEXT NOT NULL DEFAULT ''/, 'cashier session has expires_at');
expect(/created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP/, 'cashier session has created_at');
expect(/consumed_at TEXT NOT NULL DEFAULT ''/, 'cashier session has consumed_at');

if (/UPDATE store_point_cashier_sessions[\s\S]*WHERE session_id = \?[\s\S]*AND status = 'prepared'[\s\S]*AND expires_at > \?/.test(worker)) ok('cashier session prepared-to-processing uses conditional update');
else fail('cashier session consume must use conditional update from prepared to processing');

for (const code of ['CASHIER_SESSION_ALREADY_USED', 'CASHIER_SESSION_PROCESSING', 'CASHIER_SESSION_EXPIRED', 'CASHIER_SESSION_ACTOR_MISMATCH', 'CASHIER_SESSION_CUSTOMER_MISMATCH', 'CASHIER_SESSION_TENANT_MISMATCH']) {
  if (worker.includes(code)) ok(`${code} is represented`);
  else fail(`${code} missing`);
}

expect(/CREATE TABLE IF NOT EXISTS store_point_cashier_transactions/, 'point transaction ledger table exists');
expect(/CREATE UNIQUE INDEX IF NOT EXISTS idx_store_point_tx_tenant_actor_key[\s\S]*tenant_id, actor_user_id, idempotency_key/, 'ledger has tenant actor idempotency unique constraint');
expect(/CREATE UNIQUE INDEX IF NOT EXISTS idx_store_point_tx_session_once[\s\S]*cashier_session_id/, 'ledger prevents duplicate cashier_session_id');
expect(/external_transaction_id TEXT NOT NULL DEFAULT ''/, 'ledger records external transaction id');
expect(/reconciliation_status TEXT NOT NULL DEFAULT ''/, 'ledger records reconciliation status');

if (/pending_verification/.test(storeAdjustBody) && /POINT_TRANSACTION_UNKNOWN_STATE/.test(storeAdjustBody)) ok('mother timeout/unknown state is marked pending verification');
else fail('mother timeout/unknown state must not be treated as local zero balance');

if (/cashierLogError/.test(storeAdjustBody) && /cashier_log_pending/.test(storeAdjustBody) && /completed_reconcile_pending/.test(storeAdjustBody)) ok('mother success with local ledger failure is reconciliation pending');
else fail('mother success with local ledger failure must not trigger a second point mutation');

if (/VALIDATION_FAILED/.test(storeAdjustBody) && /markStorePointTransaction\(env, transactionId/.test(storeAdjustBody)) ok('validation failures finalize the reserved transaction');
else fail('validation failures must not leave a reserved transaction reusable');

expect(/point_sync_event_keys/, 'sync queue has event key sidecar table');
expect(/event_key TEXT PRIMARY KEY/, 'sync event key has unique primary key');
expect(/idx_point_sync_jobs_event_key/, 'point_sync_jobs has event_key unique index');

let pointSyncBody = '';
try {
  pointSyncBody = extractModuleFunctionBody(worker, 'PointSyncModule', 'enqueue');
  ok('PointSyncModule.enqueue body can be parsed');
} catch (err) {
  fail(err.message);
}

if (/INSERT OR IGNORE INTO point_sync_event_keys/.test(pointSyncBody) && /duplicate: true/.test(pointSyncBody)) ok('duplicate sync event returns the existing job');
else fail('sync enqueue must dedupe by event_key');

if (/saveCard|updateCard|getCrmContacts|updateCrmContact/.test(storeAdjustBody)) fail('Phase 2C store point change must not touch card/CRM ownership paths');
else ok('store point change stays out of card/CRM ownership paths');

if (failed.length) {
  console.error('\nPhase 2C security contract failed. Do not commit/deploy until fixed.');
  process.exit(1);
}

console.log('\nPhase 2C security contract passed.');
console.log(JSON.stringify({
  publicActionCount: publicActions.length,
  cashierSessionStates: ['prepared', 'processing', 'completed', 'failed_retryable', 'failed_final', 'expired'],
  syncEventKey: 'point_sync_event_keys.event_key'
}, null, 2));
