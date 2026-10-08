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
  for(const file of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0058_store_listing_reviews.sql'])for(const stmt of readFileSync('migrations/'+file,'utf8').replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean))await db.exec(stmt.replace(/\s+/g,' ')+';');
  const call=async(data,mode='allow')=>{const r=await mf.dispatchFetch('https://app.com/v1/store-shop/store',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json','X-Fixture-Mode':mode},body:JSON.stringify(data)});return {http:r.status,...await r.json()};};
  const input={name:'Runtime 咖啡店',description:'咖啡',status:'active',version:0,image_url:'https://img.example.com/card.png'};
  const passed=await call(input);assert.equal(passed.http,200,JSON.stringify(passed));assert.equal(passed.shop.version,1);
  assert.equal((await db.prepare('SELECT decision FROM store_listing_reviews').first()).decision,'allow');
  assert.equal((await call({...input,version:1})).http,200,'byte-hashed cached approval');
  await db.exec('DELETE FROM store_listing_review_usage;');assert.equal((await call({...input,name:'待人工',version:2},'manual')).code,'LISTING_REVIEW_REQUIRED');
  assert.equal((await db.prepare('SELECT name,version FROM store_shop_stores').first()).version,2);
  await db.exec('DELETE FROM store_listing_review_usage;');assert.equal((await call({...input,name:'服務失敗',version:2},'error')).http,503);
  assert.equal((await call({...input,version:2,description:'販售電子菸'})).code,'LISTING_POLICY_REJECTED');
  assert.equal((await call({...input,version:2,status:'draft',description:'未公開草稿'},'no-key')).http,200);
  console.log('WORKERD PASS: compatibility 2026-04-23 flags=[], D1 audit/quota, inline image/crypto/btoa, allow/cache/manual/error/reject/draft; no external calls');
 }finally{await mf.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
