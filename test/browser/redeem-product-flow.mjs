// Real editors -> versioned handlers -> isolated SQLite -> public product -> real quote.
// All profiles, listing reviews, wallet reads and remittance settings are synthetic.
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createListingFixture,OWNER,ADMIN,SHOP} from '../fixtures/store-listing-catalog.mjs';
import {handleStoreCommerce} from '../../worker/store-commerce.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/[\\/]$/,''),out=resolve('../redeem-product-browser');mkdirSync(out,{recursive:true});
const BUYER='U'+'b'.repeat(32),requests=[],quotes=[],external=[],errors=[];let f,pointReads=0;
function reset(role){
 f?.close();f=createListingFixture();requests.length=0;quotes.length=0;pointReads=0;
 f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role,OWNER);
 f.sql.prepare("INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,'user','合成買家')").run(BUYER,BUYER);
 f.sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,description,address,phone,status,updated_at) VALUES(?,?,'合成折抵商店','合成服務內容','合成路1號','0212345678','active','now')").run(SHOP,OWNER);
 for(const file of ['0030_store_cashier_requests.sql','0034_store_commerce.sql','0037_store_buyer_profiles.sql','0038_store_buyer_delivery.sql','0062_store_commerce_points.sql'])f.sql.exec(readFileSync(join(root,'migrations',file),'utf8'));
 f.sql.prepare("INSERT INTO store_commerce_settings(shop_id,enabled,bank_name,bank_code,bank_account,bank_holder,shipping_fee_cents,free_shipping_cents,updated_at) VALUES(?,1,'合成銀行','999','1234567890','合成店家',0,0,'now')").run(SHOP);
 f.env.STORE_COMMERCE_ENABLED='true';f.env.STORE_COMMERCE_POINTS_ENABLED='true';
}
const points={contract:{version:'commerce-ledger-v1',rawLedgerVerification:true,atMostOnceCallerRequired:true},async read(uid){assert.equal(uid,BUYER);pointReads++;return {identity:BUYER,balance:1000};},async adjust(){throw Error('No test may adjust points');},async lookup(){throw Error('No test may read a formal ledger');}};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'){
  const mode=url.searchParams.get('mode')||'owner',uid=mode==='buyer'?BUYER:mode==='owner'?OWNER:ADMIN,role=mode==='buyer'?'user':mode==='owner'?f.sql.prepare('SELECT role FROM users WHERE line_id=?').get(OWNER).role:'admin';
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>合成折抵商品流程</title><link rel="stylesheet" href="/css/store-shop.css"><main id="page-store-shop"></main><script>window.currentPage='store-shop';window.currentUserProfile={userId:'${uid}'};window.userRole='${role}';window.Config={WORKER_URL:location.origin};window.WORKER_URL=location.origin;window.liff={isLoggedIn:()=>true,getAccessToken:()=>'${uid}'};window.requestIdleCallback=()=>0;window.goPage=p=>window.currentPage=p;window.showToast=()=>{};window.fixtureApi=async(path,data)=>{const r=await fetch('/v1/store-shop'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer ${uid}','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const value=await r.json();if(!r.ok){const error=new Error(value.error);error.code=value.code;throw error;}return value;};</script><script src="/js/modules/store-shop.js"></script><script type="module">const root=document.getElementById('page-store-shop');if('${mode}'==='create'){const {mountAdminProducts}=await import('/js/modules/store-admin-products.js');await mountAdminProducts(root,{shopId:'${SHOP}',api:fixtureApi,isCurrent:()=>true,onBack(){}});}else if('${mode}'==='catalog'){const {mountAdminCatalog}=await import('/js/modules/store-admin-catalog.js');await mountAdminCatalog(root,{shopId:'${SHOP}',api:fixtureApi,isCurrent:()=>true,onBack(){},onUploadProducts(){}});}else StoreShop.mount(root,false,'','','','${mode==='buyer'?'store':'manage'}','${SHOP}');</script></html>`);return;
 }
 if(url.pathname.startsWith('/v1/')){
  let body='';for await(const part of req)body+=part;const data=body?JSON.parse(body):undefined,uid=req.headers.authorization?.slice(7)||'';requests.push({path:url.pathname,method:req.method,data});
  let response;
  if(url.pathname.startsWith('/v1/store-commerce')){
   assert(!['/v1/store-commerce/orders','/v1/store-commerce/orders/action'].includes(url.pathname),'No order writes allowed');
   response=await handleStoreCommerce(new Request('https://synthetic.test'+url.pathname+url.search,{method:req.method,headers:{Authorization:'Bearer '+uid,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),f.env,async(target)=>{assert.equal(target,'https://api.line.me/v2/profile');assert([BUYER,OWNER,ADMIN].includes(uid));return Response.json({userId:uid});},points);
   if(url.pathname.endsWith('/quote')){const value=await response.clone().json();quotes.push({status:response.status,...value});}
  }else response=await f.request(url.pathname.slice('/v1/store-shop'.length)+url.search,data,uid);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
 }
 const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+sep)||!existsSync(file)||!['.js','.mjs','.css','.png','.svg'].includes(extname(file))){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':/\.m?js$/.test(file)?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'image/png');res.end(readFileSync(file));
}catch(error){console.error(error.message);res.writeHead(500);res.end(JSON.stringify({success:false,error:'Synthetic fixture failed: '+error.message}));}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const width of [320,390,1280]){
  reset(width===390?'扣點用戶':'redeem');const beforeUsers=f.sql.prepare('SELECT * FROM users ORDER BY row_id').all(),page=await browser.newPage({viewport:{width,height:900}});
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(origin+'/?mode=owner');await page.locator('[data-do=new]').click();assert.equal(await page.locator('[data-form=product] [name=purchase_mode]').inputValue(),'');assert.equal(await page.locator('[data-form=product] [name=redeem_type]').inputValue(),'');
  await page.goto(origin+'/?mode=create');const create=page.locator('[data-admin-product-form]');await create.waitFor();
  assert.equal(await create.locator('[name=purchase_mode]').inputValue(),'');assert.equal(await create.locator('[name=redeem_type]').inputValue(),'');
  await create.locator('[name=title]').fill('合成可折抵服務');await create.locator('[name=description]').fill('合成合法服務體驗');await create.locator('[name=price]').fill('1000');await create.locator('[name=shipping_fee]').fill('60');await create.locator('[name=category]').selectOption('服務');await create.locator('[name=confirm]').check();
  await create.locator('[name=purchase_mode]').selectOption('online');await create.locator('[name=redeem_type]').selectOption('none');await create.locator('[name=status]').selectOption('active');
  await create.locator('[data-admin-save]').click();await page.getByRole('status').filter({hasText:'上架商品必須提供購物金折抵'}).waitFor();assert.equal(f.count('store_shop_products'),0);
  await create.locator('[name=status]').selectOption('draft');await create.locator('[data-admin-save]').click();await page.getByRole('status').filter({hasText:'已為'}).waitFor();
  let product=f.sql.prepare('SELECT * FROM store_shop_products').get();assert.equal(product.redeem_type,'none');assert.equal(product.purchase_mode,'online');assert.equal(product.status,'draft');
  await page.goto(origin+'/?mode=catalog');await page.getByRole('button',{name:'編輯／上下架',exact:true}).click();
  assert.equal(await page.locator('[name=redeem_type]').inputValue(),'none');assert.equal(await page.locator('[name=purchase_mode]').inputValue(),'online');
  await page.locator('[name=status]').selectOption('active');await page.getByRole('button',{name:'確認儲存',exact:true}).click();await page.getByRole('status').filter({hasText:'上架商品必須提供購物金折抵'}).waitFor();assert.equal(f.count('store_catalog_admin_audit'),0);
  await page.locator('[name=redeem_type]').selectOption('percent');await page.locator('[name=redeem_value]').fill('25');await page.screenshot({path:join(out,'admin-policy-'+width+'.png'),fullPage:true});
  await page.getByRole('button',{name:'確認儲存',exact:true}).click();await page.getByRole('status').filter({hasText:'已儲存'}).waitFor();
  await page.goto(origin+'/?mode=catalog');await page.getByRole('button',{name:'編輯／上下架',exact:true}).click();assert.equal(await page.locator('[name=redeem_type]').inputValue(),'percent');assert.equal(await page.locator('[name=redeem_value]').inputValue(),'25');
  product=f.sql.prepare('SELECT * FROM store_shop_products').get();assert.equal(product.status,'active');assert.equal(product.redeem_value,25);assert.equal(product.version,2);
  const published=await f.call('?shop='+SHOP,undefined,'');assert.equal(published.products[0].redeem_value,25);assert.equal(published.products[0].purchase_mode,'online');
  await page.goto(origin+'/?mode=owner');await page.locator('[data-do=edit]').click();assert.equal(await page.locator('[data-form=product] [name=redeem_value]').inputValue(),'25');
  const edit=page.locator('[data-form=product]');await edit.locator('[name=redeem_type]').selectOption('none');await edit.locator('[name=redeem_value]').fill('0');const priorRequests=requests.filter(r=>r.path.endsWith('/product')&&r.method==='POST').length;
  await edit.getByRole('button',{name:'儲存商品',exact:true}).click();await edit.locator('[data-listing-status]').filter({hasText:'必須提供購物金折抵'}).waitFor();assert.equal(requests.filter(r=>r.path.endsWith('/product')&&r.method==='POST').length,priorRequests);
  await edit.locator('[name=redeem_type]').selectOption('fixed');await edit.locator('[name=redeem_value]').fill('300');await edit.getByRole('button',{name:'儲存商品',exact:true}).click();await page.getByRole('alert').filter({hasText:'已儲存'}).waitFor();
  await page.goto(origin+'/?mode=owner');await page.locator('[data-do=edit]').click();assert.equal(await page.locator('[data-form=product] [name=redeem_type]').inputValue(),'fixed');assert.equal(await page.locator('[data-form=product] [name=redeem_value]').inputValue(),'300');assert.equal(await page.locator('[data-form=product] [name=purchase_mode]').inputValue(),'online');
  await page.goto(origin+'/?mode=buyer');await page.locator('[data-do=detail]').first().click();await page.getByRole('button',{name:'購買本商品',exact:true}).click();await page.locator('[data-commerce-form=quote]').waitFor();
  const quote=page.locator('[data-commerce-form=quote]');assert.equal(await quote.locator('[name=carrier] option[value=PICKUP]').count(),0);await quote.locator('[name=points_used]').fill('300');await quote.locator('[name=buyer_name]').fill('合成購買人');await quote.locator('[name=buyer_phone]').fill('0912345678');await quote.locator('[name=city]').fill('台北市');await quote.locator('[name=district]').fill('中正區');await quote.locator('[name=address]').fill('合成路1號');await quote.locator('button.primary').click();await page.locator('[data-commerce=place]').waitFor();
  assert.equal(quotes.length,1);assert.equal(quotes[0].status,200);assert.equal(quotes[0].snapshot.points_used,300);assert.equal(quotes[0].snapshot.max_points,300);assert.equal(quotes[0].snapshot.shipping_fee_cents,6000);assert.equal(quotes[0].snapshot.total_cents,76000);assert.equal(quotes[0].snapshot.items[0].id,product.id);
  await page.screenshot({path:join(out,'checkout-review-'+width+'.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(f.count('store_commerce_orders'),0);assert.equal(f.count('store_commerce_point_operations'),0);assert.equal(f.count('store_cashier_requests'),0);assert.equal(f.count('store_shop_products'),1);assert.deepEqual(f.sql.prepare('SELECT * FROM users ORDER BY row_id').all(),beforeUsers);assert(pointReads>0);
  results.push({width,adminDraftNone:true,explicitChoices:true,adminPolicySavedAndReopened:true,ownerPolicySavedAndReopened:true,publicProductUpdated:true,realQuoteWithPointsAndShipping:true,ordersCreated:0,pointWrites:0});await page.close();
 }
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);writeFileSync(join(out,'result.json'),JSON.stringify({pass:true,results,externalRequests:0,productionWrites:0},null,2));console.log(JSON.stringify({pass:true,results,externalRequests:0,productionWrites:0}));
}finally{await browser.close();await new Promise(done=>server.close(done));f?.close();}
