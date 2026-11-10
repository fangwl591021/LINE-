import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreAdminCatalog} from '../worker/store-admin-catalog.mjs';
import {storeInviteProfileView} from '../workerbackup.js';
import {listingCategories,listingPolicyVersion} from '../worker/store-listing-review.mjs';

const ADMIN='Uf729764dbb5b652a5a90a467320bea29',OWNER='U'+'2'.repeat(32),OTHER='U'+'3'.repeat(32);
const id=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';
const UPDATED='2026-11-10T00:00:00.000Z',REVIEWED=Date.parse('2026-11-10T00:01:00.000Z');
const productScope=(n=10,shop=1)=>'product:'+id(shop)+':'+id(n);
function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec("CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT ''); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);");
  for(const name of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0064_store_product_shipping.sql','0045_store_catalog_admin_audit.sql','0058_store_listing_reviews.sql'])sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  for(const [uid,role]of [[ADMIN,'admin'],[OWNER,'store'],[OTHER,'store']])sql.prepare('INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,?,?)').run(uid,uid,role,uid===ADMIN?'方萬隆':'合成會員');
  for(const [n,owner]of [[1,OWNER],[2,OTHER]])sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,description,status,updated_at) VALUES(?,?,?,'一般店家介紹','draft',?)").run(id(n),owner,'合成店家'+n,UPDATED);
  function product(n=10,shop=1){sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,description,price_cents,category,updated_at,request_key) VALUES(?,?,?,'一般商品資料',100,'購',?,?)").run(id(n),id(shop),'合成商品'+n,UPDATED,id(n));}
  product();product(11,2);
  const state={reviewReads:0,failReview:false};
  const db={withSession(){return this;},prepare(query){
    const statement=(args=[])=>({bind(...values){return statement(values);},async all(){
      if(query.includes('FROM store_listing_reviews')){state.reviewReads++;if(state.failReview)throw new Error('synthetic private database failure');}
      return {success:true,results:sql.prepare(query).all(...args)};
    },async first(){return (await this.all()).results[0]||null;}});return statement();
  }};
  const call=async(query='shop='+id(1),actor=ADMIN)=>{
    const response=await handleStoreAdminCatalog(new Request('https://test.invalid/v1/store-shop/admin/catalog?'+query,{headers:actor?{Authorization:'Bearer '+actor}:{}}),{ACTMASTER_DB:db},storeInviteProfileView,async(url,options)=>{
      assert.equal(url,'https://api.line.me/v2/profile','GET feedback never calls review or image providers');
      const uid=options.headers.Authorization.slice(7);return Response.json({userId:uid});
    });return {http:response.status,...await response.json()};
  };
  let serial=0;
  function review(scope=productScope(),{decision='manual',time=REVIEWED,policy=listingPolicyVersion,field='description',evidence='一般商品資料',raw=null}={}){
    const value=raw||{decision,checked_categories:[...listingCategories],image_count:0,issues:decision==='allow'?[]:[{category:'other',field,evidence,reason:'實際用途資料仍需核對。'}]};
    sql.prepare('INSERT INTO store_listing_reviews(scope,content_hash,policy_version,decision,review_json,actor_uid,reviewed_at) VALUES(?,?,?,?,?,?,?)').run(scope,'private-content-hash-'+(++serial),policy,decision,JSON.stringify(value),ADMIN,time);
  }
  const snapshot=()=>JSON.stringify(['users','store_shop_stores','store_shop_products','store_listing_reviews','store_catalog_admin_audit'].map(table=>sql.prepare('SELECT * FROM '+table).all()));
  return {sql,call,review,product,state,snapshot,close:()=>sql.close()};
}

test('catalog reloads current product and store feedback without exposing review identity or writing',async t=>{
  const f=fixture();t.after(f.close);f.review();f.review('store:'+OWNER,{decision:'reject',evidence:'一般店家介紹'});
  f.review(productScope(11,2),{decision:'reject'});
  const before=f.snapshot(),first=await f.call(),again=await f.call();
  assert.equal(first.http,200);assert.deepEqual(again,first);
  assert.equal(first.shop.listing_review.decision,'reject');assert.equal(first.products[0].listing_review.decision,'manual');
  assert.deepEqual(Object.keys(first.products[0].listing_review).sort(),['decision','issues','reviewed_at']);
  assert.deepEqual(Object.keys(first.products[0].listing_review.issues[0]).sort(),['category','evidence','field','reason']);
  const json=JSON.stringify(first);for(const privateValue of [ADMIN,OWNER,OTHER,'private-content-hash','actor_uid','content_hash','scope','review_json'])assert.ok(!json.includes(privateValue),privateValue);
  assert.equal(first.products.length,1);assert.equal(f.state.reviewReads,2,'one bounded review query per reload');assert.equal(f.snapshot(),before);
});

