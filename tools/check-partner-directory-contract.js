const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migration = read('migrations/0019_point_redemption_partner_directory.sql');
const worker = read('workerbackup.js');
const moduleSource = read('worker/partner-directory.mjs');
const indexHtml = read('index.html');
const navigation = read('js/navigation.js');
const home = read('js/modules/home.js');
const frontend = read('js/modules/partner-directory.js');
const docs = read('docs/point-redemption/phase-1-partner-directory.md');

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
  'point_redemption_partners',
  'point_redemption_partner_locations',
  'point_redemption_partner_policies',
  'partner_handle TEXT NOT NULL UNIQUE',
  "CHECK (status IN ('draft', 'active', 'hidden', 'suspended', 'archived'))",
  'CHECK (max_redeem_percent BETWEEN 0 AND 100)',
  'FOREIGN KEY (partner_id)'
], 'migration defines isolated partner, location and policy skeleton');

ok(!migration.includes('INSERT INTO point_redemption_partners'), 'migration does not seed fake production partners');

includesAll(worker, [
  "listPointRedemptionPartners: { access: 'public'",
  "getPointRedemptionPartner: { access: 'public'",
  "case 'listPointRedemptionPartners': return await PartnerDirectoryModule.list",
  "case 'getPointRedemptionPartner': return await PartnerDirectoryModule.get"
], 'Worker policy and dispatch expose read-only directory actions');

includesAll(moduleSource, [
  'MAX_DIRECTORY_LIMIT = 50',
  "p.status = 'active'",
  "l.status = 'active'",
  '.bind(category, city, query, queryPattern, limit).all()',
  '.bind(partnerHandle).all()',
  'partnerHandle:',
  'locationHandle:'
], 'directory module bounds and binds active-only public reads');

['storeAdjustCustomerPoints', 'insertUserPoint', 'INSERT INTO', 'UPDATE point_', 'DELETE FROM'].forEach((needle) => {
  ok(!moduleSource.includes(needle), `directory Worker module does not contain ${needle}`);
  ok(!frontend.includes(needle), `directory frontend does not contain ${needle}`);
});

includesAll(indexHtml, [
  'id="page-partner-directory"',
  'id="partner-directory-query"',
  'id="partner-directory-category"',
  'id="partner-directory-city"',
  'Phase 1 僅提供店家資料與折抵規則預覽',
  'js/modules/partner-directory.js?v='
], 'frontend includes searchable internal partner directory');

includesAll(navigation, ["page === 'partner-directory'", 'window.loadPartnerDirectory'], 'navigation initializes partner directory');
includesAll(home, ['window.openPartnerStores = function()', "window.goPage('partner-directory');"], 'home shortcut stays inside the application');
includesAll(frontend, [
  "window.fetchAPI('listPointRedemptionPartners'",
  "window.fetchAPI('getPointRedemptionPartner'",
  'partner-directory-detail-button',
  'Phase 1 不執行扣點或付款'
], 'frontend reads list/detail and labels Phase 1 safety boundary');

includesAll(docs, [
  '不建立訂單、不建立核銷碼，也不扣除會員點數',
  '不透明的 `partner_handle`',
  '`listPointRedemptionPartners`',
  '`getPointRedemptionPartner`',
  'Wrangler dry-run'
], 'Phase 1 contract documents scope, privacy, APIs and release gate');

console.log('\nPartner directory contract passed.');

