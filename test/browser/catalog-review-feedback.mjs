// Actual shared UI with isolated synthetic responses. No live identity/API or AI calls.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright');}catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const out=join(tmpdir(),'catalog-review-feedback-20261110');mkdirSync(out,{recursive:true});
const browser=await playwright.chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),writes=[],dialogs=[],errors=[],blocked=[];
 page.on('dialog',d=>{dialogs.push(d.message());return d.dismiss();});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='localhost'){blocked.push(u.href);return route.abort();}
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px Arial;background:#f8fafb}</style><main id="catalog"></main></html>'});
  if(u.pathname.startsWith('/js/modules/')||u.pathname.startsWith('/css/'))return route.fulfill({contentType:u.pathname.endsWith('.css')?'text/css':'text/javascript',body:readFileSync(new URL('../../'+u.pathname.slice(1),import.meta.url),'utf8')});
  blocked.push(u.href);return route.abort();
 });
 const review={decision:'manual',reviewed_at:Date.now(),issues:[{category:'medical',field:'description',evidence:'<img src=x onerror=alert(1)>',reason:'用途資料待核對，不能確認為一般非醫療產品。'}]};
 const product={id:'product-test',shop_id:'shop-test',title:'合成待核對商品',description:'原介紹',category:'購',image_url:'',price_cents:10000,shipping_fee_cents:0,status:'draft',version:1,purchase_mode:'online',redeem_type:'percent',redeem_value:10,listing_review:review};
 let behavior='reject',includeSavedReview=true;
 await page.exposeFunction('fixtureApi',async(path,data)=>{
  if(data){
   writes.push(data);
   if(behavior==='reject'){
    product.listing_review={...review,decision:'reject'};
    return {success:false,test_error:{code:'LISTING_POLICY_REJECTED',message:'合成內容不符合上架政策；本次未儲存。',review:product.listing_review}};
   }
   if(behavior==='unknown'){behavior='allow';return {success:false,test_error:{code:'CATALOG_UNAVAILABLE',message:'合成未知儲存結果'}};}
   Object.assign(product,data.changes);delete product.listing_review;product.version++;
   return {success:true,id:product.id,version:product.version};
  }
  if(path.includes('queue=draft'))return {success:true,products:[{...product,shop_name:'合成店家'}],next:''};
  const current={...product};if(!includeSavedReview)delete current.listing_review;
  return {success:true,shop:{id:'shop-test',name:'合成店家',version:1,status:'active'},online_product_allowed:true,summary:{total:1,draft:product.status==='draft'?1:0},products:[current],next:''};
 });
 await page.goto('http://localhost/');
 const mount=async(queue=false)=>page.evaluate(async queue=>{
  const {mountAdminCatalog,mountAdminDrafts}=await import('/js/modules/store-admin-catalog.js');
  const api=async(...args)=>{const r=await window.fixtureApi(...args);if(r.test_error){const e=new Error(r.test_error.message);Object.assign(e,{code:r.test_error.code,review:r.test_error.review});throw e;}return r;};
  const options={shopId:'shop-test',api,isCurrent:()=>true,onBack(){},onUploadProducts(){},onManageCatalog(){}};
  await (queue?mountAdminDrafts:mountAdminCatalog)(document.getElementById('catalog'),options);
 },queue);
 await mount();
 assert.equal(await page.locator('.mall-catalog-review').count(),1);
 assert.match(await page.locator('.mall-catalog-review').innerText(),/介紹｜醫療用品／藥品／醫材/);
 assert.match(await page.locator('.mall-catalog-review').innerText(),/<img src=x onerror=alert\(1\)>/);
 assert.equal(await page.locator('.mall-catalog-review img').count(),0);
 const assertRed=async locator=>assert.equal(await locator.evaluate(e=>getComputedStyle(e).color),'rgb(180, 35, 24)');
 await assertRed(page.locator('.mall-catalog-review'));
 await page.getByRole('button',{name:'編輯／上下架',exact:true}).click();
 await page.locator('[name=status]').selectOption('active');await page.getByRole('button',{name:'確認儲存',exact:true}).click();
 await page.getByRole('dialog',{name:'請確認商城操作'}).waitFor();
 assert.equal(writes.length,0);assert.equal(await page.locator('[name=title]').isDisabled(),true);
 assert.match(await page.getByRole('dialog').innerText(),/合成待核對商品.*已上架.*網購/s);
 await page.getByRole('button',{name:'返回修改',exact:true}).click();assert.equal(writes.length,0);assert.equal(await page.locator('[name=title]').isEnabled(),true);
 await page.getByRole('button',{name:'取消／返回商品列表',exact:true}).click();await page.getByRole('button',{name:'繼續編輯',exact:true}).click();
 assert.equal(await page.locator('[name=status]').inputValue(),'active');assert.equal(writes.length,0);
 await page.getByRole('button',{name:'取消／返回商品列表',exact:true}).click();await page.getByRole('button',{name:'確認離開',exact:true}).click();
 await page.getByRole('button',{name:'編輯／上下架',exact:true}).click();
 assert.equal(await page.locator('[name=status]').inputValue(),'draft');
 includeSavedReview=false;await page.locator('[name=status]').selectOption('active');await page.getByRole('button',{name:'確認儲存',exact:true}).click();await page.getByRole('button',{name:'確認送出',exact:true}).click();
 await page.getByRole('status').filter({hasText:'上架審核未通過'}).waitFor();await assertRed(page.getByRole('status'));
 assert.equal(product.status,'draft');assert.equal(writes.length,1);assert.equal(await page.locator('[name=description]').isEnabled(),true);
 await page.getByRole('button',{name:'取消／返回商品列表',exact:true}).click();await page.getByRole('button',{name:'確認離開',exact:true}).click();
 await page.getByText('最近審核未通過；該次變更未公開',{exact:true}).waitFor();
 assert.equal(await page.locator('article .mall-catalog-review').count(),1,'immediate review is rendered once before GET includes it');
 includeSavedReview=true;await mount(true);assert.equal(await page.locator('article .mall-catalog-review').count(),1);await assertRed(page.locator('article .mall-catalog-review'));
 await mount();await page.getByRole('button',{name:'編輯／上下架',exact:true}).click();
 behavior='unknown';await page.locator('[name=status]').selectOption('active');await page.getByRole('button',{name:'確認儲存',exact:true}).click();await page.getByRole('button',{name:'確認送出',exact:true}).click();
 await page.getByRole('status').filter({hasText:'合成未知儲存結果'}).waitFor();
 assert.equal(await page.locator('[name=description]').isDisabled(),true);await page.getByRole('button',{name:'重新確認同一筆儲存',exact:true}).click();
 await page.getByRole('status').filter({hasText:'已儲存'}).waitFor();assert.deepEqual(writes[1],writes[2]);assert.notEqual(writes[0].request_key,writes[1].request_key);
 assert.equal(await page.getByRole('status').evaluate(e=>e.classList.contains('mall-catalog-error')),false);
 assert.equal(await page.locator('.mall-catalog-review').count(),0);assert.equal(product.status,'active');
 for(const width of [320,390,1440]){
  product.listing_review=review;await mount();await page.setViewportSize({width,height:900});
  await page.waitForFunction(()=>!!document.getElementById('store-admin-catalog-css')?.sheet);await assertRed(page.locator('.mall-catalog-review'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:join(out,`review-list-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'編輯／上下架',exact:true}).click();await page.getByRole('button',{name:'確認儲存',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(out,`inline-confirm-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'返回修改',exact:true}).click();
 }
 assert.deepEqual(dialogs,[]);assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 console.log(JSON.stringify({passed:true,widths:[320,390,1440],redReasons:true,safeText:true,saveAndLeaveCancellation:true,retrySameRequest:true,noNativeDialogs:true,productionWrites:0,screenshots:out}));
}finally{await browser.close();}
