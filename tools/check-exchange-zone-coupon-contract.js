const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migration = read('migrations/0024_exchange_zone_coupons.sql');
const moduleSource = read('worker/exchange-zone-coupon.mjs');
const entry = read('worker-entry.mjs');
const loader = read('js/modules/exchange-zone.js');
const frontend = read('js/modules/exchange-zone-coupon.js');

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
  'CREATE TABLE IF NOT EXISTS exchange_zone_coupons',
  'post_handle TEXT NOT NULL UNIQUE',
  'coupon_handle TEXT NOT NULL UNIQUE',
  'CREATE TABLE IF NOT EXISTS exchange_zone_coupon_redemptions',
  'UNIQUE(coupon_handle, user_id)',
  'redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP'
], '0024 defines one coupon per post and one redemption per member');
ok(!migration.includes('inbox_items'), 'Phase 1 coupon schema is isolated from inbox coupons');

includesAll(moduleSource, [
  'async sync(postHandleValue, couponPayload, env, actor)',
  'author_user_id = ?2',
  'EXCHANGE_COUPON_HAS_REDEMPTIONS',
  'async hydrateList(posts, env, actor)',
  'async hydratePost(post, env, actor)',
  'async redeem(payload, env, actor)',
  'INSERT OR IGNORE INTO exchange_zone_coupon_redemptions',
  'EXCHANGE_COUPON_ALREADY_REDEEMED',
  'EXCHANGE_COUPON_SELF_REDEEM',
  "datetime(c.expires_at) >= CURRENT_TIMESTAMP"
], 'coupon module preserves ownership, expiry and single-use redemption contracts');

includesAll(entry, [
  "import { ExchangeZoneCouponModule } from './worker/exchange-zone-coupon.mjs'",
  "action === 'redeemExchangeZoneCoupon'",
  "action === 'listExchangeZonePosts'",
  'ExchangeZoneCouponModule.hydrateList',
  "action === 'getExchangeZonePost'",
  'ExchangeZoneCouponModule.hydratePost',
  "action === 'publishExchangeZonePost' || action === 'updateExchangeZonePost'",
  'ExchangeZoneCouponModule.sync',
  'return json(result, 200);'
], 'worker entry adds the coupon layer and preserves precise authenticated business errors');

includesAll(loader, [
  "exchange-zone-coupon.js?v=20260814-coupon-phase1",
  '.then(() => load(coupon))'
], 'exchange loader appends the coupon extension after core and delete overlay');

includesAll(frontend, [
  '附加優惠券',
  '一篇貼文最多 1 張，每位會員只能核銷一次',
  'name="couponTitle"',
  'name="couponDescription"',
  'name="couponExpiresAt"',
  'name="couponTerms"',
  '附優惠券',
  '現場核銷優惠券',
  "window.fetchAPI('redeemExchangeZoneCoupon'",
  '核銷後只能使用一次，不能復原',
  "action === 'publishExchangeZonePost' || action === 'updateExchangeZonePost'"
], 'frontend supports one attached coupon, detail expansion and explicit one-time redemption');
ok(!frontend.includes('QRCode') && !frontend.includes('qr-code'), 'Phase 1 does not introduce QR redemption');
ok(!frontend.includes('couponWallet') && !frontend.includes('我的優惠券匣'), 'Phase 1 does not introduce a coupon wallet');

console.log('Exchange zone coupon Phase 1 contract checks passed.');
