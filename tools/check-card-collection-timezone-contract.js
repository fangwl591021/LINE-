const fs = require('fs');
const cards = fs.readFileSync('js/modules/cards.js','utf8');
const html = fs.readFileSync('index.html','utf8');
function ok(v,label){ if(!v){ console.error('FAIL',label); process.exit(1);} console.log('OK',label); }
ok(cards.includes('function parseCardTimestamp(value)'), 'shared card timestamp parser exists');
ok(cards.includes("const iso = hasExplicitZone ? normalized : normalized + 'Z';"), 'timezone-less D1 timestamps are interpreted as UTC');
ok(cards.includes('const parsed = parseCardTimestamp(text);') && cards.includes('return parsed.getTime();'), 'sorting uses the same UTC-aware parser');
ok(cards.includes('const date = parseCardTimestamp(raw);'), 'display uses the same UTC-aware parser');
ok(html.includes('js/modules/cards.js?v=8.00'), 'cards cache bust updated');
console.log('Card collection timezone contract passed.');
