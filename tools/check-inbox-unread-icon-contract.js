const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inbox = fs.readFileSync(path.join(root, 'js/modules/inbox.js'), 'utf8');

function fail(message) {
  console.error(`Inbox unread icon contract failed: ${message}`);
  process.exit(1);
}

if (!html.includes('home-quick-mail-icon')) {
  fail('home inbox icon must have a dedicated mail icon class');
}

if (!html.includes('has-unread-mail .home-quick-mail-icon')) {
  fail('home page must define unread mail icon state styles');
}

if (!html.includes('@keyframes inboxMailPulse')) {
  fail('home page must define the unread mail two-color animation');
}

if (!html.includes('js/modules/inbox.js?v=1.10')) {
  fail('index.html must reference the bumped inbox.js cache version');
}

if (!inbox.includes('button.classList.add("has-unread-mail")')) {
  fail('refreshInboxBadge must enable unread icon state when unread count is positive');
}

if (!inbox.includes('button.classList.remove("has-unread-mail")')) {
  fail('refreshInboxBadge must clear unread icon state when unread count is zero');
}

if (inbox.includes('document.title = unread > 0')) {
  fail('unread inbox count must not prefix the browser or LIFF title');
}

if (!inbox.includes('document.title = base;')) {
  fail('updateTitleUnread must strip any old unread prefix from the title');
}

console.log('Inbox unread icon contract passed.');
