import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createListingFixture,OWNER,ADMIN,SHOP,PRODUCT} from './fixtures/store-listing-catalog.mjs';
import {normalizeProduct} from '../worker/store-shop.mjs';
import {handleStoreCommerce} from '../worker/store-commerce.mjs';
const feeMigration=readFileSync(new URL('../migrations/0064_store_product_shipping.sql',import.meta.url),'utf8');
function fixture(t){
 const f=createListingFixture({existing:true});t.after(()=>f.close());
 for(const file of ['0034_store_commerce.sql','0037_store_buyer_profiles.sql','0038_store_buyer_delivery.sql','0062_store_commerce_points.sql'])f.sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 f.sql.exec("UPDATE store_shop_products SET purchase_mode='online';");
 f.sql.prepare("INSERT INTO store_commerce_settings(shop_id,enabled,bank_name,bank_code,bank_account,bank_holder,shipping_fee_cents,free_shipping_cents,updated_at) VALUES(?,1,'合成銀行','004','123456','合成戶名',6000,0,'now')").run(SHOP);
 const cart=extra=>({shop_id:SHOP,items:[{id:PRODUCT,quantity:1}],payment_method:'REMITTANCE',points_used:0,buyer:{name:'合成買家',phone:'0912345678',email:''},customer:{name:'合成收件人',phone:'0912345678',carrier:'POST',postal_code:'',city:'台北市',district:'中正區',address:'合成路1號',store_info:'',note:''},...extra});
 const call=async(path,data)=>{
  const r=await handleStoreCommerce(new Request('https://example.test/v1/store-commerce'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+OWNER},...(data?{body:JSON.stringify(data)}:{})}),{...f.env,STORE_COMMERCE_ENABLED:'true'},f.fetcher);
  return {http:r.status,...await r.json()};
 };
 const add=(id,fee)=>f.sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,status,purchase_mode,shipping_fee_cents,updated_at,request_key) VALUES(?,?,'其他合成商品',20000,'active','online',?,'now',?)").run(id,SHOP,fee,id);
 return {...f,cart,call,add};
}
test('additive shipping migration preserves every old column and enforces nullable integer bounds',()=>{
 const sql=new DatabaseSync(':memory:');
 try{
  sql.exec(readFileSync(new URL('../migrations/0029_store_shop_catalog.sql',import.meta.url),'utf8'));
  sql.exec("INSERT INTO store_shop_stores(id,owner_uid,name,updated_at)VALUES('s','u','合成店','now');INSERT INTO store_shop_products(id,shop_id,title,price_cents,updated_at,request_key)VALUES('p','s','舊品',100,'now','p');");
  const before={...sql.prepare('SELECT * FROM store_shop_products').get()};sql.exec(feeMigration);
  const {shipping_fee_cents,...after}=sql.prepare('SELECT * FROM store_shop_products').get();assert.equal(shipping_fee_cents,null);assert.deepEqual(after,before);
  for(const value of [-1,0.5,1000001])assert.throws(()=>sql.prepare('UPDATE store_shop_products SET shipping_fee_cents=?').run(value));
  for(const value of [0,1,1000000,null])sql.prepare('UPDATE store_shop_products SET shipping_fee_cents=?').run(value);
 }finally{sql.close();}
});
test('each product charges unit shipping times quantity, zero is free and legacy shop fee is not added',async t=>{
 const f=fixture(t);f.sql.prepare('UPDATE store_shop_products SET shipping_fee_cents=12000 WHERE id=?').run(PRODUCT);f.add('second',3500);f.add('free',0);
 const data=f.cart({items:[{id:PRODUCT,quantity:2},{id:'second',quantity:3},{id:'free',quantity:9}],shipping_fee_cents:1,total_cents:1});
 const q=await f.call('/quote',data);assert.equal(q.http,200,q.error);assert.equal(q.snapshot.shipping_fee_cents,34500);assert.equal(q.snapshot.legacy_shipping_fee_cents,0);
 assert.equal(q.snapshot.items.find(i=>i.id===PRODUCT).line_shipping_fee_cents,24000);assert.equal(q.snapshot.items.find(i=>i.id==='free').line_shipping_fee_cents,0);
 f.sql.exec('UPDATE store_commerce_settings SET free_shipping_cents=1');
 assert.equal((await f.call('/quote',data)).snapshot.shipping_fee_cents,34500,'old store threshold must not erase explicit fees');
 assert.equal(f.count('store_commerce_orders'),0);assert.equal(f.count('store_commerce_point_operations'),0);
});
test('legacy NULL still charges once per cart and mixed carts add explicit fees without double charging',async t=>{
 const f=fixture(t);f.add('second',null);f.add('explicit',5000);
 const data=f.cart({items:[{id:PRODUCT,quantity:2},{id:'second',quantity:3},{id:'explicit',quantity:2}]});
 const q=await f.call('/quote',data);assert.equal(q.http,200);assert.equal(q.snapshot.shipping_fee_cents,16000);assert.equal(q.snapshot.legacy_shipping_fee_cents,6000);
 f.sql.exec('UPDATE store_commerce_settings SET free_shipping_cents=1');
 const free=await f.call('/quote',data);assert.equal(free.snapshot.shipping_fee_cents,10000);assert.equal(free.snapshot.legacy_shipping_fee_cents,0);
});
test('shipping edits invalidate quotes and created snapshots stay immutable',async t=>{
 const f=fixture(t);f.sql.prepare('UPDATE store_shop_products SET shipping_fee_cents=8000 WHERE id=?').run(PRODUCT);
 const data=f.cart(),q=await f.call('/quote',data);
 f.sql.prepare('UPDATE store_shop_products SET shipping_fee_cents=10000,version=version+1 WHERE id=?').run(PRODUCT);
 assert.equal((await f.call('/orders',{...data,quote_hash:q.quote_hash,request_key:crypto.randomUUID()})).http,409);assert.equal(f.count('store_commerce_orders'),0);
 const fresh=await f.call('/quote',data),key=crypto.randomUUID(),order=await f.call('/orders',{...data,quote_hash:fresh.quote_hash,request_key:key});assert.equal(order.http,200,order.error);
 assert.equal(order.order.snapshot.shipping_fee_cents,10000);
 const snapshot=JSON.stringify(order.order.snapshot);
 f.sql.prepare('UPDATE store_shop_products SET shipping_fee_cents=0,version=version+1 WHERE id=?').run(PRODUCT);
 const history=await f.call('/orders');assert.equal(JSON.stringify(history.orders[0].snapshot),snapshot);
 const replay=await f.call('/orders',{...data,quote_hash:fresh.quote_hash,request_key:key});assert.equal(replay.order.id,order.order.id);
});
test('write-time shipping version race rejects an order before any points operation',async t=>{
 const f=fixture(t),q=await f.call('/quote',f.cart()),prepare=f.db.prepare.bind(f.db);let once=true;
 f.db.prepare=sql=>{if(once&&sql.startsWith('INSERT INTO store_commerce_orders')){once=false;f.sql.exec('UPDATE store_shop_products SET shipping_fee_cents=9000,version=version+1');}return prepare(sql);};
 const result=await f.call('/orders',{...f.cart(),quote_hash:q.quote_hash,request_key:crypto.randomUUID()});
 assert.equal(result.http,409);assert.equal(f.count('store_commerce_orders'),0);assert.equal(f.count('store_commerce_point_operations'),0);
});
test('owner fee-only saves do not re-review content, old clients preserve fee and cross-owner writes fail',async t=>{
 const f=createListingFixture({existing:true});t.after(()=>f.close());
 const p=(await f.call('/manage')).products[0];
 const saved=await f.call('/product',{...p,shipping_fee_cents:12345});assert.equal(saved.http,200,saved.error);assert.equal(saved.products[0].shipping_fee_cents,12345);assert.equal(f.state.providerCalls,0);
 const next=saved.products[0];delete next.shipping_fee_cents;
 const legacy=await f.call('/product',{...next,title:'更新合成咖啡'});assert.equal(legacy.http,200,legacy.error);assert.equal(legacy.products[0].shipping_fee_cents,12345);assert.equal(f.state.providerCalls,1);
 assert.equal((await f.call('/product',{...legacy.products[0],shipping_fee_cents:0},ADMIN)).http,400);
 for(const fee of [-1,0.1,'10',1000001])assert.throws(()=>normalizeProduct({...p,shipping_fee_cents:fee}));
});
test('admin shipping-only updates remain audited and idempotent; other content must still pass AI',async t=>{
 const f=createListingFixture({existing:true});t.after(()=>f.close());
 const data={type:'product',id:PRODUCT,shop_id:SHOP,shop_version:1,version:1,request_key:crypto.randomUUID(),changes:{shipping_fee_cents:6000}};
 assert.equal((await f.call('/admin/catalog',data,null)).http,401);
 const result=await f.call('/admin/catalog',data,ADMIN);assert.equal(result.http,200,result.error);
 assert.equal(f.state.providerCalls,0);assert.equal(f.count('store_catalog_admin_audit'),1);
 const replay=await f.call('/admin/catalog',data,ADMIN);assert.equal(replay.replayed,true);assert.equal(f.count('store_catalog_admin_audit'),1);
 f.state.review=(_body,count)=>({decision:'manual',checked_categories:['adult_industry','fraud','tobacco_alcohol','medical','crime','sexual','gambling','other'],image_count:count,issues:[{category:'other',field:'title',evidence:'新標題',reason:'合成測試須人工確認'}]});
 const changed=await f.call('/admin/catalog',{...data,version:2,request_key:crypto.randomUUID(),changes:{shipping_fee_cents:0,title:'新標題'}},ADMIN);
 assert.equal(changed.http,422);assert.equal(f.state.providerCalls,1);assert.equal(f.count('store_catalog_admin_audit'),1);
 assert.equal(f.sql.prepare('SELECT shipping_fee_cents FROM store_shop_products').get().shipping_fee_cents,6000);
});
test('delegated new product stores its own fee and validates bounds without changing other products',async t=>{
 const f=createListingFixture({existing:true});t.after(()=>f.close());
 const input={shop_id:SHOP,shop_version:1,request_key:crypto.randomUUID(),title:'合成新商品',description:'',image_url:'',price_cents:20000,category:'購',purchase_mode:'online',redeem_type:'none',redeem_value:0,shipping_fee_cents:9000,status:'draft'};
 const created=await f.call('/admin/products',input,ADMIN);assert.equal(created.http,200,created.error);
 assert.equal(f.sql.prepare('SELECT shipping_fee_cents FROM store_shop_products WHERE id=?').get(created.product_id).shipping_fee_cents,9000);
 assert.equal(f.sql.prepare('SELECT shipping_fee_cents FROM store_shop_products WHERE id=?').get(PRODUCT).shipping_fee_cents,null);
 assert.equal((await f.call('/admin/products',input,ADMIN)).product_id,created.product_id);
 for(const fee of [-1,0.5,'60',1000001])assert.equal((await f.call('/admin/products',{...input,request_key:crypto.randomUUID(),shipping_fee_cents:fee},ADMIN)).http,400);
 assert.equal(f.count('store_shop_products'),2);assert.equal(f.count('store_admin_product_audit'),1);
});
