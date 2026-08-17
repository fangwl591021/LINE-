const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
function ok(v,m){if(!v){console.error('FAIL',m);process.exit(1)}console.log('OK',m)}
ok(html.includes('body.home-page #page-home { padding-bottom: 0; margin-top: 0 !important; }'),'home page removes forced sibling gap below banner');
ok(html.includes('class="mx-0 -mt-px bg-white px-2 pt-0 pb-4 shadow-sm"'),'home quick grid container remains unchanged');
ok(html.includes('home-quick-circle group'),'home quick actions remain intact');
console.log('Compact home top gap contract passed.');
