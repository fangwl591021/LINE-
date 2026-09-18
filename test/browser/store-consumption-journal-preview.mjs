// Loopback-only synthetic journal. POSTs affect this process's in-memory read flags only.
// No production identity, database, point transaction or external service is used.
// node test/browser/store-consumption-journal-preview.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const snapshots = new Map();
let snapshotSequence = 0;
const rows = Array.from({ length: 12 }, (_, index) => ({
  id: `${index % 2 ? 'online' : 'store'}:fixture-${index + 1}`,
  source: index % 2 ? 'online' : 'store', sourceId: `fixture-${index + 1}`,
  occurredAt: `2026-09-${String(18 - index).padStart(2, '0')}T05:57:00Z`,
  shopName: index % 2 ? '合成網路商店' : '合成咖啡店',
  title: index % 2 ? '合成禮盒訂單' : '合成現場消費',
  amountCents: index === 2 ? 0 : index === 3 ? null : 10000 + index * 1000,
  discountPoints: index % 2 || index === 2 || index === 4 ? 0 : 10, earnedPoints: index === 4 ? 25 : 0,
  payableCents: index === 2 ? 0 : index === 3 ? null : (index % 2 || index === 4 ? 10000 : 9000) + index * 1000,
  paymentStatus: index % 2 ? 'pending' : 'unconfirmed', fulfillmentStatus: index % 2 ? 'unfulfilled' : '',
  unread: index < 5,
  items: [{ title: '合成商品', quantity: 1, unitPriceCents: 10000, lineTotalCents: 10000 }],
}));
let listReads = 0, detailReads = 0, markReads = 0, markAllReads = 0;
const unreadCount = (scope = rows.map(item => item.id)) => rows.filter(item => scope.includes(item.id) && item.unread).length;
const assets = new Map([
  ['/js/modules/store-consumption-journal.js', 'js/modules/store-consumption-journal.js'],
  ['/css/store-consumption-journal.css', 'css/store-consumption-journal.css'],
]);
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>消費紀錄・本機合成驗收</title><link rel="stylesheet" href="/css/store-consumption-journal.css"><style>body{font:16px system-ui;margin:0;padding:24px;background:#effaf5;color:#163b31}main{max-width:620px;margin:auto}button{font:inherit;padding:12px 16px;border:1px solid #bfdacd;border-radius:12px;background:white;color:#145840;cursor:pointer}#fixture-status{display:block;margin:20px 0;font-size:13px;white-space:pre-wrap}.note{font-size:13px;color:#5d746a}</style></head><body><main><h1>消費紀錄・本機驗收</h1><p class="note">全部是合成資料。僅測試紀錄與已讀，不連正式會員、點數或訂單。</p><button id="open">開啟我的消費紀錄</button><output id="fixture-status">尚未開啟</output></main><script type="module">
import {openStoreConsumptionJournal} from '/js/modules/store-consumption-journal.js';
window.currentUserProfile={userId:'U'+'a'.repeat(32)};window.currentUser={userId:window.currentUserProfile.userId};window.liff={isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-token'};window.showToast=message=>{document.getElementById('fixture-status').textContent=message;};
document.getElementById('open').onclick=()=>openStoreConsumptionJournal({base:location.origin,isCurrent:()=>true});
</script></body></html>`;

function json(response, value, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:8775');
  if (request.method === 'GET' && assets.has(url.pathname)) {
    try { response.writeHead(200, { 'content-type': url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', 'cache-control': 'no-store' }); response.end(await readFile(new URL(assets.get(url.pathname), root))); }
    catch { response.end('/* Production journal asset is not written yet. */'); }
    return;
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-src 'none'; form-action 'self'" });
    response.end(html); return;
  }
  if (request.method === 'GET' && url.pathname === '/fixture-status') { json(response, { listReads, detailReads, markReads, markAllReads, unreadCount: unreadCount() }); return; }
  if (!url.pathname.startsWith('/v1/store-consumption-journal')) { json(response, { success: false, error: 'Only local journal APIs are allowed' }, 404); return; }
  if (request.headers.authorization !== 'Bearer synthetic-token') { json(response, { success: false, error: '合成驗收登入憑證錯誤' }, 401); return; }
  if (request.method === 'GET' && url.pathname === '/v1/store-consumption-journal') {
    listReads++;
    const type = url.searchParams.get('type') || 'all', start = url.searchParams.get('start'), end = url.searchParams.get('end');
    const requestedSnapshot = url.searchParams.get('snapshot');
    if (requestedSnapshot && !snapshots.has(requestedSnapshot)) { json(response, { success: false, error: '合成快照已過期' }, 409); return; }
    const selectedIds = requestedSnapshot ? snapshots.get(requestedSnapshot) : rows.filter(item => (type === 'all' || item.source === type) && (!start || item.occurredAt.slice(0, 10) >= start) && (!end || item.occurredAt.slice(0, 10) <= end)).map(item => item.id);
    const snapshot = requestedSnapshot || `fixture-snapshot-${++snapshotSequence}`;
    snapshots.set(snapshot, selectedIds);
    const filtered = rows.filter(item => selectedIds.includes(item.id));
    const offset = url.searchParams.get('cursor') === 'fixture-page-2' ? 5 : url.searchParams.get('cursor') === 'fixture-page-3' ? 10 : 0;
    json(response, { success: true, items: filtered.slice(offset, offset + 5), nextCursor: filtered.length > offset + 5 ? `fixture-page-${offset / 5 + 2}` : null, snapshot, unreadCount: unreadCount(selectedIds), timeZone: 'Asia/Taipei' }); return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/store-consumption-journal/detail') {
    detailReads++;
    const snapshot = url.searchParams.get('snapshot'), selectedIds = snapshots.get(snapshot) || [];
    const item = rows.find(row => row.id === url.searchParams.get('id') && selectedIds.includes(row.id));
    json(response, item ? { success: true, item, snapshot, unreadCount: unreadCount(selectedIds), timeZone: 'Asia/Taipei' } : { success: false, error: '找不到這筆合成紀錄' }, item ? 200 : 404); return;
  }
  if (request.method === 'POST' && ['/v1/store-consumption-journal/read', '/v1/store-consumption-journal/read-all'].includes(url.pathname)) {
    let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 2048) break; }
    let body; try { body = JSON.parse(raw); } catch { json(response, { success: false, error: 'Invalid JSON' }, 400); return; }
    const selectedIds = snapshots.get(body.snapshot);
    if (!selectedIds) { json(response, { success: false, error: '合成列表快照已過期' }, 409); return; }
    if (url.pathname.endsWith('/read-all')) { markAllReads++; rows.filter(item => selectedIds.includes(item.id)).forEach(item => { item.unread = false; }); }
    else { const item = rows.find(row => row.id === body.id && selectedIds.includes(row.id)); if (!item) { json(response, { success: false, error: '找不到合成紀錄' }, 404); return; } markReads++; item.unread = false; }
    json(response, { success: true, unreadCount: unreadCount(selectedIds), snapshot: body.snapshot }); return;
  }
  json(response, { success: false, error: 'Unsupported local action' }, 405);
});
server.listen(8775, '127.0.0.1', () => console.log('Synthetic consumption journal: http://127.0.0.1:8775/'));
