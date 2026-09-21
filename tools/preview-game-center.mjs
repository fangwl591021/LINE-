// Isolated loopback preview; synthetic identity/points, SQLite memory only.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {gameFixture} from '../test/helpers/game-fixture.mjs';
const root=new URL('../',import.meta.url);
export function createGameCenterPreview(){
 const f=gameFixture();f.deps.now=()=>Date.now();
 const index=readFileSync(new URL('index.html',root),'utf8'),task=index.slice(index.indexOf('        <section id="daily-tank-task"'),index.indexOf('        <section id="store-point-cashier"'));
 const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>LINE 遊戲館｜隔離測試</title><link rel="stylesheet" href="/css/daily-tank.css"><style>body{font-family:system-ui;background:#0c2029;color:#edfdf4;margin:0;padding:20px}button{font:inherit;padding:14px;border-radius:12px}#page-points-wallet{display:none}</style></head><body><h1>LINE 遊戲館</h1><p>本機合成會員、測試餘額；不連正式站、不實際發點。</p><p>測試點數：<b id="preview-balance">300</b></p><button id="game-center-open">玩遊戲拿點數</button><div id="page-points-wallet" class="hidden">${task}</div><script>
 window.currentUserProfile={userId:'member'};window.showToast=msg=>alert(msg);
 window.fetchAPI=async(action,payload={})=>{const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});return r.json();};
 window.renderPointBalanceState=(s,d)=>document.querySelector('#preview-balance').textContent=d.balance;window.loadPointsWallet=async()=>{};
 </script><script type="module" src="/js/modules/daily-tank-challenge.js?v=5"></script><script type="module" src="/js/modules/game-center.mjs?v=1"></script></body></html>`;
 const assets=new Set(['css/daily-tank.css','css/game-center.css','css/block-supply.css','js/modules/daily-tank-challenge.js',...['game-center','game-session','block-supply-controller','block-supply-engine','block-supply-renderer','block-supply-audio','tank-engine','tank-renderer','tank-audio','tank-music'].map(n=>`js/modules/${n}.mjs`)]);
 const server=createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');try{
  const path=new URL(req.url,'http://localhost').pathname.slice(1);
  if(req.method==='POST'&&path==='api'){let body='';for await(const p of req){body+=p;if(body.length>180000){res.writeHead(413);res.end();return;}}const {action,payload}=JSON.parse(body);const result=await (['dailyTankStatus','startDailyTank','completeDailyTank'].includes(action)?f.legacy(action,payload):f.call(action,payload));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;}
  if(!path){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(assets.has(path)){res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(new URL(path,root)));return;}
  res.writeHead(404);res.end();
 }catch{res.writeHead(500);res.end('Local preview error');}});
 return {server,fixture:f,close:()=>new Promise(resolve=>server.close(()=>{f.sql.close();resolve();}))};
}
if(process.argv[1]===fileURLToPath(import.meta.url))createGameCenterPreview().server.listen(8793,'127.0.0.1',()=>console.log('Game center preview http://127.0.0.1:8793/ (synthetic points only)'));
