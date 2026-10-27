import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreShop} from '../worker/store-shop.mjs';
function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON;CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT);');
  for(const file of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0064_store_product_shipping.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  for(const [id,role,status] of [['service','store','active'],['retail','admin','active'],['normal','redeem','active'],['hidden','store','draft'],['ineligible','tenant','active']]){
    sql.prepare('INSERT INTO users VALUES(?,?)').run('private-owner-'+id,role);
    sql.prepare('INSERT INTO store_shop_stores(id,owner_uid,name,category,address,status,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,'private-owner-'+id,id==='service'?'數位服務公司':id,'服務','公開地址',status,'2026-10-11');
  }
  const put=(id,shop='service',extra={})=>{
    const p={title:'光動能按摩機',description:'舒適放鬆 Massage',category:'購',mode:'in_store',status:'active',redeem:'percent',value:50,...extra};
    sql.prepare('INSERT INTO store_shop_products(id,shop_id,title,description,price_cents,redeem_type,redeem_value,status,category,purchase_mode,updated_at,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,shop,p.title,p.description,1180000,p.redeem,p.value,p.status,p.category,p.mode,'2026-10-11','private-key-'+id);
  };
  const db={prepare(query){return {bind(...args){return {async all(){return {results:sql.prepare(query).all(...args)};},async first(){return sql.prepare(query).get(...args)||null;}};}};}};
  const call=async(query='',method='GET')=>{const response=await handleStoreShop(new Request('https://example.test/v1/store-shop/products'+query,{method}),{ACTMASTER_DB:db},()=>{throw Error('No external services may run');});return {status:response.status,...await response.json()};};
  return {sql,put,call};
}
test('product classification is independent of company industry; title/description/shop and ASCII case search work',async()=>{
  const f=fixture();try{f.put('p1');f.put('p2','retail',{category:'食',title:'食品',description:'茶葉'});
    const found=await f.call('?category='+encodeURIComponent('購')+'&q='+encodeURIComponent('按摩'));
    assert.equal(found.status,200);assert.equal(found.products.length,1);assert.equal(found.products[0].shop.category,'服務');assert.equal(found.products[0].category,'購');
    assert.equal((await f.call('?q=massage')).products.length,1);
    assert.equal((await f.call('?q='+encodeURIComponent('數位服務公司'))).products.length,1);
    assert.equal((await f.call('?category='+encodeURIComponent('食')+'&q='+encodeURIComponent('按摩'))).products.length,0);
  }finally{f.sql.close();}
});
test('unclassified is explicit, sales channel and redeem filters preserve product settings and merchant boundary',async()=>{
  const f=fixture();try{f.put('p1');f.put('p2','service',{category:'',mode:'online',redeem:'none',value:0});f.put('p3','retail',{mode:'online',redeem:'full',value:0});f.put('p4','normal',{redeem:'full',value:0});
    assert.equal((await f.call()).products.length,4);
    assert.deepEqual((await f.call('?category=unclassified')).products.map(p=>p.id),['p2']);
    assert.deepEqual((await f.call('?purchase_mode=online')).products.map(p=>p.id),['p2','p3']);
    assert.deepEqual((await f.call('?redeem=1')).products.map(p=>p.id),['p1','p3','p4']);
    assert.deepEqual((await f.call('?redeem=1&purchase_mode=online')).products.map(p=>p.id),['p3']);
    assert.equal((await f.call('?id=p4')).products[0].shop.merchant_enabled,1);
  }finally{f.sql.close();}
});
test('public allowlist, hidden shops/products/owners, late removal and zero writes/external calls',async()=>{
  const f=fixture();try{
    f.put('visible');f.put('draft','service',{status:'draft'});f.put('archived','service',{status:'archived'});f.put('hidden','hidden');f.put('ineligible','ineligible');
    const before=f.sql.prepare('SELECT total_changes() n').get().n;
    const result=await f.call();assert.deepEqual(result.products.map(p=>p.id),['visible']);
    assert.deepEqual(Object.keys(result.products[0]).sort(),['id','shop_id','title','description','image_url','price_cents','redeem_type','redeem_value','category','purchase_mode','shipping_fee_cents','version','updated_at','shop'].sort());
    assert.deepEqual(Object.keys(result.products[0].shop).sort(),['id','name','category','address','merchant_enabled'].sort());
    assert(!JSON.stringify(result).includes('private-'));
    for(const id of ['draft','archived','hidden','ineligible','missing'])assert.equal((await f.call('?id='+id)).status,404);
    assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);
    f.sql.exec("UPDATE store_shop_products SET status='draft' WHERE id='visible'");assert.equal((await f.call('?id=visible')).status,404);
    f.sql.exec("UPDATE store_shop_products SET status='active' WHERE id='visible';UPDATE users SET role='staff' WHERE line_id='private-owner-service'");assert.equal((await f.call('?id=visible')).status,404);
  }finally{f.sql.close();}
});
test('bounded deterministic keyset pages are complete and filters persist across pages',async()=>{
  const f=fixture();try{for(let i=0;i<105;i++)f.put('p'+String(i).padStart(4,'0'));
    const found=[];let after='';do{const result=await f.call('?category='+encodeURIComponent('購')+'&after='+encodeURIComponent(after));assert(result.products.length<=40);found.push(...result.products.map(p=>p.id));after=result.next;}while(after);
    assert.equal(found.length,105);assert.equal(new Set(found).size,105);assert.deepEqual(found,[...found].sort());
  }finally{f.sql.close();}
});
test('malformed filters, methods and SQL injection fail safely without data changes',async()=>{
  const f=fixture();try{f.put('p1');const before=f.sql.prepare('SELECT total_changes() n').get().n;
    for(const q of ['?q='+('x'.repeat(81)),'?category=medical','?purchase_mode=all','?redeem=true','?id=../private','?after=r1.seed.invalid','?id=p1&after=p2'])assert.equal((await f.call(q)).status,400,q);
    assert.equal((await f.call('?q='+encodeURIComponent("' OR 1=1; DROP TABLE users;--"))).products.length,0);
    assert.equal((await f.call('','POST')).status,404);
    assert.equal(f.sql.prepare('SELECT count(*) n FROM users').get().n,5);
    assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);
  }finally{f.sql.close();}
});
