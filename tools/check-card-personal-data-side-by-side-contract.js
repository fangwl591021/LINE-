const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
const nav = fs.readFileSync('js/navigation.js','utf8');
function ok(v,label){ if(!v){ console.error('FAIL',label); process.exit(1);} console.log('OK',label); }
ok(html.includes('id="tab-content-personal" class="p-4 grid grid-cols-2 gap-3 items-start bg-white"'), 'personal data controls are side by side');
ok(html.includes('id="personal-contact-section"') && !html.includes('id="personal-contact-section" class="group rounded-2xl border border-slate-200 bg-white overflow-hidden" open'), 'contact section is closed by default');
ok(html.includes('id="personal-edit-section"') && !html.includes('id="personal-edit-section" class="group rounded-2xl border border-slate-200 bg-slate-50/50 overflow-hidden" open'), 'edit section is closed by default');
ok(nav.includes('if (contact) contact.open = false;') && nav.includes('if (edit) edit.open = false;'), 'legacy personal tab entry keeps both sections closed');
ok(html.includes('js/navigation.js?v=7.98'), 'navigation cache bust updated');
ok(html.includes('id="tab-tags"') && html.includes('id="tab-ecard"'), 'other top-level tabs remain unchanged');
console.log('Card personal-data side-by-side contract passed.');
