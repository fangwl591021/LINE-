const fs = require('fs');
const nav = fs.readFileSync('js/navigation.js','utf8');
const html = fs.readFileSync('index.html','utf8');
function ok(v,label){ if(!v){ console.error('FAIL',label); process.exit(1);} console.log('OK',label); }
ok(nav.includes("new Set(['home', 'card', 'customers', 'admin-settings', 'card-detail'])"), 'card-detail keeps shared top banner visible');
ok(html.includes('js/navigation.js?v=7.96'), 'navigation cache bust updated for card-detail banner');
ok(nav.includes("if (sharedBanner) sharedBanner.classList.toggle('hidden', !showSharedBanner)"), 'shared banner visibility remains controlled by goPage');
console.log('My-card detail shared banner contract passed.');
