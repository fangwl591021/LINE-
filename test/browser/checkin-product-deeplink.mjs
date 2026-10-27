// Real entry loader + StoreShop in Chromium. All APIs/assets are intercepted;
// no LINE send, real identity, wallet, point, checkout or order request is allowed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=new URL('../../',import.meta.url),CARD='11111111-1111-4111-8111-111111111111',SHOP='22222222-2222-4222-8222-222222222222',OTHER='33333333-3333-4333-8333-333333333333';
const FIRST='a-first-product',TARGET='z-exact-selected-product',TITLE='指定的第二件合成商品',USER='U'+'a'.repeat(32);
const query=`?shopSection=list&checkinCard=${CARD}&checkinAction=product&checkinPage=selected`;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function until(predicate){for(let i=0;i<160;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Synthetic request did not reach fixture');}
async function fixture(options={}){
 const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),calls=[],assets=[],forbidden=[],held=[];
 const state={holdEntry:false,holdProduct:false,entryFailure:false,productMode:'ok',recorded:!options.unconfirmed};
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
 const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/store-shop.css"><body style="margin:0"><main id="page-store-shop"></main><script>
  window.WORKER_URL='https://fixture.invalid';window.Config={WORKER_URL:window.WORKER_URL};window.currentUserProfile={userId:'${USER}'};window.userRole='user';window.testToken='synthetic-token-a';window.currentPage='home';window.__mounts=[];
  window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken};window.goPage=name=>window.currentPage=name;window.requestIdleCallback=()=>0;
  window.fetchAPI=()=>{throw Error('No wallet/legacy API is permitted');};
  ${options.legacy?"window.StoreShop={mount:()=>{throw Error('Legacy mount must be upgraded');}};":''}
 </script><script src="/js/modules/store-shop-entry.js"></script></body></html>`;
 const shop=id=>({id,name:id===OTHER?'另一家合成店家':'原合成店家',description:'公開的合成店面介紹。',category:'服務',address:'',phone:'',hours:'',image_url:'',merchant_enabled:1});
 const product=(id,shopId=SHOP)=>({id,shop_id:shopId,title:id===TARGET?TITLE:'絕不可誤選的第一件商品',description:'公開合成商品內容。',image_url:'',price_cents:1180000,purchase_mode:'online',redeem_type:'percent',redeem_value:50,category:'購',version:1,shop:shop(shopId)});
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname==='127.0.0.1'){
   if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:html});return;}
   if(url.pathname==='/favicon.ico'){await route.fulfill({status:204});return;}
   if(url.pathname.startsWith('/assets/')){await route.fulfill({contentType:'image/gif',body:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});return;}
   if(['/js/modules/store-shop-entry.js','/js/modules/store-shop.js','/css/store-shop.css'].includes(url.pathname)){
    assets.push(url.pathname+url.search);let body=readFileSync(new URL('.'+url.pathname,ROOT),'utf8');
    if(url.pathname==='/js/modules/store-shop.js')body+='\n;{const realMount=window.StoreShop.mount;window.StoreShop.mount=function(...args){window.__mounts.push(args.slice(1));return realMount.apply(this,args);};}';
    await route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body});return;
   }
  }
  if(url.hostname==='fixture.invalid'){
   const call={method:request.method(),path:url.pathname,query:url.search,body:request.method()==='POST'?request.postDataJSON():null,authorization:request.headers().authorization||''};calls.push(call);
   if(url.pathname==='/v1/checkin-mall/entry'&&request.method()==='POST'){
    assert.deepEqual(call.body,{cardId:CARD,action:'product',pageId:'selected'});assert.equal(call.authorization,'Bearer synthetic-token-a');
    if(state.holdEntry)await new Promise(resolve=>held.push(resolve));
    await route.fulfill({status:state.entryFailure?503:200,json:state.entryFailure?{success:false,error:'合成舊入口失敗，不應覆寫新頁'}:{success:true,recorded:state.recorded,analyticsStatus:state.recorded?'recorded':'unconfirmed',destination:{shopId:SHOP,productId:TARGET}}}).catch(()=>{});return;
   }
   if(url.pathname==='/v1/store-shop'&&request.method()==='GET'){
    const id=url.searchParams.get('shop');assert([SHOP,OTHER].includes(id));await route.fulfill({json:{success:true,shop:shop(id),products:id===SHOP?[product(FIRST),product(TARGET)]:[],product_next:''}}).catch(()=>{});return;
   }
   if(url.pathname==='/v1/store-shop/products'&&request.method()==='GET'){
    assert.equal(url.searchParams.get('id'),TARGET);if(state.holdProduct)await new Promise(resolve=>held.push(resolve));
    await route.fulfill({status:state.productMode==='404'?404:200,json:state.productMode==='404'?{success:false,error:'合成指定商品已下架'}:{success:true,products:[product(TARGET,state.productMode==='wrong-shop'?OTHER:SHOP)],next:''}}).catch(()=>{});return;
   }
  }
  forbidden.push(request.method()+' '+request.url());await route.abort();
 });
 await page.goto('http://127.0.0.1/'+query);
 const open=()=>page.evaluate(()=>window.openStoreShop('','','','list'));
 const release=async()=>{while(held.length)held.shift()();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
 const close=async()=>{while(held.length)held.shift()();assert.deepEqual(forbidden,[]);assert(calls.every(call=>call.method==='GET'||call.path==='/v1/checkin-mall/entry'),'Opening a product must not write points, checkout or orders');assert(!assets.some(url=>/shop-product-checkout|member-product-qr|store-commerce|wallet/.test(url)));await context.close();};
 return{page,state,calls,assets,forbidden,open,release,close,waiting:()=>held.length};
}
async function expectExact(f){
 await f.page.getByRole('heading',{name:TITLE,exact:true}).waitFor();assert.equal(await f.page.locator('.shop-product-detail').count(),1);assert.equal(await f.page.getByRole('heading',{name:'絕不可誤選的第一件商品',exact:true}).count(),0);
 assert.deepEqual(await f.page.evaluate(()=>window.__mounts[0]),[false,'','','','store',SHOP,TARGET]);
 assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.calls.filter(call=>call.path==='/v1/store-shop/products').length,1);
 assert.equal(await f.page.locator('[data-commerce-form],dialog,[data-point-operation]').count(),0);assert.equal(await f.page.evaluate(()=>window.StoreShop.supportsPublicProductTarget),true);
}
try{
 // 1. A legacy in-memory StoreShop must load the new capability and use the
 // exact destination's eighth mount argument, not the first product or scanner.
 {
  const f=await fixture({legacy:true});try{await f.open();await expectExact(f);assert(f.assets.some(url=>url.includes('/store-shop.js?v=71')));console.log('PASS legacy capability upgrade opens the exact second product, not scan checkout');}finally{await f.close();}
 }
 // 2. Analytics uncertainty does not turn a known destination into the mall
 // root or another product. Only the mocked entry records an attempted click.
 {
  const f=await fixture({unconfirmed:true});try{await f.open();await expectExact(f);console.log('PASS unconfirmed analytics preserves the verified exact product destination');}finally{await f.close();}
 }
 // 3. A stale or mismatched product remains an explicit error and never falls
 // back to the first item from the preceding shop response.
 for(const mode of ['wrong-shop','404']){
  const f=await fixture();try{f.state.productMode=mode;await f.open();await f.page.locator('[role="alert"]').filter({hasText:mode==='404'?'合成指定商品已下架':'未改選其他商品'}).waitFor();assert.equal(await f.page.locator('.shop-product-detail').count(),0);console.log('PASS '+mode+' returns a clear error without substituting another product');}finally{await f.close();}
 }
 // 4. Errors from a pending entry cannot overwrite another store or login.
 for(const change of ['store','token']){
  const f=await fixture();try{f.state.holdEntry=true;const opening=f.open();await until(()=>f.waiting()>0);
   if(change==='store'){await f.page.evaluate(id=>window.openStoreShop('','','','store',id),OTHER);await f.page.getByRole('heading',{name:'另一家合成店家',exact:true}).waitFor();}else await f.page.evaluate(()=>window.testToken='synthetic-token-b');
   f.state.entryFailure=true;await f.release();await opening;assert(!await f.page.locator('#page-store-shop').innerText().then(text=>text.includes('合成舊入口失敗')));assert.equal(await f.page.locator('.shop-product-detail').count(),0);console.log('PASS pending entry error discarded after '+change+' change');
  }finally{await f.close();}
 }
 // 5. The same lifecycle protection must continue after StoreShop is mounted
 // and its dedicated public-product request is still pending.
 for(const change of ['store','token']){
  const f=await fixture();try{f.state.holdProduct=true;await f.open();await until(()=>f.waiting()>0);
   if(change==='store'){await f.page.evaluate(id=>window.openStoreShop('','','','store',id),OTHER);await f.page.getByRole('heading',{name:'另一家合成店家',exact:true}).waitFor();}else await f.page.evaluate(()=>window.testToken='synthetic-token-b');
   f.state.productMode='404';await f.release();assert(!await f.page.locator('#page-store-shop').innerText().then(text=>text.includes('合成指定商品已下架')));assert.equal(await f.page.locator('.shop-product-detail').count(),0);console.log('PASS pending product error discarded after '+change+' change');
  }finally{await f.close();}
 }
 assert.deepEqual(errors,[]);console.log('PASS 5 core browser groups, real entry/StoreShop scripts; all API/asset requests mocked, no real messages or transactions');
}finally{await browser.close();}
