const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migration = read('migrations/0021_exchange_zone_foundation.sql');
const worker = read('workerbackup.js');
const workerModule = read('worker/exchange-zone.mjs');
const html = read('index.html');
const frontend = read('js/modules/exchange-zone.js');
const inboxFrontend = read('js/modules/inbox.js');
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
  "updateExchangeZonePost: { access: 'authenticated', ownership: 'self'",
  "case 'getExchangeZoneAccess': return ExchangeZoneModule.access(payload || {}, env, actor)",
  "case 'listExchangeZonePosts': return await ExchangeZoneModule.list(payload || {}, env, actor)",
  "case 'getExchangeZonePost': return await ExchangeZoneModule.get(payload || {}, env, actor)",
  "case 'updateExchangeZonePost': return await ExchangeZoneModule.update(payload || {}, env, actor)"
], 'Worker requires authenticated LINE actors and forwards verified actor to every exchange read');
ok(!worker.includes("getExchangeZoneAccess: { access: 'public'"), 'exchange access probe is not public');
ok(!worker.includes("listExchangeZonePosts: { access: 'public'"), 'exchange feed is not public');
ok(!workerModule.includes('u.picture_url'), 'exchange feed does not query the non-existent users.picture_url column');
ok(!workerModule.slice(workerModule.indexOf('function selectColumns'), workerModule.indexOf('async function withAuthor')).includes('FROM users'), 'core exchange feed does not depend on the users table');
ok(workerModule.includes('async function withAuthor'), 'exchange author metadata is hydrated separately');
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
includesAll(workerModule, [
  'canEdit:',
  'async update(payload, env, actor)',
  "author_user_id = ?2 AND status = 'published'",
  'chargedPoints: 0',
  'card_custom_config',
  'buttons'
], 'Worker exposes only an ownership capability and supports free owner-only edits with full sanitized cards');
ok(!/SET[\s\S]{0,700}expires_at\s*=/.test(workerModule.slice(workerModule.indexOf('async update('), workerModule.indexOf('async publish('))), 'editing does not extend the original expiry');
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
includesAll(html, [
  'id="page-exchange-zone" class="hidden fixed inset-0 z-[110] w-full',
  'id="exchange-zone-panel" class="absolute inset-y-0 right-0 h-[100dvh] w-full max-w-none',
  'id="exchange-zone-panel-close" type="button" class="w-10 h-10 shrink-0 rounded-full bg-red-600 text-white',
  'id="exchange-zone-drawer" class="hidden fixed inset-0 z-[120] w-full',
  'id="exchange-zone-drawer-panel" class="absolute inset-y-0 right-0 h-[100dvh] w-full max-w-none',
  'id="exchange-zone-drawer-close" type="button" class="w-10 h-10 shrink-0 rounded-full bg-red-600 text-white',
  'section class="min-h-full w-full bg-white overflow-hidden"'
], 'both exchange drawer layers and their cards fill the viewport with obvious red close controls');
ok(!/id="exchange-zone-(?:panel|drawer-panel)"[^>]+(?:w-\[(?:90|92)%\]|max-w-\[(?:390|410)px\])/.test(html), 'exchange drawer layers have no legacy narrow width cap');

includesAll(frontend, [
  "window.fetchAPI('getExchangeZoneAccess'",
  "window.fetchAPI('listExchangeZonePosts'",
  "window.fetchAPI('getExchangeZonePost'",
  "window.fetchAPI(editing ? 'updateExchangeZonePost' : 'publishExchangeZonePost'",
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
includesAll(frontend, [
  'exchange-zone-edit-button',
  '儲存修改（不扣點）',
  '原刊登期限保持不變',
  'card?.buttons',
  'safeActionUrl'
], 'owner can edit without another charge and attached public cards render safe action buttons');
includesAll(frontend, [
  '<article class="mt-5 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-4',
  '<section class="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50/70'
], 'exchange text uses a pale goose-yellow card distinct from the green electronic business card');
includesAll(frontend, [
  'exchange-zone-inquiry-button',
  '有興趣・寄站內信',
  'window.openInboxExchangeInquiry(post)'
], 'other members can enter a pre-addressed inbox inquiry from an exchange post');
includesAll(inboxFrontend, [
  'window.openInboxExchangeInquiry = function (post)',
  'inbox-exchange-post-handle',
  'query.readOnly = true',
  'exchangePostHandle'
], 'inbox composer receives only the opaque exchange post handle and locks the displayed recipient');
ok(!inboxFrontend.includes('authorUserId') && !inboxFrontend.includes('author_user_id'), 'inbox inquiry frontend never receives the post author internal identity');
ok(!frontend.includes("window.goPage?.('exchange-zone')"), 'exchange entry opens the right-side panel without page navigation');
ok(!frontend.includes('window.open('), 'drawer does not open a new browser window');
ok(!frontend.includes('window.location'), 'drawer does not navigate away from the current application');
ok(!frontend.includes('storeAdjustCustomerPoints'), 'Phase 0-2 frontend does not call point cashier');
includesAll(frontend, [
  'id="exchange-zone-compose-form" class="space-y-5" autocomplete="off" data-form-type="other"',
  'name="title"',
  'name="body"',
  'inputmode="text"',
  'data-1p-ignore',
  'data-lpignore="true"'
], 'exchange compose fields opt out of mobile payment and credential autofill');
ok(!/openExchangeZoneCompose[\s\S]{0,500}\.focus\(/.test(frontend), 'opening exchange compose does not force mobile focus or summon an autofill sheet');

includesAll(navigation, ["page === 'exchange-zone'", 'window.loadExchangeZone'], 'navigation initializes exchange feed');
ok(wrangler.includes('EXCHANGE_ZONE_ACCESS_MODE = "open"'), 'production config formally opens the exchange zone to authenticated members');
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
