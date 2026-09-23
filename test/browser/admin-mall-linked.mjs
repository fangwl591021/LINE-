// Local synthetic browser fixture. Every external request is blocked.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const out=join(tmpdir(),'admin-mall-linked-20260923');mkdirSync(out,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],blocked=[],writes=[];
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
const id='00000001-1111-4111-8111-111111111111',pid='00000010-1111-4111-8111-111111111111';
const shop={id,name:'合成測試咖啡店',owner_name:'合成負責人',owner_uid:'synthetic',owner_role:'store',status:'active',public_visible:true,version:1,product_count:1,product_limit:null,active_product_count:0,phone:'0212345678',address:'合成測試路 1 號',category:'食'};
const product={id:pid,shop_id:id,title:'合成咖啡優惠',description:'合成測試資料',price_cents:10000,category:'食',status:'draft',version:1,purchase_mode:'in_store',redeem_type:'none',redeem_value:0};
let loseResponse=true;
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname!=='localhost'){blocked.push(request.url());await route.abort();return;}
  if(url.pathname==='/'){
    await route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui;background:#f5faf8}.hidden{display:none}</style><main id="tab-mall"><div id="admin-mall-content"></div></main><script>let adminRole='admin';const WORKER_URL=location.origin;window.testToken='synthetic';window.liff={isLoggedIn:()=>!!window.testToken,getAccessToken:()=>window.testToken};function switchTab(){document.getElementById('tab-mall').classList.add('hidden')};window.syntheticUploads=[];async function fetchAPI(action,data){window.syntheticUploads.push({action,data});if(window.failUpload)throw Error('模擬上傳失敗');if(window.holdUpload)await new Promise(resolve=>{window.releaseUpload=resolve;});return {success:true,url:'https://localhost/test-image.png'};};</script><script src="/js/modules/admin-mall-dashboard.js"></script><script>loadAdminMall()</script></html>`});return;
  }
  if(url.pathname==='/test-image.png'){await route.fulfill({contentType:'image/png',body:pixel});return;}
  if(url.pathname.startsWith('/js/modules/')||url.pathname.startsWith('/css/')){
    await route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:readFileSync(new URL('../../'+url.pathname.slice(1),import.meta.url),'utf8')});return;
  }
  let data;
  if(url.pathname==='/v1/store-shop/admin/stores')data={success:true,shops:[shop],summary:{total:1,active:1,draft:0},filtered_total:1,next:''};
  else if(url.pathname==='/v1/store-shop/admin/catalog'){
    if(request.method()==='POST'){
      const body=request.postDataJSON();writes.push(body);
      if(writes.length===1){Object.assign(product,body.changes);product.version++;}
      if(loseResponse){loseResponse=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'模擬回應遺失'})});return;}
      data={success:true,id:body.id,version:2};
    }else if(url.searchParams.get('queue')==='draft')data={success:true,products:product.status==='draft'?[{...product,shop_name:shop.name}]:[],next:''};
    else data={success:true,shop,products:url.searchParams.get('status')==='draft'&&product.status!=='draft'?[]:[product],summary:{total:1,active:product.status==='active'?1:0,draft:product.status==='draft'?1:0},next:''};
  }else if(url.pathname==='/v1/store-shop/admin/products')data={success:true,shop,products:[product]};
  else{blocked.push(url.pathname);await route.abort();return;}
  assert.equal(request.headers().authorization,'Bearer synthetic');
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
});
try{
  await page.goto('http://localhost/');await page.getByRole('button',{name:'全站商品草稿',exact:true}).click();
  await page.getByRole('button',{name:'進入店家草稿',exact:true}).click();await page.getByRole('button',{name:'編輯／上下架',exact:true}).click();
  const picker=page.locator('input[name=image_file]');
  await picker.setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});
  await page.getByRole('status').filter({hasText:'原圖片未變更'}).waitFor();assert.equal(await page.evaluate(()=>syntheticUploads.length),0);
  await picker.setInputFiles({name:'image.png',mimeType:'image/png',buffer:pixel});
  await page.getByRole('status').filter({hasText:'圖片已上傳'}).waitFor();assert.equal(writes.length,0);
  assert.equal(await page.locator('input[name=image_url]').inputValue(),'https://localhost/test-image.png');
  assert.equal(await page.locator('.mall-catalog-preview').isVisible(),true);
  assert.ok(await page.evaluate(()=>syntheticUploads[0].action==='uploadImageToR2'&&syntheticUploads[0].data.base64Image.startsWith('data:image/jpeg;base64,')));
  await page.evaluate(()=>{window.failUpload=true;});await picker.setInputFiles({name:'image.png',mimeType:'image/png',buffer:pixel});
  await page.getByRole('status').filter({hasText:'模擬上傳失敗'}).waitFor();assert.equal(await page.locator('input[name=image_url]').inputValue(),'https://localhost/test-image.png');
  await page.evaluate(()=>{window.failUpload=false;});
  await page.locator('input[name=title]').fill('<img src=x onerror=alert(1)> 測試名稱');
  await page.locator('select[name=status]').selectOption('active');
  await page.getByRole('button',{name:'確認儲存',exact:true}).click();await page.getByRole('status').filter({hasText:'模擬回應遺失'}).waitFor();
  assert.equal(await page.locator('input[name=title]').isDisabled(),true);
  await page.getByRole('button',{name:'重新確認同一筆儲存',exact:true}).click();await page.getByRole('status').filter({hasText:'已儲存'}).waitFor();
  assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);
  assert.equal(writes[0].changes.image_url,'https://localhost/test-image.png');assert.equal('image_file' in writes[0].changes,false);
  await page.getByRole('button',{name:'重新載入',exact:true}).click();await page.getByText('目前沒有待確認的商品草稿。').waitFor();
  await page.getByRole('button',{name:'商品／優惠',exact:true}).click();await page.getByRole('button',{name:'編輯／上下架',exact:true}).waitFor();
  assert.equal(await page.locator('.mall-catalog img').count(),0); // title remains text, never HTML
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'店家資料',exact:true}).click();await page.locator('input[name=name]').waitFor();
    await page.waitForFunction(()=>!!document.getElementById('store-admin-catalog-css')?.sheet);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.getByRole('button',{name:'← 返回店家列表',exact:true}).isVisible(),true);
    await page.screenshot({path:join(out,`catalog-${width}.png`),fullPage:true});
  }
  await page.getByRole('button',{name:'新增商品／優惠',exact:true}).click();await page.locator('[data-admin-product-form]').waitFor();
  await page.getByRole('button',{name:'← 返回店家列表',exact:true}).click();await page.getByRole('button',{name:'商品／優惠',exact:true}).waitFor();
  await page.getByRole('button',{name:'店家資料',exact:true}).click();await page.locator('input[name=name]').waitFor();
  await page.evaluate(()=>{window.holdUpload=true;});await picker.setInputFiles({name:'image.png',mimeType:'image/png',buffer:pixel});
  await page.waitForFunction(()=>typeof window.releaseUpload==='function');
  assert.equal(await page.getByRole('button',{name:'重新載入',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'確認儲存',exact:true}).isDisabled(),true);
  await page.evaluate(async()=>{window.testToken='';window.releaseUpload();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  assert.equal(await page.locator('input[name=image_url]').inputValue(),'');
  assert.equal(writes.length,2);assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log(JSON.stringify({passed:true,widths:[320,390,1440],retrySameRequest:true,externalRequests:blocked.length,screenshots:out}));
}finally{await browser.close();}
