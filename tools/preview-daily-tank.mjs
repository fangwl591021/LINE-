// Loopback-only preview. Synthetic member and mother point service; no credentials or remote calls.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {handleDailyTank} from '../worker/daily-tank-challenge.mjs';
const root=new URL('../',import.meta.url);
export function createTankPreview() {
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 sql.exec(readFileSync(new URL('migrations/0004_point_awards.sql',root),'utf8'));
 sql.exec(readFileSync(new URL('migrations/0043_daily_tank_sessions.sql',root),'utf8'));
 const db={prepare(q){return {bind(...args){return {first:async()=>sql.prepare(q).get(...args)||null,
  run:async()=>({success:true,meta:{changes:Number(sql.prepare(q).run(...args).changes)}})};}};}};
 let balance=300;const rows=[];
 const deps={findIdentity:async()=>({user:{line_id:'preview-member',point_line_id:'preview-member'}}),points:{
  async insertUserPoint(p){balance+=p.points;rows.push({id:crypto.randomUUID(),get_point:p.points,event_name:p.eventName,point_type:p.pointType,shop_remark:p.shop_remark});return {success:true,data:{success:true,data:{id:rows.at(-1).id}}};},
  async queryPointBalanceFast(){return {success:true,data:{source:'mother',balance}};},
  async queryUserPoints(){return {success:true,data:{source:'mother',balance,list:rows}};}
 }};
 const index=readFileSync(new URL('index.html',root),'utf8');
 const task=index.slice(index.indexOf('        <section id="daily-tank-task"'),index.indexOf('        <section id="store-point-cashier"'));
 const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>坦克守衛挑戰｜本機測試</title><link rel="stylesheet" href="/css/daily-tank.css"><style>body{font-family:system-ui,sans-serif;background:#f0faf6;margin:0;padding:24px;color:#123e37}main{max-width:760px;margin:auto}.notice{padding:12px;background:#fff3d0;font-size:14px}h1{font-size:24px}button{font-family:inherit}</style></head><body><main><h1>每日任務</h1><p class="notice">本機預覽：合成會員及測試點數，不會連接正式站或實際發點。</p><p>測試餘額：<strong id="preview-balance">300</strong> 點</p><div id="page-points-wallet">${task}</div><h2>測試點數明細</h2><div id="preview-history">尚無紀錄</div></main><script>
 window.currentUserProfile={userId:'preview-member'};window.showToast=message=>alert(message);
 window.fetchAPI=async(action,payload={})=>{const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});const d=await r.json();return d.data||d;};
 window.renderPointBalanceState=(state,data)=>{if(Number.isFinite(data.balance))document.getElementById('preview-balance').textContent=data.balance;};
 window.loadPointsWallet=async()=>{const r=await fetch('/ledger').then(r=>r.json());document.getElementById('preview-balance').textContent=r.balance;document.getElementById('preview-history').replaceChildren(...r.rows.map(row=>{const el=document.createElement('p');el.textContent=row.event_name+' +'+row.get_point+' 點';return el;}));};
 </script><script type="module" src="/js/modules/daily-tank-challenge.js"></script></body></html>`;
 const assets=new Map([['/css/daily-tank.css','text/css'],['/js/modules/daily-tank-challenge.js','text/javascript'],['/js/modules/tank-engine.mjs','text/javascript']]);
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const path=new URL(req.url,'http://localhost').pathname;
  try{
   if(req.method==='POST'&&path==='/api') {
    let body='';for await(const part of req){body+=part;if(body.length>180000){res.writeHead(413);res.end();return;}}
    const {action,payload}=JSON.parse(body);
    const result=await handleDailyTank(action,payload||{},{ACTMASTER_DB:db,MOTHER_CUS_ACCOUNT_SHOP_ID:'preview'},
      {userId:'preview-member',token:'synthetic-preview-only'},deps);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
   }
   if(path==='/ledger'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({balance,rows}));return;}
   if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
   if(assets.has(path)){res.setHeader('Content-Type',assets.get(path));res.end(readFileSync(new URL(path.slice(1),root)));return;}
   res.writeHead(404);res.end();
  }catch{res.writeHead(500);res.end(JSON.stringify({success:false,error:'本機測試失敗'}));}
 });
 return {server,sql,close:()=>new Promise(resolve=>server.close(()=>{sql.close();resolve();}))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const preview=createTankPreview(),port=Number(process.env.TANK_PREVIEW_PORT||8791);
 preview.server.listen(port,'127.0.0.1',()=>console.log(`Tank preview: http://127.0.0.1:${port}/ (synthetic points only)`));
}
