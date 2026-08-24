const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js/modules/home.js'), 'utf8');
const inbox = fs.readFileSync(path.join(root, 'js/modules/inbox.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'point-bridge.html'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

ok(html.includes('id="point-friendship-modal"'), 'main app contains the former bridge friendship gate');
ok(html.includes('id="point-friendship-add-link"'), 'friendship gate keeps the OA add-friend action');
ok(html.includes('onclick="window.recheckActmasterPointFriendship()"'), 'friendship gate can recheck without leaving the main app');
ok(config.includes('window.isActmasterMainLiffClient'), 'main app defines strict LIFF-client detection');
ok(config.includes("typeof window.liff.isInClient === 'function'"), 'strict LIFF detection uses liff.isInClient');
ok(!config.includes('/\\bLine\\/'), 'strict LIFF detection does not infer LIFF from the LINE user agent');
ok(config.includes('window.liff.getFriendship()'), 'main app reads friendship from the active LIFF');
ok(config.includes('window.liff.requestFriendship()'), 'main app preserves the bridge friendship request');
ok(config.includes('window.ensureActmasterPointFriendship'), 'main app exposes the friendship startup guard');
ok(auth.includes('await window.ensureActmasterPointFriendship()'), 'authenticated main startup waits for friendship verification');
ok(config.includes("url.searchParams.set('point_friend', '1')"), 'successful recheck preserves the existing point_friend contract');
ok(/js\/config\.js\?v=9\.13/.test(html), 'main endpoint configuration is cache-busted');
ok(/js\/auth\.js\?v=10\.91/.test(html), 'main endpoint authentication is cache-busted');
ok(auth.includes("window.goPage(wantsCardCoolList ? 'card' : 'home', true)"), 'login landing renders without triggering a duplicate navigation load');
ok(auth.includes('aggregateWalletReady') && !auth.includes('setTimeout(() => window.refreshPointBalanceBadge?.(), 300)'), 'point balance uses aggregate home data before its delayed fallback');
ok(home.includes('window.__homeLoadPromises'), 'home background tasks coalesce matching in-flight work');
ok(home.includes('window.__subsiteHomeFastDataPromise'), 'subsite home bootstrap coalesces concurrent aggregate requests');
ok(home.includes("runHomeBackgroundTask_('store-settings', 3000") && home.includes("runHomeBackgroundTask_('activities-for-admin', 14000"), 'noncritical home APIs are staged after the aggregate bootstrap');
ok(!home.includes("runHomeBackgroundTask_('cards-for-admin'") && !home.includes("runHomeBackgroundTask_('cards-for-user'"), 'home bootstrap does not preload the full card library');
ok(auth.includes("body && !body.classList.contains('hidden')"), 'cashier logs stay lazy while the cashier panel is collapsed');
ok(inbox.includes('__inboxBadgeRequestedAt') && inbox.includes('< 15000'), 'inbox badge refreshes are throttled during login');
ok(config.includes('for (let attempt = 0; attempt < 2; attempt += 1)'), 'Android LIFF startup retries one transient initialization failure');
ok(config.includes('window.getActmasterLiffProfile'), 'LINE profile lookup has a bounded retry');
ok(config.includes('window.recoverActmasterStartupOnce'), 'startup performs one bounded clean-URL recovery');
ok(config.includes("'ACTMASTER_STARTUP_RECOVERY_V1'"), 'startup recovery loop is guarded by session state');
ok(config.includes('window.showActmasterStartupFailure'), 'startup failure exposes a user-operated recovery state');
ok(config.includes("retry.textContent = '重新連線'"), 'startup failure provides an explicit reconnect action');
ok(auth.includes('await window.getActmasterLiffProfile()'), 'authentication uses resilient LINE profile lookup');
ok(auth.includes('window.recoverActmasterStartupOnce?.(err)'), 'authentication attempts bounded startup recovery before showing failure');
ok(auth.includes('window.showActmasterStartupFailure()'), 'authentication never leaves Android users on a dead failure screen');
ok(bridge.includes("const BUSINESS_APP_URL = 'https://fangwl591021.github.io/LINE-/';"), 'pre-cutover bridge remains unchanged to avoid a LIFF redirect loop');
ok(bridge.includes('window.location.replace(buildBusinessUrl(profile, friendFlag))'), 'pre-cutover bridge remains usable until the console endpoint switch');

console.log('\nMain LIFF endpoint cutover contract passed.');
