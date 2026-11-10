const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await b.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><main id="page-store-shop"></main><script>window.Config={WORKER_URL:location.origin};window.currentPage="home";window.userRole="user";window.currentUserProfile={userId:"synthetic"};window.liff={isLoggedIn:()=>true,getAccessToken:()=>"synthetic"};window.goPage=p=>window.currentPage=p;window.requestIdleCallback=()=>0;</script>'});
  if(u.pathname==='/js/modules/store-shop.js')return route.fulfill({contentType:'text/javascript; charset=utf-8',body:fs.readFileSync('js/modules/store-shop.js')});
  if(u.pathname==='/v1/store-shop'){requests.push(u.searchParams.get('category'));return route.fulfill({json:{success:true,shops:[],next:''}});}
  return route.abort();
 });
 await p.goto('https://test.invalid/');await p.addScriptTag({content:fs.readFileSync('js/modules/store-shop-entry.js','utf8')});await p.addScriptTag({content:fs.readFileSync('js/modules/home-discovery-20261110.js','utf8')});
 await p.evaluate(()=>openHomeShopCategory('食'));await p.locator('[data-form=search]').waitFor();
 assert.equal(requests.at(-1),'食');assert.equal(await p.locator('[data-do=category][data-category="食"]').getAttribute('aria-pressed'),'true');assert.deepEqual(errors,[]);
 console.log('PASS: homepage category reaches real entry and filtered merchant listing without writes');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
