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
  /html\.is-ios\s*\{[^}]*-webkit-text-size-adjust:\s*108%;[^}]*text-size-adjust:\s*108%;/s.test(css),
  'iOS interface text is enlarged by roughly one visual step'
);
expect(
  /html\.is-ios\s+\.home-top-shortcut\s*\{[^}]*-webkit-text-size-adjust:\s*108%;[^}]*text-size-adjust:\s*108%;/s.test(css),
  'the existing home shortcut text lock follows the iOS scale'
);
expect(
  /html\.is-ios\s+\.material-symbols-outlined\s*\{[^}]*-webkit-text-size-adjust:\s*100%;[^}]*text-size-adjust:\s*100%;/s.test(css),
  'Material Symbols keep their existing icon size'
);
expect(
  html.includes('css/styles.css?v=7.5'),
  'the iOS font update is cache-busted'
);

console.log('\niOS font scale contract passed.');
