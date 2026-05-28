const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8');

function fail(message) {
  console.error('Home design contract failed:', message);
  process.exit(1);
}

[
  'home-profile-card',
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

if (!index.includes('js/auth.js?v=10.25')) {
  fail('auth.js cache-bust version must be bumped for check-in UI change');
}

if (!index.includes('home-action-card')) {
  fail('home cards should use the refreshed white card styling');
}
if (!index.includes('overflow-y-auto overflow-x-hidden')) {
  fail('main app surface should prevent horizontal overflow on mobile');
}
if (index.includes('id="home-profile-card" class="mx-0 -mt-1 rounded-')) {
  fail('profile panel should not render an outer card frame');
}
if (!index.includes('id="home-profile-card" class="mx-0 -mt-1 p-2.5 overflow-hidden"')) {
  fail('profile panel should keep only compact spacing without an outer frame');
}
if (!index.includes('grid grid-cols-3 divide-x divide-y divide-slate-100')) {
  fail('quick actions should render as a 2x3 grid');
}
if (!index.includes('mx-0 home-action-card p-2')) {
  fail('quick action card should use tighter spacing');
}
if (!index.includes('hidden space-y-3 animate-in') || !index.includes('text-[26px] leading-none')) {
  fail('home top spacing and point size should stay compact');
}
if (!index.includes('id="home-feature-section"')) {
  fail('featured function section should be present');
}
if (!index.includes('js/modules/home.js?v=7.36')) {
  fail('home.js cache-bust version must be bumped');
}
if (!index.includes('id="home-media-container"') || !home.includes('hasHomeMedia')) {
  fail('optional home media container must stay hidden unless media is enabled');
}
if (!home.includes('border border-pink-100') || !home.includes('text-pink-500')) {
  fail('dynamic home suggestion cards should match the refreshed pink design');
}

console.log('Home design contract passed.');
