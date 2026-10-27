// Actual UI, synthetic API fixtures only. Never contacts LINE, mother points or production.
const {createServer}=require('node:http'),{readFileSync,existsSync}=require('node:fs');
const path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'../..'),ID='11111111-1111-4111-8111-111111111111',PRODUCT='22222222-2222-4222-8222-222222222222';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32);
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture.test');
 if(url.pathname==='/'){
  res.setHeader('Content-Type','text/html;charset=utf-8');
  res.end('<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/store-shop.css"><main id="fixture"></main><script>window.currentPage="store-shop";window.currentUserProfile={userId:"'+B+'"};window.userRole="user";window.Config={WORKER_URL:location.origin};window.liff={isLoggedIn:()=>true,getAccessToken:()=>"synthetic",getProfile:async()=>({userId:"'+B+'"})};window.requestIdleCallback=()=>0;window.goPage=()=>{};window.fetchAPI=async()=>({success:false});</script><script src="/js/modules/store-shop.js"></script></html>');return;
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)||!/^\/(?:js\/|css\/|assets\/)/.test(url.pathname)||!existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'image/png');res.end(readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
 const results=[];
 try{
  for(const width of [320,390,1280]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[],posts=[];
   page.on('pageerror',error=>errors.push(error.message));
   let role='store',count=19,pickup=true,order;
   const plan=()=>({id:role==='store'?'full':role==='redeem'?'redeem':role==='reward'?'reward':'member',label:role==='store'?'雙向完整版':'折抵店家',canOnline:['store','redeem'].includes(role),canManage:['store','redeem'].includes(role),canPickup:role==='store',productLimit:role==='store'?20:role==='redeem'?1:0});
   const shop=()=>({id:ID,name:'合成測試商店',address:'台北市合成路 1 號',phone:'0212345678',status:'active',version:1,merchant_enabled:1,pickup_enabled:pickup?1:0,cooperation_plan:plan()});
   const product=()=>({id:PRODUCT,shop_id:ID,title:'合成商品',status:'active',purchase_mode:'online',price_cents:100000,shipping_fee_cents:6000,redeem_type:'percent',redeem_value:50,version:1});
   await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){errors.push('Unexpected external request');return route.abort();}
    const json=value=>route.fulfill({json:value});
    if(url.pathname==='/v1/reward-units')return json({success:true,units:[],next:''});
    if(url.pathname.startsWith('/v1/store-shop')){
     if(url.pathname.endsWith('/manage'))return json({success:true,shop:shop(),products:[],product_limit:plan().productLimit,cooperation_plan:plan(),product_count:count,product_next:''});
     return json({success:true,shops:[],products:[],next:''});
    }
    if(url.pathname.startsWith('/v1/store-commerce')){
     const action=url.pathname.slice('/v1/store-commerce'.length),data=request.method()==='POST'?request.postDataJSON():null;
     if(data)posts.push({action,data});
     if(action==='/capabilities')return json({success:true,enabled:true,points_enabled:true});
     if(action==='/settings')return json({success:true,release_enabled:true,cooperation_plan:plan(),settings:{version:1,enabled:1,bank_name:'合成銀行',bank_code:'123',bank_holder:'合成店家',bank_account:'1234567890',shipping_fee_cents:0,free_shipping_cents:0}});
     if(action==='/orders'&&request.method()==='GET')return json({success:true,orders:order?[order]:[],has_more:false});
     if(action==='/quote'){
      const customer={...data.customer,store_info:'合成測試商店｜台北市合成路 1 號｜0212345678',pickup_shop_name:'合成測試商店',pickup_address:'台北市合成路 1 號',pickup_phone:'0212345678'};
      const snapshot={shop_name:'合成測試商店',buyer_name:data.buyer.name,buyer:data.buyer,customer,items:[{...product(),quantity:1,line_total_cents:100000,line_shipping_fee_cents:0}],subtotal_cents:100000,shipping_fee_cents:0,total_cents:100000,points_used:0,bank:{name:'合成銀行',code:'123',holder:'合成店家',account:'1234567890'}};
      order={id:'synthetic-order',version:1,payment_status:'paid',fulfillment_status:'unfulfilled',points_status:'none',total_cents:100000,created_at:'2026-10-27T00:00:00Z',snapshot};
      return json({success:true,quote_hash:'synthetic-quote',snapshot});
     }
     if(action==='/orders/action'){
      if(data.action==='ship')order={...order,version:order.version+1,fulfillment_status:'shipped'};
      if(data.action==='complete')order={...order,version:order.version+1,fulfillment_status:'completed'};
      return json({success:true,order});
     }
     return json({success:true});
    }
    return route.continue();
   });
   const mount=async(section='manage')=>{
    await page.goto(origin);
    await page.evaluate(({role,section})=>{window.userRole=role;window.StoreShop.mount(document.getElementById('fixture'),false,'','','',section);},{role,section});
   };
   for(const scenario of [{role:'store',count:19,limit:20},{role:'store',count:20,limit:20},{role:'redeem',count:0,limit:1},{role:'redeem',count:1,limit:1}]){
    role=scenario.role;count=scenario.count;await mount();await page.locator('[data-form=store]').waitFor();
    assert.match(await page.locator('.shop-content').innerText(),new RegExp('上限 '+scenario.limit+' 件'));
    if(width===390&&role==='store'&&count===19)await page.locator('.shop-content').screenshot({path:path.resolve(root,'../shop-plan-full20-390.png')});
    assert.equal(await page.locator('[data-do=new]').isDisabled(),count===scenario.limit);
    if(count<scenario.limit){
     await page.locator('[data-do=new]').click();
     assert.deepEqual(await page.locator('.shop-editor [name=purchase_mode] option').evaluateAll(nodes=>nodes.map(node=>node.value)),['in_store','online']);
     assert.deepEqual(await page.locator('.shop-editor [name=redeem_type] option').evaluateAll(nodes=>nodes.map(node=>node.value)),['none','fixed','percent','full']);
    }
   }
   role='reward';await mount('manage');await page.waitForFunction(()=>document.querySelector('[role=alert]').textContent.includes('贈點單位'));
   assert.equal(await page.locator('[data-form=store]').count(),0);assert.equal(await page.locator('.shop-bar [data-do=manage]').count(),0);
   await mount();await page.evaluate(()=>window.StoreShop.mount(document.getElementById('fixture'),false));await page.locator('[data-do=point-reward]').waitFor();
   assert.equal(await page.locator('[data-do=manage]').count(),0);assert.equal(await page.locator('[data-do=point-redeem]').count(),0);
   assert.equal(await page.locator('[data-do=reward-units]').count()>0,true,'independent gift-unit directory remains visible');
   const commerce=async(mode='checkout')=>{
    await page.goto(origin);await page.evaluate(async({mode,shop,product})=>{
     document.getElementById('fixture').className='store-shop shop-lifestyle shop-points-theme';
     const {mountCommerce}=await import('/js/modules/store-commerce.js');
     await mountCommerce(document.getElementById('fixture'),{base:location.origin,mode,shop,products:[product],selectedProductId:product.id,isCurrent:()=>true});
    },{mode,shop:{...shop(),cooperation_plan:undefined},product:product()});
   };
   role='redeem';pickup=false;await commerce();assert.equal(await page.locator('[name=carrier] option[value=PICKUP]').count(),0);
   role='store';pickup=true;await commerce();await page.locator('[name=carrier]').selectOption('PICKUP');
   for(const key of ['postal_code','city','district','address','store_info']){assert.equal(await page.locator('[name='+key+']').isDisabled(),true);assert.equal(await page.locator('[name='+key+']').evaluate(node=>node.required),false);}
   assert.match(await page.locator('[data-pickup-info]').innerText(),/台北市合成路 1 號/);
   await page.locator('[name=buyer_name]').fill('合成測試人');await page.locator('[name=buyer_phone]').fill('0912345678');
   await page.locator('[data-commerce-form=quote] > button.primary').click();await page.locator('[data-commerce=place]').waitFor();
   const review=await page.locator('[data-checkout-review]').innerText();assert.match(review,/到店取貨/);assert.match(review,/台北市合成路 1 號/);assert.match(review,/運費 NT\$ 0/);
   if(width===390)await page.locator('[data-checkout-review]').screenshot({path:path.resolve(root,'../shop-plan-pickup-390.png')});
   assert.equal(posts.at(-1).data.customer.carrier,'PICKUP');assert.equal(posts.at(-1).data.customer.address,'');
   await commerce('merchant');await page.locator('[data-commerce=orders]').click();await page.locator('[data-action=ship]').waitFor({state:'attached'});
   await page.locator('.shop-sale-row details').evaluate(node=>node.open=true);
   assert.equal(await page.locator('[name=tracking_number]').count(),0);await page.locator('[data-action=ship] button').click();await page.locator('[data-action=complete]').waitFor({state:'attached'});
   assert.match(await page.locator('.shop-sale-heading').innerText(),/待取貨/);
   await page.locator('.shop-sale-row details').evaluate(node=>node.open=true);await page.locator('[name=confirmed_pickup]').check();await page.locator('[data-action=complete] button').click();
   await page.waitForFunction(()=>document.querySelector('.shop-sale-heading').textContent.includes('已取貨'));
   assert.equal(posts.at(-1).data.confirmed_pickup,true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);results.push({width,full20:true,redeem1OnlineAndPoints:true,rewardGiftOnly:true,fullPickup:true,redeemNoPickup:true,confirmedCollection:true});await page.close();
  }
  console.log(JSON.stringify({pass:true,results,formalWrites:0,externalRequests:0}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
