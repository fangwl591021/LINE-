// Loopback-only visual fixture. Uses the real loading markup/CSS and status code;
// no LINE SDK, credentials, application bootstrap, network APIs or transactions.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const assets = new Map([
  ['/assets/points-logo-transparent-20260916.png', 'image/png'],
  ['/js/login-bootstrap.js', 'text/javascript;charset=utf-8']
]);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (assets.has(url.pathname)) {
      res.setHeader('Content-Type', assets.get(url.pathname));
      res.end(await readFile(new URL(url.pathname.slice(1), root))); return;
    }
    if (url.pathname !== '/') { res.writeHead(404); res.end(); return; }
    const source = await readFile(new URL('index.html', root), 'utf8');
    const style = source.match(/<style id="login-bootstrap-style">[\s\S]*?<\/style>/)[0];
    const shell = source.slice(source.indexOf('<div id="loading-screen"'), source.indexOf('<div id="toast-container"'));
    const config = await readFile(new URL('js/config.js', root), 'utf8');
    const failure = config.slice(config.indexOf('window.showActmasterStartupFailure ='), config.indexOf('window.ensureActmasterLiffLogin ='));
    const mode = ['connecting', 'member', 'failure', 'hidden'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'connecting';
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; base-uri 'none'");
    res.end(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登入 Loading・本機預覽</title>${style}</head><body>${shell}<p>本機預覽：Loading 已關閉，未登入或載入任何會員資料。</p><script src="/js/login-bootstrap.js"></script><script>
      window.buildActmasterCleanLiffUrl=()=>'/';
      ${failure}
      const mode=${JSON.stringify(mode)};
      window.LoginBootstrap.stage(mode==='member'?'member':'connecting');
      if(mode==='failure'){window.showActmasterStartupFailure();window.LoginBootstrap.finish(false);}
      if(mode==='hidden'){document.getElementById('loading-screen').classList.add('hidden');window.LoginBootstrap.finish(false);}
    </script></body></html>`);
  } catch (error) {
    res.writeHead(500); res.end('Local preview unavailable'); console.error(error.message);
  }
});
server.listen(0, '127.0.0.1', () => console.log('Loading preview: http://127.0.0.1:' + server.address().port));
