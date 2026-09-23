const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const node = process.execPath;

const foundationChecks = [
  'tools/check-stability-foundation-contract.js',
  'tools/check-route-contract.js',
  'tools/check-identity-diagnostic-contract.js',
  'tools/check-identity-repair-dry-run-contract.js',
  'tools/check-identity-bridge-contract.js',
  'tools/check-hard-admin-upsert-contract.js',
  'tools/check-lineoa-mycard-keyword-contract.js',
  'tools/check-lineoa-cardcool-keyword-contract.js',
  'tools/check-referral-keyword-v2-contract.js',
  'tools/check-referral-attribution-contract.js',
  'tools/check-home-top-shortcut-click-contract.js',
  'tools/check-home-service-menu-contract.js',
  'tools/check-ios-font-scale-contract.js',
  'tools/check-android-business-card-camera-contract.js',
  'tools/check-card-vision-one-pass-contract.js',
  'tools/check-card-industry-review-contract.js',
  'tools/check-main-liff-endpoint-contract.js',
  'tools/check-exchange-zone-contract.js',
  'tools/check-exchange-zone-publish-contract.js',
  'tools/check-exchange-zone-coupon-contract.js',
  'tools/check-ai-match-interest-contract.js',
  'test/business-intent-save.test.mjs',
  'tools/check-card-customer-switch-contract.js',
  'tools/check-claimed-collected-card-contract.js',
  'tools/check-card-fate-tag-pipeline-contract.js',
  'tools/check-card-quota-contract.js',
  'tools/check-admin-card-quota-contract.js',
  'tools/check-admin-card-quota-ui-contract.js',
  'tools/check-admin-card-library-overview-contract.js',
  'tools/check-change-work-order-contract.js',
  'tools/check-change-risk-map-contract.js'
];

