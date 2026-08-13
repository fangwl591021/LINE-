const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migration = read('migrations/0022_exchange_zone_publish.sql');
const worker = read('workerbackup.js');
const moduleSource = read('worker/exchange-zone.mjs');
const html = read('index.html');
const frontend = read('js/modules/exchange-zone.js');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

function includesAll(source, needles, message) {
  const missing = needles.filter((needle) => !source.includes(needle));
  ok(!missing.length, `${message}${missing.length ? `; missing: ${missing.join(', ')}` : ''}`);
}

includesAll(migration, [
  'exchange_zone_publish_operations',
  'UNIQUE(author_user_id, idempotency_key)',
  "point_type TEXT NOT NULL DEFAULT 'gift_money'",
  "point_cost INTEGER NOT NULL DEFAULT 10",
  'expires_at TEXT NOT NULL',
  "'debit_uncertain'",
  "'compensation_pending'"
], 'Phase 3 migration records idempotent 10-point publish operations and expiry');
ok(!migration.includes('INSERT INTO exchange_zone_posts'), 'Phase 3 migration does not seed fake posts');

includesAll(worker, [
  "publishExchangeZonePost: { access: 'authenticated', ownership: 'self'",
  "case 'publishExchangeZonePost': return await ExchangeZoneModule.publish",
  "point_type: 'gift_money'",
  "points,",
  'source=exchange_zone;operation='
], 'Worker publishes only for authenticated self and reuses the existing gift_money service');
ok(!worker.includes("publishExchangeZonePost: { access: 'public'"), 'publish action is never public');

includesAll(moduleSource, [
  'const PUBLISH_COST = 10',
  'const PUBLISH_DAYS = 7',
  'crypto.randomUUID()',
  'idempotency_key',
  "state = 'published'",
  "points.adjust(authorUserId, -PUBLISH_COST",
  "points.adjust(authorUserId, PUBLISH_COST",
  "LOWER(COALESCE(c.source_type, '')) = 'self_profile'",
  "LOWER(COALESCE(c.visibility, '')) = 'public'",
  'EXCHANGE_PUBLISH_REFUND_PENDING'
], 'publish flow is opaque, idempotent, owner-card-bound, debit-first and compensating');
['authorUserId:', 'cardRowId:', 'operationId: operationId'].forEach((needle) => {
  ok(!moduleSource.includes(needle), `public response does not expose ${needle}`);
});
ok(!moduleSource.includes('Math.random'), 'opaque handles use Web Crypto, not Math.random');

includesAll(html, [
  'id="exchange-zone-compose-button"',
  '新增自我宣傳・10 點',
  '刊登一則文字交流內容 10 點，有效 7 天'
], 'right-side exchange panel contains a 10-point compose entry');
includesAll(frontend, [
  "window.fetchAPI('publishExchangeZonePost'",
  'window.openExchangeZoneCompose',
  'attachMyCard',
  'idempotencyKey',
  '聯絡標籤（最多 3 個）',
  '發布成功才扣'
], 'compose drawer submits text, allowlisted tags, own-card intent and an idempotency key');
ok(!frontend.includes('window.open('), 'publish experience stays inside the right-side drawer');
ok(!frontend.includes('window.location'), 'publish experience does not navigate away');

console.log('\nExchange zone Phase 3 publish contract passed.');
