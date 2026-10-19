import test from 'node:test';
import assert from 'node:assert/strict';
import {singleProductRelease as a,manualOnlineReleaseOffer,verifySingleProductRelease} from '../worker/store-single-product-release.mjs';
import {prepareListingContent,listingCategories} from '../worker/store-listing-review.mjs';
import {handleStoreAdminCatalog} from '../worker/store-admin-catalog.mjs';
import {storeInviteProfileView} from '../workerbackup.js';
import {createListingFixture,ADMIN,OWNER} from './fixtures/store-listing-catalog.mjs';
const review=()=>({decision:'manual',checked_categories:[...listingCategories],image_count:1,issues:[{category:'medical',field:'title',evidence:'光動能按摩機',reason:'用途仍待核對，保留人工確認，不作法律認定。'}]});
function fixture(t){
 const f=createListingFixture();t.after(f.close);
 f.sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,description,status,version,updated_at) VALUES(?,?,'米樂數位行銷股份有限公司','合成測試店面','active',6,'now')").run(a.shopId,OWNER);
 f.sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,description,image_url,category,price_cents,redeem_type,redeem_value,status,purchase_mode,version,updated_at,request_key) VALUES(?,?,'光動能按摩機','',?,'購',1180000,'percent',50,'active','in_store',1,'now',?)").run(a.productId,a.shopId,a.imageUrl,crypto.randomUUID());
 const scope='product:'+a.shopId+':'+a.productId;
 f.sql.prepare('INSERT INTO store_listing_reviews VALUES(?,?,?,?,?,?,?)').run(scope,a.contentHash,a.policyVersion,'manual',JSON.stringify(review()),ADMIN,Date.now());
 const data=(extra={})=>({type:'product',id:a.productId,shop_id:a.shopId,version:1,shop_version:6,request_key:crypto.randomUUID(),changes:{purchase_mode:'online'},manual_release:{reference:a.reference,confirmed:true},...extra});
 const product=()=>f.sql.prepare('SELECT * FROM store_shop_products WHERE id=?').get(a.productId);
 const shop=()=>f.sql.prepare('SELECT * FROM store_shop_stores WHERE id=?').get(a.shopId);
 // Isolated evidence-reader injection. Production uses real DNS/bytes/SHA256;
 // below we test that real reader rejects these synthetic pixels as a mismatch.
 let evidenceHash=a.contentHash;
 const snapshotReader=async(value,parent)=>({prepared:prepareListingContent(value,parent),images:[{}],hash:evidenceHash});
 const verifier=args=>verifySingleProductRelease({...args,snapshotReader});
 const call=async(body=data(),actor=ADMIN,realReader=false)=>{
  const r=await handleStoreAdminCatalog(new Request('https://synthetic.test/v1/store-shop/admin/catalog'+(body?'':'?shop='+a.shopId),{method:body?'POST':'GET',headers:actor?{Authorization:'Bearer '+actor}:{},...(body?{body:JSON.stringify(body)}:{})}),f.env,storeInviteProfileView,f.fetcher,realReader?verifySingleProductRelease:verifier);
  return {http:r.status,...await r.json()};
 };
 return {...f,data,product,shop,call,scope,setHash:value=>evidenceHash=value,audit:()=>f.sql.prepare('SELECT * FROM store_catalog_admin_audit').all()};
}
test('only the pinned shop/product/version offers a release and GET is read-only',async t=>{
 const f=fixture(t),snapshot=()=>JSON.stringify(['users','store_shop_stores','store_shop_products','store_listing_reviews','store_catalog_admin_audit'].map(table=>f.sql.prepare('SELECT * FROM '+table).all())),before=snapshot();
 assert.equal(manualOnlineReleaseOffer(f.product(),f.shop()).reference,a.reference);
 const result=await f.call(null);assert.equal(result.http,200);assert.deepEqual(result.products[0].manual_online_release,{reference:a.reference});assert.equal(f.audit().length,0);assert.equal(f.state.providerCalls,0);assert.equal(snapshot(),before);
 for(const change of [{id:crypto.randomUUID()},{version:2},{status:'draft'},{price_cents:1180001},{redeem_value:49},{description:'changed'},{purchase_mode:'online'},{image_url:'https://example.test/new.jpg'}])assert.equal(manualOnlineReleaseOffer({...f.product(),...change},f.shop()),null);
 assert.equal(manualOnlineReleaseOffer(f.product(),{...f.shop(),version:7}),null);
});
test('confirmed one-time release is atomic, audited and replay-safe without changing the AI decision',async t=>{
 const f=fixture(t),before=f.product(),users=JSON.stringify(f.sql.prepare('SELECT * FROM users').all()),data=f.data();
 assert.equal((await f.call(data)).http,200);const after=f.product();assert.equal(after.purchase_mode,'online');assert.equal(after.version,2);
 for(const key of Object.keys(before).filter(k=>!['purchase_mode','version','updated_at'].includes(k)))assert.equal(after[key],before[key],key);
 assert.equal(f.audit().length,1);const audit=f.audit()[0],payload=JSON.parse(audit.payload_json);
 assert.equal(audit.actor_uid,ADMIN);assert.equal(audit.old_version,1);assert.equal(audit.new_version,2);assert.equal(payload.manual_release.content_hash,a.contentHash);assert.match(payload.manual_release.reason,/使用者2026-10-19明確同意/);
 assert.equal(JSON.parse(audit.before_json).purchase_mode,'in_store');assert.equal(JSON.parse(audit.after_json).purchase_mode,'online');
 assert.equal(f.sql.prepare('SELECT decision FROM store_listing_reviews WHERE content_hash=?').get(a.contentHash).decision,'manual');assert.equal(f.state.providerCalls,0);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM users').all()),users);
 assert.equal((await f.call(data)).replayed,true);assert.equal(f.audit().length,1);
 assert.equal('manual_online_release'in (await f.call(null)).products[0],false);
 assert.equal((await f.call({...data,changes:{title:'changed'}})).http,409);
 assert.equal((await f.call(f.data({version:2}))).http,409);assert.equal(f.audit().length,1);
});
test('concurrent identical approval is one version change and one audit',async t=>{
 const f=fixture(t),batch=f.db.batch;let queue=Promise.resolve();
 f.db.batch=async statements=>{const previous=queue;let unlock;queue=new Promise(resolve=>unlock=resolve);await previous;try{return await batch(statements);}finally{unlock();}};
 const data=f.data(),results=await Promise.all([f.call(data),f.call(data)]);
 assert.deepEqual(results.map(r=>r.http),[200,200]);assert.equal(f.audit().length,1);assert.equal(f.product().version,2);assert.equal(f.product().purchase_mode,'online');
});
test('anonymous/non-admin requests cannot use the exception or read its admin capability',async t=>{
 const f=fixture(t);for(const actor of [null,'bad',OWNER])for(const body of [f.data(),null])assert.equal((await f.call(body,actor)).http,actor===OWNER?403:401);assert.equal(f.audit().length,0);
});
test('missing, false, string, forged or extended consent never releases',async t=>{
 const f=fixture(t);
 for(const consent of [null,false,true,{}, {reference:a.reference,confirmed:false},{reference:a.reference,confirmed:'true'},{reference:'different',confirmed:true},{reference:a.reference,confirmed:true,skipReview:true}])assert.equal((await f.call(f.data({manual_release:consent}))).http,400);
 assert.equal(f.product().purchase_mode,'in_store');assert.equal(f.audit().length,0);
});
test('additional edits, cross-shop/product/type and stale price or policy cannot piggyback',async t=>{
 const f=fixture(t);
 for(const changes of [{purchase_mode:'online',description:'changed'},{purchase_mode:'online',status:'active'},{purchase_mode:'in_store'},{status:'draft'}])assert.equal((await f.call(f.data({changes}))).http,409);
 assert.equal((await f.call(f.data({type:'store',id:a.shopId,version:6,changes:{name:'changed'}}))).http,409);
 assert.equal((await f.call(f.data({id:crypto.randomUUID()}))).http,404);
 f.sql.prepare('UPDATE store_shop_products SET price_cents=1180100 WHERE id=?').run(a.productId);assert.equal((await f.call()).http,409);assert.equal(f.audit().length,0);
});
test('changed fingerprint, missing/rejected/other-category/invalid review fail closed',async t=>{
 const f=fixture(t);f.setHash('0'.repeat(64));assert.equal((await f.call()).http,409);f.setHash(a.contentHash);
 for(const [decision,value]of [['reject',{...review(),decision:'reject'}],['error',review()],['manual',{...review(),issues:[{category:'other',field:'title',evidence:'光動能按摩機',reason:'其他風險待確認'}]}],['manual',{decision:'manual'}]]){
  f.sql.prepare('UPDATE store_listing_reviews SET decision=?,review_json=?').run(decision,JSON.stringify(value));assert.ok((await f.call()).http>=400);assert.equal(f.audit().length,0);
 }
 f.sql.exec('DELETE FROM store_listing_reviews');assert.equal((await f.call()).http,409);assert.equal(f.product().purchase_mode,'in_store');
});
test('real evidence reader rehashes image bytes; synthetic pixels never match the approval',async t=>{
 const f=fixture(t);const result=await f.call(f.data(),ADMIN,true);assert.equal(result.http,409);assert.match(result.error,/圖片內容已變更/);assert.equal(f.audit().length,0);assert.equal(f.state.providerCalls,0);assert.equal(f.state.requests.filter(r=>r.image).length,1);
});
test('ordinary save without consent and other products still require AI review',async t=>{
 const f=fixture(t);f.state.review=()=>review();const data=f.data();delete data.manual_release;
 assert.equal((await f.call(data)).http,422);assert.equal(f.audit().length,0);assert.equal(f.state.providerCalls,1);
});
test('write-time review/price/role races cannot create an audit or overwrite newer facts',async t=>{
 for(const kind of ['review','price','role']){
  const f=fixture(t),batch=f.db.batch;f.db.batch=async statements=>{
   if(kind==='review')f.sql.exec("UPDATE store_listing_reviews SET decision='reject'");
   if(kind==='price')f.sql.prepare('UPDATE store_shop_products SET price_cents=1 WHERE id=?').run(a.productId);
   if(kind==='role')f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN);
   return batch(statements);
  };
  assert.equal((await f.call()).http,409);assert.equal(f.audit().length,0);assert.equal(f.product().purchase_mode,'in_store');
 }
});
test('audit or product update failure rolls back the whole release',async t=>{
 const f=fixture(t);f.sql.exec("CREATE TRIGGER fail_release BEFORE UPDATE ON store_shop_products BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;");
 assert.equal((await f.call()).http,503);assert.equal(f.audit().length,0);assert.equal(f.product().purchase_mode,'in_store');assert.equal(f.product().version,1);
});
