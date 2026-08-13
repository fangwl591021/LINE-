const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migration = read('migrations/0021_exchange_zone_foundation.sql');
const worker = read('workerbackup.js');
const workerModule = read('worker/exchange-zone.mjs');
const html = read('index.html');
const frontend = read('js/modules/exchange-zone.js');
const navigation = read('js/navigation.js');
const wrangler = read('wrangler.toml');
const docs = read('docs/exchange-zone/phase-0-2-private-read-only.md');

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
  'exchange_zone_posts',
  'post_handle TEXT NOT NULL UNIQUE',
  'author_user_id TEXT NOT NULL',
  'contact_tags_json TEXT NOT NULL',
  "CHECK (status IN ('draft', 'published', 'hidden', 'archived'))",
  'idx_exchange_zone_posts_feed',
  'idx_exchange_zone_posts_author'
], 'migration defines isolated exchange post skeleton and indexes');
ok(!migration.includes('INSERT INTO exchange_zone_posts'), 'migration does not seed fake production posts');

includesAll(worker, [
  "getExchangeZoneAccess: { access: 'authenticated'",
  "listExchangeZonePosts: { access: 'authenticated'",
  "getExchangeZonePost: { access: 'authenticated'",
  "case 'getExchangeZoneAccess': return ExchangeZoneModule.access(payload || {}, env, actor)",
  "case 'listExchangeZonePosts': return await ExchangeZoneModule.list(payload || {}, env, actor)",
  "case 'getExchangeZonePost': return await ExchangeZoneModule.get(payload || {}, env, actor)"
], 'Worker requires authenticated LINE actors and forwards verified actor to every exchange read');
ok(!worker.includes("getExchangeZoneAccess: { access: 'public'"), 'exchange access probe is not public');
ok(!worker.includes("listExchangeZonePosts: { access: 'public'"), 'exchange feed is not public');
ok(!workerModule.includes('u.picture_url'), 'exchange feed does not query the non-existent users.picture_url column');
ok(workerModule.includes('async function withPublicCard'), 'exchange feed hydrates optional public-card data separately');
ok(workerModule.includes("console.warn('Exchange zone public card hydration skipped:'"), 'optional public-card schema differences cannot fail the whole feed');

includesAll(workerModule, [
  "return ['private', 'pilot', 'open'].includes(mode) ? mode : 'private'",
  "const isAdmin = role === 'admin'",
  'EXCHANGE_ZONE_PRIVATE_TESTER_IDS',
  'isPrivateTester',
  "mode === 'pilot'",
  "mode === 'open'",
  "code: 'EXCHANGE_ZONE_ACCESS_DENIED'",
  "WHERE p.status = 'published'",
  "p.post_handle = ?1 AND p.status = 'published'",
  "LOWER(COALESCE(c.source_type, '')) = 'self_profile'",
  "LOWER(COALESCE(c.visibility, '')) = 'public'"
], 'Worker defaults private, supports gated rollout and reads published owner-bound public cards');
includesAll(workerModule, [
  'postHandle:',
  'cardAvailable',
  'contactTags:',
  'author: {'
], 'Worker returns opaque public view models');
['authorUserId:', 'cardRowId:', 'postId:'].forEach((needle) => {
  ok(!workerModule.includes(needle), `Worker does not render internal field ${needle}`);
});

includesAll(html, [
  'id="home-exchange-zone-button"',
  'class="hidden home-quick-circle group"',
  'id="page-exchange-zone"',
  'id="exchange-zone-panel"',
  'id="exchange-zone-panel-close"',
  'id="exchange-zone-panel-backdrop"',
  'id="exchange-zone-list"',
  'id="exchange-zone-empty"',
  'id="exchange-zone-drawer"',
  'id="exchange-zone-drawer-panel"',
  'translate-x-full',
  'id="exchange-zone-drawer-close"',
  'id="exchange-zone-drawer-backdrop"',
  'js/modules/exchange-zone.js?v='
], 'frontend includes hidden entry, LINE-style list and right-side drawer controls');
ok(/開啟折抵店家[\s\S]*id="home-exchange-zone-button"/.test(html), 'exchange entry is placed immediately after the redeem-store shortcut');

includesAll(frontend, [
  "window.fetchAPI('getExchangeZoneAccess'",
  "window.fetchAPI('listExchangeZonePosts'",
  "window.fetchAPI('getExchangeZonePost'",
  "button.classList.toggle('hidden', !state.access.allowed)",
  "root.classList.remove('hidden')",
  "panel.classList.remove('translate-x-full')",
  'window.closeExchangeZonePanel',
  "panel.classList.remove('translate-x-full')",
  "panel.classList.add('translate-x-full')",
  "document.body.classList.add('overflow-hidden')",
  "document.body.classList.remove('overflow-hidden')",
  'window.closeExchangeZoneDrawer',
  'cardAvailable',
  'contactTags'
], 'frontend fails closed, preserves page context and renders text, tags and public card preview');
ok(!frontend.includes("window.goPage?.('exchange-zone')"), 'exchange entry opens the right-side panel without page navigation');
ok(!frontend.includes('window.open('), 'drawer does not open a new browser window');
ok(!frontend.includes('window.location'), 'drawer does not navigate away from the current application');
ok(!frontend.includes('storeAdjustCustomerPoints'), 'Phase 0-2 frontend does not call point cashier');

includesAll(navigation, ["page === 'exchange-zone'", 'window.loadExchangeZone'], 'navigation initializes exchange feed');
ok(wrangler.includes('EXCHANGE_ZONE_ACCESS_MODE = "private"'), 'production config keeps exchange zone private by default');
ok(!wrangler.includes('EXCHANGE_ZONE_PRIVATE_TESTER_IDS = '), 'private tester identities are not committed to public config');

['points_ledger', 'insertUserPoint', 'storeAdjustCustomerPoints', 'createOrder', 'payment'].forEach((needle) => {
  ok(!migration.includes(needle), `migration does not contain ${needle}`);
  ok(!workerModule.includes(needle), `Worker module does not contain ${needle}`);
});

includesAll(docs, [
  '`private`：只有經後端驗證，且列在 `EXCHANGE_ZONE_PRIVATE_TESTER_IDS` 的 admin 可以進入',
  '首頁入口預設隱藏',
  '三個 actions 都要求有效 LINE 登入',
  '不建立點數交易、訂單、付款或核銷',
  'Cloudflare Secret `EXCHANGE_ZONE_PRIVATE_TESTER_IDS`',
  '`0021_exchange_zone_foundation.sql`'
], 'Phase 0-2 contract documents private gate, privacy and migration order');

console.log('\nExchange zone Phase 0-2 contract passed.');
