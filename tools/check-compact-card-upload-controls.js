const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
function ok(v,label){if(!v){console.error('FAIL',label);process.exit(1)}console.log('OK',label)}
const start=html.indexOf('id="page-card"');
const end=html.indexOf('id="page-card-detail"',start);
ok(start>=0&&end>start,'card page region found');
const card=html.slice(start,end);
ok(card.includes('bg-white px-4 py-3 border-y border-slate-100'),'card upload area uses compact outer padding');
ok(card.includes('class="flex gap-3 mt-0"'),'extra top margin removed');
ok(card.includes('collected-card-camera-label')&&card.includes('py-3 rounded-2xl'),'camera button height reduced');
ok(card.includes("document.getElementById('galleryInput').click()")&&card.includes('py-3 rounded-2xl'),'gallery button height reduced');
ok((card.match(/material-symbols-outlined text-2xl/g)||[]).length>=2,'upload icons reduced to compact size');
ok(!card.includes('collected-card-camera-label" class="flex-1 bg-blue-50 text-blue-600 py-4'),'old tall camera control removed');
console.log('Compact card upload controls contract passed.');
