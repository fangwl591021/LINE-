import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const themeUrl = new URL('css/home-reference-theme.css', root);
const css = readFileSync(themeUrl, 'utf8');
const scope = 'body.home-page:not(.business-home-v2-active)';
const shortcutStart = html.indexOf('id="home-primary-shortcuts"');
const shortcutEnd = html.indexOf('id="home-mall-banner"', shortcutStart);
const shortcuts = html.slice(shortcutStart, shortcutEnd);
const shortcutElements = [...shortcuts.matchAll(/<(button|a)\b[\s\S]*?<\/\1>/g)].map(match => match[0]);

test('compact home removes top sibling space and the empty-switch line box without hiding controls', () => {
  const rule = selector => {
    const start = css.indexOf(`${scope} ${selector} {`);
    assert.ok(start >= 0, `missing scoped rule for ${selector}`);
    return css.slice(start, css.indexOf('}', start) + 1);
  };
  assert.match(rule('#main'), /padding:\s*0 12px 100px;/);
  assert.match(rule('#home-profile-card'), /margin:\s*0;/);
  assert.match(rule('#home-profile-card'), /display:\s*flex;/);
  assert.match(rule('#home-profile-card'), /flex-direction:\s*column;/);
  assert.match(rule('#home-primary-shortcuts'), /margin-top:\s*6px;/);
  assert.match(rule('#home-primary-shortcuts'), /padding:\s*6px;/);
  assert.match(rule('#home-primary-shortcuts > .grid'), /gap:\s*6px;/);
  assert.match(rule('#home-mall-banner'), /margin:\s*8px 0 0;/);
  assert.match(rule('#home-profile-card .home-top-shortcut'), /height:\s*108px;/);
  assert.match(rule('#home-primary-shortcuts .home-quick-circle'), /min-height:\s*76px;/);
  assert.doesNotMatch(css, /#home-top-nav-switch[^{}]*\{[^}]*display:\s*none/);
  assert.match(html, /home-reference-theme\.css\?v=2/);
});

test('reference palette loads a local cache-versioned stylesheet only for the real home', () => {
  assert.match(html, /<link\b[^>]*href="css\/home-reference-theme\.css\?v=\d+"[^>]*>/);
  assert.ok(existsSync(themeUrl));
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...source.matchAll(/([^{}]+)\{[^{}]*\}/g)];
  assert.ok(rules.length > 10, 'the reference palette has substantive, scoped style rules');
  for (const match of rules) {
    const selectors = match[1].trim();
    if (selectors.startsWith('@')) continue;
    for (const selector of selectors.split(/,(?![^()]*\))/)) {
      assert.ok(selector.trim().startsWith(scope), `unscoped rule: ${selector}`);
    }
  }
  assert.doesNotMatch(source, /@import\b|(?:https?:)?\/\//, 'the palette must not add third-party font or asset requests');
  assert.doesNotMatch(source, /#page-store-shop|\.shop-points-theme/, 'the mall has its own theme and must remain untouched');
});

test('all eight home shortcuts keep their real handlers and visibility gates', () => {
  assert.ok(shortcutStart >= 0 && shortcutEnd > shortcutStart);
  assert.equal(shortcutElements.length, 8);
  const expected = [
    "window.goPage('card')",
    "window.openMyCardEntry ? window.openMyCardEntry(event) : window.goPage('admin-settings')",
    'window.openHomeZodiacFortune?.()',
    'href="https://lin.ee/SGdgLJk"',
    "window.goPage('my-activities')",
    "window.goPage('inbox')",
    'window.openPartnerStores?.()',
    'window.openExchangeZone?.()'
  ];
  expected.forEach((handler, index) => assert.ok(shortcutElements[index].includes(handler), `shortcut ${index + 1}: ${handler}`));
  assert.match(shortcutElements[3], /target="_blank" rel="noopener noreferrer"/);
  assert.match(shortcutElements[5], /id="inbox-nav-button"/);
  assert.match(shortcutElements[5], /id="inbox-unread-badge" class="hidden/);
  assert.match(shortcutElements[7], /class="hidden home-quick-circle group"/);
  assert.equal((shortcuts.match(/class="home-quick-label ios-home-primary-label"/g) || []).length, 4);
});

test('reference icons keep their meanings, requested colors, and readable labels', () => {
  const iconExpectations = [
    ['wallet', /text-orange-/],
    ['badge', /text-pink-/],
    ['water_drop', /text-purple-/],
    null,
    ['event_note', /text-slate-/],
    ['mail', /text-(?:sky|blue|cyan)-/],
    ['storefront', /text-purple-/],
    ['forum', /text-emerald-/]
  ];
  iconExpectations.forEach((expected, index) => {
    if (!expected) return;
    assert.ok(shortcutElements[index].includes(`>${expected[0]}</span>`), `shortcut ${index + 1} retains ${expected[0]}`);
    assert.match(shortcutElements[index], expected[1]);
    assert.match(shortcutElements[index], /home-quick-label/);
  });
  assert.doesNotMatch(shortcutElements[3], />edit_note</, 'LINE friend entry must no longer use the edit-note icon');
  assert.match(shortcutElements[3], /aria-label="加LINE好友"/);
  assert.match(shortcutElements[5], /home-quick-mail-icon/, 'unread mail animation hook remains intact');
});

test('theme assets are local files and the existing mall banner remains a genuine entry', () => {
  const assets = [...css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)].map(match => match[1]);
  for (const path of assets) assert.ok(existsSync(new URL(path.split('?')[0], themeUrl)), `missing local asset: ${path}`);
  const lineIcon = shortcutElements[3].match(/<img\b[^>]*src="([^"]+)"[^>]*>/)?.[0] || '';
  const lineIconPath = lineIcon.match(/src="([^"]+)"/)?.[1] || '';
  assert.match(lineIconPath, /^assets\/[^/]+\.svg$/);
  assert.ok(existsSync(new URL(lineIconPath, root)), 'LINE icon is a checked-in local vector');
  assert.match(lineIcon, /width="32" height="32"/);
  assert.match(lineIcon, /alt="" aria-hidden="true"/, 'decorative logo must not duplicate the link label');
  const svg = readFileSync(new URL(lineIconPath, root), 'utf8');
  assert.match(svg, /<svg\b/);
  assert.doesNotMatch(svg, /<script\b|<foreignObject\b|(?:href|src)="https?:/i);
  const banner = html.match(/<button\b[^>]*id="home-mall-banner"[\s\S]*?<\/button>/)?.[0] || '';
  assert.match(banner, /onclick="window\.openStoreShop\(\)"/);
  assert.match(banner, /assets\/points-mall-banner-20260916\.png/);
  assert.match(banner, /width="2170" height="725"/);
});

