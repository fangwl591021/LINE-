// Isolated localhost/SQLite acceptance; never uses production data or credentials.
const {createServer}=require('node:http'),{DatabaseSync}=require('node:sqlite');
const {readFileSync,mkdirSync,writeFileSync}=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
async function main(){
  const {handleStoreShop}=await import('../../worker/store-shop.mjs');
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON;CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT);');
  for(const f of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0064_store_product_shipping.sql'])sql.exec(readFileSync(path.resolve('migrations',f),'utf8'));
  const shopId='11111111-1111-4111-8111-111111111111';sql.prepare('INSERT INTO users VALUES(?,?)').run('test-owner','store');
  sql.prepare('INSERT INTO store_shop_stores(id,owner_uid,name,category,status,updated_at) VALUES(?,?,?,?,?,?)').run(shopId,'test-owner','合成數位服務公司','服務','active','2026-10-11');
  const put=(id,title,category='購',mode='in_store',redeem='percent')=>sql.prepare('INSERT INTO store_shop_products(id,shop_id,title,description,category,purchase_mode,redeem_type,redeem_value,price_cents,status,updated_at,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,shopId,title,'合成展示資料，沒有真實交易',category,mode,redeem,redeem==='percent'?50:0,1180000,'active','2026-10-11','fixture-'+id);
  put('a-massage','光動能按摩機');put('b-online','網購展示商品','','online','none');put('c-hostile','<img src=x onerror=alert(1)> 虛構商品');
  for(let i=0;i<42;i++)put('z'+String(i).padStart(3,'0'),'分頁展示商品 '+i);
  const before=sql.prepare('SELECT total_changes() n').get().n;
  const db={prepare(q){return {bind(...a){return {async all(){return {results:sql.prepare(q).all(...a)};},async first(){return sql.prepare(q).get(...a)||null;}};}};}};
  const files=new Set(['js/modules/store-shop.js','js/modules/store-points-home.js','css/store-shop.css','assets/points-logo-transparent-20260916.png']);
  let base;const server=createServer(async(req,res)=>{try{
    const url=new URL(req.url,base),file=url.pathname.slice(1);
    if(url.pathname==='/'){
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>商品探索・隔離測試</title><link rel="stylesheet" href="/css/store-shop.css"><body style="margin:0"><main id="public-store-shop"></main><script>window.Config={WORKER_URL:location.origin};window.requestIdleCallback=()=>0;</script><script src="/js/modules/store-shop.js"></script></body></html>');return;
    }
    if(files.has(file)){res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/png');res.end(readFileSync(path.resolve(file)));return;}
    if(url.pathname.startsWith('/v1/store-shop')){
      assert.equal(req.method,'GET','Discovery must never write');const response=await handleStoreShop(new Request(url,{method:req.method}),{ACTMASTER_DB:db},()=>{throw Error('External API forbidden');});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    res.writeHead(404);res.end();
  }catch(e){console.error(e);res.writeHead(500);res.end('Fixture error');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});const output=path.resolve('.wrangler/product-discovery-qa');mkdirSync(output,{recursive:true});
  const errors=[],external=[],results=[];
  try{
    for(const width of [320,390,1280]){
      const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',async route=>{if(!route.request().url().startsWith(base+'/')){external.push(route.request().url());await route.abort();}else await route.continue();});
      await page.goto(base);await page.getByRole('button',{name:'探索商品 ›',exact:false}).click();await page.locator('[data-form=product-search]').waitFor();
      await page.getByRole('group',{name:'跨店商品分類篩選'}).getByRole('button',{name:'購物商品',exact:true}).click();
      await page.getByRole('textbox',{name:'搜尋商品名稱、介紹或店名'}).fill('按摩');await page.getByRole('button',{name:'搜尋商品',exact:true}).click();
      await page.locator('[data-discovered-product]').waitFor();assert.equal(await page.locator('[data-discovered-product]').count(),1);
      assert.match(await page.locator('[data-discovered-product]').innerText(),/光動能按摩機[\s\S]*合成數位服務公司[\s\S]*50%/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No responsive overflow');
      await page.screenshot({path:path.join(output,'search-'+width+'.png'),fullPage:true});
      await page.getByRole('button',{name:'商品詳情',exact:true}).click();await page.getByRole('heading',{name:'光動能按摩機',exact:true}).waitFor();
      assert.match(await page.locator('.shop-product-detail').innerText(),/限店內購買/);
      await page.getByRole('button',{name:'返回商品探索',exact:false}).click();await page.locator('[data-form=product-search]').waitFor();assert.equal(await page.getByRole('textbox',{name:'搜尋商品名稱、介紹或店名'}).inputValue(),'按摩');
      await page.getByRole('textbox',{name:'搜尋商品名稱、介紹或店名'}).fill('');await page.getByRole('button',{name:'搜尋商品',exact:true}).click();
      await page.getByRole('group',{name:'跨店商品分類篩選'}).getByRole('button',{name:'未分類',exact:true}).click();await page.locator('[data-discovered-product]').waitFor();assert.equal(await page.locator('[data-discovered-product]').count(),1);
      await page.getByRole('button',{name:'商品詳情',exact:true}).click();await page.getByRole('heading',{name:'網購展示商品'}).waitFor();const login=page.getByRole('link',{name:'登入後線上選購'});assert.equal(await login.isVisible(),true);
      await page.getByRole('button',{name:'返回商品探索',exact:false}).click();await page.locator('[data-form=product-search]').waitFor();
      await page.getByRole('group',{name:'跨店商品分類篩選'}).getByRole('button',{name:'全部',exact:true}).click();await page.locator('[data-discovered-product]').first().waitFor();
      await page.getByLabel('購買方式').selectOption('online');await page.waitForFunction(()=>document.querySelectorAll('[data-discovered-product]').length===1);
      await page.getByLabel('只看可折抵商品').check();await page.getByText('沒有符合條件的已上架商品。',{exact:false}).waitFor();
      await page.getByLabel('只看可折抵商品').uncheck();await page.getByLabel('購買方式').selectOption('');await page.waitForFunction(()=>document.querySelectorAll('[data-discovered-product]').length===40);
      const ids=await page.locator('[data-discovered-product]').evaluateAll(a=>a.map(n=>n.dataset.discoveredProduct));await page.getByRole('button',{name:'下一頁商品',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-discovered-product]').length===5);
      const next=await page.locator('[data-discovered-product]').evaluateAll(a=>a.map(n=>n.dataset.discoveredProduct));assert.equal(new Set([...ids,...next]).size,45);
      await page.getByRole('navigation',{name:'探索方式'}).getByRole('button',{name:'找店家',exact:true}).click();await page.locator('.shop-discovery-grid').waitFor();
      await page.getByRole('group',{name:'店家業種篩選'}).getByRole('button',{name:'購物零售',exact:true}).click();await page.getByText('目前沒有符合條件的已上架店家。',{exact:true}).waitFor();
      await page.getByRole('group',{name:'店家業種篩選'}).getByRole('button',{name:'專業服務',exact:true}).click();await page.getByRole('button',{name:'進入商城',exact:true}).click();await page.getByRole('heading',{name:'合成數位服務公司',exact:true}).waitFor();
      assert.equal(await page.locator('img[src=x]').count(),0,'Untrusted product text is not executable markup');
      if(width===1280){
        // A failed list is retriable and late discovery results cannot replace a store view.
        let failOnce=true;
        const pattern='**/v1/store-shop/products?*';
        await page.route(pattern,async route=>{if(failOnce){failOnce=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'合成失敗'})});}else await route.continue();});
        await page.getByRole('navigation',{name:'商城導覽'}).getByRole('button',{name:'找商品',exact:true}).click();await page.getByText('商品暫時無法載入，原資料未變動。').waitFor();
        await page.getByRole('button',{name:'重新載入商品',exact:true}).click();await page.locator('[data-form=product-search]').waitFor();await page.unroute(pattern);
        await page.route('**/v1/store-shop/products?id=*',route=>route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({success:false,error:'商品已下架'})}));
        await page.getByRole('button',{name:'商品詳情',exact:true}).first().click();await page.getByText('商品已下架',{exact:true}).waitFor();assert.equal(await page.locator('.shop-product-detail').count(),0);await page.unroute('**/v1/store-shop/products?id=*');
        await page.getByRole('button',{name:'返回商品探索',exact:false}).click();await page.locator('[data-form=product-search]').waitFor();
        let release,notify;const requested=new Promise(resolve=>notify=resolve);
        await page.route(pattern,async route=>{release=()=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,products:[],next:''})});notify();});
        await page.getByRole('navigation',{name:'商城導覽'}).getByRole('button',{name:'找商品',exact:true}).click();await requested;
        await page.getByRole('navigation',{name:'探索方式'}).getByRole('button',{name:'找店家',exact:true}).click();await page.locator('.shop-discovery-grid').waitFor();await release();await page.unroute(pattern);
        assert.equal(await page.locator('[data-form=product-search]').count(),0);assert.equal(await page.locator('[data-form=search]').count(),1);
      }
      results.push({width,independentProductSearch:true,unclassified:true,salesChannelAndRedeemFilters:true,pagination:45,oldStoreFlow:true,overflow:false});await page.close();
    }
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(sql.prepare('SELECT total_changes() n').get().n,before);
    writeFileSync(path.join(output,'result.json'),JSON.stringify({results,errors,externalRequests:external,rowsWrittenByBrowsing:0,productionWrites:0},null,2));console.log('PASS: 320/390/1280 product search, category, filters, detail/back, pagination, old store flow, XSS and zero writes.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));sql.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
