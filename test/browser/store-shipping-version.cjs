// Isolated browser and mocked API; no production identities, orders or points.
const {createServer}=require('node:http'),{readFileSync}=require('node:fs');
const path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'../..');
const server=createServer((request,response)=>{
 const url=new URL(request.url,'http://fixture.invalid');
 if(url.pathname==='/'){
  response.setHeader('Content-Type','text/html;charset=utf-8');
  response.end('<!doctype html><html><meta charset="utf-8"><main id="fixture"></main><script>window.liff={isLoggedIn:()=>true,getAccessToken:()=>"synthetic",getProfile:async()=>({userId:"synthetic-user"})}</script></html>');return;
 }
 if(url.pathname==='/js/modules/store-commerce.js'){
  response.setHeader('Content-Type','text/javascript');response.end(readFileSync(path.join(root,'js/modules/store-commerce.js')));return;
 }
 if(url.pathname==='/css/store-commerce.css'){
  response.setHeader('Content-Type','text/css');response.end(readFileSync(path.join(root,'css/store-commerce.css')));return;
 }
 response.writeHead(404);response.end();
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:900}}),requests=[],errors=[];
  let responseVersion,order,firstOrder=true;
  const product={id:'product-a',shop_id:'shop-a',title:'合成商品',status:'active',purchase_mode:'online',price_cents:10000,shipping_fee_cents:6000,redeem_type:'none',redeem_value:0};
  const snapshot=version=>({...(version===undefined?{}:{shipping_rule_version:version}),shop_name:'合成店家',buyer_name:'測試人',buyer:{name:'測試人',phone:'0912345678',email:''},customer:{name:'測試人',phone:'0912345678',carrier:'POST',postal_code:'',city:'台北市',district:'中正區',address:'合成路1號',store_info:'',note:''},items:[{...product,quantity:2,line_total_cents:20000,line_shipping_fee_cents:12000}],subtotal_cents:20000,shipping_fee_cents:version===2?6000:12000,legacy_shipping_fee_cents:0,total_cents:version===2?26000:32000,points_used:0,bank:{name:'合成銀行',code:'123',holder:'合成店家',account:'1234567890'}});
  const orderFrom=(id,s)=>({id,version:1,snapshot:s,payment_status:'pending',fulfillment_status:'unfulfilled',points_status:'none',total_cents:s.total_cents,created_at:'2026-11-11T00:00:00Z'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin)throw Error('Unexpected external request');
   if(!url.pathname.startsWith('/v1/store-commerce'))return route.continue();
   const action=url.pathname.slice('/v1/store-commerce'.length),data=request.method()==='POST'?request.postDataJSON():null;
   if(data)requests.push({action,data});
   const json=value=>route.fulfill({json:value});
   if(action==='/capabilities')return json({success:true,enabled:true,points_enabled:false});
   if(action==='/quote')return json({success:true,quote_hash:'synthetic-quote',snapshot:snapshot(responseVersion)});
   if(action==='/orders'&&request.method()==='POST'){
    if(firstOrder){firstOrder=false;return route.fulfill({status:426,json:{success:false,error:'結帳頁面已更新，請先至我的網路訂單查核，再重新整理後核對商品與運費'}});}
    order=orderFrom('new-order',snapshot(2));return json({success:true,order});
   }
   if(action==='/orders'&&request.method()==='GET')return json({success:true,orders:[orderFrom('old-order',snapshot(undefined)),orderFrom('new-order',snapshot(2))],has_more:false});
   throw Error('Unexpected API '+action);
  });
  await page.goto(origin);
  await page.evaluate(async product=>{
   const {mountCommerce}=await import('/js/modules/store-commerce.js');
   await mountCommerce(document.getElementById('fixture'),{base:location.origin,mode:'checkout',shop:{id:'shop-a',name:'合成店家'},products:[product],isCurrent:()=>true});
  },product);
  for(const [key,value]of Object.entries({buyer_name:'測試人',buyer_phone:'0912345678',city:'台北市',district:'中正區',address:'合成路1號'}))await page.locator('[name='+key+']').fill(value);
  await page.locator('[name=qty-product-a]').fill('2');
  for(const version of [undefined,1,'2']){
   responseVersion=version;
   const received=page.waitForResponse(response=>response.url().endsWith('/v1/store-commerce/quote'));
   await page.locator('[data-commerce-form=quote] > button.primary').click();
   await received;
   await page.waitForFunction(()=>document.querySelector('.commerce-error').textContent.includes('重新整理'));
   assert.equal(requests.at(-1).data.shipping_rule_version,2);
   assert.equal(await page.locator('[data-commerce=place]').count(),0,'old or invalid server quote may not be submitted');
   assert.equal(requests.filter(r=>r.action==='/orders').length,0);
  }
  responseVersion=2;
  await page.locator('[data-commerce-form=quote] > button.primary').click();
  await page.locator('[data-commerce=place]').waitFor();
  assert.equal(await page.locator('.commerce-error').innerText(),'','old version warning clears after a valid quote');
  const quote=await page.locator('[data-checkout-review]').innerText();
  assert.match(quote,/每筆訂單計一次運費/);assert.match(quote,/運費 NT\$ 60/);assert.doesNotMatch(quote,/本商品運費/);
  await page.locator('[name=confirm_order]').check();await page.locator('[data-commerce=place]').click();
  await page.waitForFunction(()=>document.querySelector('.commerce-error').textContent.includes('先至我的網路訂單查核'));
  const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('store-commerce-pending:synthetic-user')));
  assert.ok(pending?.id,'426 must retain the unresolved request key');
  assert.equal(requests.filter(r=>r.action==='/orders').length,1);
  await page.locator('[data-commerce=place]').click();
  await page.getByRole('heading',{name:'訂單已建立，尚未匯款'}).waitFor();
  const submitted=requests.filter(r=>r.action==='/orders');assert.equal(submitted.length,2);
  assert.equal(submitted[0].data.shipping_rule_version,2);assert.equal(submitted[1].data.shipping_rule_version,2);
  assert.equal(submitted[0].data.request_key,pending.id);assert.equal(submitted[1].data.request_key,pending.id);
  assert.equal(await page.evaluate(()=>localStorage.getItem('store-commerce-pending:synthetic-user')),null);
  await page.locator('[data-commerce=orders]').click();
  await page.locator('.shop-sale-row').first().waitFor();
  const orders=page.locator('.shop-sale-row');await orders.nth(0).locator('summary').click();await orders.nth(1).locator('summary').click();
  assert.match(await orders.nth(0).innerText(),/本商品運費 NT\$ 60 × 2 = NT\$ 120/,'old receipt keeps original calculation');
  assert.match(await orders.nth(1).innerText(),/每筆訂單計一次運費/);
  assert.doesNotMatch(await orders.nth(1).innerText(),/本商品運費/);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,oldQuoteBlocked:true,versionedOrder:true,retains426Key:true,oldReceiptPreserved:true,newReceiptPerOrder:true,productionWrites:0}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
