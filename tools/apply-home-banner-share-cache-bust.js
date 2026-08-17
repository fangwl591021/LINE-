const fs = require('fs');
const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');
if (html.includes('js/modules/card-page-banner-shortcuts.js?v=1.2')) {
  html = html.replace('js/modules/card-page-banner-shortcuts.js?v=1.2', 'js/modules/card-page-banner-shortcuts.js?v=1.3');
} else if (!html.includes('js/modules/card-page-banner-shortcuts.js?v=1.3')) {
  throw new Error('card-page-banner-shortcuts cache marker not found');
}
fs.writeFileSync(path, html);
console.log('Bumped card-page-banner-shortcuts to v1.3');
