// Local-only synthetic acceptance page. No production APIs, AI requests, or writes.
// Run: node test/browser/card-harvest-match-preview.mjs (http://127.0.0.1:8774/)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const intent = { offer: '食品通路', seek: '日本經銷商', collaboration: '聯合推廣' };
const intentKey = JSON.stringify(intent);
const names = ['古瀚良', '張簡沛淵', '高群雄', '李侑霖', '吳柏達', '毛豪', '食品通路甲', '食品通路乙', '食品通路丙', '食品通路丁', '食品通路戊', '食品通路己'];
const cards = names.map((name, index) => ({
  rowId: 'SYNTHETIC_' + index, 姓名: name, sourceType: 'private_import', scannerUserId: 'U_PREVIEW',
  公司名稱: index % 2 ? '合成食品公司' : '合成行銷公司', 職稱: '合作夥伴', 業種: index % 2 ? '餐飲食品' : '工商專業服務',
  created_at: `2026-09-${String(18 - index).padStart(2, '0')}T00:00:00Z`,
  aiMatch: { status: index === 8 ? 'pending' : index === 9 ? 'needs_intent' : 'completed', score: [75, 82, 68, 45, 82, 45, 0, 91, null, null, 62, 84][index], source: index === 4 ? 'rules' : 'ai', reason: '此為本機合成資料：食品通路資源可協助商品推廣，需進一步確認實際合作範圍。', updatedAt: '2026-09-18T00:00:00Z', intentKey },
}));
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>收藏配對 · 本機合成驗收</title><link rel="stylesheet" href="/styles.css"><style>
*{box-sizing:border-box}body{margin:0;background:#f2faf7;color:#142d42;font-family:system-ui,sans-serif}main{max-width:600px;margin:auto;padding:20px 12px}h1{font-size:20px;margin:10px 0}.notice{font-size:12px;color:#526779;margin-bottom:16px}input,button{font:inherit}input{width:100%;padding:12px;border:1px solid #c6ddd4;border-radius:10px;margin:10px 0}.filters{display:flex;gap:8px;flex-wrap:wrap}.filters button{border:1px solid #c6ddd4;border-radius:20px;background:white;padding:8px 12px}button{cursor:pointer}.bg-white{background:white}.flex{display:flex}.flex-1{flex:1}.items-center{align-items:center}.justify-between{justify-content:space-between}.flex-wrap{flex-wrap:wrap}.gap-3{gap:12px}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.text-right{text-align:right}.text-center{text-align:center}.rounded-full{border-radius:50%}.w-14{width:56px}.h-14{height:56px}.px-3{padding-left:12px;padding-right:12px}.py-3{padding-top:12px;padding-bottom:12px}.px-4{padding-left:16px;padding-right:16px}.border-b{border-bottom:1px solid #e6edf3}.text-slate-400{color:#8796a7}.text-slate-500{color:#677991}.font-black,.font-bold{font-weight:700}.truncate{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.overflow-hidden{overflow:hidden}.mt-1{margin-top:4px}.mt-2{margin-top:8px}.text-emerald-700{color:#008553}.material-symbols-outlined{font-size:0}.material-symbols-outlined:after{content:'›';font-size:22px}.pt-0\\.5{padding-top:2px}#card-list{margin-top:18px}dialog{max-width:calc(100vw - 24px)}
</style></head><body><main><h1>我的收藏名片</h1><div class="notice">本機合成資料 · 無正式站 API、AI 或點數異動</div><input id="search-card-input" aria-label="搜尋收藏名片" placeholder="搜尋姓名、公司" oninput="window.filterCards()"><div class="filters"><button data-card-industry="全部" onclick="window.setCardIndustryFilter('全部')">全部</button><button data-card-industry="餐飲食品" onclick="window.setCardIndustryFilter('餐飲食品')">餐飲食品</button><button data-card-industry="工商專業服務" onclick="window.setCardIndustryFilter('工商專業服務')">工商專業服務</button></div><div id="card-list"></div><div id="preview-notice" role="status"></div></main><script>
window.currentUserProfile={userId:'U_PREVIEW'};window.currentUser={userId:'U_PREVIEW'};window.userRole='user';window.currentUserCard={rowId:'SELF','LINE ID':'U_PREVIEW','自訂名片設定':JSON.stringify({businessIntent:${JSON.stringify(intent)}})};window.harvestCards=${JSON.stringify(cards)};window.allCards=window.harvestCards;window.showToast=function(message){document.getElementById('preview-notice').textContent=message};window.fetchAPI=function(){throw new Error('本機驗收禁止外部 API')};
</script><script src="/js/modules/cards.js"></script><script>window.openCardDetailByRowId=function(){window.showToast('這是合成名片，僅驗收收藏列表與配對理由。')};window.renderCardList(window.harvestCards)</script></body></html>`;

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (request.method !== 'GET') { response.writeHead(405); response.end('Read-only fixture'); return; }
  const files = { '/styles.css': ['css/styles.css', 'text/css'], '/js/modules/cards.js': ['js/modules/cards.js', 'text/javascript'] };
  if (pathname === '/') { response.writeHead(200, { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' }); response.end(html); return; }
  const file = files[pathname];
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  try { response.writeHead(200, { 'content-type': file[1] + ';charset=utf-8', 'cache-control': 'no-store' }); response.end(await readFile(fileURLToPath(new URL(file[0], root)))); }
  catch { response.writeHead(500); response.end('Fixture asset unavailable'); }
});
server.listen(8774, '127.0.0.1', () => console.log('Read-only synthetic card preview: http://127.0.0.1:8774/'));
