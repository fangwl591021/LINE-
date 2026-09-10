import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreShop,normalizeProduct,normalizeStore} from '../worker/store-shop.mjs';

const A='U'+'a'.repeat(32), B='U'+'b'.repeat(32), USER='U'+'c'.repeat(32);
function fixture() {
  const sql=new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT);');
  sql.prepare('INSERT INTO users VALUES (?,?)').run(A,'store');
  sql.prepare('INSERT INTO users VALUES (?,?)').run(B,'tenant');
  sql.prepare('INSERT INTO users VALUES (?,?)').run(USER,'user');
  sql.exec(readFileSync(new URL('../migrations/0029_store_shop_catalog.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0031_store_product_category.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0030_store_cashier_requests.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0033_store_shop_sales_index.sql',import.meta.url),'utf8'));
  const db={prepare(query){return {bind(...args){return {async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){const result=sql.prepare(query).run(...args);return {meta:{changes:Number(result.changes)}};}};}};}};
  const fetcher=async(url,options)=>{
    assert.equal(url,'https://api.line.me/v2/profile');
    const token=options.headers.Authorization.slice(7);
    return ['a','b','c'].includes(token)?Response.json({userId:{a:A,b:B,c:USER}[token]}):new Response('',{status:401});
  };
  async function call(path='',data,token) {
    const headers={}; if(token) headers.Authorization=`Bearer ${token}`;
    const response=await handleStoreShop(new Request(`https://example.test/v1/store-shop${path}`,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined}),{ACTMASTER_DB:db},fetcher);
    return {status:response.status,...await response.json()};
  }
  return {sql,call};
}
const store=(extra={})=>({name:'測試店面',description:'第一行\n第二行',status:'active',version:0,...extra});
const product=(extra={})=>({title:'商品',price_cents:19900,redeem_type:'fixed',redeem_value:30,status:'active',request_key:crypto.randomUUID(),...extra});

test('sales: owner-only, successful product transactions, Taiwan dates, safe history and no writes',async()=>{
  const {call,sql}=fixture();
  await call('/store',store(),'a');await call('/store',store(),'b');
  const p=(await call('/product',product(),'a')).products[0];
  const other=(await call('/product',product(),'b')).products[0];
  const insert=(actor,id,time,status='succeeded',extra={})=>sql.prepare('INSERT INTO store_cashier_requests(actor_id,request_id,customer_id,fingerprint,status,updated_at) VALUES(?,?,?,?,?,?)')
    .run(actor,crypto.randomUUID(),crypto.randomUUID(),JSON.stringify({productId:id,mode:'redeem',amount:8800,deductPoints:800,raw:'PRIVATE-CUSTOMER',qrHash:'PRIVATE-HASH',...extra}),status,time);
  insert(A,p.id,'2026-09-09 16:00:00'); // Taiwan September 10, exactly midnight
  insert(A,p.id,'2026-09-10 15:59:59');
  insert(A,p.id,'2026-09-09 15:59:59');
  insert(A,p.id,'2026-09-10 16:00:00');
  for(const state of ['pending','sending','unknown','failed'])insert(A,p.id,'2026-09-10 08:00:00',state);
  insert(A,p.id,'2026-09-10 08:00:00','succeeded',{mode:'reward'});
  insert(A,'','2026-09-10 08:00:00');
  insert(B,other.id,'2026-09-10 08:00:00');
  insert(A,other.id,'2026-09-10 08:00:00'); // even incorrect ownership metadata cannot leak another shop
  insert(A,p.id,'2026-09-10 08:00:00','succeeded',{amount:'8800'});
  sql.prepare("INSERT INTO store_cashier_requests VALUES(?,?,?,'broken JSON','succeeded',NULL,CURRENT_TIMESTAMP,?)").run(A,crypto.randomUUID(),'private','2026-09-10 08:00:00');
  sql.prepare("UPDATE store_shop_products SET status='archived',title='Renamed',price_cents=1 WHERE id=?").run(p.id);
  sql.prepare("UPDATE store_shop_stores SET status='draft' WHERE owner_uid=?").run(A);
  const before=sql.prepare('SELECT total_changes() AS n').get().n;
  const path='/sales?start=2026-09-10&end=2026-09-10&userId='+B+'&shop='+other.shop_id;
  assert.equal((await call(path)).status,401);
  assert.equal((await call(path,null,'invalid')).status,401);
  assert.equal((await call(path,null,'c')).status,403);
  const report=await call(path,null,'a');
  assert.equal(report.status,200);
  assert.deepEqual(report.summary,{count:2,amount:17600,points:1600,payable:16000});
  assert.equal(report.records[0].confirmedAt,'2026-09-10T15:59:59Z');
  assert.equal(report.records[0].productTitle,'Renamed'); // amount comes from transaction, never current price
  assert.equal(report.records[0].amount,8800);
  assert.equal(report.hasNext,false);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE|customer_id|owner_uid|fingerprint|result_json/);
  assert.equal((await call(path,null,'b')).summary.count,1);
  assert.equal(sql.prepare('SELECT total_changes() AS n').get().n,before);
  sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(A);
  assert.equal((await call(path,null,'a')).status,403);
  sql.close();
});

