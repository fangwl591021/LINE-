const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
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
ok(/js\/config\.js\?v=9\.12/.test(html), 'main endpoint configuration is cache-busted');
ok(/js\/auth\.js\?v=10\.88/.test(html), 'main endpoint authentication is cache-busted');
ok(bridge.includes("const BUSINESS_APP_URL = 'https://fangwl591021.github.io/LINE-/';"), 'pre-cutover bridge remains unchanged to avoid a LIFF redirect loop');
ok(bridge.includes('window.location.replace(buildBusinessUrl(profile, friendFlag))'), 'pre-cutover bridge remains usable until the console endpoint switch');

console.log('\nMain LIFF endpoint cutover contract passed.');
