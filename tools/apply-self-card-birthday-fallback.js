const fs = require('fs');

let cards = fs.readFileSync('js/modules/cards.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');

const oldCode = `    const birthday = safeText(card.birthday || card["生日"]).trim();\n    const fate = typeof window.getZodiacProfileForBirthday === "function" ? window.getZodiacProfileForBirthday(birthday) : null;`;
const newCode = `    const directBirthday = safeText(card.birthday || card["生日"]).trim();\n    const currentUserId = getCurrentUserId();\n    const isSelfProfileCard = !!currentUserId && (\n      getCardLineId(card) === currentUserId ||\n      getCardSourceType(card) === "self_profile"\n    );\n    const sessionBirthday = safeText(\n      (window.currentUser && window.currentUser.birthday) ||\n      (window.currentUserProfile && window.currentUserProfile.birthday) ||\n      ""\n    ).trim();\n    const birthday = directBirthday || (isSelfProfileCard ? sessionBirthday : "");\n    const fate = typeof window.getZodiacProfileForBirthday === "function" ? window.getZodiacProfileForBirthday(birthday) : null;`;

if (cards.includes(oldCode)) cards = cards.replace(oldCode, newCode);
else if (!cards.includes(newCode)) throw new Error('fate birthday marker not found');

if (html.includes('js/modules/cards.js?v=7.98')) html = html.replace('js/modules/cards.js?v=7.98', 'js/modules/cards.js?v=7.99');
else if (!html.includes('js/modules/cards.js?v=7.99')) throw new Error('cards cache marker not found');

fs.writeFileSync('js/modules/cards.js', cards);
fs.writeFileSync('index.html', html);
console.log('Applied self-card birthday fallback for zodiac fate.');
