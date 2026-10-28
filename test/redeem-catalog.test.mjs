import test from 'node:test';
import assert from 'node:assert/strict';
import {createListingFixture,OWNER,ADMIN,SHOP,PRODUCT} from './fixtures/store-listing-catalog.mjs';
import {allowListing} from './fixtures/store-listing-review.mjs';
import {listingCategories} from '../worker/store-listing-review.mjs';
import {handleStoreCommerce} from '../worker/store-commerce.mjs';
import {readFileSync} from 'node:fs';
import {checkRedeemOnlyAction} from '../worker/redeem-only-cashier.mjs';
const store=extra=>({name:'合成生活公司',description:'生活商品與合作服務',phone:'0223456789',address:'台北市合成路1號',status:'active',version:0,...extra});
const product=extra=>({title:'生活展示商品',description:'一般生活用商品',price_cents:10000,redeem_type:'percent',redeem_value:10,purchase_mode:'in_store',category:'購',status:'active',request_key:crypto.randomUUID(),...extra});
const role=(f,value='redeem')=>f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(value,OWNER);
const rejection=(decision='reject')=>({decision,checked_categories:listingCategories,image_count:0,issues:[{category:'other',field:'description',evidence:'待核對的展示內容',reason:'合成審核：需確認此內容'}]});

