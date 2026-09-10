import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreCommerce} from '../worker/store-commerce.mjs';

const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32),D='U'+'d'.repeat(32);
function fixture(t) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT,name TEXT);');
  for(const [uid,role,name] of [[A,'store','甲店長'],[B,'admin','乙店長'],[C,'user','買家小陳'],[D,'user','另一買家']])sql.prepare('INSERT INTO users VALUES(?,?,?)').run(uid,role,name);
  for(const file of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0034_store_commerce.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  for(const [id,uid] of [['shop-a',A],['shop-b',B]])sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,status,updated_at) VALUES(?,?,?,'active','2026-09-10')").run(id,uid,id);
  for(const [id,shop] of [['p-a','shop-a'],['p-b','shop-b']])sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,status,updated_at,request_key) VALUES(?,?,?,880000,'active','2026-09-10',?)").run(id,shop,'眼鏡 '+id,id);
  const hooks={};
  const db={prepare(query){return {bind(...args){return {
    sync(){if(hooks.beforeRun)hooks.beforeRun(query);const out=sql.prepare(query).run(...args);return {meta:{changes:Number(out.changes)}};},
    async run(){return this.sync();},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};}
  };}};},async batch(statements){sql.exec('BEGIN');try{const results=statements.map((s,i)=>{if(i===1&&hooks.failBatch)throw new Error('test batch failure');return s.sync();});sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const env={ACTMASTER_DB:db,STORE_COMMERCE_ENABLED:'true'};
  const fetcher=async(url,options)=>{assert.equal(url,'https://api.line.me/v2/profile');const id={a:A,b:B,c:C,d:D}[options.headers.Authorization.slice(7)];return id?Response.json({userId:id}):new Response('',{status:401});};
  async function call(path,data,token='c') {
    const response=await handleStoreCommerce(new Request('https://example.test/v1/store-commerce'+path,{method:data?'POST':'GET',headers:token?{Authorization:'Bearer '+token}:{},body:data?JSON.stringify(data):undefined}),env,fetcher);
    return {status:response.status,...await response.json()};
  }
  const setup=async()=>{for(const token of ['a','b'])assert.equal((await call('/settings',config(),token)).status,200);};
  async function order(extra={},token='c'){const input={...cart(),...extra};const quote=await call('/quote',input,token);assert.equal(quote.status,200,quote.error);const data={...input,quote_hash:quote.quote_hash,request_key:crypto.randomUUID()};const result=await call('/orders',data,token);assert.equal(result.status,200,result.error);return {...result,data};}
  const act=(o,action,extra={},token='c')=>call('/orders/action',{order_id:o.id,version:o.version,request_key:crypto.randomUUID(),action,...extra},token);
  return {sql,db,env,hooks,call,setup,order,act};
}
const config=(extra={})=>({version:0,enabled:true,bank_name:'測試銀行',bank_code:'004',bank_holder:'測試店',bank_account:'123456789012',shipping_fee_cents:6000,free_shipping_cents:1000000,...extra});
const cart=(extra={})=>({shop_id:'shop-a',items:[{id:'p-a',quantity:1}],payment_method:'REMITTANCE',points_used:0,customer:{name:'收件小林',phone:'0912345678',carrier:'POST',address:'100 台北市測試路1號',store_info:'',note:''},...extra});

test('default release gate blocks transactions, settings prep and old receipts remain available',async t=>{
  const f=fixture(t);delete f.env.STORE_COMMERCE_ENABLED;
  assert.equal((await f.call('/capabilities',null,null)).enabled,false);
  assert.equal((await f.call('/settings',config(),'a')).status,200);
  assert.equal((await f.call('/quote',cart())).status,503);
  assert.equal((await f.call('/orders',{...cart(),request_key:crypto.randomUUID()})).status,503);
  assert.equal((await f.call('/orders')).orders.length,0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM store_commerce_orders').get().n,0);
});
test('auth: no client UID, no anonymous settings, non-merchant and admin cross-shop denied',async t=>{
  const f=fixture(t);await f.setup();
  assert.equal((await f.call('/settings',null,null)).status,401);
  assert.equal((await f.call('/settings',null,'bad')).status,401);
  assert.equal((await f.call('/settings')).status,403);
  const result=await f.order();
  assert.equal((await f.act(result.order,'report_remittance',{last5:'12345',buyer_uid:C},'d')).status,404);
  assert.equal((await f.act(result.order,'verify_remittance',{received_cents:886000,confirmed:true},'b')).status,404);
  assert.equal((await f.call('/orders?scope=merchant&shop_id=shop-a',null,'b')).orders.length,0);
  assert.equal((await f.call('/orders?buyer_uid='+C,null,'d')).orders.length,0);
  assert(!JSON.stringify(await f.call('/orders')).includes(C));
});
test('settings are per-shop, versioned and not overwritten by stale forms',async t=>{
  const f=fixture(t);await f.setup();
  assert.equal((await f.call('/settings',config({version:1,bank_holder:'甲新戶名',shop_id:'shop-b'}),'a')).settings.bank_holder,'甲新戶名');
  assert.equal((await f.call('/settings',null,'b')).settings.bank_holder,'測試店');
  assert.equal((await f.call('/settings',config({version:1}),'a')).status,409);
  assert.equal((await f.call('/settings',config({version:2,bank_code:'abc'}),'a')).status,400);
});
test('server prices, shipping thresholds, one-shop cart and strict quantities',async t=>{
  const f=fixture(t);await f.setup();
  const first=await f.call('/quote',cart({price_cents:1,total_cents:1}));assert.equal(first.snapshot.total_cents,886000);
  assert.equal((await f.call('/quote',cart({items:[{id:'p-a',quantity:2}]}))).snapshot.shipping_fee_cents,0);
  for(const items of [[{id:'p-b',quantity:1}],[{id:'p-a',quantity:1},{id:'p-a',quantity:1}],[{id:'p-a',quantity:1.2}],[{id:'p-a',quantity:-1}],[{id:'p-a',quantity:'1'}]])assert.notEqual((await f.call('/quote',cart({items}))).status,200);
  assert.equal((await f.call('/quote',cart({points_used:800}))).status,400);
  assert.equal((await f.call('/quote',cart({payment_method:'LINEPAY'}))).status,400);
  assert.equal((await f.call('/quote',cart({customer:{...cart().customer,carrier:'FAMILY',store_info:''}}))).status,400);
});
test('quote invalidated by price/bank changes; snapshots remain immutable',async t=>{
  const f=fixture(t);await f.setup();const quoted=await f.call('/quote',cart());
  f.sql.exec("UPDATE store_shop_products SET price_cents=990000,version=version+1 WHERE id='p-a'");
  assert.equal((await f.call('/orders',{...cart(),quote_hash:quoted.quote_hash,request_key:crypto.randomUUID()})).status,409);
  const {order}=await f.order();const original=order.snapshot;
  await f.call('/settings',config({version:1,bank_account:'9876543210'}),'a');
  f.sql.exec("UPDATE store_shop_products SET title='新名稱',status='archived',version=version+1 WHERE id='p-a'");
  assert.deepEqual((await f.call('/orders')).orders[0].snapshot,original);
});
test('quote-to-insert race rejects concurrent product change without writing an order',async t=>{
  const f=fixture(t);await f.setup();const quote=await f.call('/quote',cart());
  f.hooks.beforeRun=query=>{if(query.startsWith('INSERT INTO store_commerce_orders')){delete f.hooks.beforeRun;f.sql.exec("UPDATE store_shop_products SET version=version+1 WHERE id='p-a'");}};
  assert.equal((await f.call('/orders',{...cart(),quote_hash:quote.quote_hash,request_key:crypto.randomUUID()})).status,409);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM store_commerce_orders').get().n,0);
});
test('duplicate and simultaneous submissions create one order; changed payload conflicts',async t=>{
  const f=fixture(t);await f.setup();const quote=await f.call('/quote',cart());const data={...cart(),quote_hash:quote.quote_hash,request_key:crypto.randomUUID()};
  const [a,b]=await Promise.all([f.call('/orders',data),f.call('/orders',data)]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.order.id,b.order.id);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM store_commerce_orders').get().n,1);
  assert.equal((await f.call('/orders/lookup?request_key='+data.request_key)).order.id,a.order.id);
  assert.equal((await f.call('/orders/lookup?request_key='+data.request_key,null,'d')).order,null);
  assert.equal((await f.call('/orders',{...data,items:[{id:'p-a',quantity:2}]})).status,409);
  f.sql.exec("UPDATE store_shop_products SET status='archived'");
  assert.equal((await f.call('/orders',data)).order.id,a.order.id);
});
test('remittance report is not payment; verified exact amount precedes shipment and completion',async t=>{
  const f=fixture(t);await f.setup();let {order}=await f.order();
  assert.equal((await f.act(order,'ship',{tracking_number:'TEST'},'a')).status,409);
  assert.equal((await f.act(order,'verify_remittance',{received_cents:order.total_cents,confirmed:true},'a')).status,409);
  order=(await f.act(order,'report_remittance',{last5:'12345'})).order;assert.equal(order.payment_status,'reported');assert.equal(order.received_cents,0);
  assert.equal((await f.act(order,'cancel')).status,409);
  assert.equal((await f.act(order,'verify_remittance',{received_cents:order.total_cents,confirmed:false},'a')).status,400);
  assert.equal((await f.act(order,'verify_remittance',{received_cents:1,confirmed:true},'a')).status,409);
  order=(await f.act(order,'verify_remittance',{received_cents:order.total_cents,confirmed:true},'a')).order;
  assert.equal(order.payment_status,'paid');assert.equal(order.received_cents,order.total_cents);
  assert.equal((await f.act(order,'ship',{tracking_number:''},'a')).status,400);
  order=(await f.act(order,'ship',{tracking_number:'TEST-123'},'a')).order;assert.equal(order.fulfillment_status,'shipped');
  order=(await f.act(order,'complete',{},'a')).order;assert.equal(order.fulfillment_status,'completed');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM store_commerce_events').get().n,4);
});
test('event idempotency, parallel CAS, rollback and actor-scoped audit',async t=>{
  const f=fixture(t);await f.setup();const {order}=await f.order();
  const data={order_id:order.id,version:1,action:'report_remittance',last5:'12345',request_key:crypto.randomUUID()};
  f.hooks.failBatch=true;assert.equal((await f.call('/orders/action',data)).status,503);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM store_commerce_events').get().n,0);assert.equal((await f.call('/orders')).orders[0].version,1);delete f.hooks.failBatch;
  const [a,b]=await Promise.all([f.call('/orders/action',data),f.call('/orders/action',data)]);assert.equal(a.status,200);assert.equal(b.status,200);
  assert.equal((await f.call('/orders/action',data)).order.version,2);
  assert.equal((await f.call('/orders/action',{...data,last5:'54321'})).status,409);
  assert.equal((await f.call('/orders/action',{...data,request_key:crypto.randomUUID()})).status,409);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM store_commerce_events').get().n,1);
});
test('unpaid cancellation does not refund or permit future payment/shipping',async t=>{
  const f=fixture(t);await f.setup();let {order}=await f.order();order=(await f.act(order,'cancel')).order;
  assert.equal(order.payment_status,'cancelled');assert.equal(order.received_cents,0);
  assert.equal((await f.act(order,'report_remittance',{last5:'12345'})).status,409);
});
test('bounded request, pagination and retired merchant fail closed',async t=>{
  const f=fixture(t);await f.setup();assert.equal((await f.call('/quote',{...cart(),junk:'x'.repeat(21000)})).status,413);
  for(let i=0;i<21;i++)await f.order();const first=await f.call('/orders');assert.equal(first.orders.length,20);assert.equal(first.has_more,true);
  const last=await f.call('/orders?page=1');assert.equal(last.orders.length,1);assert(!first.orders.some(o=>o.id===last.orders[0].id));
  assert.equal((await f.call('/orders?page=-1')).status,400);
  f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(A);assert.equal((await f.call('/quote',cart())).status,404);assert.equal((await f.call('/orders?scope=merchant',null,'a')).status,403);
});
