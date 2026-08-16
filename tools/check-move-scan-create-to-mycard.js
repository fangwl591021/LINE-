const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
function ok(value, label) { if (!value) { console.error('FAIL', label); process.exit(1); } console.log('OK', label); }
const sourceArea = html.slice(html.indexOf('aria-label="名片與客戶切換"'), html.indexOf('id="details-my-ecard"'));
ok(!sourceArea.includes('收藏名片請用來掃描客戶或合作夥伴。'), 'collection page no longer shows self-card guidance');
ok(html.includes('id="mycard-scan-create-moved"'), 'scan-create block exists in My Card section');
const myCardIndex = html.indexOf('id="details-my-ecard"');
const movedIndex = html.indexOf('id="mycard-scan-create-moved"');
ok(myCardIndex >= 0 && movedIndex > myCardIndex, 'scan-create block is inside/after My Card section start');
ok(html.includes('>建立我的名片</button>'), 'create-my-card action preserved');
ok(html.includes('document_scanner</span> 掃描建立名片'), 'scan-create title preserved');
console.log('My Card scan-create move contract passed.');
