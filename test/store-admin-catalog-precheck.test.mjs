import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStoreAdminCatalog} from '../worker/store-admin-catalog.mjs';
import {storeInviteProfileView} from '../workerbackup.js';
import worker from '../worker-entry.mjs';
import {createListingFixture,ADMIN,OWNER,SHOP,PRODUCT} from './fixtures/store-listing-catalog.mjs';
import {allowListing} from './fixtures/store-listing-review.mjs';
import {listingCategories} from '../worker/store-listing-review.mjs';

const PATH='/admin/catalog/review',OTHER_SHOP='33333333-1111-4111-8111-111111111111';
const payload=(extra={})=>({type:'product',id:PRODUCT,shop_id:SHOP,version:1,shop_version:1,request_key:crypto.randomUUID(),changes:{status:'active'},...extra});
const blocked=decision=>({decision,checked_categories:[...listingCategories],image_count:0,issues:[{category:'medical',field:'description',evidence:'待核對用途',reason:'具體使用用途尚待核對。'}]});
function fixture(){
  const f=createListingFixture({existing:true});
  f.sql.prepare("UPDATE store_shop_stores SET updated_at='2026-11-10T00:00:00.000Z' WHERE id=?").run(SHOP);
  f.sql.prepare("UPDATE store_shop_products SET status='draft',description='待核對用途',updated_at='2026-11-10T00:00:00.000Z' WHERE id=?").run(PRODUCT);
  const queries=[],db=f.env.ACTMASTER_DB;
  f.env.ACTMASTER_DB={...db,withSession(){return this;},prepare(query){queries.push(query);return db.prepare(query);},batch(statements){return db.batch(statements);}};
  const snapshot=()=>JSON.stringify(['users','store_shop_stores','store_shop_products','store_catalog_admin_audit','store_admin_product_audit'].map(table=>f.sql.prepare('SELECT * FROM '+table).all()));
  return {...f,queries,snapshot};
}

for(const decision of ['allow','reject','manual','error'])test('draft precheck '+decision+' never publishes or changes commerce data',async t=>{
  const f=fixture();t.after(f.close);
  f.state.review=()=>decision==='allow'?allowListing():decision==='error'?new Response('',{status:500}):blocked(decision);
  const before=f.snapshot(),response=await f.request(PATH,payload(),ADMIN),result=await response.json();
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.status,decision==='allow'?200:decision==='error'?503:422);
  if(decision==='allow')assert.deepEqual(result,{success:true,id:PRODUCT,reviewed:true,decision:'allow',published:false});
  else if(decision==='error')assert.equal(result.code,'LISTING_REVIEW_UNAVAILABLE');
  else {assert.equal(result.review.decision,decision);assert.equal(result.review.issues[0].evidence,'待核對用途');}
  assert.equal(f.snapshot(),before);assert.equal(f.count('store_listing_reviews'),decision==='error'?0:1);
  assert.ok(!f.queries.some(query=>query.includes('store_catalog_admin_audit')),'precheck does not read receipts or enter the publishing audit');
  if(['reject','manual'].includes(decision)){
    const reload=await f.call('/admin/catalog?shop='+SHOP,null,ADMIN);
    assert.equal(reload.products[0].status,'draft');assert.equal(reload.products[0].listing_review.decision,decision);
  }
});

