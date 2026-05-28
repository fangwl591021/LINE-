const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function fail(message) {
  console.error(`Home profile restyle contract failed: ${message}`);
  process.exit(1);
}

if (!html.includes('home-profile-hero')) {
  fail('missing dark dotted profile hero');
}

if (!html.includes('grid grid-cols-[112px_1fr_92px]')) {
  fail('profile card must move points and QR into the left and right side columns');
}

if (html.includes('<span class="ml-0.5 text-[11px] font-black text-slate-600">點</span>')) {
  fail('profile points card should not render a trailing point unit');
}

if (!html.includes('items-center justify-center gap-2')) {
  fail('fortune button should keep the icon and Today label on the same row');
}

if (!html.includes('id="home-profile-card"')) {
  fail('missing active home profile card');
}

if (!html.includes('id="home-profile-card" class="mx-0 -mt-1 overflow-hidden"')) {
  fail('active home profile card should not render an outer frame');
}

[
  'id="home-profile-avatar-button"',
  'id="home-profile-avatar-edit-badge"'
].forEach(marker => {
  if (!html.includes(marker)) fail(`missing owner-only control marker ${marker}`);
});

if (!html.includes('id="home-profile-card-legacy" class="hidden"')) {
  fail('legacy profile card must be hidden for visual fallback only');
}

[
  'id="home-profile-avatar"',
  'id="home-profile-name"',
  'id="home-profile-role"',
  'id="home-profile-points"',
  'id="home-zodiac-weekly-btn"',
  'id="home-profile-qr"'
].forEach(marker => {
  if (!html.includes(marker)) fail(`missing required profile marker ${marker}`);
});

if (!html.includes("onclick=\"window.goPage('admin-settings')\"")) {
  fail('new profile card must keep an edit entry point');
}

if (!html.includes('grid grid-cols-3 gap-3')) {
  fail('home quick actions must use separated card grid spacing');
}

console.log('Home profile restyle contract passed.');
