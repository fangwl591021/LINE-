const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(`iOS font scale contract failed: ${message}`);
  console.log(`OK ${message}`);
}

expect(
  html.includes('/iPad|iPhone|iPod/.test(userAgent)'),
  'native iPhone, iPad and iPod user agents are detected'
);
expect(
  html.includes("navigator.platform === 'MacIntel'") &&
    html.includes('navigator.maxTouchPoints > 1'),
  'iPadOS desktop-style user agents are detected'
);
expect(
  html.includes("document.documentElement.classList.add('is-ios')"),
  'only detected iOS devices receive the is-ios marker'
);
expect(
  !/html\.is-ios\s*\{[^}]*text-size-adjust:/s.test(css),
  'iOS no longer receives a broad page-wide text scale'
);
expect(
  /html\.is-ios\s+\.ios-home-primary-label\s*\{[^}]*font-size:\s*13px;/s.test(css),
  'only the requested primary home shortcut labels are enlarged on iOS'
);
expect(
  (html.match(/class="home-quick-label ios-home-primary-label"/g) || []).length === 4,
  'exactly four labels from the referenced first shortcut row opt in'
);
expect(
  !html.includes('home-quick-icon ios-home-primary-label') &&
    !css.includes('html.is-ios .material-symbols-outlined'),
  'shortcut icons keep their existing size'
);
expect(
  html.includes('css/styles.css?v=7.6'),
  'the iOS font update is cache-busted'
);

console.log('\niOS font scale contract passed.');
