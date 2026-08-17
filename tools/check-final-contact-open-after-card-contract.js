const fs = require('fs');
const ui = fs.readFileSync('js/modules/business-intent.js','utf8');
const html = fs.readFileSync('index.html','utf8');
function ok(v,m){ if(!v){ console.error('FAIL',m); process.exit(1); } console.log('OK',m); }
ok(ui.includes("window.currentPage === 'card-detail'"), 'post-render hook is scoped to card detail');
ok(ui.includes("window.switchTab?.('personal')"), 'post-render hook activates personal tab');
ok(ui.includes("window.openPersonalDataPanel?.('info')"), 'post-render hook force opens contact panel');
ok(html.includes('js/modules/business-intent.js?v=1.1'), 'business intent cache is busted');
console.log('Final contact open contract passed.');
