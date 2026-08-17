const fs = require('fs');
const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');
if (html.includes('js/navigation.js?v=7.94')) html = html.replace('js/navigation.js?v=7.94','js/navigation.js?v=7.95');
else if (!html.includes('js/navigation.js?v=7.95')) throw new Error('navigation script marker not found');
fs.writeFileSync(path, html);
console.log('Updated navigation cache bust for my-card shared banner.');
