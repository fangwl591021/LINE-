const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const home=fs.readFileSync(path.join(root,'js/modules/home.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
function ok(cond,msg){if(!cond){console.error('Ticker readable pace contract failed:',msg);process.exit(1);}console.log('OK',msg);}
ok((home.match(/duration: 8000, easing: 'linear', fill: 'forwards'/g)||[]).length>=2,'enter and exit are slowed to 8 seconds');
ok(home.includes('await waitHomeTicker_(950);'),'center pre-flash pause is extended');
ok(home.includes('await waitHomeTicker_(1050);'),'center post-flash pause is extended');
ok(home.includes("textEl.textContent = '';"),'text is cleared after fully leaving');
ok(home.includes('await waitHomeTicker_(1500);'),'messages have a 1.5 second blank gap');
ok(index.includes('js/modules/home.js?v=7.85'),'home.js cache bust is v7.85');
console.log('Ticker readable pace contract passed.');