const fullChecks = [
  'test/store-admin-catalog.test.mjs',
  'test/scanned-card-contacts.test.mjs',
  'test/gomoku.test.mjs',
  'test/gomoku-integration.test.mjs',
  'test/block-supply-engine.test.mjs',
  'test/block-supply-audio.test.mjs',
  'test/game-center.test.mjs',
  'test/tank-engine.test.mjs',
  'test/tank-audio.test.mjs',
  'test/daily-tank-challenge.test.mjs',
  'test/crm-card-phone-link.test.mjs',
  'test/partner-onboarding-ai.test.mjs',
  'test/partner-onboarding-ui.test.mjs',
  'test/store-consumption-journal.test.mjs',
  'test/store-consumption-journal-ui.test.mjs',
  'test/card-harvest-match.test.mjs',
  'test/card-harvest-match-ui.test.mjs',
  'test/collection-match-history.test.mjs',
  'test/login-bootstrap.test.mjs',
  'test/direct-phone-reward.test.mjs',
  'test/store-phone-reward.test.mjs',
  'test/point-history-cashier-dedupe.test.mjs',
  'test/store-points-home.test.mjs',
  'test/home-reference-theme.test.mjs',
  'test/store-wallet-card.test.mjs',
  'test/store-admin.test.mjs',
  'test/store-admin-products.test.mjs',
  'test/store-admin-products-ui.test.mjs',
  'test/store-partner-catalog.test.mjs',
  'test/store-admin-ui.test.mjs',
  'test/store-admin-entry.test.mjs',
  'test/store-shop-cover.test.mjs',
  'test/store-invite-binding.test.mjs',
  'test/store-invite-binding-entry.test.mjs',
  'test/store-invite-route.test.mjs',
  'test/store-invite-share.test.mjs',
  'test/store-invite-auth.test.mjs',
  'test/store-invite-storefront.test.mjs',
  'test/card-safety-review.test.mjs',
  'test/cardmaster-safety-feedback.test.mjs',
  'test/matchmake-safety-feedback.test.mjs',
  'test/reward-role-admin.test.mjs',
  'test/reward-only-cashier.test.mjs',
  'test/reward-only-integration.test.mjs',
  'test/reward-cashier-ui.test.cjs',
  'tools/check-store-shop-lifestyle-contract.js',
  'test/store-shop-shell-navigation.test.mjs',
  'test/store-shop-public-categories.test.mjs',
  'test/store-commerce.test.mjs',
  'test/store-line-keywords.test.mjs',
  'test/store-checkout-warning.test.mjs',
  'test/store-point-operation.test.mjs',
  'test/store-point-operation-entry.test.mjs',
  'test/store-product-ocr.test.mjs',
  'tools/check-safe-cashier-contract.js',
  'test/safe-cashier-client.test.cjs',
  'test/store-point-qr-routing.test.cjs',
  'tools/check-store-shop-contract.js',
  'tools/check-stability-foundation-contract.js',
  'tools/check-route-contract.js',
  'tools/check-identity-diagnostic-contract.js',
  'tools/check-identity-repair-dry-run-contract.js',
  'tools/check-identity-bridge-contract.js',
  'tools/check-hard-admin-upsert-contract.js',
  'tools/check-lineoa-mycard-keyword-contract.js',
  'tools/check-lineoa-cardcool-keyword-contract.js',
  'tools/check-referral-keyword-v2-contract.js',
  'tools/check-referral-attribution-contract.js',
  'tools/check-home-top-shortcut-click-contract.js',
  'tools/check-home-service-menu-contract.js',
  'tools/check-ios-font-scale-contract.js',
  'tools/check-android-business-card-camera-contract.js',
  'tools/check-card-vision-one-pass-contract.js',
  'tools/check-card-industry-review-contract.js',
  'test/card-vision-crop.test.mjs',
  'tools/check-main-liff-endpoint-contract.js',
  'tools/check-exchange-zone-contract.js',
  'tools/check-exchange-zone-publish-contract.js',
  'tools/check-exchange-zone-coupon-contract.js',
  'tools/check-ai-match-interest-contract.js',
  'test/business-intent-save.test.mjs',
  'tools/check-incremental-matchmaking-contract.js',
  'tools/check-card-customer-switch-contract.js',
  'tools/check-claimed-collected-card-contract.js',
  'tools/check-card-fate-tag-pipeline-contract.js',
  'tools/check-card-quota-contract.js',
  'tools/check-admin-card-quota-contract.js',
  'tools/check-admin-card-quota-ui-contract.js',
  'tools/check-admin-card-library-overview-contract.js',
  'tools/check-change-work-order-contract.js',
  'tools/check-change-risk-map-contract.js',
  'tools/check-auth-contract.js',
  'tools/check-share-contract.js',
  'test/liff-share-target-picker.test.mjs',
  'tools/check-inbox-recipient-scope-contract.js',
  'tools/check-mycard-entry-contract.js',
  'tools/check-own-card-upload-contract.js',
  'tools/check-matchmake-contract.js',
  'tools/check-admin-crm-referrer-contract.js',
  'tools/check-cardmaster-public-readiness-contract.js',
  'tools/check-home-profile-owner-controls-contract.js',
  'tools/check-home-profile-restyle-contract.js',
  'tools/check-home-design-contract.js',
  'tools/check-checkin-display-contract.js',
  'test/checkin-award-copy.test.mjs',
  'tools/check-inbox-unread-icon-contract.js',
  'tools/check-local-gpt-key-hidden-contract.js',
  'tools/check-today-fortune-contract.js',
  'tools/check-user-social-settings-contract.js',
  'tools/check-line-keywords-contract.js',
  'tools/check-liff-routes-contract.js',
  'tools/check-card-resolver-contract.js',
  'tools/check-points-ledger-contract.js',
  'tools/check-button-actions-contract.js',
  'tools/check-platform-shop-contract.js',
  'tools/check-partner-directory-contract.js',
  'test/partner-directory.test.mjs',
  'test/exchange-zone.test.mjs',
  'tools/check-personal-task-recurrence-schema-contract.js',
  'tools/check-personal-task-recurrence-worker-contract.js',
  'tools/check-personal-agenda-voice-contract.js',
  'test/personal-agenda-time.test.mjs',
  'tools/check-home-recurring-task-panel-contract.js',
  'tools/check-customer-import-contract.js',
  'tools/check-admin-customer-import-monitor-contract.js'
];

const requested = process.argv.slice(2);
const listOnly = requested.includes('--list');
const checks = requested.includes('--full')
  ? fullChecks
  : requested.length
    ? requested.filter(arg => arg !== '--full' && arg !== '--list')
    : foundationChecks;

if (listOnly) {
  console.log(requested.includes('--full') ? 'Full smoke contracts:' : 'Foundation smoke contracts:');
  checks.forEach((relativePath) => console.log(`- ${relativePath}`));
  process.exit(0);
}

let failed = false;

for (const relativePath of checks) {
  const scriptPath = path.resolve(root, relativePath);
  console.log(`\n== ${relativePath} ==`);
  const result = spawnSync(node, [scriptPath], {
    cwd: root,
    stdio: 'inherit',
    shell: false
  });
  if (result.status !== 0) {
    failed = true;
    console.error(`FAILED ${relativePath}`);
  }
}

if (failed) {
  console.error('\nSmoke contracts failed. Do not deploy this build.');
  process.exit(1);
}

console.log('\nSmoke contracts passed.');
