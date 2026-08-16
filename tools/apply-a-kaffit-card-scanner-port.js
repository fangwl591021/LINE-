const fs = require('fs');

const indexPath = 'index.html';
let html = fs.readFileSync(indexPath, 'utf8');
const classic = '<script src="js/modules/cropper.js?v=7.18"></script>';
const moduleTag = '<script type="module" src="js/modules/a-kaffit-card-scanner-adapter.js?v=1.0"></script>';

if (!html.includes(classic)) throw new Error('cropper script marker not found');
if (!html.includes(moduleTag)) {
  html = html.replace(classic, `${classic}\n${moduleTag}`);
}
fs.writeFileSync(indexPath, html);
console.log('A-kaffit card scanner adapter wired after legacy cropper module.');
