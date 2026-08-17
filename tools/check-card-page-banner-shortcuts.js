const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
const mod = fs.readFileSync('js/modules/card-page-banner-shortcuts.js','utf8');
function ok(v,label){if(!v){console.error('FAIL',label);process.exit(1)}console.log('OK',label)}
const bannerStart = html.indexOf('id="home-profile-card"');
const bannerEnd = html.indexOf('id="home-header-site-name"', bannerStart);
const banner = html.slice(bannerStart, bannerEnd);
ok(banner.includes('data-home-top-action="points"') && banner.includes('購物金'), 'homepage banner keeps points slot');
ok(banner.includes('data-home-top-action="checkin"') && banner.includes('簽到贈點'), 'homepage banner keeps checkin slot');
ok(html.includes('js/modules/card-page-banner-shortcuts.js?v=1.0'), 'card-page banner module is loaded');
ok(mod.includes("setCardPageBanner(page === 'card')"), 'only card page activates alternate banner');
ok(mod.includes("p.pointsLabel.textContent = '收藏名片'"), 'card page replaces points label with 收藏名片');
ok(mod.includes("p.checkinLabel.textContent = '我的客戶'"), 'card page replaces checkin label with 我的客戶');
ok(mod.includes("p.points.setAttribute('onclick', \"window.goPage('card')\")"), '收藏名片 banner slot opens card page');
ok(mod.includes("p.checkin.setAttribute('onclick', \"window.goPage('customers')\")"), '我的客戶 banner slot opens customers page');
ok(mod.includes("p.pointsLabel.textContent = '購物金'"), 'leaving card page restores points label');
ok(mod.includes("p.checkinLabel.textContent = '簽到贈點'"), 'leaving card page restores checkin label');
console.log('Card-page banner shortcut contract passed.');
