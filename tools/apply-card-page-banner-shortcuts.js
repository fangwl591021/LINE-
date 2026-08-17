const fs = require('fs');
const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');
const tag = '    <script src="js/modules/card-page-banner-shortcuts.js?v=1.0"></script>\n';
if (!html.includes(tag.trim())) {
  if (!html.includes('</body>')) throw new Error('Missing </body>');
  html = html.replace('</body>', `${tag}</body>`);
}
fs.writeFileSync(path, html);
console.log('Wired card-page banner shortcut module.');
