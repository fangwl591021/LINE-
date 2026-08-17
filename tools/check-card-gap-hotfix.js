const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
const mod = fs.readFileSync('js/modules/card-page-banner-shortcuts.js','utf8');
function ok(v,label){if(!v){console.error('FAIL',label);process.exit(1)}console.log('OK',label)}
ok(html.includes('js/modules/card-page-banner-shortcuts.js?v=1.2'),'cache bust is v1.2');
ok(mod.includes('margin-top: 0 !important'),'card/customer page top margin is zero');
ok(mod.includes('padding-top: 0.5rem !important') && mod.includes('padding-bottom: 0.5rem !important'),'upload section padding is compact');
ok(mod.includes('min-height: 58px !important'),'upload controls use compact touch height');
ok(html.includes('data-home-top-action="points"') && html.includes('購物金'),'homepage points remains');
ok(html.includes('data-home-top-action="checkin"') && html.includes('簽到贈點'),'homepage checkin remains');
console.log('Card gap hotfix contract passed.');
