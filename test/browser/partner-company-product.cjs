// Actual UI and existing Worker API, loopback + in-memory SQLite + synthetic LINE/AI only.
const {createServer}=require('node:http'),{DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const {handleStoreShop}=await import('../../worker/store-shop.mjs');
 const {listingTestEnv,listingTestFetch}=await import('../fixtures/store-listing-review.mjs');
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON;CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT);');
 const tokens='0123456789abcdef'.slice(0,15).split(''),cases=['user','redeem','扣點用戶','reward','贈點用戶'].flatMap((role,r)=>[320,390,1280].map((width,w)=>({role,width,token:tokens[r*3+w]})));
 for(const {token,role} of cases)sql.prepare('INSERT INTO users VALUES(?,?)').run('U'+token.repeat(32),role);
 for(const name of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0064_store_product_shipping.sql'])sql.exec(fs.readFileSync(path.join('migrations',name),'utf8'));
 const db={prepare(query){const stmt=(args=[])=>({bind(...a){return stmt(a);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}});return stmt();}};
 const env=listingTestEnv(sql,db),requests=[],providers=[];
 const fetcher=listingTestFetch(async(url,opts)=>{providers.push(url);assert.equal(url,'https://api.line.me/v2/profile');const token=opts.headers.Authorization.slice(7);return tokens.includes(token)?Response.json({userId:'U'+token.repeat(32)}):new Response('',{status:401});});
 const home=fs.readFileSync('js/modules/home.js','utf8').match(/window\.openPartnerStores = function\(\) \{[\s\S]*?\n    \};/)[0];
 const files=new Set(['js/modules/store-shop-entry.js','js/modules/store-shop.js','css/store-shop.css','assets/points-logo-transparent-20260916.png']);
 let origin;
 const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin),file=url.pathname.slice(1);requests.push({method:req.method,path:url.pathname});
  if(url.pathname==='/'){
   const pub=url.searchParams.has('public'),token=url.searchParams.get('token')||'a';assert.ok(tokens.includes(token));const role=cases.find(c=>c.token===token).role;
   res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>公司上架・隔離測試</title><link rel="stylesheet" href="/css/store-shop.css"><body style="margin:0">'+(pub?'<main id="public-store-shop"></main>':'<button id="partner-shortcut" onclick="openPartnerStores()">折抵店家</button><main id="page-store-shop"></main>')+'<script>window.Config={WORKER_URL:location.origin};window.currentPage="home";window.userRole='+JSON.stringify(role)+';window.currentUserProfile={userId:"U"+"'+token+'".repeat(32)};window.liff={isLoggedIn:()=>true,getAccessToken:()=>"'+token+'"};window.goPage=p=>window.currentPage=p;window.showToast=m=>{document.body.dataset.toast=m};'+home+'</script><script src="/js/modules/'+(pub?'store-shop.js':'store-shop-entry.js')+'"></script></body></html>');return;
  }
  if(files.has(file)){res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png');res.end(fs.readFileSync(file));return;}
  if(url.pathname.startsWith('/v1/store-shop')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const response=await handleStoreShop(new Request(url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined}),env,fetcher);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  res.writeHead(404);res.end();
 }catch(error){console.error(error);res.writeHead(500);res.end('Synthetic fixture failed');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true}),out=process.env.PARTNER_COMPANY_QA_DIR||path.join(os.tmpdir(),'partner-company-product-qa-20261019');fs.mkdirSync(out,{recursive:true});
 try{
  const results=[];
  for(const {token,role,width} of cases){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
   await page.goto(origin+'/?token='+token);const writesBefore=sql.prepare('SELECT total_changes() n').get().n,start=requests.length;
   await page.locator('#partner-shortcut').click();await page.getByRole('button',{name:'上架公司／商品',exact:true}).waitFor();
   assert.equal(new URL(page.url()).origin,origin);assert.equal(sql.prepare('SELECT total_changes() n').get().n,writesBefore);
   assert.deepEqual(requests.slice(start).filter(r=>r.path.startsWith('/v1/')).map(r=>r.path),['/v1/store-shop']);
   await page.screenshot({path:path.join(out,'entry-'+token+'-'+width+'.png'),fullPage:true});
   await page.getByRole('button',{name:'上架公司／商品',exact:true}).click();const store=page.locator('[data-form=store]');await store.waitFor();
   await store.locator('[name=name]').fill('合成手作品牌有限公司 '+width);await store.locator('[name=description]').fill('提供手作禮盒與客製包裝服務。\n這是隔離測試，並非真實店家。');
   await store.locator('[name=phone]').fill('02-2345-6789');await store.locator('[name=address]').fill('台北市合成測試路 1 號');await store.locator('[name=status]').selectOption('active');
   await store.getByRole('button',{name:'儲存店面',exact:true}).click();await page.locator('[data-do=new]').waitFor();
   assert.equal(await page.locator('[data-do=sales],[data-do=online-manage]').count(),0);
   await page.locator('[data-do=new]').click();const product=page.locator('[data-form=product]');await product.locator('[name=title]').fill('經典手作禮盒');await product.locator('[name=price]').fill('350');await product.locator('[name=status]').selectOption('active');
   await product.getByRole('button',{name:'儲存商品',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-do=new]')?.disabled);
   const management=await page.request.get(origin+'/v1/store-shop/manage',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());assert.equal(management.product_count,1);assert.equal(management.product_limit,1);
   assert.equal(sql.prepare('SELECT role FROM users WHERE line_id=?').get('U'+token.repeat(32)).role,role);
   if(['redeem','扣點用戶'].includes(role))assert.match(await page.locator('.shop-content').innerText(),/原會員扣點功能不變/);if(['reward','贈點用戶'].includes(role))assert.match(await page.locator('.shop-content').innerText(),/原會員贈點功能不變/);
   const second=await page.request.post(origin+'/v1/store-shop/product',{headers:{Authorization:'Bearer '+token},data:{title:'不能新增第二件',price_cents:10000,status:'draft',request_key:crypto.randomUUID(),redeem_type:'none',redeem_value:0}});assert.equal(second.status(),400);
   await page.locator('[data-do=view][data-id="'+management.shop.id+'"]').click();await page.locator('.shop-company-info').waitFor();
   assert.match(await page.locator('.shop-company-info').innerText(),/02-2345-6789/);assert.match(await page.locator('.shop-company-info').innerText(),/台北市合成測試路 1 號/);
   assert.equal(await page.getByRole('link',{name:'撥打電話',exact:true}).getAttribute('href'),'tel:0223456789');
   const maps=new URL(await page.getByRole('link',{name:'開啟地圖',exact:true}).getAttribute('href'));assert.equal(maps.hostname,'www.google.com');assert.equal(maps.searchParams.get('query'),'台北市合成測試路 1 號');
   assert.equal(await page.locator('.shop-grid article').count(),1);assert.equal(await page.locator('[data-do=member-qr]').count(),0);
   const before=sql.prepare('SELECT total_changes() n').get().n;
   await page.goto(origin+'/?public=1&shop='+management.shop.id+'&token='+token);await page.locator('.shop-company-info').waitFor();await page.locator('.shop-grid article').waitFor();
   assert.equal(sql.prepare('SELECT total_changes() n').get().n,before);assert.equal(await page.locator('[data-do=manage]').count(),0);
   await page.screenshot({path:path.join(out,'company-'+token+'-'+width+'.png'),fullPage:true});
   const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,classes:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,60)}))}));
   assert.ok(overflow.scroll<=width,JSON.stringify(overflow));assert.deepEqual(errors,[]);
   results.push({role,width,companySaved:true,publicPhoneAddress:true,oneProduct:true,secondProductDenied:true,roleUnchanged:true,publicWrites:0,noPointRequests:true,noOverflow:true});await page.close();
  }
  assert.ok(providers.every(u=>u==='https://api.line.me/v2/profile'));assert.equal(requests.some(r=>r.path.startsWith('/v1/')&&/point|wallet|qr|store-commerce/.test(r.path)),false);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({results,productionWrites:0,externalProviders:'stubbed'},null,2));console.log(JSON.stringify({passed:true,results,out}));
 }finally{await browser.close();await new Promise(r=>server.close(r));sql.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
