const fs = require('fs');
const inbox = fs.readFileSync('js/modules/inbox.js','utf8');
const html = fs.readFileSync('index.html','utf8');
function ok(v,m){ if(!v){ console.error('FAIL',m); process.exit(1); } console.log('OK',m); }
ok(inbox.includes('res.success === false || res.error'), 'frontend rejects failed send response');
ok(inbox.includes("throw new Error((res && res.error) || '訊息送出失敗')"), 'worker error is surfaced to user');
ok(html.includes('js/modules/inbox.js?v=1.20'), 'inbox cache bust updated');
console.log('Inbox send result guard contract passed.');
