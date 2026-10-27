import test from 'node:test';
import assert from 'node:assert/strict';
import {createListingFixture,OWNER,ADMIN,SHOP,PRODUCT} from './fixtures/store-listing-catalog.mjs';
import {allowListing} from './fixtures/store-listing-review.mjs';
import {checkRewardOnlyAction} from '../worker/reward-only-cashier.mjs';
const setRole=(f,role)=>f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role,OWNER);
const store=extra=>({name:'合成贈點單位',description:'一般生活服務',phone:'0223456789',address:'合成路1號',status:'active',version:0,...extra});
const product=extra=>({title:'生活展示商品',description:'一般生活商品',price_cents:10000,redeem_type:'none',redeem_value:0,purchase_mode:'in_store',status:'active',request_key:crypto.randomUUID(),...extra});
const snapshot=f=>JSON.stringify(['users','store_shop_stores','store_shop_products','store_admin_product_audit','store_catalog_admin_audit'].map(table=>f.sql.prepare('SELECT * FROM '+table).all()));

for(const role of ['reward','贈點用戶','REWARD']){
 test(role+' retains gift-only authority while retail management and publication are denied without writes',async t=>{
  const f=createListingFixture({existing:true});t.after(f.close);setRole(f,role);
  const before=snapshot(f);
  for(const path of ['/manage','/sales','/product-ocr','/store-ai-draft'])assert.equal((await f.call(path,path.includes('ocr')||path.includes('draft')?{}:undefined)).http,403,path);
  for(const [path,data]of [['/store',store({version:1,owner_uid:ADMIN,role:'store'})],['/product',product()],['/product',product({id:PRODUCT,version:1})]])assert.equal((await f.call(path,data)).http,403,path);
  assert.equal((await f.call('?shop='+SHOP)).http,404);
  assert.equal((await f.call('')).shops.length,0);assert.equal((await f.call('/products')).products.length,0);assert.equal((await f.call('/products?id='+PRODUCT)).http,404);
  assert.equal((await f.call('/manage',undefined,null)).http,401);
  assert.equal(snapshot(f),before);assert.equal(f.state.providerCalls,0,'ineligible plan is rejected before AI review');
  const gift={mode:'reward',deductPoints:0,customerUserId:'U'+'b'.repeat(32),rewardScanToken:'rwd_'+'a'.repeat(64)};
  assert.equal(checkRewardOnlyAction('storeAdjustCustomerPoints',gift),'');
  for(const extra of [{mode:'redeem'},{deductPoints:1},{productId:PRODUCT}])assert.ok(checkRewardOnlyAction('storeAdjustCustomerPoints',{...gift,...extra}));
  assert.equal(f.sql.prepare('SELECT points FROM users WHERE line_id=?').get(OWNER).points,500);
 });
 test(role+' cannot gain retail rights through administrator catalog or product upload',async t=>{
  const f=createListingFixture({existing:true});t.after(f.close);setRole(f,role);f.sql.prepare("UPDATE store_shop_products SET status='draft'").run();
  const before=snapshot(f);
  assert.equal((await f.call('/admin/catalog?shop='+SHOP,undefined,ADMIN)).http,403);
  assert.deepEqual((await f.call('/admin/catalog?queue=draft',undefined,ADMIN)).products,[]);
  const edit={type:'product',id:PRODUCT,shop_id:SHOP,shop_version:1,version:1,request_key:crypto.randomUUID(),changes:{status:'active'}};
  assert.equal((await f.call('/admin/catalog',edit,ADMIN)).http,403);
  assert.equal((await f.call('/admin/products',{...product(),shop_id:SHOP,shop_version:1},ADMIN)).http,403);
  assert.equal(snapshot(f),before);assert.equal(f.state.providerCalls,0);
 });
}
for(const operation of ['create-store','update-store','create-product','update-product'])test('changing full plan to reward during '+operation+' rejects the stale write atomically',async t=>{
 const existing=operation!=='create-store',f=createListingFixture({existing});t.after(f.close);
 if(operation==='create-product')f.sql.prepare("UPDATE store_shop_products SET status='archived'").run();
 const before=JSON.stringify([f.sql.prepare('SELECT * FROM store_shop_stores').all(),f.sql.prepare('SELECT * FROM store_shop_products').all()]);
 f.state.review=()=>{setRole(f,'reward');return allowListing();};
 const result=await f.call(operation.includes('store')?'/store':'/product',operation.includes('store')?store({version:existing?1:0}):product(operation==='update-product'?{id:PRODUCT,version:1}:{}));
 assert.notEqual(result.http,200);assert.equal((await f.call('/manage')).http,403);
 assert.equal(JSON.stringify([f.sql.prepare('SELECT * FROM store_shop_stores').all(),f.sql.prepare('SELECT * FROM store_shop_products').all()]),before);
});
