// Actual navigation/home shortcut/loader/store UI; read-only synthetic APIs, no live login.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{createServer}=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 const read=f=>fs.readFileSync(f,'utf8'),home=read('js/modules/home.js').match(/window\.openPartnerStores = function\(\) \{[\s\S]*?\n    \};/)[0];
 const id='11111111-1111-4111-8111-111111111111',owner='U'+'a'.repeat(32),requests=[],files=new Set(['js/navigation.js','js/modules/store-shop-entry.js','js/modules/store-shop.js','js/modules/store-points-home.js','js/modules/reward-units.js','css/store-shop.css','assets/points-logo-transparent-20260916.png']);
 let origin,delayDirectory=false,releaseDirectory;
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin),file=url.pathname.slice(1);
  if(url.pathname==='/'){
   res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>店家入口・隔離測試</title><style>.hidden{display:none!important}body{margin:0}</style><body><section id="page-home"><button onclick="openPartnerStores()" id="partner">折抵店家</button><button onclick="openStoreShop()" id="mall">點數通</button></section><main id="page-store-shop" class="hidden"></main><script>window.Config={WORKER_URL:location.origin};window.WORKER_URL="https://tracking.example.test";window.currentViewMode="user";window.currentPage="home";window.userRole="user";window.currentUserProfile={userId:"'+owner+'"};window.liff={isLoggedIn:()=>true,getAccessToken:()=>"synthetic-token"};window.loadUserActivities=()=>{};window.showToast=()=>{};window.requestIdleCallback=()=>0;'+home+'</script><script src="/js/navigation.js"></script><script src="/js/modules/store-shop-entry.js"></script></body></html>');return;
  }
  if(files.has(file)){res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png');res.end(fs.readFileSync(file));return;}
  if(url.pathname.startsWith('/v1/')){
   requests.push({method:req.method,path:url.pathname,auth:req.headers.authorization||'',search:url.search});assert.ok(req.method==='GET'||url.pathname==='/v1/checkin-mall/entry','No mutations allowed');
   let data;
   if(url.pathname==='/v1/checkin-mall/entry')data={success:true};
   else if(url.pathname==='/v1/reward-units')data={success:true,units:[],next:''};
   else if(url.pathname==='/v1/store-commerce/settings')data={success:true,release_enabled:true,settings:{enabled:1,bank_name:'合成銀行',bank_holder:'合成公司',bank_code:'000',bank_account:'0000000000',shipping_fee_cents:0,free_shipping_cents:0}};
   else if(url.pathname==='/v1/store-shop/manage')data={success:true,shop:{id,name:'本人合成公司',description:'合成資料，不是真實公司。',phone:'0223456789',address:'合成路1號',category:'服務',status:'draft',version:1},products:[],product_limit:1,product_count:0,product_next:''};
   else if(url.pathname==='/v1/store-shop/products'){
    const products=['合成按摩機','合成服務方案'].map((title,i)=>({id:'product-'+i,title,description:'隔離展示資料，不是真實商品。',category:i?'服務':'購',purchase_mode:'online',redeem_type:'none',price_cents:1180000,image_url:origin+'/assets/points-logo-transparent-20260916.png',shop:{id,name:'公開合成店',merchant_enabled:0}}));
    data={success:true,products:url.searchParams.has('id')?products.filter(p=>p.id===url.searchParams.get('id')):products,next:''};
   }
   else if(url.pathname==='/v1/store-shop'){
    if(delayDirectory)await new Promise(resolve=>releaseDirectory=resolve);
    data={success:true,shops:[{id,name:'公開合成店',description:'這是公開合成公司資料。',address:'合成路',category:'服務',has_active_products:0}],next:''};
   }else throw Error('Unexpected API '+url.pathname);
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;
  }
  res.writeHead(404);res.end();
 }catch(error){console.error(error);res.writeHead(500);res.end('Fixture failed');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true}),out=process.env.STORE_ENTRY_QA_DIR||path.join(os.tmpdir(),'store-entry-management-20261020');fs.mkdirSync(out,{recursive:true});
 try{
  const results=[];
  const localOnly=async route=>{
   if(route.request().url().startsWith(origin+'/'))return route.continue();
   if(route.request().url()==='https://tracking.example.test/v1/checkin-mall/entry'){requests.push({method:'POST',path:'/v1/checkin-mall/entry'});return route.fulfill({json:{success:true}});}
   return route.abort();
  };
  for(const role of ['user','store','admin','redeem','扣點用戶'])for(const width of [320,390,1280]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
   await page.route('**/*',localOnly);
   await page.goto(origin);await page.evaluate(role=>window.userRole=role,role);await page.locator('#partner').click();await page.locator('[data-form=search]').waitFor();assert.equal(await page.locator('[data-form=product-search]').count(),0);
   await page.locator('[data-do=manage]').first().click();await page.locator('[data-form=store]').waitFor();assert.equal(await page.locator('[data-form=store] [name=name]').inputValue(),'本人合成公司');await page.waitForFunction(()=>document.querySelector('.shop-brand-mark img')?.naturalWidth>0);
   assert.equal(await page.locator('.shop-bar [data-do=manage]').getAttribute('aria-current'),'page');
   await page.locator('.shop-bar [data-do=discover]').click();await page.locator('[data-form=product-search]').waitFor();assert.equal(await page.locator('.shop-bar [data-do=discover]').getAttribute('aria-current'),'page');assert.equal(await page.locator('.shop-bar [data-do=manage]').getAttribute('aria-current'),'false');
   assert.equal(await page.locator('[data-discovered-product]').count(),2);
   assert.equal(await page.locator('.shop-bottom-nav [data-do=find]').getAttribute('aria-current'),'false');
   await page.locator('.shop-discovery-tabs').evaluate(node=>node.scrollIntoView({block:'start'}));
   const tabs=await page.locator('.shop-discovery-tabs button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {y:r.y,height:r.height,right:r.right};}));
   assert.equal(tabs.length,3);assert.ok(tabs.every(r=>r.y>=0&&r.y===tabs[0].y&&r.height>=44&&r.right<=width));
   await page.screenshot({path:path.join(out,'discovery-visible-'+role+'-'+width+'.png')});
   await page.locator('.shop-discovery-tabs [data-do=manage]').click();await page.locator('[data-form=store]').waitFor();assert.equal(await page.locator('[data-form=store] [name=name]').inputValue(),'本人合成公司');
   await page.locator('.shop-bar [data-do=discover]').click();await page.locator('[data-form=product-search]').waitFor();
   await page.locator('[data-do=discover-detail]').first().click();await page.locator('.shop-product-detail').waitFor();assert.equal(await page.locator('.shop-bottom-nav [data-do=find]').getAttribute('aria-current'),'false');
   await page.locator('.shop-bottom-nav [data-do=find]').click();await page.locator('[data-form=search]').waitFor();
   assert.equal(await page.locator('[data-form=product-search]').count(),0);assert.equal(await page.locator('.shop-bottom-nav [data-do=find]').getAttribute('aria-current'),'page');
   assert.equal(await page.locator('[data-form=search] [name=q]').evaluate(node=>node===document.activeElement),false);
   const settingsBox=await page.locator('.shop-discovery-tabs [data-do=manage]').boundingBox();assert.ok(settingsBox.y>=0&&settingsBox.y+settingsBox.height<1000-90);
   await page.screenshot({path:path.join(out,'directory-visible-'+role+'-'+width+'.png')});
   await page.locator('.shop-discovery-tabs [data-do=manage]').click();await page.locator('[data-form=store]').waitFor();
   await page.locator('.shop-bar [data-do=discover]').click();await page.locator('[data-form=product-search]').waitFor();
   await page.locator('.shop-discovery-tabs [data-do=list]').click();await page.locator('[data-form=search]').waitFor();assert.equal(await page.locator('.shop-bar [data-do=list]').getAttribute('aria-current'),'page');
   await page.locator('[data-do=manage]').first().click();await page.locator('[data-form=store]').waitFor();await page.screenshot({path:path.join(out,'manage-'+role+'-'+width+'.png'),fullPage:true});
   const start=requests.length;await page.evaluate(()=>openStoreShop('','','','list'));await page.locator('[data-form=search]').waitFor();assert.equal(await page.locator('[data-form=product-search]').count(),0);assert.equal(requests.slice(start).filter(r=>r.path==='/v1/store-shop/products').length,0);
   delayDirectory=true;await page.locator('.shop-bar [data-do=list]').click();await page.waitForFunction(()=>document.querySelector('.shop-content')?.textContent.includes('載入店家中'));
   while(!releaseDirectory)await new Promise(r=>setTimeout(r,10));await page.locator('.shop-bar [data-do=manage]').click();await page.locator('[data-form=store]').waitFor();delayDirectory=false;releaseDirectory();releaseDirectory=null;await page.waitForTimeout(100);assert.equal(await page.locator('[data-form=store]').count(),1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);results.push({role,width,partnerDirectory:true,pureListDirectory:true,settingsOwnForm:true,selectionFollowsPage:true,visibleSettingsFromProducts:true,bottomFindOpensStores:true,noAutomaticKeyboard:true,lateListIgnored:true});await page.close();
  }
  const page=await browser.newPage();await page.route('**/*',localOnly);
  await page.goto(origin+'/?shopSection=list&checkinCard=00000000-0000-4000-8000-000000000001&checkinAction=mall');await page.evaluate(()=>openStoreShop('','','','list'));await page.locator('[data-form=product-search]').waitFor();await page.locator('.shop-bar [data-do=manage]').click();await page.locator('[data-form=store]').waitFor();
  const count=requests.length;await page.evaluate(()=>openStoreShop('','','','manage'));await page.locator('[data-form=store]').waitFor();assert.ok(requests.slice(count).every(r=>r.path==='/v1/store-shop/manage'),'Old check-in context cannot override explicit settings');
  for(const role of ['reward','tenant','unknown']){
   await page.evaluate(role=>window.userRole=role,role);const before=requests.filter(r=>r.path==='/v1/store-shop/manage').length;
   await page.evaluate(()=>openStoreShop('','','','discovery'));await page.locator('[data-form=product-search]').waitFor();assert.equal(await page.locator('.shop-discovery-tabs [data-do=manage]').count(),0);
   await page.evaluate(()=>openStoreShop('','','','manage'));await page.locator('[role=alert]').filter({hasText:'請登入已登記的會員帳號'}).waitFor();assert.equal(requests.filter(r=>r.path==='/v1/store-shop/manage').length,before);assert.equal(await page.locator('.shop-bar [data-do=manage]').count(),0);
  }
  assert.ok(requests.filter(r=>r.path==='/v1/store-shop/manage').every(r=>r.auth==='Bearer synthetic-token'));assert.equal(requests.filter(r=>r.method!=='GET'&&r.path!=='/v1/checkin-mall/entry').length,0);
  console.log(JSON.stringify({passed:true,results,checkinMallPreserved:true,explicitManageOverridesOldUrl:true,productionWrites:0,out}));
 }finally{delayDirectory=false;releaseDirectory?.();await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