test('network search remains the existing three-scope form with accessible focus', () => {
  const start = html.indexOf('id="home-network-search-entry"');
  const end = html.indexOf('id="home-system-ticker"', start);
  const section = html.slice(start, end);
  assert.match(section, /onsubmit="return window\.openBusinessHomeSearch\(event\)"/);
  for (const value of ['own', 'public', 'ai']) assert.match(section, new RegExp(`name="businessHomeSearchScope" value="${value}"`));
  assert.match(section, /value="own" checked/);
  assert.match(section, /name="businessHomeSearchQuery" type="search" maxlength="300"/);
  assert.match(section, /onclick="window\.openHomeAiMatchInterest\?\.\(\)"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test('the new cards, announcement and task styling cannot force hidden data visible', () => {
  for (const selector of ['#home-primary-shortcuts', '#home-system-ticker', '#home-recurring-task-panel', '.home-lower-panel']) {
    assert.ok(css.includes(selector), `reference theme includes ${selector}`);
  }
  assert.match(html, /id="home-system-ticker" class="hidden/);
  assert.match(html, /id="home-recurring-task-content" class="hidden/);
  assert.match(html, /id="home-recurring-task-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="home-recurring-task-content"/);
  assert.doesNotMatch(css, /\.hidden\s*\{[^}]*display\s*:\s*(?:block|flex|grid)/s);
});

test('the theme preserves main-home member, points, QR and footer navigation hooks', () => {
  for (const id of ['home-profile-avatar-button', 'home-profile-points', 'nav-btn-card', 'nav-btn-matchmake', 'nav-btn-inbox', 'nav-btn-admin-settings', 'nav-btn-home']) {
    assert.ok(html.includes(`id="${id}"`), `kept ${id}`);
  }
  for (const handler of ['window.handleHomeAvatarClick?.()', 'window.openPointsWallet()', 'window.claimDailyPointCheckin(this)']) {
    assert.ok(html.includes(handler), `kept ${handler}`);
  }
  const sharedBanner = readFileSync(new URL('js/modules/card-page-banner-shortcuts.js', root), 'utf8');
  assert.ok(sharedBanner.includes("setHomeShareShortcut(page === 'home')"));
  assert.ok(sharedBanner.includes("window.showInviteLink?.()"));
  assert.ok(sharedBanner.includes("window.goPage('home')"));
});

test('dark shortcut-label palette cannot override white top-strip checkin text', () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const labelRules = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => /\.home-quick-label\s*$/.test(match[1].trim()) && /color\s*:\s*var\(--home-ink\)/.test(match[2]));
  for (const match of labelRules) {
    assert.ok(match[1].includes('#page-home') || match[1].includes('#home-primary-shortcuts') || match[1].includes('.home-lower-panel'), 'dark label color must not target the shared green top strip');
  }
});
