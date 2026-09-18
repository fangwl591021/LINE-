// Static, loopback-only view of the real homepage markup/styles. No LIFF, API or account data.
// node test/browser/home-spacing-preview.mjs; ?role=user hides the empty admin switch.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const policy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8776');
  try {
    if (url.pathname === '/') {
      let html = await readFile(new URL('index.html', root), 'utf8');
      html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, script =>
        /src="https:\/\/cdn\.tailwindcss\.com/.test(script) || /tailwind\.config\s*=/.test(script) ? script : '');
      html = html.replace(/\son[a-z]+="[^"]*"/gi, '');
      html = html.replace(/\ssrc="https?:[^"]*"/gi, attr => attr.includes('cdn.tailwindcss.com') ? attr : '');
      html = html.replace(/<link\b[^>]*href="https:\/\/(?!fonts\.googleapis\.com)[^>]*>/gi, '');
      html = html.replace('class="light"', `class="light${url.searchParams.has('ios') ? ' is-ios' : ''}"`);
      html = html.replace('<body class="', '<body class="home-page shared-front-banner-page ');
      html = html.replace('id="loading-screen" class="', 'id="loading-screen" class="hidden ');
      html = html.replace('id="page-home" class="hidden ', 'id="page-home" class="');
      html = html.replace(/(<nav id="bottom-nav"[^>]*class=")[^"]*(")/, (full) => full.replace(' hidden ', ' '));
      // Handlers were already stripped, so retain the actual zero-size admin control as a flex item.
      if (url.searchParams.get('role') !== 'user') html = html.replace('id="home-top-nav-switch" class="hidden"', 'id="home-top-nav-switch" class=""');
      html = html.replace(/(<img id="home-profile-avatar")/, '$1 src="assets/points-logo-transparent-20260916.png"');
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Content-Security-Policy':policy});
      return res.end(html);
    }
    if (!/^\/(?:css\/[\w-]+\.css|assets\/[\w.-]+\.(?:png|svg))$/.test(url.pathname)) {
      res.writeHead(404); return res.end();
    }
    const content = await readFile(new URL(url.pathname.slice(1), root));
    const type = url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    res.writeHead(200, {'Content-Type':type, 'Cache-Control':'no-store'}); res.end(content);
  } catch { res.writeHead(404); res.end(); }
}).listen(8776, '127.0.0.1', () => console.log('Static homepage preview: http://127.0.0.1:8776/'));
