const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');

function fail(message) {
  console.error('Home design contract failed:', message);
  process.exit(1);
}

[
  'home-profile-card',
  'home-header-site-name',
  'home-top-nav-switch',
  'home-profile-avatar',
  'home-profile-points',
  'home-zodiac-weekly-btn',
  'home-profile-qr',
  'home-onboarding-ai-list',
  'home-sales-assistant-list'
].forEach((id) => {
  if (!index.includes(`id="${id}"`)) fail(`missing required home id: ${id}`);
});

[
  "window.openTodayFortune?.()",
  "window.shareHomeProfileCard(this)",
  "window.claimDailyPointCheckin(this)",
  "window.goPage('card')",
  "window.shareMyCard(this)",
  "window.goPage('inbox')"
].forEach((needle) => {
  if (!index.includes(needle)) fail(`missing home action: ${needle}`);
});

if (!index.includes('js/auth.js?v=10.26')) {
  fail('auth.js cache-bust version must be bumped for check-in UI change');
}

if (!index.includes('home-action-card')) {
  fail('home cards should use the refreshed white card styling');
}
if (!index.includes('overflow-y-auto overflow-x-hidden')) {
  fail('main app surface should prevent horizontal overflow on mobile');
}
if (!index.includes('id="home-profile-card" class="home-profile-v2 mx-0 -mt-1"')) {
  fail('profile panel should keep the v2 layout without an outer frame');
}
if (!index.includes('home-profile-hero')) {
  fail('profile panel should render the dark dotted hero header');
}
if (!index.includes('id="top-nav"') ||
    !index.includes('body.home-page #top-nav { display: none !important; }') ||
    !index.includes('body.home-page #main { padding-top: 0; }')) {
  fail('home page should move the white nav title into the green hero');
}
if (!index.includes('id="bottom-nav"') || index.includes('body.home-page nav { display: none !important; }')) {
  fail('home page must not hide the bottom navigation');
}
if (!index.includes('js/navigation.js?v=7.7') ||
    !navigation.includes("} else if (page === 'home')") ||
    !navigation.includes("if (bottomNav) bottomNav.classList.remove('hidden');") ||
    !navigation.includes("if (bottomNavAdmin) bottomNavAdmin.classList.add('hidden');")) {
  fail('home page must always show the standard bottom navigation');
}
if (!index.includes('grid grid-cols-3 gap-2.5')) {
  fail('quick actions should render as separated action cards');
}
if (!index.includes('hidden space-y-3 animate-in') || !index.includes('text-[18px] leading-none')) {
  fail('home top spacing and point size should stay compact');
}
if (!index.includes('id="home-feature-section"')) {
  fail('featured function section should be present');
}
if (!index.includes('js/modules/home.js?v=7.43')) {
  fail('home.js cache-bust version must be bumped');
}
if (!index.includes('id="home-media-container"') || !home.includes('hasHomeMedia')) {
  fail('optional home media container must stay hidden unless media is enabled');
}
if (!home.includes('border border-pink-100') || !home.includes('text-pink-500')) {
  fail('dynamic home suggestion cards should match the refreshed pink design');
}

console.log('Home design contract passed.');
