import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createListingFixture,OWNER,ADMIN,SHOP,PRODUCT} from './fixtures/store-listing-catalog.mjs';
import {normalizeProduct} from '../worker/store-shop.mjs';
import {handleStoreCommerce} from '../worker/store-commerce.mjs';
const feeMigration=readFileSync(new URL('../migrations/0064_store_product_shipping.sql',import.meta.url),'utf8');
function fixture(t){
 const f=createListingFixture({existing:true});t.after(()=>f.close());
 for(const file of ['0034_store_commerce.sql','0037_store_buyer_profiles.sql','0038_store_buyer_delivery.sql','0062_store_commerce_points.sql'])f.sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 f.sql.exec("UPDATE store_shop_products SET purchase_mode='online';");
 f.sql.prepare("INSERT INTO store_commerce_settings(shop_id,enabled,bank_name,bank_code,bank_account,bank_holder,shipping_fee_cents,free_shipping_cents,updated_at) VALUES(?,1,'合成銀行','004','123456','合成戶名',6000,0,'now')").run(SHOP);
 const cart=extra=>({shipping_rule_version:2,shop_id:SHOP,items:[{id:PRODUCT,quantity:1}],payment_method:'REMITTANCE',points_used:0,buyer:{name:'合成買家',phone:'0912345678',email:''},customer:{name:'合成收件人',phone:'0912345678',carrier:'POST',postal_code:'',city:'台北市',district:'中正區',address:'合成路1號',store_info:'',note:''},...extra});
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
test('same-shop products charge one fee once regardless of products or quantities',async t=>{
 const f=fixture(t);f.sql.prepare('UPDATE store_shop_products SET shipping_fee_cents=5000 WHERE id=?').run(PRODUCT);f.add('second',5000);
 const data=f.cart({items:[{id:PRODUCT,quantity:2},{id:'second',quantity:3}],shipping_fee_cents:1,total_cents:1});
 const q=await f.call('/quote',data);assert.equal(q.http,200,q.error);assert.equal(q.snapshot.shipping_fee_cents,5000);assert.equal(q.snapshot.shipping_rule_version,2);
 assert.deepEqual(q.snapshot.items.map(i=>i.configured_shipping_fee_cents),[5000,5000]);
 for(const item of q.snapshot.items){assert.equal('shipping_fee_cents' in item,false);assert.equal('line_shipping_fee_cents' in item,false);}
 f.sql.exec('UPDATE store_commerce_settings SET free_shipping_cents=1');
 assert.equal((await f.call('/quote',data)).snapshot.shipping_fee_cents,5000,'legacy threshold must not erase explicit fees');
 assert.equal(f.count('store_commerce_orders'),0);assert.equal(f.count('store_commerce_point_operations'),0);
});
test('mixed legacy and explicit fees must agree after the legacy threshold; no charges are added together',async t=>{
 const f=fixture(t);f.add('legacy',null);f.add('explicit',6000);
 const data=f.cart({items:[{id:PRODUCT,quantity:2},{id:'legacy',quantity:3},{id:'explicit',quantity:2}]});
 const q=await f.call('/quote',data);assert.equal(q.http,200,q.error);assert.equal(q.snapshot.shipping_fee_cents,6000);
 f.sql.exec('UPDATE store_commerce_settings SET free_shipping_cents=1');
 const mismatch=await f.call('/quote',data);assert.equal(mismatch.http,409);assert.match(mismatch.error,/運費設定不一致/);
 assert.equal(f.count('store_commerce_orders'),0);
});
test('zero is free, NULL uses the legacy fee and legacy free threshold does not apply to explicit fees',async t=>{
 const f=fixture(t);f.add('legacy',null);f.add('free',0);
 const twoLegacy=f.cart({items:[{id:PRODUCT,quantity:4},{id:'legacy',quantity:2}]});
 assert.equal((await f.call('/quote',twoLegacy)).snapshot.shipping_fee_cents,6000);
 const mixed=f.cart({items:[{id:PRODUCT,quantity:4},{id:'free',quantity:2}]});
 assert.equal((await f.call('/quote',mixed)).http,409,'NULL without legacy threshold is not zero');
 f.sql.exec('UPDATE store_commerce_settings SET free_shipping_cents=1');
 const free=await f.call('/quote',mixed);assert.equal(free.http,200,free.error);assert.equal(free.snapshot.shipping_fee_cents,0);
 f.sql.prepare('UPDATE store_shop_products SET shipping_fee_cents=0 WHERE id=?').run(PRODUCT);
 assert.equal((await f.call('/quote',mixed)).snapshot.shipping_fee_cents,0,'all explicitly free remains free');
});
test('different per-item shipping or free versus paid refuse checkout until unified; pickup remains free',async t=>{
 const f=fixture(t);f.sql.prepare('UPDATE store_shop_products SET shipping_fee_cents=5000 WHERE id=?').run(PRODUCT);f.add('other',6000);f.add('free',0);
 for(const second of ['other','free']){
  const data=f.cart({items:[{id:PRODUCT,quantity:9},{id:second,quantity:1}]});
  const q=await f.call('/quote',data);assert.equal(q.http,409);assert.match(q.error,/運費設定不一致/);
  assert.equal((await f.call('/orders',{...data,quote_hash:'0'.repeat(64),request_key:crypto.randomUUID()})).http,409);
 }
 f.sql.exec("UPDATE store_shop_stores SET address='合成路1號',phone='0223456789'");
 const pickup=f.cart({items:[{id:PRODUCT,quantity:9},{id:'other',quantity:2},{id:'free',quantity:1}],customer:{name:'合成收件人',phone:'0912345678',carrier:'PICKUP'}});
 const q=await f.call('/quote',pickup);assert.equal(q.http,200,q.error);assert.equal(q.snapshot.shipping_fee_cents,0);assert.equal(f.count('store_commerce_orders'),0);
});
test('old clients cannot create new orders, old quotes expire and successful requests replay without a new marker',async t=>{
 const f=fixture(t),data=f.cart(),q=await f.call('/quote',data);assert.equal(q.http,200,q.error);
 const unmarked={...data};delete unmarked.shipping_rule_version;
 for(const version of [undefined,1,3,'2']){
  const outdated={...unmarked,...(version===undefined?{}:{shipping_rule_version:version})};
  const stale=await f.call('/quote',outdated);assert.equal(stale.http,426);assert.match(stale.error,/我的網路訂單查核/);assert.match(stale.error,/重新整理/);
  const noOrder=await f.call('/orders',{...outdated,quote_hash:q.quote_hash,request_key:crypto.randomUUID()});assert.equal(noOrder.http,426);assert.equal(f.count('store_commerce_orders'),0);
 }
 const s=q.snapshot;
 const items=s.items.map(i=>({id:i.id,title:i.title,price_cents:i.price_cents,version:i.version,redeem_type:i.redeem_type,redeem_value:i.redeem_value,shipping_fee_cents:i.configured_shipping_fee_cents,quantity:i.quantity,line_total_cents:i.line_total_cents,max_points:i.max_points,line_shipping_fee_cents:i.configured_shipping_fee_cents==null?null:i.configured_shipping_fee_cents*i.quantity}));
 const previousSnapshot={shop_id:s.shop_id,shop_name:s.shop_name,shop_version:s.shop_version,settings_version:s.settings_version,buyer_name:s.buyer_name,buyer:s.buyer,items,customer:s.customer,payment_method:s.payment_method,points_used:s.points_used,max_points:s.max_points,discount_cents:s.discount_cents,subtotal_cents:s.subtotal_cents,shipping_fee_cents:s.shipping_fee_cents,legacy_shipping_fee_cents:s.shipping_fee_cents,total_cents:s.total_cents,bank:s.bank};
 const oldHash=createHash('sha256').update(JSON.stringify({buyer:OWNER,pointIdentity:'',snapshot:previousSnapshot})).digest('hex');
 assert.notEqual(oldHash,q.quote_hash);
 const oldQuote=await f.call('/orders',{...data,quote_hash:oldHash,request_key:crypto.randomUUID()});assert.equal(oldQuote.http,409);assert.equal(f.count('store_commerce_orders'),0);
 const key=crypto.randomUUID(),created=await f.call('/orders',{...data,quote_hash:q.quote_hash,request_key:key});assert.equal(created.http,200,created.error);
 const originalSnapshot=JSON.stringify(previousSnapshot);f.sql.prepare('UPDATE store_commerce_orders SET snapshot_json=? WHERE id=?').run(originalSnapshot,created.order.id);
 const replay=await f.call('/orders',{...unmarked,quote_hash:oldHash,request_key:key});assert.equal(replay.http,200);assert.equal(replay.order.id,created.order.id);assert.equal(JSON.stringify(replay.order.snapshot),originalSnapshot);
 const scoped=await f.call('/orders/lookup?request_key='+key);assert.equal(scoped.order.id,created.order.id);assert.equal(f.count('store_commerce_orders'),1);
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