for(const value of ['redeem','扣點用戶'])test(value+' owner isolation and product redemption do not grant gifts or store promotion',async t=>{
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
 for(const payload of [{mode:'reward'},{mode:'redeem',rewardPoints:100},{mode:'redeem',autoBindPointAccount:true}])assert.ok(checkRedeemOnlyAction('storeAdjustCustomerPoints',payload));
 assert.equal(checkRedeemOnlyAction('storeAdjustCustomerPoints',{mode:'redeem',productId:PRODUCT,qrToken:'qr-safe'}),'');
 for(const action of ['getStoreShopRedemptionProduct','resolveStoreMemberProductQr'])assert.equal(checkRedeemOnlyAction(action,{}),'');
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
 f.state.review=()=>{role(f,'tenant');return allowListing();};
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

test('existing administrator catalog supports redeem online products while preserving one-item and audit guards',async t=>{
 const f=createListingFixture({existing:true});t.after(f.close);role(f);f.sql.prepare("UPDATE store_shop_products SET status='draft'").run();
 const view=await f.call('/admin/catalog?shop='+SHOP,undefined,ADMIN);assert.equal(view.http,200);assert.equal(view.online_product_allowed,true);
 assert.equal((await f.call('/admin/catalog?queue=draft',undefined,ADMIN)).products[0].id,PRODUCT);
 const edit=changes=>({type:'product',id:PRODUCT,shop_id:SHOP,shop_version:1,version:1,request_key:crypto.randomUUID(),changes});
 assert.equal((await f.call('/admin/catalog',edit({purchase_mode:'online'}),ADMIN)).http,200);
 assert.equal((await f.call('/admin/products',{...product(),shop_id:SHOP,shop_version:1},ADMIN)).http,409);
 assert.equal((await f.call('/admin/catalog',{...edit({status:'archived'}),version:2},ADMIN)).http,200);
 const saved=await f.call('/admin/products',{...product({status:'draft'}),shop_id:SHOP,shop_version:1},ADMIN);assert.equal(saved.http,200);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM store_shop_products WHERE status!='archived'").get().n,1);
 assert.equal(f.count('store_admin_product_audit'),1);assert.equal(f.count('store_catalog_admin_audit'),2);
 assert.equal(f.sql.prepare('SELECT role FROM users WHERE line_id=?').get(OWNER).role,'redeem');
});

for(const value of ['redeem','扣點用戶','REDEEM'])for(const source of ['owner','administrator'])test(value+' '+source+' saves explicit online redemption then public catalog and read-only checkout quote agree',async t=>{
 const f=createListingFixture({existing:source==='administrator'});t.after(f.close);role(f,value);
 for(const file of ['0034_store_commerce.sql','0037_store_buyer_profiles.sql','0038_store_buyer_delivery.sql','0062_store_commerce_points.sql'])f.sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const BUYER='U'+'b'.repeat(32),POINT='U'+'c'.repeat(32);
 f.sql.prepare("INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,'user','合成買家')").run(BUYER,BUYER);
 let shopId,productId;
 if(source==='owner'){
  const storeResult=await f.call('/store',store());assert.equal(storeResult.http,200);shopId=storeResult.shop.id;f.resetUsage();
  const result=await f.call('/product',product({price_cents:100000,shipping_fee_cents:8000,purchase_mode:'online',redeem_type:'percent',redeem_value:25}));assert.equal(result.http,200);productId=result.products[0].id;
 }else{
  shopId=SHOP;productId=PRODUCT;
  const result=await f.call('/admin/catalog',{type:'product',id:PRODUCT,shop_id:SHOP,shop_version:1,version:1,request_key:crypto.randomUUID(),changes:{price_cents:100000,shipping_fee_cents:8000,purchase_mode:'online',status:'active',redeem_type:'percent',redeem_value:25}},ADMIN);assert.equal(result.http,200);
 }
 const published=(await f.call('?shop='+shopId,undefined,null)).products[0];assert.equal(published.purchase_mode,'online');assert.equal(published.redeem_type,'percent');assert.equal(published.redeem_value,25);
 f.sql.prepare("INSERT INTO store_commerce_settings(shop_id,enabled,bank_name,bank_code,bank_account,bank_holder,shipping_fee_cents,free_shipping_cents,updated_at) VALUES(?,1,'合成銀行','999','12345678','合成店家',0,0,'now')").run(shopId);
 const env={...f.env,STORE_COMMERCE_ENABLED:'true',STORE_COMMERCE_POINTS_ENABLED:'true'},wallet={reads:0,writes:0};
 const points={contract:{version:'commerce-ledger-v1',rawLedgerVerification:true,atMostOnceCallerRequired:true},async read(uid){assert.equal(uid,BUYER);wallet.reads++;return {identity:POINT,balance:500};},async lookup(){throw Error('Quote cannot query write receipts');},async adjust(){wallet.writes++;throw Error('Quote cannot change points');}};
 const cart={shop_id:shopId,payment_method:'REMITTANCE',points_used:200,items:[{id:productId,quantity:1}],buyer:{name:'合成買家',phone:'0912345678',email:''},customer:{name:'合成收件人',phone:'0912345678',carrier:'POST',city:'台北市',district:'中正區',address:'合成路1號'}};
 const quote=async input=>{const response=await handleStoreCommerce(new Request('https://app.com/v1/store-commerce/quote',{method:'POST',headers:{Authorization:'Bearer '+BUYER},body:JSON.stringify(input)}),env,async(url,options)=>{assert.equal(url,'https://api.line.me/v2/profile');assert.equal(options.headers.Authorization,'Bearer '+BUYER);return Response.json({userId:BUYER});},points);return {http:response.status,...await response.json()};};
 const users=JSON.stringify(f.sql.prepare('SELECT * FROM users ORDER BY row_id').all()),changes=f.sql.prepare('SELECT total_changes() n').get().n;
 const result=await quote(cart);assert.equal(result.http,200,result.error);assert.equal(result.snapshot.items[0].id,productId);assert.equal(result.snapshot.max_points,250);assert.equal(result.snapshot.points_used,200);assert.equal(result.snapshot.discount_cents,20000);assert.equal(result.snapshot.shipping_fee_cents,8000);assert.equal(result.snapshot.total_cents,88000);
 assert.equal((await quote({...cart,points_used:251})).http,400);assert.equal((await quote({...cart,customer:{name:'合成取貨人',phone:'0912345678',carrier:'PICKUP'}})).http,403);
 assert.equal(wallet.reads,1);assert.equal(wallet.writes,0);assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,changes);
 assert.equal(f.count('store_commerce_orders'),0);assert.equal(f.count('store_commerce_point_operations'),0);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM users ORDER BY row_id').all()),users);
});
