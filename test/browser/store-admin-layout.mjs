// Re-runnable local-only browser fixture. No real identity, API, or external network.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
const runtime=process.env.CODEX_BROWSER_MODULES||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(runtime,'playwright'));}
const origin='http://store-admin.test',out=process.env.STORE_ADMIN_SCREENSHOTS||join(tmpdir(),'store-admin-ui-20260914');mkdirSync(out,{recursive:true});
const files=['js/modules/store-shop.js','js/modules/store-admin.js','css/store-shop.css','css/store-admin.css'];
const sources=new Map(files.map(file=>['/'+file,readFileSync(new URL('../../'+file,import.meta.url),'utf8')]));
const id=i=>`${String(i).padStart(8,'0')}-1111-4111-8111-111111111111`;
const shops=Array.from({length:23},(_,i)=>({id:id(i+1),name:i===0?'米樂生活・測試店家':`合成測試店家 ${i+1}`,status:i%2===0?'active':'draft',category:'食',address:'新北市板橋區文化路一段 123 號',phone:'02-12345678',owner_uid:'U_SYNTHETIC_'+i,owner_name:i===1?'':`合成負責人 ${i+1}`,owner_role:'store',product_count:3,active_product_count:2,online_product_count:1,public_visible:i%2===0&&i!==2,image_url:'https://store-admin.test/photo.svg',merchant_enabled:1}));
const browser=await playwright.chromium.launch({headless:true,channel:process.env.STORE_ADMIN_BROWSER_CHANNEL||'chrome'});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
const requests=[],blocked=[],errors=[];let delayDirectory=false;const delayed=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname!=='store-admin.test'){blocked.push(request.url());await route.abort();return;}
  if(url.pathname==='/'){
    await route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>管理員店家列表・合成本機測試</title><link rel="stylesheet" href="/css/store-shop.css"><body style="margin:0;background:#fffaf1"><main id="fixture"></main><script>window.currentPage="store-shop";window.userRole="admin";window.currentUserProfile={userId:"U_TEST_ADMIN"};window.testToken="synthetic-token";window.Config={WORKER_URL:location.origin};window.liff={isLoggedIn:()=>!!window.testToken,getAccessToken:()=>window.testToken};window.requestIdleCallback=()=>0;window.goPage=p=>window.currentPage=p;</script><script src="/js/modules/store-shop.js"></script></body></html>'});return;
  }
  if(sources.has(url.pathname)){await route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:sources.get(url.pathname)});return;}
  if(url.pathname==='/photo.svg'||url.pathname==='/assets/storefront/lifestyle-cafe-v1.jpg'){
    await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#f1d8a6"/><circle cx="300" cy="420" r="220" fill="#9bb69c"/><text x="300" y="470" text-anchor="middle" font-size="80" fill="#173e59">合成店家</text></svg>'});return;
  }
  if(url.pathname.startsWith('/v1/store-shop')){
    requests.push({path:url.pathname,search:url.search,method:request.method(),authorization:request.headers().authorization||''});let data;
    if(url.pathname==='/v1/store-shop/admin/stores'){
      if(delayDirectory)await new Promise(resolve=>delayed.push(resolve));
      const q=url.searchParams.get('q')||'',status=url.searchParams.get('status')||'',after=url.searchParams.get('after')||'';
      const selected=shops.filter(s=>(!status||s.status===status)&&(!q||[s.name,s.owner_name,s.phone,s.address].some(v=>v.includes(q))));
      const remaining=selected.filter(s=>!after||s.id>after),result=remaining.slice(0,20);
      data={success:true,shops:result,next:remaining.length>20?result.at(-1).id:'',summary:{total:23,active:12,draft:11},filtered_total:selected.length};
    }else if(url.pathname==='/v1/store-shop/manage')data={success:true,shop:null,products:[],product_limit:null,product_count:0,product_next:''};
    else if(url.searchParams.has('shop'))data={success:true,shop:shops.find(s=>s.id===url.searchParams.get('shop')),products:[{id:'product-synthetic',title:'合成商品',image_url:'https://store-admin.test/photo.svg',price_cents:10000,purchase_mode:'in_store',status:'active'}],product_next:''};
    else data={success:true,shops:shops.filter(s=>s.public_visible).slice(0,4),next:''};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});return;
  }
  blocked.push(request.url());await route.abort();
});
const mount=async(role='admin',section='admin-stores')=>{
  await page.evaluate(({role,section})=>{window.userRole=role;window.currentPage='store-shop';window.currentUserProfile={userId:'U_TEST_ADMIN'};window.testToken='synthetic-token';window.StoreShop.mount(document.getElementById('fixture'),false,'','','',section,'');},{role,section});
};
const untilDirectory=()=>page.waitForFunction(()=>document.querySelectorAll('.store-admin-card').length>0&&document.querySelector('.store-admin-list')?.getAttribute('aria-busy')==='false');
const results=[];
try{
  await page.goto(origin);await mount();await untilDirectory();
  assert.equal(await page.locator('.store-admin-card').count(),20);assert.equal(await page.locator('[data-admin-action=retry]').isVisible(),false);
  await page.locator('[data-admin-action=next]').click();await page.waitForFunction(()=>document.querySelectorAll('.store-admin-card').length===3);await page.locator('[data-admin-action=previous]').click();await untilDirectory();
  assert.equal(await page.locator('.store-admin-card').count(),20);
  await page.locator('[data-admin-action=view]').first().click();await page.waitForSelector('.shop-store-intro');
  assert.equal(await page.locator('.shop-content [data-do=admin-stores]').count(),1);
  await page.locator('.shop-content [data-do=admin-stores]').click();await untilDirectory();
  await page.locator('[data-admin-action=back]').click();await page.waitForSelector('[data-form=store]');
  assert.equal(await page.locator('.shop-content [data-do=admin-stores]').count(),1);
  await page.locator('.shop-content [data-do=admin-stores]').click();await untilDirectory();
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:width===1440?960:844});await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForFunction(()=>!!document.getElementById('store-admin-styles')?.sheet);
    const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,rowHeight:document.querySelector('.store-admin-card').getBoundingClientRect().height,summaryHeight:document.querySelector('.store-admin-summary').getBoundingClientRect().height,toolbarPosition:getComputedStyle(document.querySelector('.store-admin-toolbar')).position,backWidth:document.querySelector('[data-admin-action=back]').getBoundingClientRect().width}));
    assert.ok(geometry.scrollWidth<=width,JSON.stringify(geometry));assert.ok(geometry.rowHeight<195,JSON.stringify(geometry));assert.ok(geometry.summaryHeight<100);assert.equal(geometry.toolbarPosition,'sticky');
    const screenshot=join(out,`admin-store-list-${width}.png`);await page.screenshot({path:screenshot});results.push({...geometry,screenshot});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-admin-form] input').fill('不存在的店');await page.locator('[data-admin-action=search]').click();await page.waitForSelector('.store-admin-empty');assert.match(await page.locator('.store-admin-status').textContent(),/0 家/);
  await page.locator('[data-admin-form] input').fill('');await page.locator('[data-admin-action=search]').click();await untilDirectory();
  delayDirectory=true;await page.locator('[data-admin-action=refresh]').click();await page.waitForFunction(()=>document.querySelector('.store-admin-list')?.getAttribute('aria-busy')==='true');
  for(let i=0;i<50&&!delayed.length;i++)await new Promise(r=>setTimeout(r,10));assert.equal(delayed.length,1);
  await page.evaluate(()=>{window.testToken='changed-account-token';window.currentUserProfile={userId:'U_OTHER_ADMIN'};});delayDirectory=false;delayed.shift()();await page.waitForTimeout(100);
  assert.equal(await page.locator('.store-admin-card').count(),0);assert.equal((await page.locator('.shop-content').textContent()).includes('合成負責人'),false);
  for(const role of ['user','store','reward']){
    const before=requests.filter(r=>r.path.endsWith('/admin/stores')).length;await mount(role,'');await page.waitForSelector('.shop-life-hero');
    assert.equal(await page.locator('[data-do=admin-stores]').count(),0,role);
    await mount(role,'admin-stores');await page.waitForFunction(()=>document.querySelector('[role=alert]')?.textContent.includes('僅開放管理員'));
    assert.equal(requests.filter(r=>r.path.endsWith('/admin/stores')).length,before,role);
  }
  assert.ok(requests.every(r=>r.method==='GET'));assert.ok(requests.filter(r=>r.path.endsWith('/admin/stores')).every(r=>r.authorization.startsWith('Bearer ')));assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,results,pagination:true,viewReturn:true,manageEntry:true,searchEmpty:true,staleAccountRejected:true,roleGuard:['user','store','reward'],externalRequests:blocked,requests:requests.length},null,2));
}finally{await browser.close();}
