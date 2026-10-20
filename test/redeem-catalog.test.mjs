import test from 'node:test';
import assert from 'node:assert/strict';
import {createListingFixture,OWNER,ADMIN,SHOP,PRODUCT} from './fixtures/store-listing-catalog.mjs';
import {allowListing} from './fixtures/store-listing-review.mjs';
import {listingCategories} from '../worker/store-listing-review.mjs';
import {checkRedeemOnlyAction} from '../worker/redeem-only-cashier.mjs';
const store=extra=>({name:'合成生活公司',description:'生活商品與合作服務',phone:'0223456789',address:'台北市合成路1號',status:'active',version:0,...extra});
const product=extra=>({title:'生活展示商品',description:'一般生活用商品',price_cents:10000,redeem_type:'none',redeem_value:0,purchase_mode:'in_store',category:'購',status:'active',request_key:crypto.randomUUID(),...extra});
const role=(f,value='redeem')=>f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(value,OWNER);
const rejection=(decision='reject')=>({decision,checked_categories:listingCategories,image_count:0,issues:[{category:'other',field:'description',evidence:'待核對的展示內容',reason:'合成審核：需確認此內容'}]});

for(const value of ['redeem','扣點用戶'])test(value+' owner isolation, no implicit store promotion or new cashier permissions',async t=>{
 const f=createListingFixture();t.after(f.close);role(f,value);
 const created=await f.call('/store',store({owner_uid:ADMIN,role:'store'}));assert.equal(created.http,200);
 assert.equal(f.sql.prepare('SELECT owner_uid FROM store_shop_stores').get().owner_uid,OWNER);
 f.resetUsage();const adminStore=await f.call('/store',store({name:'其他店家'}),ADMIN);assert.equal(adminStore.http,200);
 f.resetUsage();const other=await f.call('/product',product(),ADMIN);assert.equal(other.http,200);
 assert.equal((await f.call('/product',{...other.products[0],title:'越權修改'})).http,409);
 assert.equal((await f.call('/admin/catalog?shop='+adminStore.shop.id,undefined,OWNER)).http,403);
 assert.equal((await f.call('/manage',undefined,null)).http,401);
 assert.equal(f.sql.prepare('SELECT role FROM users WHERE line_id=?').get(OWNER).role,value);
 assert.equal(checkRedeemOnlyAction('storeAdjustCustomerPoints',{mode:'redeem'}),'');
 for(const payload of [{mode:'reward'},{mode:'redeem',rewardPoints:100},{mode:'redeem',productId:PRODUCT}])assert.ok(checkRedeemOnlyAction('storeAdjustCustomerPoints',payload));
});

for(const mode of ['reject','manual','error'])test('redeem catalog '+mode+' review never publishes or overwrites a product',async t=>{
 const f=createListingFixture({existing:true});t.after(f.close);role(f);
 const before=JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_products').all());
 f.state.review=()=>mode==='error'?new Response('',{status:500}):rejection(mode);
 const result=await f.call('/product',product({id:PRODUCT,version:1,description:'待核對的展示內容',review:{decision:'allow'}}));
 assert.equal(result.http,mode==='error'?503:422);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_products').all()),before);
 assert.equal(f.sql.prepare('SELECT role FROM users WHERE line_id=?').get(OWNER).role,'redeem');
});

for(const operation of ['create-store','update-store','create-product','update-product'])test('role revoked during review blocks '+operation+' at the atomic write',async t=>{
 const existing=operation!=='create-store',f=createListingFixture({existing});t.after(f.close);role(f);
 if(operation==='create-product')f.sql.prepare("UPDATE store_shop_products SET status='archived'").run();
 const beforeStores=JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_stores').all()),beforeProducts=JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_products').all());
 f.state.review=()=>{role(f,'reward');return allowListing();};
 const result=await f.call(operation.includes('store')?'/store':'/product',operation.includes('store')?store({version:existing?1:0}):product(operation==='update-product'?{id:PRODUCT,version:1}:{}));
 assert.notEqual(result.http,200);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_stores').all()),beforeStores);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_products').all()),beforeProducts);
 assert.equal((await f.call('/manage')).http,403);
});

test('an in-flight store request cannot retain unlimited online privilege after changing to redeem',async t=>{
 const f=createListingFixture({existing:true});t.after(f.close);f.sql.prepare("UPDATE store_shop_products SET status='archived'").run();
 f.state.review=()=>{role(f);return allowListing();};
 assert.notEqual((await f.call('/product',product({purchase_mode:'online'}))).http,200);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM store_shop_products WHERE status!='archived'").get().n,0);
});

test('existing administrator catalog supports redeem owners but keeps one-item, no-online and audit guards',async t=>{
 const f=createListingFixture({existing:true});t.after(f.close);role(f);f.sql.prepare("UPDATE store_shop_products SET status='draft'").run();
 const view=await f.call('/admin/catalog?shop='+SHOP,undefined,ADMIN);assert.equal(view.http,200);assert.equal(view.online_product_allowed,false);
 assert.equal((await f.call('/admin/catalog?queue=draft',undefined,ADMIN)).products[0].id,PRODUCT);
 const edit=changes=>({type:'product',id:PRODUCT,shop_id:SHOP,shop_version:1,version:1,request_key:crypto.randomUUID(),changes});
 assert.equal((await f.call('/admin/catalog',edit({purchase_mode:'online'}),ADMIN)).http,403);
 assert.equal((await f.call('/admin/products',{...product(),shop_id:SHOP,shop_version:1},ADMIN)).http,409);
 assert.equal((await f.call('/admin/catalog',edit({status:'archived'}),ADMIN)).http,200);
 const saved=await f.call('/admin/products',{...product({status:'draft'}),shop_id:SHOP,shop_version:1},ADMIN);assert.equal(saved.http,200);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM store_shop_products WHERE status!='archived'").get().n,1);
 assert.equal(f.count('store_admin_product_audit'),1);assert.equal(f.count('store_catalog_admin_audit'),1);
 assert.equal(f.sql.prepare('SELECT role FROM users WHERE line_id=?').get(OWNER).role,'redeem');
});
