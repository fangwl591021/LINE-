// Read-only loopback harness. Real SDK load; no liff.init, login, API, or storage.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { sdkVersion, queryCases, extractParser } from '../fixtures/liff-query-compat.mjs';

const root = new URL('../../', import.meta.url);
const parsers = {
  main: extractParser(readFileSync(new URL('js/config.js', root), 'utf8'), 'main'),
  bridge: extractParser(readFileSync(new URL('point-bridge.html', root), 'utf8'), 'bridge')
};
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const match = /^\/case\/(main|bridge)\/(\d+)$/.exec(url.pathname);
  if (match && queryCases[Number(match[2])]) {
    const kind = match[1];
    res.end('<!doctype html><meta charset="utf-8"><title>Read-only query case</title><script>' + parsers[kind] + '\nwindow.compatResult = Object.fromEntries(' + (kind === 'main' ? 'readActmasterInitialParams' : 'readParams') + '());</script>');
    return;
  }
  if (url.pathname !== '/') { res.writeHead(404); res.end('Not found'); return; }
  res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LIFF ${sdkVersion} 參數相容驗證</title><style>body{font:16px system-ui;max-width:960px;margin:24px auto;padding:16px;color:#143b39}h1{font-size:24px}.pass{color:#00805d}.fail{color:#b42318}li{padding:5px}iframe{display:none}</style>
<h1>LIFF ${sdkVersion} 參數相容驗證</h1><p>唯讀測試：不登入、不呼叫業務 API、不寫入會員或點數。</p>
<p id="sdk">SDK 載入中</p><h2 id="summary">測試中</h2><ol id="results"></ol>
<script>
const cases = ${json(queryCases)};
let passed = 0, failed = 0, completed = 0;
window.compatReport = { passed: 0, failed: 0, completed: 0, total: cases.length * 2, sdk: null };
for (const kind of ['main','bridge']) cases.forEach((fixture,index) => {
  const frame = document.createElement('iframe');
  frame.onload = () => {
    const values = frame.contentWindow.compatResult || {};
    const errors = [];
    for (const [key,value] of Object.entries(fixture.expected)) if (values[key] !== value) errors.push(key);
    for (const key of fixture.absent || []) if (Object.hasOwn(values,key)) errors.push('leaked ' + key);
    const ok = errors.length === 0;
    if (ok) passed++; else failed++;
    completed++;
    const item = document.createElement('li'); item.className = ok ? 'pass' : 'fail';
    item.textContent = (ok ? 'PASS ' : 'FAIL ') + kind + ': ' + fixture.name + (ok ? '' : ' (' + errors.join(', ') + ')');
    document.getElementById('results').append(item);
    document.getElementById('summary').textContent = completed + '/' + cases.length * 2 + ' 完成；PASS ' + passed + '；FAIL ' + failed;
    Object.assign(window.compatReport,{passed,failed,completed});
  };
  frame.src = '/case/' + kind + '/' + index + fixture.search;
  document.body.append(frame);
});
function sdkLoaded() {
  const version = window.liff.getVersion(); window.compatReport.sdk = version;
  document.getElementById('sdk').textContent = '實際 SDK 版本：' + version + (version === ${json(sdkVersion)} ? ' PASS' : ' FAIL');
}
function sdkFailed() { window.compatReport.sdk = 'load failed'; document.getElementById('sdk').textContent = 'SDK 載入失敗'; }
</script><script src="https://static.line-scdn.net/liff/edge/versions/${sdkVersion}/sdk.js" onload="sdkLoaded()" onerror="sdkFailed()"></script></html>`);
});
server.listen(0, '127.0.0.1', () => console.log('Read-only LIFF preview: http://127.0.0.1:' + server.address().port + '/'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
