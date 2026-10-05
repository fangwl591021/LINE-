// Read-only visual fixture using actual page markup/styles and ONLY the tutorial module.
// No auth, LINE SDK, points, OCR, account data or app API is loaded.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
export function startPreview(port=8821){
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    try{
      if(url.pathname==='/'){
        let html=await readFile(new URL('index.html',root),'utf8');
        html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,script=>/src="(?:https:\/\/cdn\.tailwindcss\.com|js\/modules\/tutorial-center\.js)/.test(script)||/tailwind\.config\s*=/.test(script)?script:'');
        html=html.replace(/\son[a-z]+="[^"]*"/gi,'');
        html=html.replace('<body class="','<body class="home-page shared-front-banner-page ');
        html=html.replace('id="loading-screen" class="','id="loading-screen" class="hidden ');
        html=html.replace('id="page-home" class="hidden ','id="page-home" class="');
        html=html.replace(/(<nav id="bottom-nav"[^>]*class=")[^"]*(")/,m=>m.replace(' hidden ',' '));
        html=html.replace('</head>','<style>#app{display:block!important}.tutorial-fixture-note{padding:8px;background:#fff9de;color:#6e5820;font:12px sans-serif}</style></head>');
        html=html.replace('<main','<div class="tutorial-fixture-note">本機教學入口預覽・未連接會員資料</div><main');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);
      }
      if(!/^\/(?:css\/[\w-]+\.css|js\/modules\/tutorial-center\.js|assets\/[\w.-]+\.(?:png|svg|jpg))$/.test(url.pathname)){res.writeHead(404);return res.end();}
      const data=await readFile(new URL(url.pathname.slice(1),root));
      const ext=url.pathname.split('.').pop();
      res.writeHead(200,{'Content-Type':({css:'text/css',js:'text/javascript',png:'image/png',svg:'image/svg+xml',jpg:'image/jpeg'})[ext]});res.end(data);
    }catch{res.writeHead(404);res.end();}
  });
  return new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server)));
}
if(process.argv[1]===fileURLToPath(import.meta.url))startPreview().then(()=>console.log('Read-only tutorial preview: http://127.0.0.1:8821/'));
