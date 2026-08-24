const fs = require('fs');
const path = require('path');
const { assertCacheBust } = require('./check-cache-bust-contract');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8');

function fail(message) {
  console.error('Today fortune contract failed:', message);
  process.exit(1);
}

if (!index.includes('onclick="window.openTodayFortune?.()"')) {
  fail('home fortune button must open the daily fortune flow');
}
if (!index.includes('&#20170;&#26085;')) {
  fail('home fortune button must be labeled Today');
}
try {
  assertCacheBust('js/modules/home.js');
} catch (e) {
  fail(e.message);
}
if (!index.includes('weekly-zodiac-theme-label') ||
    !index.includes('weekly-zodiac-summary-label') ||
    !index.includes('weekly-zodiac-action-label')) {
  fail('fortune modal labels must be addressable for daily copy');
}

if (!/function getHomeChineseZodiac_/.test(home)) {
  fail('daily fortune must include Chinese zodiac calculation');
}
if (!/function getHomeLifeNumber_/.test(home)) {
  fail('daily fortune must include life number calculation');
}
if (!/function buildTodayFortune_/.test(home)) {
  fail('daily fortune must compose a combined forecast');
}
if (!/window\.openTodayFortune\s*=\s*function/.test(home)) {
  fail('daily fortune open handler must be exported');
}
if (!home.includes("btn.classList.add('flex')") || !home.includes("btn.classList.remove('flex')")) {
  fail('fortune button must restore flex layout when shown and remove it when hidden');
}
if (!home.includes('forecast.meta') || !home.includes('forecast.summary') || !home.includes('forecast.action')) {
  fail('daily fortune modal must render meta, summary, and action text');
}
if (!index.includes('max-w-[420px]') || !index.includes('p-2 sm:p-4')) {
  fail('daily fortune modal must provide a wider mobile-safe recommendation layout');
}
if (!index.includes('max-h-[calc(100dvh-1rem)]') ||
    !index.includes('min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 space-y-4')) {
  fail('daily fortune modal must keep its content vertically scrollable on short mobile viewports');
}

console.log('Today fortune contract passed.');
