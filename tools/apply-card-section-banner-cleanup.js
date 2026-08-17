const fs = require('fs');
const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');

const switchPattern = /\s*<nav class="card-customer-switch[^>]*aria-label="名片與客戶切換">[\s\S]*?<\/nav>\s*/g;
const before = (html.match(/aria-label="名片與客戶切換"/g) || []).length;
html = html.replace(switchPattern, '\n');
const after = (html.match(/aria-label="名片與客戶切換"/g) || []).length;
if (after !== 0) throw new Error('card/customer lower switch still exists');
console.log(`Removed ${before} lower card/customer switch nav(s).`);

fs.writeFileSync(path, html);