test('sales: bounded dates, inclusive leap day, deterministic pages, whole-range totals and empty results',async()=>{
  const {call,sql}=fixture();await call('/store',store(),'a');
  const p=(await call('/product',product(),'a')).products[0];
  for(let i=0;i<45;i++)sql.prepare('INSERT INTO store_cashier_requests(actor_id,request_id,customer_id,fingerprint,status,updated_at) VALUES(?,?,?,?,?,?)')
    .run(A,crypto.randomUUID(),'private',JSON.stringify({productId:p.id,mode:'redeem',amount:100,deductPoints:100}),'succeeded','2028-02-28 16:00:00');
  const query='/sales?start=2028-02-29&end=2028-02-29';
  const pages=await Promise.all([0,1,2,3].map(page=>call(query+'&page='+page,null,'a')));
  assert.deepEqual(pages.map(p=>p.records.length),[20,20,5,0]);
  assert.deepEqual(pages.map(p=>p.hasNext),[true,true,false,false]);
  assert.equal(new Set(pages.flatMap(p=>p.records.map(r=>r.transactionId))).size,45);
  for(const page of pages)assert.deepEqual(page.summary,{count:45,amount:4500,points:4500,payable:0});
  for(const params of ['','start=2026-02-29&end=2026-03-01','start=2026-09-11&end=2026-09-10','start=2026-01-01&end=2027-01-02','start=2026-01-01&end=2026-01-01&page=-1','start=2026-01-01&end=2026-01-01&page=1.5']) {
    assert.equal((await call('/sales?'+params,null,'a')).status,400,params);
  }
  const empty=await call('/sales?start=2026-09-10&end=2026-09-10',null,'a');
  assert.deepEqual(empty.summary,{count:0,amount:0,points:0,payable:0});assert.deepEqual(empty.records,[]);
  assert.equal((await call(query,null,'b')).status,404); // no shop
  sql.close();
});

test('product categories persist, validate and preserve older clients without category',async()=>{
  const {call,sql}=fixture(); await call('/store',store(),'a');
  for(const category of ['食','宿','遊','購','行','服務','製造']) {
    const data=product({category,title:category});
    assert.equal((await call('/product',data,'a')).status,200);
    assert.equal((await call('/product',data,'a')).status,200);
  }
  for(const category of ['其他','<script>',12,{},['食']]) assert.equal((await call('/product',product({category}),'a')).status,400);
  const p=(await call('/manage',null,'a')).products.find(p=>p.category==='食');
  const old={...p,title:'舊版修改'}; delete old.category;
  assert.equal((await call('/product',old,'a')).status,200);
  const updated=(await call('/manage',null,'a')).products.find(x=>x.id===p.id);
  assert.equal(updated.category,'食'); assert.equal(updated.version,p.version+1);
  await call('/store',store(),'b');
  assert.equal((await call('/product',{...updated,category:'購'},'b')).status,409);
  assert.equal((await call('/product',{...p,category:'購'},'a')).status,409);
  await call('/product',product({title:'舊商品'}),'a');
  assert.equal((await call('/manage',null,'a')).products.find(p=>p.title==='舊商品').category,'');
  sql.close();
});

