const fs = require('fs');
const nav = fs.readFileSync('js/navigation.js','utf8');
const html = fs.readFileSync('index.html','utf8');
function ok(v,label){ if(!v){ console.error('FAIL',label); process.exit(1);} console.log('OK',label); }
ok(nav.includes("new Set(['home', 'card', 'customers', 'admin-settings'])"), 'my-card admin-settings keeps shared top banner visible');
ok(nav.includes("else if (page === 'admin-settings') window.refreshBusinessCardCameraInputs('mycard')"), 'my-card camera behavior remains unchanged');
ok(html.includes('js/navigation.js?v=7.95'), 'navigation cache bust updated');
console.log('My-card shared banner contract passed.');
