// Local-only UI acceptance fixture. No real member or point APIs are called.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline'), port = baseline ? 8778 : 8779;
const read = name => baseline ? execFileSync('git', ['show', 'b0e1206:' + name], { cwd: root }) : fs.readFileSync(path.join(root, name));
const fixture = `<script>
(() => {
 const scenario = new URLSearchParams(location.search).get('scenario') || 'normal';
 history.replaceState(null, '', '/');
 const log = window.__loginPreview = [];
 const note = name => log.push({ name, at: Math.round(performance.now()) });
 const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
 const uid = 'U' + '1'.repeat(32);
 window.liff = {
   init: async () => { note('init-start'); await pause(1200); note('init-end'); },
   isLoggedIn: () => true, isInClient: () => true, isApiAvailable: () => false,
   getAccessToken: () => 'local-preview-no-authority',
   getProfile: async () => { note('profile-start'); await pause(scenario === 'stalled' ? 60000 : scenario === 'slow' ? 12000 : 1800); note('profile-end'); return { userId: uid, displayName: '本機測試會員' }; },
   getFriendship: async () => { note('friendship-start'); await pause(1800); note('friendship-end'); return { friendFlag: scenario !== 'friend-denied' }; },
   requestFriendship: async () => note('friendship-prompt'), getContext: () => ({ type: 'external' })
 };
 window.fetch = async (url, options = {}) => {
   let body = {}; try { body = JSON.parse(options.body || '{}'); } catch (_) {}
   const action = body.action || 'blocked'; note('api:' + action);
   let data;
   if (action === 'checkUser') { await pause(300); data = { isRegistered: true, info: { userId: uid, role: 'user', networkId: 'admin', name: '本機測試會員' } }; }
   else if (action === 'getInboxCount') data = { unread: 0 };
   else if (action === 'getExchangeZoneAccess') data = { access: { mode: 'open', allowed: true, canPublish: false } };
   else if (action === 'getSubsiteHome') data = { user: { userId: uid, role: 'user', name: '本機測試會員' }, role: 'user', wallet: { status: 'error', error: '本機預覽不查詢正式點數' }, cards: { recentCards: [], hasMyCard: false }, storePointCashier: { logs: [] } };
   else return new Response(JSON.stringify({ success: false, error: '本機預覽已阻擋：' + action }), { headers: { 'Content-Type': 'application/json' } });
   return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
 };
 window.addEventListener('DOMContentLoaded', () => note('dom-ready'));
})();
</script>`;
http.createServer((req, res) => {
 try {
  if (req.method !== 'GET') { res.writeHead(405); return res.end('Read-only preview'); }
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  if (!path.resolve(root, relative).startsWith(root + path.sep) || relative.startsWith('.')) { res.writeHead(403); return res.end(); }
  let body = read(relative);
  if (relative === 'index.html') body = Buffer.from(body.toString().replace(/<script charset="utf-8" src="https:\/\/static\.line-scdn\.net[^\"]+"><\/script>/, fixture));
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  res.writeHead(200, { 'Content-Type': (types[path.extname(relative)] || 'application/octet-stream') + (['.html','.js','.mjs','.css'].includes(path.extname(relative)) ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store', 'Content-Security-Policy': "connect-src 'self'" });
  res.end(body);
 } catch (_) { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log('Read-only fixture: http://127.0.0.1:' + port));