test('category filter uses active products, combines search and paginates without duplicates',async()=>{
  const {call,sql}=fixture();
  for(let i=0;i<43;i++) {
    const id=String(i).padStart(3,'0');
    sql.prepare('INSERT INTO users VALUES (?,?)').run('uid'+id,'store');
    sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,status,updated_at) VALUES (?,?,?,'active','now')").run(id,'uid'+id,'shop'+id);
    for(let j=0;j<2;j++)sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,status,updated_at,request_key,category) VALUES (?,?,?,100,?,'now',?,'食')").run(id+'p'+j,id,'商品',i===42?'draft':'active',crypto.randomUUID());
  }
  const first=await call('?category='+encodeURIComponent('食')); assert.equal(first.shops.length,40);
  const next=await call('?category='+encodeURIComponent('食')+'&after='+first.next); assert.equal(next.shops.length,2);
  assert.equal(new Set([...first.shops,...next.shops].map(s=>s.id)).size,42);
  assert.equal((await call('?category='+encodeURIComponent('食')+'&q=shop005')).shops.length,1);
  assert.equal((await call('?category='+encodeURIComponent('宿'))).shops.length,0);
  assert.equal((await call('?category=invalid')).status,400);
  sql.prepare("UPDATE store_shop_products SET status='archived' WHERE shop_id='005'").run();
  assert.equal((await call('?category='+encodeURIComponent('食')+'&q=shop005')).shops.length,0);
  sql.close();
});

test('category migration preserves existing product data and restricts new values',()=>{
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0029_store_shop_catalog.sql',import.meta.url),'utf8'));
  sql.exec("INSERT INTO store_shop_stores(id,owner_uid,name,updated_at) VALUES ('s','u','店家','now'); INSERT INTO store_shop_products(id,shop_id,title,price_cents,updated_at,request_key) VALUES ('p','s','舊商品',880000,'now','key');");
  const before={...sql.prepare('SELECT * FROM store_shop_products').get()};
  sql.exec(readFileSync(new URL('../migrations/0031_store_product_category.sql',import.meta.url),'utf8'));
  const {category,...after}=sql.prepare('SELECT * FROM store_shop_products').get();
  assert.equal(category,''); assert.deepEqual(after,before);
  assert.throws(()=>sql.exec("UPDATE store_shop_products SET category='invalid'"));sql.close();
});

