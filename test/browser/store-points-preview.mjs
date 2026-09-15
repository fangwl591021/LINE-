// Loopback-only UI fixture: synthetic identity/points, no transaction endpoint.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const publicStores=await fetch('https://line-engine.fangwl591021.workers.dev/v1/store-shop').then(r=>r.json()).catch(()=>({success:true,shops:[]}));
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:8769');
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(url.pathname==='/v1/store-shop'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(publicStores));return;}
  if(url.pathname==='/demo'){
    const role=['user','store','reward','admin'].includes(url.searchParams.get('role'))?url.searchParams.get('role'):'user';
    res.setHeader('Content-Type','text/html;charset=utf-8');
    res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>點數通新版・本機測試</title><link rel="stylesheet" href="/css/store-shop.css"><style>.hidden{display:none!important}body{margin:0}#preview-toolbar{padding:8px;background:#edf4f0;font:12px system-ui;display:flex;flex-wrap:wrap;gap:12px}#preview-toolbar a{color:#146146}</style><body><div id="preview-toolbar">本機測試：示範點數，不連正式交易。<a href="?role=user">一般會員</a><a href="?role=store">店長</a><a href="?role=reward">贈點單位</a><a href="?role=admin">管理員</a></div><main id="fixture"></main><div id="store-point-cashier" class="hidden"><div id="store-point-cashier-body" class="hidden"><label><input type="radio" name="store-point-mode" value="redeem" checked>折抵扣點</label><label><input type="radio" name="store-point-mode" value="reward">消費贈點</label><input id="store-point-customer" aria-label="測試手機"><button id="btn-store-point-submit" onclick="throw Error('fixture does not submit')">測試環境禁止送出</button></div></div><div id="store-point-scanner-modal" class="hidden">相機模擬入口，不開相機</div><div id="toast-container"></div><script>
    window.currentPage='store-shop';window.userRole=${JSON.stringify(role)};
    window.currentUserProfile={userId:'U'+ 'a'.repeat(32)};window.Config={WORKER_URL:location.origin};
    window.liff={isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-token'};
    window.isRewardOnlyPointCashier=()=>window.userRole==='reward';
    window.canUseStorePointCashier=()=>['admin','store','reward'].includes(window.userRole);
    window.updateStorePointCashierPermissions=()=>{document.querySelectorAll('[name="store-point-mode"]').forEach(r=>{r.disabled=window.isRewardOnlyPointCashier()&&r.value!=='reward';if(window.isRewardOnlyPointCashier())r.checked=r.value==='reward';});};
    window.resetStorePointCashier=()=>{document.getElementById('store-point-customer').value='';window.updateStorePointCashierPermissions();};
    window.updateStorePointPreview=()=>{};
    window.openStorePointScanner=()=>document.getElementById('store-point-scanner-modal').classList.remove('hidden');
    window.closeStorePointScanner=()=>document.getElementById('store-point-scanner-modal').classList.add('hidden');
    window.fetchAPI=async action=>{document.getElementById('preview-toolbar').dataset.lastRead=action;return {success:true,data:{source:'mother',balance:13260,queriedLineUserId:window.currentUserProfile.userId,list:[]}};};
    window.requestIdleCallback=()=>0;window.goPage=()=>location.assign('/demo?role='+window.userRole);
    </script><script src="/js/modules/store-shop.js"></script><script>StoreShop.mount(document.getElementById('fixture'),false);</script></body></html>`);return;
  }
  const path=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep)||!/^\/(?:js\/modules\/|js\/vendor\/|css\/|assets\/|store-shop\.html$)/.test(url.pathname)){res.writeHead(404);res.end();return;}
  try{const data=await readFile(path);res.setHeader('Content-Type',path.endsWith('.js')||path.endsWith('.mjs')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html;charset=utf-8':path.endsWith('.png')?'image/png':'image/jpeg');res.end(data);}catch{res.writeHead(404);res.end();}
});
server.listen(8769,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8769/demo?role=user'));
