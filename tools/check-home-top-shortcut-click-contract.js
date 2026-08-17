const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(`Home top shortcut click contract failed: ${message}`);
}

const activeStart = html.indexOf('<section id="home-profile-card"');
const activeEnd = html.indexOf('<section id="home-profile-card-legacy"', activeStart);
expect(activeStart >= 0 && activeEnd > activeStart, 'active profile card markup is missing');

const activeCard = html.slice(activeStart, activeEnd);
const actions = {
  profile: 'window.handleHomeAvatarClick?.()',
  cards: "window.goPage('card')",
  customers: "window.goPage('customers')",
  home: "window.goPage('home')"
};

for (const [action, handler] of Object.entries(actions)) {
  const pattern = new RegExp(`<button[^>]+data-home-top-action="${action}"[^>]+onclick="${handler.replace(/[?.()']/g, '\\$&')}"[^>]*>`, 's');
  expect(pattern.test(activeCard), `${action} must be a complete clickable button`);
}

expect(
  activeCard.includes('id="home-profile-avatar-button" type="button" data-home-top-action="profile"'),
  'profile name and member-area text must share the avatar button'
);
expect(activeCard.includes('data-home-top-action="cards"') && activeCard.includes('收藏名片'), 'second shortcut must be 收藏名片');
expect(activeCard.includes('data-home-top-action="customers"') && activeCard.includes('我的客戶'), 'third shortcut must be 我的客戶');
expect(
  activeCard.includes('data-home-top-action="home"') && activeCard.includes('aria-label="返回首頁"'),
  'fourth active shortcut must remain the explicit return-home action'
);
expect(!activeCard.includes('data-home-top-action="points"'), 'points shortcut must no longer occupy the shared banner');
expect(!activeCard.includes('data-home-top-action="checkin"'), 'checkin shortcut must no longer occupy the shared banner');
expect(
  html.includes('.home-top-shortcut > * { pointer-events: none; }'),
  'shortcut children must delegate hit testing to the parent button'
);
expect(
  html.includes('height: 108px; padding-top: 10px; padding-bottom: 10px;'),
  'shortcuts must use a fixed vertically centered Android-safe hit area'
);
expect(
  html.includes('font-size: 30px; line-height: 1;') &&
    html.includes('home-profile-avatar-frame') &&
    html.includes('text-[13px] font-black leading-tight'),
  'shortcut icons, avatar and labels must keep the compact layout'
);
expect(
  html.includes('width: 46px; height: 46px; min-width: 46px; min-height: 46px; max-width: 46px; max-height: 46px;') &&
    html.includes('flex: 0 0 46px; aspect-ratio: 1 / 1; border-radius: 9999px;') &&
    html.includes('.home-profile-avatar-frame > img') &&
    html.includes('border-radius: inherit; object-fit: cover;'),
  'Android must not flex-shrink or stretch the profile avatar into an oval'
);

console.log('Home top shortcut click contract passed.');
