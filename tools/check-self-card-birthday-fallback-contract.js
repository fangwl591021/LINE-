const fs = require('fs');
const cards = fs.readFileSync('js/modules/cards.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
function ok(v, label) { if (!v) { console.error('FAIL', label); process.exit(1); } console.log('OK', label); }
ok(cards.includes('const directBirthday = safeText(card.birthday || card["生日"]).trim();'), 'card birthday remains first authority');
ok(cards.includes('getCardLineId(card) === currentUserId'), 'linked self card may use registered member birthday');
ok(cards.includes('getCardSourceType(card) === "self_profile"'), 'self-profile card may use registered member birthday');
ok(cards.includes('const birthday = directBirthday || (isSelfProfileCard ? sessionBirthday : "");'), 'registered birthday is fallback only for own card');
ok(cards.includes('(window.currentUser && window.currentUser.birthday)'), 'session user birthday is used as fallback');
ok(!cards.includes('const birthday = directBirthday || sessionBirthday;'), 'other peoples cards never inherit current user birthday');
ok(html.includes('js/modules/cards.js?v=7.99'), 'cards module cache bust updated');
console.log('Self-card birthday fallback contract passed.');
