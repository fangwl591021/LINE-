// Local SQLite + synthetic mother only; never uses production accounts or points.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin='http://127.0.0.1:8794';
const output=path.join(require('node:os').tmpdir(),'line-online-checkout-flow-qa-20261019');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const server=spawn(process.execPath,['test/browser/store-commerce-server.mjs'],{env:{...process.env,TEST_COMMERCE_POINTS:'true'},stdio:['ignore','pipe','pipe']});
 let log='';server.stdout.on('data',c=>log+=c);server.stderr.on('data',c=>log+=c);
 let browser;
 try{
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(log);if(log.includes('Synthetic commerce test:'))break;await delay(50);}
  if(!log.includes('Synthetic commerce test:'))throw Error('Synthetic server did not start: '+log);
  console.log('Synthetic server ready; launching isolated Chrome.');
  browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync(output,{recursive:true});
  const results=[];
  for(const width of [320,390,1440]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[],requests=[];
   page.setDefaultTimeout(15000);console.log('Checkout width '+width);
   page.on('pageerror',e=>console.log('Browser error',e.message));
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.route('**/*',route=>{
    if(!route.request().url().startsWith(origin+'/')){errors.push('External request: '+route.request().url());return route.abort();}
    return route.continue();
   });
   page.on('request',r=>{if(r.method()==='POST')requests.push({url:r.url(),body:r.postDataJSON()});});
   const state=()=>page.request.get(origin+'/test-point-state').then(r=>r.json());
   const begin=await state();
   const open=async()=>{await page.goto(origin);await page.locator('.shop-bottom-nav [data-do=find]').click();await page.locator('[data-do=view]').first().click();await page.locator('[data-do=detail][data-id=p-b]').first().click();};
   await open();
   assert.equal(await page.locator('[data-do=online-buy]').getAttribute('data-product-id'),'p-b');
   await page.getByRole('button',{name:'購買本商品',exact:true}).click();await page.locator('[name=qty-p-b]').waitFor();
   assert.equal(await page.locator('[name=qty-p-b]').inputValue(),'1');assert.equal(await page.locator('[name=qty-p-a]').count(),0);
   assert.match(await page.locator('.commerce-panel').innerText(),/11,800/);
   await page.locator('[data-commerce=wallet]').click();await page.waitForFunction(value=>document.querySelector('[data-wallet-status]').textContent.includes(value),begin.balance.toLocaleString('zh-TW'));
   await page.locator('[name=points_used]').fill('50');
   for(const [key,value]of Object.entries({buyer_name:'合成購買人',buyer_phone:'0912345678',city:'台北市',district:'中正區',address:'測試路1號'}))await page.locator(`[name=${key}]`).fill(value);
   await page.locator('[data-commerce-form=quote] > button.primary').click();await page.locator('[data-commerce=place]').waitFor();
   assert.equal((await state()).writes.length,begin.writes.length,'Quote must never debit');
   const review=await page.locator('[data-checkout-review]').innerText();
   assert.match(review,/合成測試商品B/);assert.doesNotMatch(review,/測試眼鏡/);assert.match(review,/運費 NT\$ 60/);assert.match(review,/11,810/);assert.match(review,/50 點/);
   assert.equal(await page.locator('[data-checkout-fields]').evaluate(el=>el.disabled),true);
   assert.equal(await page.locator('[name=qty-p-b]').isDisabled(),true);
   assert.ok(await page.locator('[data-commerce-form=quote]').evaluate(form=>form.compareDocumentPosition(document.querySelector('[data-checkout-review]'))&Node.DOCUMENT_POSITION_FOLLOWING));
   await page.locator('[data-commerce=place]').click();await page.waitForFunction(()=>document.querySelector('.commerce-error').textContent.includes('勾選確認'));
   assert.equal(requests.filter(r=>r.url.endsWith('/orders')).length,0);
   await page.locator('[data-commerce=edit]').click();assert.equal(await page.locator('[name=points_used]').inputValue(),'50');assert.equal(await page.locator('[name=qty-p-b]').inputValue(),'1');
   assert.equal(await page.locator('[name=address]').inputValue(),'測試路1號');
   await page.locator('[data-commerce-form=quote] > button.primary').click();await page.locator('[name=confirm_order]').check();
   await page.screenshot({path:path.join(output,`quote-${width}.png`),fullPage:true});
   await page.locator('[data-commerce=place]').dblclick();await page.getByRole('heading',{name:'訂單已建立，尚未匯款',exact:true}).waitFor();
   const posted=requests.filter(r=>r.url.endsWith('/orders'));assert.equal(posted.length,1);assert.deepEqual(posted[0].body.items,[{id:'p-b',quantity:1}]);
   const debited=await state();assert.equal(debited.balance,begin.balance-50);assert.deepEqual(debited.writes.slice(begin.writes.length),[-50]);
   assert.match(await page.locator('.commerce-panel').innerText(),/11,810/);assert.match(await page.locator('.commerce-panel').innerText(),/已扣點/);
   await page.locator('[data-action=report_remittance]').waitFor();
   assert.match(await page.locator('.commerce-panel').innerText(),/1234567890/);
   await page.screenshot({path:path.join(output,`remittance-${width}.png`),fullPage:true});
   if(width===390){
    await page.locator('[name=last5]').fill('12345');await page.locator('[data-action=report_remittance] button').click();
    await page.getByRole('heading',{name:'匯款回報已送出，待店家核帳'}).waitFor();
    assert.match(await page.locator('.commerce-panel').innerText(),/不代表已收款/);assert.doesNotMatch(await page.locator('.commerce-panel h2').innerText(),/已付款|已完成/);
    assert.equal((await state()).balance,debited.balance);
    await page.screenshot({path:path.join(output,`reported-${width}.png`),fullPage:true});
   }else{
    await page.locator('[data-commerce=cancel]').click();await page.waitForFunction(()=>document.body.innerText.includes('已退點'));
    const refunded=await state();assert.equal(refunded.balance,begin.balance);assert.deepEqual(refunded.writes.slice(begin.writes.length),[-50,50]);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('合成購買人')),false);assert.deepEqual(errors,[]);
   // Revalidation may not substitute another item if a stale card loses eligibility.
   await open();
   await page.route('**/v1/store-shop/products?id=p-b',async route=>{
    const response=await route.fetch(),data=await response.json();data.products[0].purchase_mode='in_store';await route.fulfill({json:data});
   });
   const beforeStale=requests.length;await page.getByRole('button',{name:'購買本商品',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[role=alert]').textContent.includes('未改選其他商品'));
   assert.equal(await page.locator('[data-commerce-form=quote]').count(),0);assert.equal(requests.length,beforeStale);
   results.push({width,selectedProduct:'p-b',quoteDebit:false,shipping:60,points:50,cash:11810,postedOnce:true,inlineReport:width===390,staleBlocked:true,noOverflow:true,productionWrites:0});
   await page.close();
  }
  // Admin form must truthfully distinguish an unsaved online choice from active mode.
  const page=await browser.newPage({viewport:{width:390,height:900}});
  await page.route('**/js/modules/store-admin-catalog.js*',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync('js/modules/store-admin-catalog.js','utf8')}));
  await page.route('**/css/store-admin-catalog.css*',r=>r.fulfill({contentType:'text/css',body:fs.readFileSync('css/store-admin-catalog.css','utf8')}));
  await page.goto(origin);page.on('dialog',d=>d.accept());
  await page.evaluate(async()=>{
   document.body.innerHTML='<main id="catalog"></main>';
   const {mountAdminCatalog}=await import('/js/modules/store-admin-catalog.js');
   await mountAdminCatalog(document.getElementById('catalog'),{shopId:'shop-a',isCurrent:()=>true,onBack(){},onUploadProducts(){},api:async(_path,data)=>{
    if(data){const e=new Error('需人工確認產品用途');e.code='LISTING_MANUAL';throw e;}
    return {success:true,shop:{id:'shop-a',name:'合成店家',status:'active',version:1},online_product_allowed:true,summary:{total:1,draft:0},products:[{id:'p-b',shop_id:'shop-a',title:'合成商品',description:'',category:'購',image_url:'',price_cents:1180000,status:'active',version:1,purchase_mode:'in_store'}]};
   }});
  });
  await page.getByRole('button',{name:'編輯／上下架'}).click();await page.locator('[name=purchase_mode]').selectOption('online');await page.getByRole('button',{name:'確認儲存',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('銷售方式仍為「限店內」'));
  await page.screenshot({path:path.join(output,'review-not-saved.png'),fullPage:true});
  await page.close();
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({results,reviewNotSaved:true,productionWrites:0},null,2));
  console.log(JSON.stringify({results,reviewNotSaved:true,productionWrites:0}));
 }finally{await browser?.close();server.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
