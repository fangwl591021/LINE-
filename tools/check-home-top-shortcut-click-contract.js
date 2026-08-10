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
  points: 'window.openPointsWallet()',
  checkin: 'window.claimDailyPointCheckin(this)',
  invite: 'window.showInviteLink?.()'
};

for (const [action, handler] of Object.entries(actions)) {
  const pattern = new RegExp(`<button[^>]+data-home-top-action="${action}"[^>]+onclick="${handler.replace(/[?.()]/g, '\\$&')}"[^>]*>`, 's');
  expect(pattern.test(activeCard), `${action} must be a complete clickable button`);
}

expect(
  activeCard.includes('id="home-profile-avatar-button" type="button" data-home-top-action="profile"'),
  'profile name and member-area text must share the avatar button'
);
expect(
  html.includes('.home-top-shortcut > * { pointer-events: none; }'),
  'shortcut children must delegate hit testing to the parent button'
);

console.log('Home top shortcut click contract passed.');
