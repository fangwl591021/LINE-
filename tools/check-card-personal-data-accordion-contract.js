const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
const nav = fs.readFileSync('js/navigation.js','utf8');
const cards = fs.readFileSync('js/modules/cards.js','utf8');
function ok(v,label){ if(!v){ console.error('FAIL',label); process.exit(1);} console.log('OK',label); }

ok(html.includes('id="tab-personal"') && html.includes('>👤 個人資料</button>'), 'contact and edit tabs are replaced by personal data tab');
ok(!html.includes('id="tab-info"') && !html.includes('id="tab-edit"'), 'old separate contact/edit tab buttons are removed');
ok(html.includes('id="personal-contact-section"') && html.includes('聯絡資料'), 'contact data is an accordion section');
ok(html.includes('id="personal-edit-section"') && html.includes('編輯內容'), 'edit content is an accordion section');
ok(html.includes('id="tab-content-info"') && html.includes('id="tab-content-edit"'), 'existing contact and edit content ids remain compatible');
ok(html.includes('id="tab-tags"') && html.includes('id="tab-ecard"'), 'five tags and digital card tabs remain independent');
ok(nav.includes("const activeTab = (tab === 'info' || tab === 'edit') ? 'personal' : tab"), 'legacy info/edit switchTab calls map to personal data');
ok(nav.includes("['personal','tags','ecard']"), 'switchTab now manages three top-level tabs');
ok(cards.includes('const personalEditSection = $("personal-edit-section")'), 'card permissions control edit accordion visibility');
ok(cards.includes('personalEditSection.classList.add("hidden")'), 'read-only cards hide edit accordion');
ok(html.includes('js/navigation.js?v=7.97'), 'navigation cache bust updated');
ok(html.includes('js/modules/cards.js?v=7.98'), 'cards cache bust updated');
console.log('Card personal-data accordion contract passed.');
