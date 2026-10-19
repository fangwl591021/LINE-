// Real admin shell/modules with synthetic auth and APIs. No production API requests.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const tailwind=await (await fetch('https://cdn.tailwindcss.com',{signal:AbortSignal.timeout(20000)})).text();
const admin=readFileSync(new URL('../../admin.html',import.meta.url),'utf8').replace('</head>','<style>.material-symbols-outlined{font-size:0!important;display:inline-block;width:24px;min-width:24px;height:24px}</style></head>');
const root=new URL('../../',import.meta.url),browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage();
const A='Uf729764dbb5b652a5a90a467320bea29',card='11111111-1111-4111-8111-111111111111',calls=[],errors=[],blocked=[];
let reportFail=false;
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:tailwind});
 if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:`window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getProfile:async()=>({userId:'${A}',displayName:'方萬隆',pictureUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}),getAccessToken:()=>'synthetic-token'};`});
 if(url.hostname==='line-engine.fangwl591021.workers.dev'){
  if(url.pathname==='/v1/checkin-mall/entry'){
   const body=request.postDataJSON();assert.deepEqual(Object.keys(body).sort(),['action','cardId']);calls.push(body.action);
   return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,recorded:true})});
  }
  if(url.pathname.startsWith('/v1/store-shop'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,products:[],shops:[],next:''})});
  if(url.pathname==='/v1/checkin-mall/report'){
   assert.equal(request.headers().authorization,'Bearer synthetic-token');calls.push('report');
   return route.fulfill({status:reportFail?503:200,contentType:'application/json',body:JSON.stringify(reportFail?{success:false,error:'合成報告暫時無法取得'}:{success:true,summary:{entries:23,people:12,mall:20,details:3},cards:{total:30,accepted:29,unknown:1,failed:0},rows:[{actor_name:'<img src=x onerror=alert(1)>',action:'mall',clicked_at:Date.now(),card_id:card}],next:''})});
  }
  if(request.method()==='POST'){
   const body=request.postDataJSON();assert.notEqual(body.action,'insertUserPoint');
   const data=body.action==='checkUser'?{info:{role:'admin',name:'方萬隆',networkId:'admin'}}:body.action==='getAdminStats'?{}:[];
   return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  }
 }
 if(url.hostname==='localhost'){
  if(url.pathname==='/admin.html')return route.fulfill({contentType:'text/html',body:admin});
  if(url.pathname==='/entry.html')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/store-shop.css"><body style="margin:0"><main id="page-store-shop"></main><script>
    window.WORKER_URL='https://line-engine.fangwl591021.workers.dev/';window.currentUserProfile={userId:'${A}'};window.userRole='user';
    window.liff={isLoggedIn:()=>true,getAccessToken:()=>'synthetic-token'};window.goPage=name=>window.currentPage=name;
    window.fetchAPI=async action=>{if(action==='queryUserPoints')return {success:true,data:{list:[],queriedLineUserId:'${A}'}};throw Error('Synthetic wallet unavailable');};
    </script><script src="/js/modules/store-shop-entry.js"></script></body></html>`});
  try{const file=new URL('.'+url.pathname,root);if(!file.href.startsWith(root.href))throw Error('outside');const body=readFileSync(file);return route.fulfill({contentType:url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'application/octet-stream',body});}catch{return route.fulfill({status:404,body:''});}
 }
 if(['fonts.googleapis.com','fonts.gstatic.com','cdnjs.cloudflare.com'].includes(url.hostname))return route.fulfill({status:200,body:''});
 if(['ui-avatars.com','cdn-icons-png.flaticon.com'].includes(url.hostname))return route.fulfill({contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});
 blocked.push(url.hostname);return route.abort();
});
try{
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:1000});await page.goto('http://localhost/admin.html');
  await page.waitForFunction(()=>document.getElementById('nav-checkin-mall-report')&&!document.getElementById('nav-checkin-mall-report').classList.contains('hidden'));
  await page.locator('#loading-screen').waitFor({state:'detached'});
  await page.evaluate(()=>switchTab('checkin-mall-report'));
  await page.getByRole('status').filter({hasText:'已載入 1 筆'}).waitFor();
  assert.match(await page.locator('#checkin-mall-report-content').innerText(),/不重複進入者 12 人/);assert.equal(await page.locator('#checkin-mall-report-content img').count(),0);
  const geometry=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert(geometry.scroll<=geometry.width+1,JSON.stringify(geometry));
  await page.screenshot({path:'C:/Users/User/.codex/visualizations/2026/08/24/01a03430-08fc-7dd2-9cff-51f0c9b9a81d/checkin-mall-report-'+width+'.png'});
 }
 reportFail=true;await page.getByRole('button',{name:'查詢報告'}).click();await page.getByRole('status').filter({hasText:'合成報告暫時無法取得'}).waitFor();assert.equal(await page.locator('#checkin-mall-report-content tbody tr').count(),0);
 for(const action of ['mall','details']){
  await page.setViewportSize({width:390,height:900});await page.goto('http://localhost/entry.html?shopSection=list&checkinCard='+card+'&checkinAction='+action);
  await page.evaluate(()=>window.openStoreShop('','','','list'));
  if(action==='mall')await page.locator('.shop-discovery-tabs').waitFor();else await page.locator('dialog.store-history-popup[open]').waitFor();
  assert(calls.includes(action));
  if(action==='mall')await page.locator('.shop-home-return button').waitFor();else await page.getByRole('button',{name:'關閉點數紀錄',exact:true}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'C:/Users/User/.codex/visualizations/2026/08/24/01a03430-08fc-7dd2-9cff-51f0c9b9a81d/checkin-mall-entry-'+action+'.png'});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);console.log('PASS actual admin shell at 320/390/1440, authenticated read-only report, names escaped, failure clears old data, return control visible. Production APIs mocked.');
}finally{await browser.close();}
