const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
const nav = fs.readFileSync('js/navigation.js','utf8');
function ok(v,label){ if(!v){ console.error('FAIL',label); process.exit(1);} console.log('OK',label); }
ok(html.includes('id="personal-contact-toggle"') && html.includes('id="personal-edit-toggle"'), 'contact and edit controls stay side by side');
ok(html.includes('id="tab-content-info" class="hidden mt-3 w-full') && html.includes('id="tab-content-edit" class="hidden mt-3 w-full'), 'both content panels are full width and closed by default');
ok(!html.includes('id="personal-contact-section"') && !html.includes('id="personal-edit-section"'), 'old half-width details accordions are removed');
ok(nav.includes('window.togglePersonalDataPanel = function(kind)'), 'personal data toggle helper exists');
ok(nav.includes('window.closePersonalDataPanels = function()'), 'single-open close helper exists');
ok(nav.includes("const wasOpen = !targetPanel.classList.contains('hidden')") && nav.includes('window.closePersonalDataPanels();'), 'opening one panel closes the other first');
ok(nav.includes("if (wasOpen) return;"), 'clicking the active panel closes it');
ok(nav.includes('window.closePersonalDataPanels?.();'), 'entering personal tab starts with both panels closed');
ok(html.includes('js/navigation.js?v=7.99'), 'navigation cache bust updated');
ok(html.includes('id="tab-tags"') && html.includes('id="tab-ecard"'), 'five-tag and digital-card tabs remain unchanged');
console.log('Card personal-data single-expanded contract passed.');