test('only authenticated administrators can precheck drafts and methods remain no-store',async t=>{
  const f=fixture();t.after(f.close);const before=f.snapshot();
  for(const actor of [null,OWNER]){
    const response=await f.request(PATH,payload(),actor);assert.equal(response.status,actor?403:401);assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  for(const [method,status]of [['GET',405],['PUT',405],['DELETE',405],['OPTIONS',204]]){
    const response=await handleStoreAdminCatalog(new Request('https://test.invalid/v1/store-shop'+PATH,{method}),f.env,storeInviteProfileView,f.fetcher);
    assert.equal(response.status,status);assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  const response=await worker.fetch(new Request('https://test.invalid/v1/store-shop'+PATH,{method:'POST'}),f.env,{});
  assert.equal(response.status,401,'actual Worker entry routes the new endpoint behind authentication');
  assert.equal(f.state.providerCalls,0);assert.equal(f.snapshot(),before);
});

test('precheck rejects stale versions, active or archived products and cross-shop targets before review',async t=>{
  const f=fixture();t.after(f.close);
  f.sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,status,updated_at) VALUES(?,?,'另一店家','active','2026-11-10T00:00:00.000Z')").run(OTHER_SHOP,ADMIN);
  for(const [data,status]of [[payload({version:2}),409],[payload({shop_version:2}),409],[payload({shop_id:OTHER_SHOP}),404],[payload({id:OTHER_SHOP}),404]]){
    const before=f.snapshot();assert.equal((await f.call(PATH,data,ADMIN)).http,status);assert.equal(f.snapshot(),before);
  }
  for(const status of ['active','archived']){
    f.sql.prepare('UPDATE store_shop_products SET status=? WHERE id=?').run(status,PRODUCT);const before=f.snapshot();
    assert.equal((await f.call(PATH,payload(),ADMIN)).code,'DRAFT_PRODUCT_REQUIRED');assert.equal(f.snapshot(),before);
  }
  assert.equal(f.state.providerCalls,0);assert.equal(f.count('store_listing_reviews'),0);
});

test('precheck accepts no content changes, store edits, manual consent or extra authority',async t=>{
  const f=fixture();t.after(f.close);const before=f.snapshot();
  for(const data of [
    payload({type:'store',id:SHOP}),payload({changes:{status:'draft'}}),payload({changes:{status:'active',title:'改名'}}),
    payload({changes:{status:'active',purchase_mode:'online'}}),payload({manual_release:null}),
    payload({manual_release:{reference:'massage-online-20261019',confirmed:true}}),payload({owner_uid:OWNER}),
    payload({changes:{}}),payload({changes:[]}),payload({request_key:'bad'}),payload({version:0})
  ])assert.equal((await f.call(PATH,data,ADMIN)).http,400);
  assert.equal((await f.call(PATH+'?shop='+SHOP,payload(),ADMIN)).http,400);
  assert.equal(f.state.providerCalls,0);assert.equal(f.count('store_listing_reviews'),0);assert.equal(f.snapshot(),before);
});

test('precheck retains normalization, owner eligibility and redemption rules',async t=>{
  const f=fixture();t.after(f.close);
  f.sql.prepare("UPDATE store_shop_products SET redeem_type='percent',redeem_value=0 WHERE id=?").run(PRODUCT);
  let before=f.snapshot();assert.equal((await f.call(PATH,payload(),ADMIN)).http,400);assert.equal(f.snapshot(),before);
  f.sql.prepare("UPDATE store_shop_products SET redeem_type='none',redeem_value=0 WHERE id=?").run(PRODUCT);
  f.sql.prepare("UPDATE users SET role='redeem' WHERE line_id=?").run(OWNER);
  before=f.snapshot();assert.equal((await f.call(PATH,payload(),ADMIN)).http,400);assert.equal(f.snapshot(),before);
  f.sql.prepare("UPDATE users SET role='reward' WHERE line_id=?").run(OWNER);
  before=f.snapshot();assert.equal((await f.call(PATH,payload(),ADMIN)).http,403);assert.equal(f.snapshot(),before);assert.equal(f.state.providerCalls,0);
});

test('precheck cannot replay a publishing receipt and a later publish still needs fresh version and image checks',async t=>{
  const f=fixture();t.after(f.close);const data=payload(),before=f.snapshot();
  const result=await f.call(PATH,data,ADMIN);assert.equal(result.published,false);assert.equal(f.snapshot(),before);
  assert.equal(f.state.providerCalls,1);assert.equal((await f.call(PATH,data,ADMIN)).published,false);assert.equal(f.state.providerCalls,1);
  f.sql.prepare('UPDATE store_shop_products SET version=2 WHERE id=?').run(PRODUCT);
  assert.equal((await f.call('/admin/catalog',data,ADMIN)).http,409);assert.equal(f.count('store_catalog_admin_audit'),0);
  f.sql.prepare("UPDATE store_shop_products SET version=1,image_url='https://img.example.com/changed.png' WHERE id=?").run(PRODUCT);
  f.state.image=()=>new Response('',{status:302,headers:{Location:'https://img.example.com/redirect.png'}});
  assert.equal((await f.call('/admin/catalog',data,ADMIN)).code,'LISTING_IMAGE_UNREVIEWED');assert.equal(f.count('store_catalog_admin_audit'),0);
  f.sql.prepare("UPDATE store_shop_products SET image_url='' WHERE id=?").run(PRODUCT);
  assert.equal((await f.call('/admin/catalog',data,ADMIN)).http,200);assert.equal(f.count('store_catalog_admin_audit'),1);
  assert.equal((await f.call(PATH,data,ADMIN)).http,409,'a previous publish receipt cannot make precheck return publish success');
  assert.equal(f.count('store_catalog_admin_audit'),1);
});
