const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const home=fs.readFileSync(path.join(root,'js/modules/home.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
function ok(cond,msg){if(!cond){console.error('Ticker readable pace contract failed:',msg);process.exit(1);}console.log('OK',msg);}
ok(home.includes('iterations: Infinity') && home.includes("easing: 'linear'"),'ticker moves continuously');
ok(!home.includes('waitHomeTicker_'),'ticker does not insert center or inter-message waits');
ok(home.includes('segmentWidth / 45 * 1000'),'speed stays consistent for short and long announcements');
ok(/js\/modules\/home\.js\?v=/.test(index),'home.js has a cache version');
console.log('Ticker readable pace contract passed.');
