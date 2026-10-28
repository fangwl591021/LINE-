// Actual UI + isolated SQLite/fake mother. No production accounts or points.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin='http://127.0.0.1:8794',out=path.join(require('node:os').tmpdir(),'store-product-shipping-qa-20261019');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const server=spawn(process.execPath,['test/browser/store-commerce-server.mjs'],{env:{...process.env,TEST_PRODUCT_SHIPPING:'true',TEST_COMMERCE_POINTS:'true'},stdio:['ignore','pipe','pipe']});
 let log='',browser;server.stdout.on('data',c=>log+=c);server.stderr.on('data',c=>log+=c);
 try{
  for(let i=0;i<100&&!log.includes('Synthetic commerce test:');i++){if(server.exitCode!==null)throw Error(log);await wait(50);}
  if(!log.includes('Synthetic commerce test:'))throw Error(log);
  browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync(out,{recursive:true});const results=[];
  for(const [index,width]of [320,390,1440].entries()){
   console.log('Product shipping UI width '+width);
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[],posted=[];page.setDefaultTimeout(15000);
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
   await page.goto(origin);
   await page.evaluate(async()=>{window.testToken='a';await openStoreShop();});
   await page.locator('.shop-bottom-nav [data-do=find]').click();await page.locator('[data-do=manage]:visible').first().click();await page.locator('[data-do=edit][data-id=p-b]').click();
   const fee=150+index;
   await page.locator('[data-form=product] [name=shipping_fee]').fill(String(fee));
   await page.screenshot({path:path.join(out,'owner-'+width+'.png'),fullPage:true});
   await page.getByRole('button',{name:'儲存商品',exact:true}).click();
   await page.locator('[data-do=edit][data-id=p-b]').waitFor();
   const publicData=await page.request.get(origin+'/v1/store-shop?shop=shop-a').then(r=>r.json());
   assert.equal(publicData.products.find(p=>p.id==='p-b').shipping_fee_cents,fee*100);
   assert.equal(publicData.products.find(p=>p.id==='p-a').shipping_fee_cents,0);
   await page.evaluate(async()=>{window.testToken='b';await openStoreShop();});
   await page.locator('.shop-bottom-nav [data-do=find]').click();await page.locator('[data-do=view]').first().click();
   await page.getByRole('button',{name:'選擇本店網購商品',exact:true}).click();
   await page.locator('[data-commerce-form=quote] [name=qty-p-b]').waitFor();
   assert.match(await page.locator('.commerce-panel').innerText(),new RegExp('單件運費 NT\\$ '+fee));
   await page.locator('[name=qty-p-b]').fill('2');await page.locator('[name=qty-p-a]').fill('1');await page.locator('[name=points_used]').fill('50');
   for(const [key,value]of Object.entries({buyer_name:'合成測試',buyer_phone:'0912345678',city:'台北市',district:'中正區',address:'合成路1號'}))await page.locator('[name='+key+']').fill(value);
   const state=()=>page.request.get(origin+'/test-point-state').then(r=>r.json()),before=await state();
   page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/v1/store-commerce/orders'))posted.push(r.postDataJSON());});
   await page.locator('[data-commerce-form=quote] > button.primary').click();await page.locator('[data-commerce=place]').waitFor();
   const review=await page.locator('[data-checkout-review]').innerText();
   assert.match(review,/本商品運費 NT\$ 0 × 1 = NT\$ 0/);
   assert.ok(review.includes('本商品運費 NT$ '+fee+' × 2 = NT$ '+fee*2),review);
   assert.ok(review.includes((32400+fee*2-50).toLocaleString('zh-TW')),review);
   assert.deepEqual((await state()).writes,before.writes,'Quote never debits');
   assert.equal(await page.locator('[name=shipping_fee]').count(),0,'Buyer cannot set shipping');
   await page.screenshot({path:path.join(out,'quote-'+width+'.png'),fullPage:true});
   await page.locator('[name=confirm_order]').check();await page.locator('[data-commerce=place]').dblclick();
   await page.getByRole('heading',{name:'訂單已建立，尚未匯款',exact:true}).waitFor();
   assert.equal(posted.length,1);assert.equal((await state()).balance,before.balance-50);
   await page.locator('[data-commerce=cancel]').click();await page.waitForFunction(()=>document.body.innerText.includes('已退點'));
   assert.equal((await state()).balance,before.balance);assert.deepEqual((await state()).writes.slice(before.writes.length),[-50,50]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
   // Same actual admin editor, with a mocked API and no production identities.
   await page.route('**/js/modules/store-admin-catalog.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('js/modules/store-admin-catalog.js','utf8')}));
   await page.route('**/css/store-admin-catalog.css*',r=>r.fulfill({contentType:'text/css',body:fs.readFileSync('css/store-admin-catalog.css','utf8')}));
   const adminWrites=[];await page.exposeFunction('shippingAdminApi',async(_path,data)=>{
    if(data){adminWrites.push(data);return {success:true,id:'p-b',version:2};}
    return {success:true,shop:{id:'shop-a',name:'合成店家',status:'active',version:1},online_product_allowed:true,summary:{total:1,draft:0},products:[{id:'p-b',shop_id:'shop-a',title:'合成商品',description:'',category:'購',image_url:'',price_cents:1180000,status:'active',version:1,purchase_mode:'online',redeem_type:'percent',redeem_value:50,shipping_fee_cents:fee*100}]};
   });
   await page.evaluate(async()=>{document.body.innerHTML='<main id="catalog"></main>';const {mountAdminCatalog}=await import('/js/modules/store-admin-catalog.js');await mountAdminCatalog(document.getElementById('catalog'),{shopId:'shop-a',isCurrent:()=>true,onBack(){},onUploadProducts(){},api:window.shippingAdminApi});});
   await page.getByRole('button',{name:'編輯／上下架',exact:true}).click();assert.equal(await page.locator('[name=shipping_fee]').inputValue(),String(fee));
   await page.locator('[name=shipping_fee]').fill('75');await page.getByRole('button',{name:'確認儲存',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('已儲存'));
   assert.equal(adminWrites[0].changes.shipping_fee_cents,7500);assert.equal(adminWrites[0].changes.price_cents,1180000);assert.equal(adminWrites[0].changes.redeem_type,'percent');assert.equal(adminWrites[0].changes.redeem_value,50);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   results.push({width,unitShipping:fee,quantity:2,freeOtherProduct:true,shippingTotal:fee*2,cash:32400+fee*2-50,ownerSaved:true,adminSaved:true,quoteDebit:false,syntheticDebitRefundOnce:true,noBuyerFeeInput:true,noOverflow:true,productionWrites:0});
   await page.close();
  }
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({results,out}));
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
