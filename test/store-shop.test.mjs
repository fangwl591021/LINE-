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
