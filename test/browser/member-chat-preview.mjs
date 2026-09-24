// Loopback-only UI fixture with real chat handler + in-memory SQLite. No production calls.
// Run: node test/browser/member-chat-preview.mjs
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleMemberChat, processMemberChatNotifications } from '../../worker/member-chat.mjs';
const sql = new DatabaseSync(':memory:'), root = new URL('../../', import.meta.url);
const ids = { a: 'U' + 'a'.repeat(32), b: 'U' + 'b'.repeat(32), c: 'U' + 'c'.repeat(32) };
sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',name TEXT,phone TEXT,role TEXT);
  CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
  CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,line_id TEXT,profile_user_id TEXT,owner_user_id TEXT,source_type TEXT,visibility TEXT,pool_eligible INTEGER,ai_review_status TEXT,name TEXT,company_name TEXT,title TEXT,updated_at TEXT);`);
for (const [id, name, company] of [['a', '小林（測試）', '綠葉設計'], ['b', '小陳（測試）', '晨光咖啡'], ['c', '小張（測試）', '合作商行']]) {
  sql.prepare('INSERT INTO users(row_id,line_id,name,phone,role) VALUES(?,?,?,?,?)').run(id, ids[id], name, '0900000000', 'user');
  sql.prepare("INSERT INTO card_contacts VALUES(?,?,?,?, 'self_profile','public',1,'passed',?,?,?,'2026-09-24')").run('card-' + id, ids[id], ids[id], ids[id], name, company, '負責人');
}
sql.exec("ALTER TABLE card_contacts ADD COLUMN english_name TEXT DEFAULT ''; ALTER TABLE card_contacts ADD COLUMN archived_at TEXT DEFAULT ''; ALTER TABLE card_contacts ADD COLUMN merged_into_row_id TEXT DEFAULT ''; UPDATE card_contacts SET english_name='Demo Chen',visibility='private',pool_eligible=0,ai_review_status='pending' WHERE row_id='card-b'; UPDATE users SET phone='' WHERE row_id='b';");
sql.exec(readFileSync(new URL('migrations/0046_member_private_chat.sql', root), 'utf8'));
sql.exec(readFileSync(new URL('migrations/0047_member_chat_notifications.sql', root), 'utf8'));
function prepare(query, args = []) {
  return { bind(...values) { return prepare(query, values); }, async first() { return sql.prepare(query).get(...args) || null; }, async all() { return { success: true, results: sql.prepare(query).all(...args) }; }, async run() { const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes) } }; } };
}
const db = { prepare, withSession() { return this; } }, env = { ACTMASTER_DB: db, EXCHANGE_ZONE_ACCESS_MODE: 'open', LINE_CHANNEL_ACCESS_TOKEN: 'local-fake-token' };
const pushes = [];
const fetcher = async (url, options) => {
  if (url.startsWith('https://api.line.me/v2/bot/profile/')) return Response.json({ userId: url.split('/').at(-1) });
  if (url === 'https://api.line.me/v2/bot/message/push') { pushes.push(JSON.parse(options.body)); return Response.json({}); }
  if (url !== 'https://api.line.me/v2/profile') throw Error('External requests disabled');
  const uid = ids[options.headers.Authorization.slice(7)]; return new Response(JSON.stringify({ userId: uid }), { status: uid ? 200 : 401 });
};
let apiReads = 0;
const assets = new Map([['/js/modules/member-chat.js', 'text/javascript'], ['/js/modules/member-chat-route.js', 'text/javascript'], ['/css/member-chat.css', 'text/css']]);
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>會員私訊・本機測試</title><style>body{font:16px system-ui;background:#f0faf5;color:#163c43;padding:20px}button,select{font:inherit;padding:12px;margin:8px 0}small{display:block;line-height:1.6}</style></head><body><h1>會員私訊・本機測試</h1><small>合成帳號、記憶體資料庫，不連正式 LINE、會員或點數。重啟後清空。</small><label>測試帳號 <select id="account"><option value="a">小林</option><option value="b">小陳</option><option value="c">小張</option></select></label><br><button id="open">開啟我的聊天</button> <button id="members">找會員</button><output></output><script type="module">
import {openMemberChat} from '/js/modules/member-chat.js';
const account=document.querySelector('#account');account.value=new URLSearchParams(location.search).get('as')||'a';
function switchAccount(){window.currentUserProfile={userId:'U'+account.value.repeat(32)};}switchAccount();
account.onchange=switchAccount;window.liff={isLoggedIn:()=>true,getAccessToken:()=>account.value};window.showToast=message=>document.querySelector('output').textContent=message;
function openPreview(tab){const modal=openMemberChat({base:location.origin,tab});modal.querySelector('.mc-hint').textContent='本機合成測試，不含正式會員。英文搜尋可試 Demo Chen；正式名單請至點數通開啟。';}
document.querySelector('#open').onclick=()=>openPreview('threads');document.querySelector('#members').onclick=()=>openPreview('members');
const target=new URLSearchParams(location.search).get('memberChat');if(target)openMemberChat({base:location.origin,threadId:target});
</script></body></html>`;
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8804');
  try {
    if (req.method === 'GET' && assets.has(url.pathname)) { res.writeHead(200, { 'Content-Type': assets.get(url.pathname), 'Cache-Control': 'no-store' }); res.end(readFileSync(new URL(url.pathname.slice(1), root))); return; }
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'" }); res.end(html); return; }
    if (req.method === 'GET' && url.pathname === '/fixture-status') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ apiReads, pushes, messages: sql.prepare('SELECT count(*) n FROM member_chat_messages').get().n })); return; }
    if (req.method === 'POST' && url.pathname === '/fixture-drain') { sql.exec("UPDATE member_chat_notification_jobs SET due_at=0 WHERE status='pending'"); await processMemberChatNotifications(env, fetcher); res.writeHead(200); res.end('mock cron complete'); return; }
    if (!url.pathname.startsWith('/v1/member-chat/')) { res.writeHead(404); res.end(); return; }
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 16000) { res.writeHead(413); res.end(); return; } }
    apiReads++;
    const result = await handleMemberChat(new Request(url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? raw : undefined }), env, fetcher);
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text());
  } catch { res.writeHead(500); res.end('Local fixture failed'); }
}).listen(Number(process.env.CHAT_PREVIEW_PORT || 8804), '127.0.0.1', () => console.log('Synthetic member chat port ' + (process.env.CHAT_PREVIEW_PORT || 8804)));
