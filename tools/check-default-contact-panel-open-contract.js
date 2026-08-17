const fs = require('fs');
const nav = fs.readFileSync('js/navigation.js','utf8');
const html = fs.readFileSync('index.html','utf8');
function ok(v,m){ if(!v){ console.error('FAIL',m); process.exit(1); } console.log('OK',m); }
ok(nav.includes("const defaultPanel = requestedTab === 'edit' ? 'edit' : 'info';"), 'personal tab chooses contact by default');
ok(nav.includes('window.togglePersonalDataPanel?.(defaultPanel);'), 'personal tab opens one full-width panel');
ok(nav.includes("const target = kind === 'edit' ? 'edit' : 'info';"), 'accordion remains mutually exclusive');
ok(html.includes('js/navigation.js?v=8.00'), 'navigation cache busted');
console.log('Default contact panel contract passed.');