test('store management requires verified token and database role, never payload claims',async()=>{
  const {call,sql}=fixture();
  assert.equal((await call('/store',store())).status,401);
  assert.equal((await call('/store',store({role:'admin',userId:A}),'c')).status,403);
  assert.equal((await call('/manage',null,'invalid')).status,401);
  assert.equal((await call('/store',store(),'a')).status,200);
  sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(A);
  assert.equal((await call('/manage',null,'a')).status,403);
  assert.equal((await call()).shops.length,0);
  sql.close();
});
test('create is explicit, owned by actor and public responses do not expose identity',async()=>{
  const {call,sql}=fixture();
  assert.equal((await call('/manage',null,'a')).shop,null);
  const created=await call('/store',store({owner_uid:B}),'a');
  assert.equal(created.shop.version,1); assert.equal(created.shop.owner_uid,undefined);
  assert.equal(sql.prepare('SELECT owner_uid FROM store_shop_stores').get().owner_uid,A);
  assert.equal((await call()).shops[0].owner_uid,undefined);
  assert.equal((await call('/manage',null,'b')).shop,null);
  assert.equal((await call('/store',store(),'a')).status,409);
  sql.close();
});
test('cross-shop product updates and stale updates cannot overwrite',async()=>{
  const {call,sql}=fixture();
  await call('/store',store(),'a'); await call('/store',store(),'b');
  const created=await call('/product',product(),'a'); const p=created.products[0];
  assert.equal((await call('/product',{...p,title:'stolen'},'b')).status,409);
  assert.equal((await call('/product',{...p,title:'new'},'a')).status,200);
  assert.equal((await call('/product',{...p,title:'stale'},'a')).status,409);
  assert.equal((await call('/manage',null,'a')).products[0].title,'new');
  sql.close();
});
test('product retries are idempotent and no private retry keys are exposed',async()=>{
  const {call,sql}=fixture(); await call('/store',store(),'a');
  const data=product(); await call('/product',data,'a'); const retry=await call('/product',data,'a');
  assert.equal(retry.products.length,1); assert.equal(retry.products[0].request_key,undefined);
  assert.equal((await call('/product',{...data,title:'different retry'},'a')).status,409);
  sql.close();
});
test('draft and archived products are hidden and draft stores are not public',async()=>{
  const {call,sql}=fixture(); const s=(await call('/store',store(),'a')).shop;
  await call('/product',product({status:'draft'}),'a');
  const p=(await call('/product',product(),'a')).products.find(p=>p.status==='active');
  assert.equal((await call('?shop='+s.id)).products.length,1);
  await call('/product',{...p,status:'archived'},'a');
  assert.equal((await call('?shop='+s.id)).products.length,0);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM store_shop_products').get().n,2);
  assert.equal((await call('/store',{...s,status:'draft'},'a')).status,200);
  assert.equal((await call('?shop='+s.id)).status,404);
  assert.equal((await call()).shops.length,0); sql.close();
});
test('input validation rejects hostile URLs, invalid prices and discount limits',()=>{
  for(const url of ['javascript:alert(1)','data:image/png;base64,AA','http://example.com/x','https://user:pass@example.com/x']) assert.throws(()=>normalizeStore(store({image_url:url})));
  for(const n of [-1,NaN,Infinity,1.5,'123']) assert.throws(()=>normalizeProduct(product({price_cents:n})));
  assert.throws(()=>normalizeProduct(product({redeem_type:'percent',redeem_value:101})));
  assert.throws(()=>normalizeProduct(product({redeem_type:'none',redeem_value:1})));
  assert.throws(()=>normalizeStore(store({name:'x'.repeat(81)})));
  assert.equal(normalizeStore(store()).description,'第一行\n第二行');
});
test('malformed or oversized data and unknown methods fail safely',async()=>{
  const {call,sql}=fixture(); await call('/store',store(),'a');
  assert.equal((await call('/product',product({description:'x'.repeat(17000)}),'a')).status,413);
  assert.equal((await call('/checkout',{},'a')).status,404); sql.close();
});
test('public catalog pagination never loses a store and filters search',async()=>{
  const {call,sql}=fixture();
  const insertUser=sql.prepare('INSERT INTO users VALUES (?,?)');
  const insertShop=sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,category,status,updated_at) VALUES (?,?,?,'food','active','now')");
  for(let i=0;i<42;i++){const id=String(i).padStart(3,'0');insertUser.run('uid'+id,'store');insertShop.run(id,'uid'+id,'name'+id);}
  const first=await call(); assert.equal(first.shops.length,40);
  const next=await call('?after='+first.next); assert.equal(next.shops.length,2);
  assert.equal((await call('?q=name005')).shops.length,1);sql.close();
});
test('store version conflicts preserve newer data',async()=>{
  const {call,sql}=fixture(); const s=(await call('/store',store(),'a')).shop;
  assert.equal((await call('/store',{...s,name:'new'},'a')).status,200);
  assert.equal((await call('/store',{...s,name:'stale'},'a')).status,409);
  assert.equal((await call('/manage',null,'a')).shop.name,'new'); sql.close();
});
