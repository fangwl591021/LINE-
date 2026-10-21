import test from 'node:test';
import assert from 'node:assert/strict';
import {createListingFixture,OWNER,ADMIN,SHOP,PRODUCT} from './fixtures/store-listing-catalog.mjs';
import {allowListing} from './fixtures/store-listing-review.mjs';
import {listingCategories} from '../worker/store-listing-review.mjs';
import {checkRewardOnlyAction} from '../worker/reward-only-cashier.mjs';
const setRole=(f,role)=>f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role,OWNER);
const store=extra=>({name:'合成贈點單位',description:'一般生活服務',phone:'0223456789',address:'合成路1號',status:'active',version:0,...extra});
const product=extra=>({title:'生活展示商品',description:'一般生活商品',price_cents:10000,redeem_type:'none',redeem_value:0,purchase_mode:'in_store',status:'active',request_key:crypto.randomUUID(),...extra});

for(const role of ['reward','贈點用戶']){
 test(role+' company edits and public discovery are catalog-only, never change identity or gifting authority',async t=>{
  const f=createListingFixture();t.after(f.close);setRole(f,role);
  const created=await f.call('/store',store({owner_uid:ADMIN,role:'store'}));assert.equal(created.http,200);assert.equal(created.product_limit,1);
  f.resetUsage();const edited=await f.call('/store',store({version:1,description:'提供客製生活禮盒與贈點活動資訊'}));assert.equal(edited.http,200);
  f.resetUsage();const saved=await f.call('/product',product());assert.equal(saved.http,200);
  const pub=await f.call('?shop='+created.shop.id);assert.equal(pub.shop.phone,'0223456789');assert.equal(pub.shop.address,'合成路1號');assert.equal(pub.shop.merchant_enabled,0);assert.equal(pub.products.length,1);
  assert.equal('owner_uid' in pub.shop,false);assert.equal((await f.call('/products?q='+encodeURIComponent('生活展示商品'))).products.length,1);
  assert.equal((await f.call('/products?redeem=1')).products.length,0);assert.equal((await f.call('/sales')).http,403);
  assert.equal((await f.call('/admin/catalog?shop='+created.shop.id)).http,403);assert.equal((await f.call('/manage',undefined,null)).http,401);
  assert.equal(f.sql.prepare('SELECT role FROM users WHERE line_id=?').get(OWNER).role,role);
  assert.equal(f.sql.prepare('SELECT points FROM users WHERE line_id=?').get(OWNER).points,500);
  const gift={mode:'reward',deductPoints:0,customerUserId:'U'+'b'.repeat(32),rewardScanToken:'rwd_'+'a'.repeat(64)};
  assert.equal(checkRewardOnlyAction('storeAdjustCustomerPoints',gift),'');
  for(const extra of [{mode:'redeem'},{deductPoints:1},{productId:PRODUCT}])assert.ok(checkRewardOnlyAction('storeAdjustCustomerPoints',{...gift,...extra}));
 });

 for(const mode of ['reject','manual','error'])test(role+' '+mode+' listing review never publishes a store or product',async t=>{
  const f=createListingFixture({existing:true});t.after(f.close);setRole(f,role);
  const before=JSON.stringify([f.sql.prepare('SELECT * FROM store_shop_stores').all(),f.sql.prepare('SELECT * FROM store_shop_products').all()]);
  f.state.review=()=>mode==='error'?new Response('',{status:500}):{decision:mode,checked_categories:listingCategories,image_count:0,issues:[{category:'other',field:'description',evidence:'待核對展示內容',reason:'合成審核須確認內容'}]};
  for(const [path,data] of [['/store',store({version:1,description:'待核對展示內容'})],['/product',product({id:PRODUCT,version:1,description:'待核對展示內容'})]]){
   f.resetUsage();assert.equal((await f.call(path,data)).http,mode==='error'?503:422);
   assert.equal(JSON.stringify([f.sql.prepare('SELECT * FROM store_shop_stores').all(),f.sql.prepare('SELECT * FROM store_shop_products').all()]),before);
  }
 });

 for(const operation of ['create-store','update-store','create-product','update-product'])test(role+' revoked during '+operation+' cannot save stale approval',async t=>{
  const existing=operation!=='create-store',f=createListingFixture({existing});t.after(f.close);setRole(f,role);
  if(operation==='create-product')f.sql.prepare("UPDATE store_shop_products SET status='archived'").run();
  const before=JSON.stringify([f.sql.prepare('SELECT * FROM store_shop_stores').all(),f.sql.prepare('SELECT * FROM store_shop_products').all()]);
  f.state.review=()=>{setRole(f,'tenant');return allowListing();};
  const result=await f.call(operation.includes('store')?'/store':'/product',operation.includes('store')?store({version:existing?1:0}):product(operation==='update-product'?{id:PRODUCT,version:1}:{}));
  assert.notEqual(result.http,200);assert.equal((await f.call('/manage')).http,403);
  assert.equal(JSON.stringify([f.sql.prepare('SELECT * FROM store_shop_stores').all(),f.sql.prepare('SELECT * FROM store_shop_products').all()]),before);
 });

 test(role+' existing admin catalog retains quota, no-online and atomic audits',async t=>{
  const f=createListingFixture({existing:true});t.after(f.close);setRole(f,role);f.sql.prepare("UPDATE store_shop_products SET status='draft'").run();
  assert.equal((await f.call('/admin/catalog?shop='+SHOP,undefined,ADMIN)).online_product_allowed,false);
  assert.equal((await f.call('/admin/catalog?queue=draft',undefined,ADMIN)).products[0].id,PRODUCT);
  const edit=changes=>({type:'product',id:PRODUCT,shop_id:SHOP,shop_version:1,version:1,request_key:crypto.randomUUID(),changes});
  assert.equal((await f.call('/admin/catalog',edit({purchase_mode:'online'}),ADMIN)).http,403);
  assert.equal((await f.call('/admin/products',{...product(),shop_id:SHOP,shop_version:1},ADMIN)).http,409);
  assert.equal((await f.call('/admin/catalog',edit({status:'archived'}),ADMIN)).http,200);
  assert.equal((await f.call('/admin/products',{...product({status:'draft'}),shop_id:SHOP,shop_version:1},ADMIN)).http,200);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM store_shop_products WHERE status!='archived'").get().n,1);
  assert.equal(f.count('store_admin_product_audit'),1);assert.equal(f.count('store_catalog_admin_audit'),1);
  assert.equal(f.sql.prepare('SELECT role FROM users WHERE line_id=?').get(OWNER).role,role);
 });
}
