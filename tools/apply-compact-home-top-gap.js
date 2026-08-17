const fs = require('fs');
let html = fs.readFileSync('index.html','utf8');
const marker = 'body.home-page #page-home { padding-bottom: 0; }';
const replacement = 'body.home-page #page-home { padding-bottom: 0; margin-top: 0 !important; }';
if (html.includes(marker)) html = html.replace(marker, replacement);
else if (!html.includes(replacement)) throw new Error('home page spacing marker not found');
fs.writeFileSync('index.html', html);
console.log('Applied compact home top gap.');
