const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'worker-entry.mjs'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js/modules/home.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function must(cond, msg) { if (!cond) { console.error('Ticker live stats contract failed:', msg); process.exit(1); } }
must(worker.includes("action === 'getSystemTickerLiveStats'"), 'direct live stats action missing');
must(worker.includes('todayCardCollectionCount'), 'worker count missing');
must(home.includes("window.fetchAPI('getSystemTickerLiveStats'"), 'frontend does not fetch direct live stats');
must(home.includes('iterations: Infinity') && home.includes("easing: 'linear'"), 'ticker must continuously move at linear pace');
must(!home.includes('waitHomeTicker_'), 'ticker must not wait in the middle');
must(/js\/modules\/home\.js\?v=/.test(index), 'home.js cache version missing');
console.log('Direct ticker live stats contract passed.');