test('feedback expires when either product or parent storefront changes',async t=>{
  const f=fixture();t.after(f.close);f.review();
  assert.ok((await f.call()).products[0].listing_review);
  f.sql.prepare('UPDATE store_shop_products SET updated_at=? WHERE id=?').run(new Date(REVIEWED).toISOString(),id(10));
  assert.ok((await f.call()).products[0].listing_review,'review at the exact current timestamp is applicable');
  f.sql.prepare('UPDATE store_shop_products SET updated_at=? WHERE id=?').run(new Date(REVIEWED+1).toISOString(),id(10));
  assert.equal((await f.call()).products[0].listing_review,undefined);
  f.sql.prepare('UPDATE store_shop_products SET updated_at=? WHERE id=?').run(UPDATED,id(10));
  f.sql.prepare('UPDATE store_shop_stores SET updated_at=? WHERE id=?').run(new Date(REVIEWED+1).toISOString(),id(1));
  assert.equal((await f.call()).products[0].listing_review,undefined);assert.equal((await f.call('queue=draft')).products.find(p=>p.id===id(10)).listing_review,undefined);
});

test('latest current-policy outcome wins and stale policies or invalid review output are omitted',async t=>{
  const f=fixture();t.after(f.close);f.review();f.review(productScope(),{decision:'allow',time:REVIEWED+1});
  assert.equal((await f.call()).products[0].listing_review,undefined,'do not revive an older rejection');
  f.review(productScope(),{decision:'reject',time:REVIEWED+2,policy:'old-policy'});
  assert.equal((await f.call()).products[0].listing_review,undefined);
  f.review(productScope(),{time:REVIEWED+3,raw:{decision:'manual',checked_categories:listingCategories,image_count:0,issues:[{category:'other',field:'description',evidence:'不存在的舊內容',reason:'資料仍需核對'}]}});
  assert.equal((await f.call()).products[0].listing_review,undefined,'evidence must still describe the listing');
  f.review(productScope(),{time:REVIEWED+4,raw:{decision:'manual',checked_categories:listingCategories,image_count:0,issues:[{category:'other',field:'description',evidence:'一般商品資料',reason:'資料仍需核對',actor_uid:ADMIN}]}});
  assert.equal((await f.call()).products[0].listing_review,undefined,'unexpected private fields invalidate stored feedback');
  f.review(productScope(),{time:REVIEWED+5});assert.ok((await f.call()).products[0].listing_review);
  f.sql.prepare("UPDATE store_shop_stores SET updated_at='invalid timestamp' WHERE id=?").run(id(1));
  assert.equal((await f.call()).products[0].listing_review,undefined);
});

test('draft queue adds current feedback to each bounded page without leaking hidden parent fields',async t=>{
  const f=fixture();t.after(f.close);
  for(let n=20;n<43;n++){f.product(n,n%2+1);f.review(productScope(n,n%2+1));}
  f.review();const before=f.snapshot();
  const first=await f.call('queue=draft');assert.equal(first.http,200);assert.equal(first.products.length,20);assert.ok(first.next);assert.equal(f.state.reviewReads,1);
  const second=await f.call('queue=draft&after='+first.next);assert.equal(second.products.length,5);assert.equal(f.state.reviewReads,2);
  const products=[...first.products,...second.products];assert.equal(new Set(products.map(p=>p.id)).size,25);
  assert.equal(products.filter(p=>p.listing_review).length,24);
  for(const product of products)for(const key of ['owner_uid','description','image_url','review_parent_description','review_parent_updated_at'])assert.equal(key in product,false,key);
  for(const uid of [ADMIN,OWNER,OTHER])assert.ok(!JSON.stringify(products).includes(uid));assert.equal(f.snapshot(),before);
});

test('unauthorized readers cannot obtain feedback and genuine database failures are not empty success',async t=>{
  const f=fixture();t.after(f.close);f.review();
  for(const actor of [null,OWNER,OTHER])for(const query of ['shop='+id(1),'queue=draft']){
    const result=await f.call(query,actor);assert.equal(result.http,actor?403:401);assert.equal(result.products,undefined);
  }
  assert.equal(f.state.reviewReads,0);
  f.state.failReview=true;assert.equal((await f.call()).http,503);assert.equal((await f.call('queue=draft')).http,503);
  f.state.failReview=false;f.sql.exec('DROP TABLE store_listing_reviews');
  const legacy=await f.call();assert.equal(legacy.http,200);assert.equal(legacy.products[0].listing_review,undefined);
  assert.equal((await f.call('queue=draft')).http,200);
});
