const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const allowWrite = args.includes('--allow-write');
const readOnly = !allowWrite;
const endpointIndex = args.indexOf('--endpoint');
const endpoint = endpointIndex >= 0 ? args[endpointIndex + 1] : process.env.STAGING_BASE_URL;
const prefixIndex = args.indexOf('--test-data-prefix');
const testDataPrefix = prefixIndex >= 0 ? args[prefixIndex + 1] : '';
const config = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const blockers = [];

function report(kind, message) {
  console.log(`${kind} ${message}`);
}

function stagingHostAllowed(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    const allowlist = (process.env.STAGING_ALLOWED_HOSTS || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    return host.includes('staging') || allowlist.includes(host);
  } catch (_) {
    return false;
  }
}

async function runReadOnlyChecks(baseUrl) {
  const health = await fetch(baseUrl, { method: 'GET', redirect: 'error' });
  report('HEALTH', `status=${health.status}`);
  if (health.status >= 500) throw new Error('STAGING_HEALTH_FAILED');

  const rejected = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updateUserRole', payload: { userId: 'STG_UNAUTHENTICATED' } })
  });
  report('AUTH_REJECTION', `status=${rejected.status}`);
  if (rejected.ok) throw new Error('UNAUTHENTICATED_ADMIN_ACTION_ACCEPTED');
}

async function main() {
  report('MODE', readOnly ? 'READ_ONLY=true' : 'READ_ONLY=false');
  if (!/^\[env\.staging\]\s*$/m.test(config)) blockers.push('STAGING_ENV_MISSING: wrangler.toml has no [env.staging] configuration');
  if (!endpoint) blockers.push('STAGING_ENDPOINT_MISSING: provide --endpoint only after an isolated staging endpoint exists');
  if (endpoint && !stagingHostAllowed(endpoint)) blockers.push('STAGING_HOST_REJECTED: endpoint host must contain staging or be in STAGING_ALLOWED_HOSTS');
  if (allowWrite && !/^STG_[A-Z0-9_-]+$/i.test(testDataPrefix)) blockers.push('STAGING_TEST_DATA_PREFIX_REQUIRED: --allow-write requires --test-data-prefix STG_<isolated-name>');

  report('CHECK', 'schema and migration audit require a masked staging snapshot');
  report('CHECK', 'read-only mode performs health and unauthenticated admin rejection only after endpoint safety gates pass');
  if (allowWrite) report('WRITE_PLAN', 'bootstrap, tenant isolation, and cashier tests require isolated STG_ test data; this script does not create test data itself');

  if (blockers.length) {
    blockers.forEach((message) => report('BLOCKER', message));
    process.exit(1);
  }

  if (readOnly) await runReadOnlyChecks(endpoint);
  report('PASS', 'staging endpoint and safety gates are eligible for the selected validation mode');
}

main().catch((error) => {
  report('BLOCKER', error && error.message ? error.message : 'STAGING_VALIDATION_FAILED');
  process.exit(1);
});