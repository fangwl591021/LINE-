const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
const ui = fs.readFileSync('js/modules/business-intent.js','utf8');
const match = fs.readFileSync('js/modules/matchmake.js','utf8');
const worker = fs.readFileSync('workerbackup.js','utf8');
function ok(v,m){ if(!v){ console.error('FAIL',m); process.exit(1); } console.log('OK',m); }
ok(html.includes('js/modules/business-intent.js?v=1.0'), 'business intent module loaded');
ok(ui.includes('🎯 業務需求') && ui.includes('business-intent-offer') && ui.includes('business-intent-seek') && ui.includes('business-intent-collaboration'), 'three business intent fields exist');
ok(ui.includes("cfg.businessIntent = intent"), 'business intent persists in card custom config');
ok(ui.includes('startBusinessIntentRecommendation'), 'immediate smart recommendation action exists');
ok(match.includes('businessIntent: businessIntent'), 'matchmaking sends saved business intent');
ok(match.includes('我可以提供：') && match.includes('我正在尋找：') && match.includes('我希望合作：'), 'empty search can use saved business intent');
ok(worker.includes('businessIntent = {}'), 'worker accepts business intent');
ok(worker.includes('const readBusinessIntent = (contact) =>'), 'candidate business intent is read from card config');
ok(worker.includes('業務需求: ${c.BusinessIntent'), 'candidate business intent is included in AI prompt');
ok(worker.includes('具體說明互補點與合作價值'), 'AI prompt requests decision-oriented reason');
ok(worker.includes('localMatchmakingFallback(effectiveQuery, safeContacts)'), 'fallback uses effective business intent query');
console.log('Business intent matchmaking contract passed.');
