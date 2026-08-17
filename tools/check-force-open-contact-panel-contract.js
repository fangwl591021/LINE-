const fs=require('fs');
const nav=fs.readFileSync('js/navigation.js','utf8');
const html=fs.readFileSync('index.html','utf8');
function ok(v,m){if(!v){console.error('FAIL',m);process.exit(1)}console.log('OK',m)}
ok(nav.includes("window.openPersonalDataPanel?.(defaultPanel)"),'personal tab force-opens default panel');
ok(nav.includes("window.openPersonalDataPanel = function(kind)"),'force-open helper exists');
ok(nav.includes("targetPanel.classList.remove('hidden')"),'force-open helper reveals target');
ok(nav.includes("window.closePersonalDataPanels();"),'force-open remains mutually exclusive');
ok(html.includes('js/navigation.js?v=8.01'),'navigation cache busted');
console.log('Force-open contact panel contract passed.');