const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const inventory = fs.readFileSync(path.join(root, 'docs', 'release', 'staging-environment-inventory.md'), 'utf8');
let blockers = 0;

function check(condition, message) {
  console.log(`${condition ? 'OK' : 'BLOCKER'} ${message}`);
  if (!condition) blockers += 1;
}

function blockBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from >= 0 ? source.slice(from, to >= 0 ? to : source.length) : '';
}

const production = config.slice(0, config.indexOf('[env.staging]'));
const staging = config.slice(config.indexOf('[env.staging]'));
const activeStaging = staging.split(/\r?\n/).filter((line) => !line.trim().startsWith('#')).join('\n');
const productionD1 = (production.match(/database_id\s*=\s*"([^"]+)"/) || [])[1];
const productionKv = (production.match(/\[\[kv_namespaces\]\][\s\S]*?id\s*=\s*"([^"]+)"/) || [])[1];
const productionR2 = (production.match(/\[\[r2_buckets\]\][\s\S]*?bucket_name\s*=\s*"([^"]+)"/) || [])[1];
const stagingD1 = (staging.match(/\[\[env\.staging\.d1_databases\]\][\s\S]*?database_id\s*=\s*"([^"]+)"/) || [])[1];
const stagingKv = (staging.match(/\[\[env\.staging\.kv_namespaces\]\][\s\S]*?id\s*=\s*"([^"]+)"/) || [])[1];
const stagingR2 = (staging.match(/\[\[env\.staging\.r2_buckets\]\][\s\S]*?bucket_name\s*=\s*"([^"]+)"/) || [])[1];
const stagingName = (staging.match(/name\s*=\s*"([^"]+)"/) || [])[1];
const stagingWebhook = (staging.match(/STAGING_WEBHOOK_URL\s*=\s*"([^"]+)"/) || [])[1];
const stagingLiff = (activeStaging.match(/SOCIAL_LIKE_LIFF_ID\s*=\s*"([^"]+)"/) || [])[1];
const motherWrite = (activeStaging.match(/MOTHER_LINE_MEMBER_API_URL\s*=\s*"([^"]+)"/) || [])[1];

check(!!staging && /^\[env\.staging\]/m.test(config), '[env.staging] is explicitly configured');
check(stagingName === 'line-engine-staging' && stagingName !== 'line-engine', 'staging Worker name is distinct');
check(!!stagingD1 && stagingD1 !== productionD1 && /staging/i.test(staging), 'staging D1 binding is distinct from production');
check(!!stagingKv && stagingKv !== productionKv && /LINE_ENGINE_STAGING_KV/.test(inventory), 'staging KV binding is distinct from production');
check(!!stagingR2 && stagingR2 !== productionR2 && /staging/i.test(stagingR2), 'staging R2 binding is distinct from production');
check(/workers_dev\s*=\s*true/.test(staging), 'staging uses a distinct workers.dev surface');
check(/^https:\/\/line-engine-staging\.[^/]+\/line-webhook$/.test(stagingWebhook || ''), 'staging webhook target is not the production Worker hostname');
check(stagingLiff && stagingLiff !== '1660923784-NVioaXK7', 'staging LIFF ID is configured and distinct from production');
check(motherWrite && !/aiwe\.cc/i.test(motherWrite), 'staging mother-site write endpoint is configured and non-production');
check(/STAGING_POINT_MODE\s*=\s*"mock"/.test(staging), 'staging point mode is mock and cannot target production point wallet');
check(!/(LINE_CHANNEL_SECRET|LINE_CHANNEL_ACCESS_TOKEN|ADMIN_BOOTSTRAP_SECRET|MOTHER_LINE_MEMBER_API_KEY)\s*=\s*".+"/.test(activeStaging), 'staging config contains no hard-coded secret values');
check(productionD1 === '8a0107f9-000d-4810-b6bf-5d599b699195' && productionKv === '6785c24db6eb4080b48ce091c81d631c' && productionR2 === 'linengine', 'production bindings remain unchanged');
check(/line-engine-staging-db/.test(staging) && /line-engine-staging-assets/.test(staging), 'staging resource names carry an isolation marker');
check(/ENVIRONMENT\s*=\s*"staging"/.test(staging) && /\[env\.staging\.vars\]/.test(staging) && /LINE_OA_FOLLOW_POINTS\s*=\s*"0"/.test(staging) && /MOTHER_LINE_MEMBER_API_URL\s*=\s*""/.test(staging), 'staging vars explicitly override production integration values');

if (blockers) {
  console.error(`\nStaging resource isolation blocked: ${blockers} blocker(s).`);
  process.exit(1);
}
console.log('\nStaging resource isolation contract passed.');