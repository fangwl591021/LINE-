const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
const mod = fs.readFileSync('js/modules/card-page-banner-shortcuts.js','utf8');
function ok(v,label){ if(!v){ console.error('FAIL',label); process.exit(1);} console.log('OK',label); }
ok(mod.includes('function setHomeShareShortcut(isHomePage)'), 'home banner runtime share switch exists');
ok(mod.includes("p.home.setAttribute('onclick', 'window.showInviteLink?.()')"), 'home page restores invite/share action');
ok(mod.includes("p.home.setAttribute('onclick', \"window.goPage('home')\")"), 'internal pages keep return-home action');
ok(mod.includes("if (p.homeIcon) p.homeIcon.textContent = 'qr_code_2';"), 'home share icon is restored');
ok(mod.includes("if (p.homeLabel) p.homeLabel.textContent = '專屬 QR';") && mod.includes("if (p.homeValue) p.homeValue.textContent = '分享';"), 'home share labels are restored');
ok(mod.includes("setHomeShareShortcut(page === 'home')"), 'page navigation switches share only on home');
ok(html.includes('js/modules/card-page-banner-shortcuts.js?v=1.3'), 'LIFF cache bust loads restored runtime');
ok(html.includes('data-home-top-action="home" onclick="window.goPage(\'home\')"'), 'static banner keeps safe return-home fallback');
console.log('Home banner share restore contract passed.');
