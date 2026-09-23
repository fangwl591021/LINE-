import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreAdminCatalog} from '../worker/store-admin-catalog.mjs';
import {handleStoreShop} from '../worker/store-shop.mjs';
import {storeInviteProfileView} from '../workerbackup.js';
import worker from '../worker-entry.mjs';
const uid=n=>'U'+String(n).repeat(32),id=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';
const ADMIN='Uf729764dbb5b652a5a90a467320bea29',OWNER=uid(2),MEMBER=uid(3);
const payload=(extra={})=>({type:'product',id:id(10),shop_id:id(1),version:1,shop_version:1,request_key:id(99),changes:{title:'更新商品',status:'active'},...extra});
test('global draft queue is read-only, paged across eligible shops and contains no member details',async t=>{
  const f=fixture();t.after(()=>f.sql.close());
  for(let n=20;n<44;n++)f.sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,updated_at,request_key) VALUES(?,?,'草稿',100,'now',?)").run(id(n),id(n%2+1),id(n));
  f.sql.prepare("UPDATE store_shop_products SET status='active' WHERE id=?").run(id(20));
  f.sql.prepare("UPDATE store_shop_products SET status='archived' WHERE id=?").run(id(21));
  const before=JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_products ORDER BY id').all());
  const first=await f.call(null,ADMIN,'queue=draft');assert.equal(first.http,200);assert.equal(first.products.length,20);assert.ok(first.next);
  const second=await f.call(null,ADMIN,'queue=draft&after='+first.next);assert.equal(second.products.length,4);assert.equal(second.next,'');
  const products=[...first.products,...second.products];assert.equal(new Set(products.map(p=>p.id)).size,24);assert.equal(new Set(products.map(p=>p.shop_id)).size,2);
  assert.ok(products.every(p=>p.status==='draft'&&p.shop_name));
  for(const p of products)for(const field of ['owner_uid','phone','email','line_id','owner_name'])assert.equal(field in p,false);
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_products ORDER BY id').all()),before);assert.equal(f.audit().length,0);
  f.sql.prepare("UPDATE users SET role='reward' WHERE line_id=?").run(OWNER);
  const eligible=await f.call(null,ADMIN,'queue=draft');assert.ok(eligible.products.length);assert.ok(eligible.products.every(p=>p.shop_id===id(2)));
});
test('draft queue rejects unauthenticated access and ambiguous query parameters',async t=>{
  const f=fixture();t.after(()=>f.sql.close());
  for(const actor of [null,'bad',OWNER,MEMBER])assert.equal((await f.call(null,actor,'queue=draft')).http,!actor||actor==='bad'?401:403);
  for(const query of ['queue=active','queue=draft&queue=draft','queue=draft&shop='+id(1),'queue=draft&status=draft','queue=draft&after=bad','queue=draft&after='+id(1)+'&after='+id(2)])assert.equal((await f.call(null,ADMIN,query)).http,400);
  assert.equal(f.audit().length,0);
});
test('actual entry routes catalog behind verification and rejects unsupported methods',async()=>{
  const env={ACTMASTER_DB:{prepare(){throw new Error('Unauthenticated DB access');}}};
  for(const [method,status]of [['GET',401],['POST',401],['PUT',405],['DELETE',405],['OPTIONS',204]]){
    const result=await worker.fetch(new Request('https://test.invalid/v1/store-shop/admin/catalog',{method}),env,{});
    assert.equal(result.status,status);assert.equal(result.headers.get('Cache-Control'),'no-store');
  }
});
function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT '',points INTEGER DEFAULT 500); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);");
  for(const name of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0045_store_catalog_admin_audit.sql'])sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  for(const [user,role]of [[ADMIN,'admin'],[OWNER,'store'],[MEMBER,'user']])sql.prepare('INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,?,?)').run(user,user,role,user===ADMIN?'方萬隆':'合成會員');
  for(const [n,owner]of [[1,OWNER],[2,MEMBER]])sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,status,updated_at) VALUES(?,?,?,'active','now')").run(id(n),owner,'店家'+n);
  for(const [n,shop]of [[10,1],[11,2]])sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,updated_at,request_key,category) VALUES(?,?,'原商品',100,'now',?,'食')").run(id(n),id(shop),id(n));
  let beforeBatch=null,failUpdate=false,queue=Promise.resolve();
  const db={withSession(){return this;},prepare(query){
    const stmt=(args=[])=>({bind(...values){return stmt(values);},async all(){
      if(failUpdate&&query.startsWith('UPDATE store_shop_'))throw new Error('synthetic private failure');
      const results=sql.prepare(query).all(...args);return {success:true,results,meta:{changes:sql.prepare('SELECT changes() n').get().n}};
    },async first(){return (await this.all()).results[0]||null;},async run(){return this.all();}});return stmt();
  },async batch(statements){
    const previous=queue;let release;queue=new Promise(resolve=>{release=resolve;});await previous;
    if(beforeBatch){beforeBatch();beforeBatch=null;}sql.exec('BEGIN');
    try{const results=[];for(const statement of statements)results.push(await statement.all());sql.exec('COMMIT');return results;}
    catch(error){sql.exec('ROLLBACK');throw error;}finally{release();}
  }};
  const fetcher=async(_url,options)=>{const user=options.headers.Authorization.slice(7);return /^U[0-9a-f]{32}$/.test(user)?Response.json({userId:user}):new Response('',{status:401});};
  const call=async(data=null,actor=ADMIN,query='shop='+id(1))=>{
    const response=await handleStoreAdminCatalog(new Request('https://test.invalid/v1/store-shop/admin/catalog'+(data?'':'?'+query),{method:data?'POST':'GET',headers:actor?{Authorization:'Bearer '+actor}:{},...(data?{body:typeof data==='string'?data:JSON.stringify(data)}:{})}),{ACTMASTER_DB:db},storeInviteProfileView,fetcher);
    return {http:response.status,...await response.json()};
  };
  const publicStore=async()=>{
    const response=await handleStoreShop(new Request('https://test.invalid/v1/store-shop?shop='+id(1)),{ACTMASTER_DB:db},fetcher);
    return {http:response.status,...await response.json()};
  };
  return {sql,call,publicStore,db,fetcher,before:fn=>{beforeBatch=fn;},fail:()=>{failUpdate=true;},audit:()=>sql.prepare('SELECT * FROM store_catalog_admin_audit').all(),product:()=>sql.prepare('SELECT * FROM store_shop_products WHERE id=?').get(id(10))};
}
test('shared catalog write is visible in existing public/mobile API and leaves identities/policies intact',async t=>{
  const f=fixture();t.after(()=>f.sql.close());const users=JSON.stringify(f.sql.prepare('SELECT * FROM users').all());
  assert.equal((await f.publicStore()).products.length,0);
  const result=await f.call(payload());assert.equal(result.http,200);assert.equal(result.version,2);assert.equal(result.replayed,false);
  assert.equal((await f.publicStore()).products[0].title,'更新商品');
  assert.equal(f.product().shop_id,id(1));assert.equal(f.product().redeem_type,'none');assert.equal(f.product().purchase_mode,'in_store');
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM users').all()),users);assert.equal(f.audit().length,1);
  const before=JSON.parse(f.audit()[0].before_json);assert.equal(before.title,'原商品');
  const hidden=await f.call(payload({version:2,request_key:id(98),changes:{status:'draft'}}));assert.equal(hidden.http,200);assert.equal((await f.publicStore()).products.length,0);
});
test('store edit uses same store id and version while preserving ownership',async t=>{
  const f=fixture();t.after(()=>f.sql.close());const data=payload({type:'store',id:id(1),changes:{name:'新店名',phone:'0212345678'}});
  assert.equal((await f.call(data)).http,200);const live=await f.publicStore();assert.equal(live.shop.name,'新店名');assert.equal(live.shop.version,2);
  assert.equal(f.sql.prepare('SELECT owner_uid FROM store_shop_stores WHERE id=?').get(id(1)).owner_uid,OWNER);
});
for(const actor of [null,'bad',OWNER,MEMBER])test('non-admin catalog read/write rejected '+actor,async t=>{
  const f=fixture();t.after(()=>f.sql.close());for(const data of [null,payload()])assert.equal((await f.call(data,actor)).http,!actor||actor==='bad'?401:403);assert.equal(f.audit().length,0);
});
test('idempotent retry never overwrites later owner edits; changed request conflicts',async t=>{
  const f=fixture();t.after(()=>f.sql.close());assert.equal((await f.call(payload())).http,200);
  f.sql.prepare("UPDATE store_shop_products SET title='店家後改',version=3 WHERE id=?").run(id(10));
  assert.equal((await f.call(payload())).replayed,true);assert.equal(f.product().title,'店家後改');assert.equal(f.product().version,3);
  assert.equal((await f.call(payload({changes:{status:'draft'}}))).http,409);assert.equal(f.audit().length,1);
});
test('simultaneous identical requests are one write and conflicting saves cannot overwrite',async t=>{
  const f=fixture();t.after(()=>f.sql.close());const results=await Promise.all([f.call(payload()),f.call(payload())]);
  assert.ok(results.every(result=>result.http===200));
  assert.equal((await f.call(payload())).http,200);assert.equal(f.product().version,2);assert.equal(f.audit().length,1);
  assert.equal((await f.call(payload({request_key:id(98)}))).http,409);
});
for(const [label,sql]of [
  ['actor role',`UPDATE users SET role='user' WHERE line_id='${ADMIN}'`],
  ['owner role',`UPDATE users SET role='reward' WHERE line_id='${OWNER}'`],
  ['shop version',`UPDATE store_shop_stores SET version=2 WHERE id='${id(1)}'`],
  ['product version',`UPDATE store_shop_products SET version=2 WHERE id='${id(10)}'`]
])test('write-time '+label+' change rejects stale approval',async t=>{
  const f=fixture();t.after(()=>f.sql.close());f.before(()=>f.sql.exec(sql));assert.equal((await f.call(payload())).http,409);assert.equal(f.audit().length,0);assert.equal(f.product().title,'原商品');
});
test('failed write rolls back audit and hides internal errors',async t=>{
  const f=fixture();t.after(()=>f.sql.close());f.fail();const result=await f.call(payload());assert.equal(result.http,503);assert.doesNotMatch(result.error,/synthetic|private/);assert.equal(f.audit().length,0);assert.equal(f.product().version,1);
});
test('strict fields, cross-shop ids, bounds and archived restoration rejected',async t=>{
  const f=fixture();t.after(()=>f.sql.close());
  for(const changes of [{owner_uid:ADMIN},{redeem_type:'full'},{purchase_mode:'online'},{price_cents:-1},{image_url:'javascript:alert(1)'},{status:'approved'},{description:'a'.repeat(3001)}])assert.equal((await f.call(payload({changes}))).http,400);
  assert.equal((await f.call(payload({id:id(11)}))).http,404);
  assert.equal((await f.call(payload({shop_id:id(3)}))).http,403);
  assert.equal((await f.call('x'.repeat(17000))).http,413);
  assert.equal((await f.call(payload({changes:{status:'archived'}}))).http,200);
  assert.equal((await f.call(payload({version:2,request_key:id(98),changes:{status:'active'}}))).http,409);
});
test('member product capacity and existing policy restrictions survive admin editing',async t=>{
  const f=fixture();t.after(()=>f.sql.close());const data=payload({shop_id:id(2),id:id(11)});
  f.sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,updated_at,request_key) VALUES(?,?,'另一件',100,'now',?)").run(id(12),id(2),id(12));
  assert.equal((await f.call(data)).http,409);
  assert.equal((await f.call({...data,changes:{status:'archived'}})).http,200);
});
test('paged catalog includes drafts and archived without exposing owner identifiers',async t=>{
  const f=fixture();t.after(()=>f.sql.close());
  for(let n=20;n<44;n++)f.sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,updated_at,request_key) VALUES(?,?,'商品',100,'now',?)").run(id(n),id(1),id(n));
  const first=await f.call();assert.equal(first.products.length,20);assert.ok(first.next);assert.equal('owner_uid'in first.shop,false);
  const second=await f.call(null,ADMIN,'shop='+id(1)+'&after='+first.next);assert.equal(second.products.length,5);assert.equal(second.next,'');
  assert.equal((await f.call(null,ADMIN,'shop='+id(1)+'&status=active')).products.length,0);
  for(const query of ['shop='+id(1)+'&shop='+id(2),'shop='+id(1)+'&status=bad','shop='+id(1)+'&owner='+ADMIN])assert.equal((await f.call(null,ADMIN,query)).http,400);
});
