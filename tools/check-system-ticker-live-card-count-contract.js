const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'worker-entry.mjs'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js/modules/home.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function ok(cond, msg) {
  if (!cond) { console.error('FAIL ' + msg); process.exit(1); }
  console.log('OK ' + msg);
}

ok(worker.includes('async function getTodaySystemCardCollectionCount'), 'worker counts today system card collections');
ok(worker.includes("NOT IN ('self_profile','self_upload','line_generated','video_profile','referral_placeholder')"), 'system count excludes own/system card types');
ok(worker.includes('📇 今日全系統新增收藏名片'), 'worker emits live collected-card ticker message');
ok(worker.includes('response = await enrichSystemTickerResponse(env, action, response);'), 'getSystemTicker response is enriched');
ok(home.includes('window.startHomeSystemTicker = async function'), 'frontend runs a message queue');
ok(home.includes('iterations: Infinity') && home.includes("easing: 'linear'"), 'ticker moves continuously at linear pace');
ok(!home.includes('waitHomeTicker_'), 'ticker has no timed center pause');
ok(html.includes('id="home-system-ticker-text"'), 'ticker text target remains in the home page');
ok(/js\/modules\/home\.js\?v=/.test(html), 'home module has a cache version');
console.log('System ticker live card count contract passed.');
