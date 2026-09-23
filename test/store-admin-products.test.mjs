import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreAdminProducts} from '../worker/store-admin-products.mjs';
import {storeInviteProfileView} from '../workerbackup.js';
const uid=n=>'U'+String(n).repeat(32),id=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';
const ADMIN='Uf729764dbb5b652a5a90a467320bea29',OWNER=uid(2),MEMBER=uid(3),REWARD=uid(4);
const product=(extra={})=>({shop_id:id(1),shop_version:1,request_key:id(99),title:'商品',description:'介紹',image_url:'https://img.test/item.png',price_cents:12345,category:'食',status:'draft',redeem_type:'none',redeem_value:0,purchase_mode:'in_store',...extra});
function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT '',points INTEGER DEFAULT 500); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);");
  for(const name of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0040_store_admin_product_audit.sql'])sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  for(const [user,role]of [[ADMIN,'admin'],[OWNER,'store'],[MEMBER,'user'],[REWARD,'reward']])sql.prepare('INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,?,?)').run(user,user,role,user===ADMIN?'方萬隆':'會員'+role);
  for(const [n,owner]of [[1,OWNER],[2,MEMBER],[3,REWARD],[4,uid(9)]])sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,status,updated_at) VALUES(?,?,?,'active','2026-09-19')").run(id(n),owner,'店家'+n);
  let beforeBatch=null,failAudit=false;
  const db={withSession(value){assert.equal(value,'first-primary');return this;},prepare(query){
    const statement=(args=[])=>({query,args,bind(...values){return statement(values);},async all(){
      if(failAudit&&query.startsWith('INSERT INTO store_admin_product_audit'))throw new Error('audit failed secret');
      return {success:true,results:sql.prepare(query).all(...args)};
    }});return statement();
  },async batch(statements){
    if(beforeBatch){beforeBatch();beforeBatch=null;}
    sql.exec('BEGIN');
    try{const results=[];for(const s of statements)results.push(await s.all());sql.exec('COMMIT');return results;}
    catch(error){sql.exec('ROLLBACK');throw error;}
  }};
  const fetcher=async(url,options)=>{
    assert.equal(url,'https://api.line.me/v2/profile');assert.equal(options.redirect,'manual');
    const value=options.headers.Authorization.slice(7);
    return /^U[0-9a-f]{32}$/.test(value)?Response.json({userId:value}):new Response('',{status:401});
  };
  const call=async(data=null,actor=ADMIN,query='shop='+id(1),method=data?'POST':'GET')=>{
    const req=new Request('https://test.invalid/v1/store-shop/admin/products'+(method==='GET'?'?'+query:''),{method,headers:actor?{Authorization:'Bearer '+actor,'Content-Type':'application/json'}:{},...(data?{body:typeof data==='string'?data:JSON.stringify(data)}:{})});
    const response=await handleStoreAdminProducts(req,{ACTMASTER_DB:db},storeInviteProfileView,fetcher);
    return {status:response.status,...await response.json()};
  };
  return {sql,db,call,setBeforeBatch:fn=>{beforeBatch=fn;},failAudit:()=>{failAudit=true;},count:table=>sql.prepare('SELECT count(*) n FROM '+table).get().n,
    identities:()=>JSON.stringify(sql.prepare('SELECT * FROM users ORDER BY row_id').all()),
    stores:()=>JSON.stringify(sql.prepare('SELECT * FROM store_shop_stores ORDER BY id').all())};
}
test('private preview is scoped and create belongs to target, with atomic administrator provenance',async t=>{
  const f=fixture();t.after(()=>f.sql.close());const users=f.identities(),stores=f.stores();
  const preview=await f.call();assert.equal(preview.status,200);assert.equal(preview.shop.id,id(1));assert.equal(preview.shop.product_limit,null);assert.equal('owner_uid'in preview.shop,false);
  const result=await f.call(product());assert.equal(result.status,200);assert.equal(result.replayed,false);
  const saved=f.sql.prepare('SELECT * FROM store_shop_products').get(),audit=f.sql.prepare('SELECT * FROM store_admin_product_audit').get();
  assert.equal(saved.shop_id,id(1));assert.equal(saved.price_cents,12345);assert.equal(saved.status,'draft');assert.equal(audit.actor_uid,ADMIN);assert.equal(audit.owner_uid,OWNER);assert.equal(audit.product_id,saved.id);
  assert.equal(f.identities(),users);assert.equal(f.stores(),stores);
});
for(const actor of [null,'bad',OWNER,MEMBER,REWARD]){
  test('denies unauthorized caller '+actor,async t=>{
    const f=fixture();t.after(()=>f.sql.close());
    for(const data of [null,product()])assert.equal((await f.call(data,actor)).status,!actor||actor==='bad'?401:403);
    assert.equal(f.count('store_shop_products'),0);assert.equal(f.count('store_admin_product_audit'),0);
  });
}
test('verified administrator aliases work but conflicting identity rows fail closed',async t=>{
  const f=fixture();t.after(()=>f.sql.close());const alias=uid(5);
  f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(alias,ADMIN);
  assert.equal((await f.call(product(),alias)).status,200);assert.equal(f.sql.prepare('SELECT actor_uid FROM store_admin_product_audit').get().actor_uid,alias);
  f.sql.prepare('INSERT INTO users(row_id,line_id,role) VALUES(?,?,?)').run(alias,alias,'user');
  assert.equal((await f.call(product({request_key:id(98)}),alias)).status,409);assert.equal(f.count('store_shop_products'),1);
});
test('unregistered, missing, reward-only and arbitrary targets cannot receive products',async t=>{
  const f=fixture();t.after(()=>f.sql.close());
  for(const shop of [id(3),id(4),id(5)])assert.equal((await f.call(product({shop_id:shop}))).status,403);
  assert.equal((await f.call(product({shop_id:"x' OR 1=1"}))).status,400);
  assert.equal((await f.call(product({owner_uid:ADMIN}))).status,400);
  assert.equal((await f.call(product({id:id(100)}))).status,400);
  assert.equal(f.count('store_shop_products'),0);
});
test('normal-member target keeps one-product limit and in-store/no-redemption restrictions',async t=>{
  const f=fixture();t.after(()=>f.sql.close());
  assert.equal((await f.call(null,ADMIN,'shop='+id(2))).shop.product_limit,1);
  assert.equal((await f.call(product({shop_id:id(2),purchase_mode:'online'}))).status,403);
  assert.equal((await f.call(product({shop_id:id(2),redeem_type:'fixed',redeem_value:10}))).status,403);
  assert.equal((await f.call(product({shop_id:id(2)}))).status,200);
  assert.equal((await f.call(product({shop_id:id(2),request_key:id(98)}))).status,409);
  assert.equal((await f.call(product({shop_id:id(2)}))).status,200);
});
test('retry returns original product even after owner edits; changed payload or actor conflicts',async t=>{
  const f=fixture();t.after(()=>f.sql.close());const created=await f.call(product());
  f.sql.prepare("UPDATE store_shop_products SET title='店家修改',version=2 WHERE id=?").run(created.product_id);
  const retry=await f.call(product());assert.equal(retry.product_id,created.product_id);assert.equal(retry.replayed,true);
  assert.equal((await f.call(product({price_cents:500}))).status,409);
  f.sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(uid(6),ADMIN);
  assert.equal((await f.call(product(),uid(6))).status,409);
  assert.equal(f.count('store_shop_products'),1);assert.equal(f.count('store_admin_product_audit'),1);
});
test('owner-created request-key collision is not adopted or modified',async t=>{
  const f=fixture();t.after(()=>f.sql.close());
  f.sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,updated_at,request_key) VALUES(?,?,'原商品',100,'now',?)").run(id(5),id(1),id(99));
  assert.equal((await f.call(product())).status,409);assert.equal(f.count('store_admin_product_audit'),0);assert.equal(f.sql.prepare('SELECT title FROM store_shop_products').get().title,'原商品');
});
test('failed audit rolls the product insert back and never leaks internal errors',async t=>{
  const f=fixture();t.after(()=>f.sql.close());f.failAudit();
  const result=await f.call(product());assert.equal(result.status,503);assert.doesNotMatch(result.error,/secret|audit failed/);
  assert.equal(f.count('store_shop_products'),0);assert.equal(f.count('store_admin_product_audit'),0);
});
for(const [name,change]of [
  ['store version',f=>f.sql.prepare('UPDATE store_shop_stores SET version=2 WHERE id=?').run(id(1))],
  ['store status',f=>f.sql.prepare("UPDATE store_shop_stores SET status='draft' WHERE id=?").run(id(1))],
  ['target role',f=>f.sql.prepare("UPDATE users SET role='reward' WHERE line_id=?").run(OWNER)],
  ['actor role',f=>f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN)]
]){
  test('write-time '+name+' change rejects stale operation',async t=>{
    const f=fixture();t.after(()=>f.sql.close());f.setBeforeBatch(()=>change(f));
    assert.equal((await f.call(product())).status,409);assert.equal(f.count('store_shop_products'),0);assert.equal(f.count('store_admin_product_audit'),0);
  });
}
test('concurrent member create cannot exceed quota',async t=>{
  const f=fixture();t.after(()=>f.sql.close());
  f.setBeforeBatch(()=>f.sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,updated_at,request_key) VALUES(?,?,'已先建立',100,'now',?)").run(id(8),id(2),id(8)));
  assert.equal((await f.call(product({shop_id:id(2)}))).status,409);assert.equal(f.count('store_shop_products'),1);assert.equal(f.count('store_admin_product_audit'),0);
});
test('validates price, image, status, payload bounds, version, and strict query',async t=>{
  const f=fixture();t.after(()=>f.sql.close());
  for(const extra of [{price_cents:-1},{price_cents:1.5},{price_cents:100000001},{image_url:'javascript:alert(1)'},{status:'archived'},{category:'bad'},{redeem_type:'percent',redeem_value:101},{shop_version:0},{request_key:'x'},{description:'x'.repeat(3001)}])assert.equal((await f.call(product(extra))).status,400,JSON.stringify(extra).slice(0,100));
  assert.equal((await f.call(product({shop_version:2}))).status,409);
  assert.equal((await f.call('x'.repeat(17000))).status,413);
  assert.equal((await f.call(null,ADMIN,'shop='+id(1)+'&owner='+ADMIN)).status,400);
  assert.equal((await f.call(null,ADMIN,'shop='+id(1)+'&shop='+id(2))).status,400);
  assert.equal(f.count('store_shop_products'),0);
});
test('explicit active/online creation does not change draft store publication',async t=>{
  const f=fixture();t.after(()=>f.sql.close());
  f.sql.prepare("UPDATE store_shop_stores SET status='draft' WHERE id=?").run(id(1));
  assert.equal((await f.call(product({status:'active',purchase_mode:'online',redeem_type:'fixed',redeem_value:10}))).status,200);
  assert.equal(f.sql.prepare('SELECT status FROM store_shop_stores WHERE id=?').get(id(1)).status,'draft');
});
