const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {Miniflare}=require(process.env.LISTING_MINIFLARE_MODULE);
const {buildSync}=require(process.env.LISTING_ESBUILD_MODULE);
(async()=>{
 const bundle=buildSync({entryPoints:['test/fixtures/store-listing-runtime.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-04-23',compatibilityFlags:[],d1Databases:{ACTMASTER_DB:'listing-isolated-db'},port:0});
 try{
  const db=await mf.getD1Database('ACTMASTER_DB');
  await db.exec("CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT);");await db.prepare('INSERT INTO users VALUES(?,?)').bind('U'+'a'.repeat(32),'store').run();
  for(const file of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0064_store_product_shipping.sql','0058_store_listing_reviews.sql'])for(const stmt of readFileSync('migrations/'+file,'utf8').replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.exec(stmt.replace(/\s+/g,' ')+';');
  const api=async(path,data,mode='allow')=>{const r=await mf.dispatchFetch('https://app.com/v1/store-shop'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json','X-Fixture-Mode':mode},...(data?{body:JSON.stringify(data)}:{})});return {http:r.status,...await r.json()};};
  const call=(data,mode)=>api('/store',data,mode);
  const input={name:'Runtime 咖啡店',description:'咖啡',status:'active',version:0,image_url:'https://img.example.com/card.png'};
  const passed=await call(input);assert.equal(passed.http,200,JSON.stringify(passed));assert.equal(passed.shop.version,1);
  assert.equal((await db.prepare('SELECT decision FROM store_listing_reviews').first()).decision,'allow');
  assert.equal((await call({...input,version:1})).http,200,'byte-hashed cached approval');
  await db.exec('DELETE FROM store_listing_review_usage;');assert.equal((await call({...input,name:'待人工',version:2},'manual')).code,'LISTING_REVIEW_REQUIRED');
  assert.equal((await db.prepare('SELECT name,version FROM store_shop_stores').first()).version,2);
  await db.exec('DELETE FROM store_listing_review_usage;');assert.equal((await call({...input,name:'服務失敗',version:2},'error')).http,503);
  assert.equal((await call({...input,version:2,description:'販售電子菸'})).code,'LISTING_POLICY_REJECTED');
  assert.equal((await call({...input,version:2,status:'draft',description:'未公開草稿'},'no-key')).http,200);
  await db.prepare("UPDATE users SET role='redeem'").run();await db.exec('DELETE FROM store_listing_review_usage;');
  const shop=(await call({...input,name:'折抵展示公司',version:3,phone:'0223456789',address:'合成路1號'})).shop;
  const p={title:'折抵單位展示商品',description:'一般生活商品',price_cents:10000,redeem_type:'none',redeem_value:0,purchase_mode:'in_store',status:'draft',request_key:crypto.randomUUID()};
  const draft=await api('/product',p);assert.equal(draft.http,200,JSON.stringify(draft));assert.equal(draft.product_limit,1);
  const unredeemable=await api('/product',{...draft.products[0],status:'active'});assert.equal(unredeemable.http,400);assert.match(unredeemable.error,/折抵政策/);
  assert.equal((await db.prepare('SELECT status FROM store_shop_products WHERE id=?').bind(draft.products[0].id).first()).status,'draft');
  assert.equal((await api('/product',{...p,request_key:crypto.randomUUID()})).http,400);
  const online=await api('/product',{...draft.products[0],purchase_mode:'online',shipping_fee_cents:100,redeem_type:'percent',redeem_value:50});assert.equal(online.http,200,JSON.stringify(online));
  await db.exec('DELETE FROM store_listing_review_usage;');const published=await api('/product',{...online.products[0],status:'active'});assert.equal(published.http,200,JSON.stringify(published));
  const pub=await api('?shop='+shop.id);assert.equal(pub.shop.merchant_enabled,1);assert.equal(pub.shop.phone,'0223456789');assert.equal(pub.products.length,1);
  assert.equal((await api('/products?q='+encodeURIComponent(p.title))).products.length,1);
  await api('/product',{...published.products[0],status:'archived'});
  const concurrent=await Promise.all([1,2].map(n=>api('/product',{...p,title:'替換商品'+n,request_key:crypto.randomUUID()})));assert.equal(concurrent.filter(r=>r.http===200).length,1);
  assert.equal((await api('/manage')).product_count,1);
  await db.prepare("UPDATE users SET role='store'").run();
  for(let n=0;n<18;n++)assert.equal((await api('/product',{...p,title:'完整版草稿'+n,request_key:crypto.randomUUID()})).http,200);
  assert.equal((await api('/manage')).product_count,19);
  const fullRace=await Promise.all([1,2].map(n=>api('/product',{...p,title:'最後名額'+n,request_key:crypto.randomUUID()})));
  assert.deepEqual(fullRace.map(r=>r.http).sort(),[200,400]);
  assert.equal((await api('/manage')).product_limit,20);assert.equal((await api('/manage')).product_count,20);
  assert.equal((await api('/product',{...p,title:'第二十一項',request_key:crypto.randomUUID()})).http,400);
  for(const role of ['reward','贈點用戶','user']){
   await db.prepare('UPDATE users SET role=?').bind(role).run();
   const before=await db.prepare('SELECT * FROM store_shop_products ORDER BY id').all();
   assert.equal((await api('/manage')).http,403);
   assert.equal((await call({...input,name:'不可上架',version:4})).http,403);
   assert.equal((await api('/product',{...p,request_key:crypto.randomUUID()})).http,403);
   assert.equal((await api('?shop='+shop.id)).http,404);
   assert.equal((await api('/products')).products.length,0);
   assert.deepEqual((await db.prepare('SELECT * FROM store_shop_products ORDER BY id').all()).results,before.results);
  }
  await db.prepare("UPDATE users SET role='tenant'").run();assert.equal((await api('/manage')).http,403);
  console.log('WORKERD PASS: compatibility 2026-04-23 flags=[], D1 AI review/audit, redeem online+redemption/one item/concurrent quota/public phone/address, full-plan20/final-slot race, reward/user denied while historical data retained, revocation; no external calls');
 }finally{await mf.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
