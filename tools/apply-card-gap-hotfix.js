const fs = require('fs');
const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');
html = html.replace('js/modules/card-page-banner-shortcuts.js?v=1.0', 'js/modules/card-page-banner-shortcuts.js?v=1.2');
if (!html.includes('js/modules/card-page-banner-shortcuts.js?v=1.2')) throw new Error('card-page banner cache bust failed');
fs.writeFileSync(path, html);
console.log('Bumped card-page banner module to v1.2');
