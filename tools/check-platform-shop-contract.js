const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const architecture = fs.readFileSync(path.join(root, 'docs', 'platform-shop', 'architecture.md'), 'utf8');
const dataActions = fs.readFileSync(path.join(root, 'docs', 'platform-shop', 'data-and-actions.md'), 'utf8');
const plan = fs.readFileSync(path.join(root, 'docs', 'platform-shop', 'implementation-plan.md'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'docs', 'README.md'), 'utf8');
const riskMap = fs.readFileSync(path.join(root, 'docs', 'contracts', 'change-risk-map.json'), 'utf8');
const regression = fs.readFileSync(path.join(root, 'docs', 'tests', 'regression-matrix.md'), 'utf8');
const checklist = fs.readFileSync(path.join(root, 'docs', 'release', 'change-checklist.md'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const navigationJs = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');
const platformShopJs = fs.readFileSync(path.join(root, 'js', 'modules', 'platform-shop.js'), 'utf8');
const platformShopData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'platform-shop-products.json'), 'utf8'));

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

includesAll(architecture, [
  '平台統一上架',
  '會員可以使用自己的購物金 / gift_money 點數折抵',
  '每件商品可自訂點數折抵規則',
  '合作店家只作為供應、履約、核銷或結算對象',
  '不使用現有 `orders` 表',
  '不重用店家點數收銀流程'
], 'architecture fixes platform-shop boundaries');

includesAll(dataActions, [
  'platform_shop_products',
  'platform_shop_orders',
  'platform_shop_order_items',
  'platform_shop_redemptions',
  '`point_redeem_type`',
  '`point_redeem_value`',
  '`point_redeem_cap`',
  '`platform_shop_redeem`',
  '不得寫入現有 `orders`',
  '不得呼叫 `storeAdjustCustomerPoints`'
], 'data contract defines isolated tables and point redemption fields');

includesAll(dataActions, [
  '逐品項計算可折抵上限',
  '會員實際折抵點數不得超過會員可用點數',
  '`payable_amount` 必須由 `subtotal - point_discount` 計算',
  '禁止由前端直接傳入最終 `payable_amount` 作為後端信任值',
  '`none`',
  '`fixed`',
  '`percent`',
  '`full`'
], 'data contract requires product-level redemption calculation');

includesAll(dataActions, [
  '`savePlatformShopProduct` | platform admin',
  '`createPlatformShopOrder` | authenticated user',
  '`redeemPlatformShopVoucher` | partner store staff 或 platform admin',
  '產品管理必須是 platform admin，不是 tenant admin',
  '合作店家核銷必須驗證 `partner_store_id` ownership'
], 'action contract separates platform admin, member and partner store permissions');

includesAll(plan, [
  'Phase 1：只讀商品目錄',
  'Phase 2：購物車與訂單草稿',
  'Phase 3：點數折抵',
  '每件商品先定義 `point_redeem_type` 與 `point_redeem_value`',
  'checkout 時逐品項計算可折抵上限',
  '`payable_amount` 不得由前端決定'
], 'implementation plan stages catalog, cart and point redemption safely');

includesAll(readme, [
  '平台商城、會員點數折抵、合作店家核銷',
  'docs/platform-shop/architecture.md',
  'docs/platform-shop/data-and-actions.md',
  'docs/platform-shop/implementation-plan.md'
], 'README links platform-shop contracts');

includesAll(riskMap, [
  '"platform-shop"',
  '平台商城',
  'docs/platform-shop/architecture.md',
  'tools/check-platform-shop-contract.js'
], 'change risk map includes platform-shop area');

includesAll(regression, [
  'SHOP-01',
  'SHOP-02',
  'SHOP-03',
  'SHOP-04',
  'SHOP-05',
  'SHOP-06',
  'SHOP-07',
  'SHOP-08'
], 'regression matrix includes platform-shop scenarios');

includesAll(checklist, [
  '平台商城',
  '商城商品只允許平台管理員上架',
  '商城訂單不使用既有 `orders`',
  '商城折抵不呼叫店家點數收銀流程',
  '後端逐品項計算結帳金額',
  '合作店家只能核銷被指派的商城憑證'
], 'release checklist includes platform-shop safety gates');


includesAll(indexHtml, [
  'id="page-platform-shop"',
  '線上商城',
  'js/modules/platform-shop.js?v='
], 'front-end exposes an isolated platform-shop route');

includesAll(indexHtml, [
  'onclick="window.openPartnerStores?.()"',
  'aria-label="開啟折抵店家"',
  '<span class="home-quick-label">折抵店家</span>'
], 'home redeem-store shortcut remains available');

includesAll(fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8'), [
  'window.openPartnerStores = function()',
  "const PUBLIC_PARTNER_STORE_URL = 'https://aiwe.cc/index.php/search_linecard/?shop_id=78&submitted=1';",
  'window.location.assign(PUBLIC_PARTNER_STORE_URL);',
  "case 'shop':",
  'return window.openPartnerStores?.();'
], 'home shop actions open the temporary public partner directory');

const homeSource = fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8');
['line_userid=', 'bot_token=', 'client_id=', 'redirect_uri='].forEach((parameter) => {
  ok(!homeSource.includes(parameter), `temporary public partner URL excludes ${parameter}`);
});

ok(!homeSource.includes("window.open(url, '_blank', 'noopener');"), 'home shop fallback does not open a new browser tab');

includesAll(navigationJs, [
  "page === 'platform-shop'",
  'window.loadPlatformShop'
], 'navigation initializes the platform-shop page');

includesAll(platformShopJs, [
  'platform-shop-products.json',
  'window.loadPlatformShop',
  'pointRedeemType',
  'pointRedeemValue',
  '即將開放'
], 'platform-shop module is read-only catalog shell with redemption metadata');

ok(!platformShopJs.includes('storeAdjustCustomerPoints'), 'platform-shop module does not call store cashier point flow');
ok(!platformShopJs.includes('insertUserPoint'), 'platform-shop module does not write point ledger');
ok(!platformShopJs.includes('fetchAPI'), 'platform-shop module does not call Worker actions');
ok(Array.isArray(platformShopData.products), 'platform-shop catalog data has products array');
console.log('\nPlatform shop contract passed.');
