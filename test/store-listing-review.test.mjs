import test from 'node:test';
import assert from 'node:assert/strict';
import {requireListingReview,ListingReviewError,prepareListingContent,normalizeListingReview,listingCategories,listingPolicyVersion} from '../worker/store-listing-review.mjs';
import {PartnerDirectoryModule} from '../worker/partner-directory.mjs';
import {createListingFixture,OWNER,ADMIN,SHOP,PRODUCT} from './fixtures/store-listing-catalog.mjs';
import {allowListing} from './fixtures/store-listing-review.mjs';
const store=(extra={})=>({name:'合成咖啡店',description:'咖啡與手作蛋糕',status:'active',version:0,...extra});
const product=(extra={})=>({title:'咖啡',description:'手沖咖啡',price_cents:10000,redeem_type:'none',redeem_value:0,purchase_mode:'in_store',category:'食',status:'active',request_key:crypto.randomUUID(),...extra});
const blocked=(category,field,evidence,decision='reject',imageCount=0)=>({decision,checked_categories:[...listingCategories],image_count:imageCount,issues:[{category,field,evidence,reason:'此內容屬平台禁止上架範圍，需核對。'}]});
const cases=[['adult_industry','歡樂陪侍酒吧'],['fraud','保證投資月收益百分之五十'],['tobacco_alcohol','進口葡萄酒專卖'],['medical','醫療用器材耗材店'],['crime','購買假證件服務'],['sexual','成人色情影像訂閱'],['gambling','娛樂城投注平台'],['other','危險商品交易服務']];
for(const [category,name]of cases)test('synthetic provider rejects policy category '+category+' without publishing',async t=>{
  const f=createListingFixture();t.after(f.close);f.state.review=()=>blocked(category,'name',name);
  const result=await f.call('/store',store({name,approval:'allow',review:{decision:'allow'},clientOpenAIKey:'ignored'}));
  assert.equal(result.http,422);assert.equal(result.code,'LISTING_POLICY_REJECTED');assert.equal(f.count('store_shop_stores'),0);assert.equal(f.count('store_listing_reviews'),1);
  assert.equal(f.sql.prepare('SELECT policy_version FROM store_listing_reviews').get().policy_version,listingPolicyVersion);
  assert.equal(f.state.providerCalls,1);
});
test('safe coffee, hotel, haircut, nonmedical mask and anti-fraud education are not keyword-blocked',async t=>{
  const f=createListingFixture();t.after(f.close);
  for(const name of ['紅酒造型蠟燭','一般旅館酒店住宿','理髮美容咖啡店','一般布口罩','反詐教學：禁止販售毒品']){
    f.resetUsage();const existing=f.sql.prepare('SELECT version FROM store_shop_stores').get();
    assert.equal((await f.call('/store',store({name,version:existing?.version||0}))).http,200);
  }
  assert.equal(f.count('store_shop_stores'),1);
});
test('explicit prohibited sales cannot be allowed by provider or client approval',async t=>{
  const f=createListingFixture();t.after(f.close);
  for(const description of ['販售電子菸','買賣人頭帳戶','性交易服務','販售醫用口罩','線上賭場']){
    const r=await f.call('/store',store({description,reviewed:true,review_hash:'forged'}));assert.equal(r.http,422);assert.equal(r.code,'LISTING_POLICY_REJECTED');
  }
  assert.equal(f.state.providerCalls,0);assert.equal(f.count('store_shop_stores'),0);
});
test('missing key, failure, abort, refusal, malformed, incomplete and forged evidence all fail closed',async t=>{
  for(const provider of [()=>new Response('',{status:500}),()=>{throw new DOMException('synthetic-only','TimeoutError');},()=>Response.json({status:'completed',output:[{content:[{type:'refusal',refusal:'no'}]}]}),()=>Response.json({status:'incomplete',output:[]}),()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:'not json'}]}]}),()=>({...allowListing(),checked_categories:['fraud']}),()=>blocked('fraud','name','invented evidence')]){
    const f=createListingFixture();try{f.state.review=provider;const r=await f.call('/store',store());assert.equal(r.http,503);assert.match(r.code,/LISTING_REVIEW_/);assert.match(r.diagnosticId,/^LR-[0-9a-f-]+$/);assert.ok(r.error.includes(r.diagnosticId));assert.equal(f.count('store_shop_stores'),0);}finally{f.close();}
  }
  const f=createListingFixture();t.after(f.close);delete f.env.OPENAI_API_KEY;assert.equal((await f.call('/store',store())).http,503);assert.equal(f.state.providerCalls,0);
});
test('draft/archived writes and legacy read-only listings do not depend on AI tables/key',async t=>{
  const f=createListingFixture({existing:true});t.after(f.close);delete f.env.OPENAI_API_KEY;
  f.sql.exec('DROP TABLE store_listing_reviews;DROP TABLE store_listing_review_usage;');
  assert.equal((await f.call('?shop='+SHOP)).products.length,1);
  assert.equal((await f.call('/product',product({id:PRODUCT,version:1,status:'archived'}))).http,200);
  assert.equal((await f.call('/store',store({version:1,status:'draft',description:'可留草稿核對'}))).http,200);assert.equal(f.state.providerCalls,0);
});
test('reject/manual leave existing public store/product data and point identities unchanged',async t=>{
  const f=createListingFixture({existing:true});t.after(f.close);
  const before=JSON.stringify(f.sql.prepare('SELECT * FROM users').all()),stores=JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_stores').all()),products=JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_products').all());
  f.state.review=()=>blocked('fraud','description','保證高收益','manual');
  assert.equal((await f.call('/store',store({version:1,description:'保證高收益'}))).code,'LISTING_REVIEW_REQUIRED');
  f.resetUsage();assert.equal((await f.call('/product',product({id:PRODUCT,version:1,description:'保證高收益'}))).http,422);
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM users').all()),before);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_stores').all()),stores);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM store_shop_products').all()),products);
});
test('administrator editing and assisted uploading cannot bypass policy or write commerce audit',async t=>{
  const f=createListingFixture({existing:true});t.after(f.close);f.state.review=()=>blocked('sexual','description','成人色情影像');
  for(const type of ['store','product']){
    f.resetUsage();const r=await f.call('/admin/catalog',{type,id:type==='store'?SHOP:PRODUCT,shop_id:SHOP,shop_version:1,version:1,request_key:crypto.randomUUID(),changes:{description:'成人色情影像',status:'active'}},ADMIN);
    assert.equal(r.http,422);assert.equal(f.count('store_catalog_admin_audit'),0);
  }
  f.resetUsage();assert.equal((await f.call('/admin/products',{...product({description:'成人色情影像'}),shop_id:SHOP,shop_version:1},ADMIN)).http,422);assert.equal(f.count('store_admin_product_audit'),0);assert.equal(f.count('store_shop_products'),1);
});
test('partner-directory activation blocks prohibited content before partner/policy/location writes',async t=>{
  const f=createListingFixture();t.after(f.close);
  const r=await PartnerDirectoryModule.save({authenticatedUserId:ADMIN,partner:{name:'非法店家',description:'販售毒品',status:'active'},redeemPolicy:{enabled:true},location:{branchName:'新分店'}},f.env,f.fetcher);
  assert.equal(r.code,'LISTING_POLICY_REJECTED');for(const table of ['point_redemption_partners','point_redemption_partner_policies','point_redemption_partner_locations'])assert.equal(f.count(table),0);
  assert.equal((await PartnerDirectoryModule.save({partner:{name:'保留草稿',status:'draft'}},f.env,f.fetcher)).success,true);
});
test('images are inlined, checked and byte-hashed; links do not receive server/LINE secrets',async t=>{
  const f=createListingFixture();t.after(f.close);const value=store({image_url:'https://img.example.com/card.png',phone:'PRIVATE_PHONE',address:'PRIVATE_ADDRESS'});
  assert.equal((await f.call('/store',value)).http,200);
  const body=f.state.requests.find(r=>r.input),image=f.state.requests.find(r=>r.image);
  assert.equal(body.input[0].content[1].type,'input_image');assert.match(body.input[0].content[1].image_url,/^data:image\/png;base64,/);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
  assert.equal(body.model,'gpt-4.1-mini');
  for(const secret of [OWNER,'PRIVATE_PHONE','PRIVATE_ADDRESS','synthetic-listing-key'])assert(!JSON.stringify(body).includes(secret));assert.equal(image.opts.redirect,'manual');assert.equal(image.opts.headers.Authorization,undefined);
  f.resetUsage();assert.equal((await f.call('/store',{...value,version:1})).http,200);assert.equal(f.state.providerCalls,1);
  f.state.image=()=>{const b=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');b[40]^=1;return new Response(b,{headers:{'Content-Type':'image/png'}});};
  f.resetUsage();assert.equal((await f.call('/store',{...value,version:2})).http,200);assert.equal(f.state.providerCalls,2);
});
test('image-only prohibited result rejects; redirects, internal URLs, oversized and wrong magic never pass',async t=>{
  const f=createListingFixture();t.after(f.close);f.state.review=()=>blocked('tobacco_alcohol','image','第 1 張正中央為電子菸販售圖','reject',1);
  assert.equal((await f.call('/store',store({image_url:'https://img.example.com/only.png'}))).code,'LISTING_POLICY_REJECTED');assert.equal(f.count('store_shop_stores'),0);
  for(const image of [()=>new Response('',{status:302,headers:{Location:'http://127.0.0.1'}}),()=>new Response('notimage',{headers:{'Content-Type':'image/png'}}),()=>new Response('',{headers:{'Content-Type':'image/png','Content-Length':'4194305'}})]){
    f.state.image=image;const r=await f.call('/store',store({image_url:'https://img.example.com/new.png'}));assert.equal(r.http,422);assert.equal(r.code,'LISTING_IMAGE_UNREVIEWED');
  }
  assert.equal((await f.call('/store',store({image_url:'https://127.0.0.1/private.png'}))).code,'LISTING_IMAGE_INVALID');assert.equal(f.state.providerCalls,1);
});
test('content changes invalidate approval; a version race after approval preserves the newer store',async t=>{
  const f=createListingFixture({existing:true});t.after(f.close);
  f.state.review=()=>{f.sql.exec("UPDATE store_shop_stores SET version=version+1,name='較新的資料';");return allowListing();};
  assert.equal((await f.call('/store',store({version:1}))).http,409);assert.equal(f.sql.prepare('SELECT name FROM store_shop_stores').get().name,'較新的資料');
  f.resetUsage();f.state.review=()=>blocked('fraud','description','保證高收益');assert.equal((await f.call('/store',store({version:2,description:'保證高收益'}))).http,422);assert.equal(f.state.providerCalls,2);
});
test('missing audit schema and audit persistence failure cannot publish',async t=>{
  for(const kind of ['missing','failure']){const f=createListingFixture();try{
    if(kind==='missing')f.sql.exec('DROP TABLE store_listing_reviews;');else f.sql.exec("CREATE TRIGGER deny_audit BEFORE INSERT ON store_listing_reviews BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
    assert.equal((await f.call('/store',store())).http,503);assert.equal(f.count('store_shop_stores'),0);
  }finally{f.close();}}
});
test('eligibility revoked during AI wait cannot create or publish a store',async t=>{
  for(const existing of [false,true]){const f=createListingFixture({existing});try{
    f.state.review=()=>{f.sql.prepare("UPDATE users SET role='guest' WHERE line_id=?").run(OWNER);return allowListing();};
    const r=await f.call('/store',store({version:existing?1:0}));assert.equal(r.http,existing?409:403);assert.equal(f.count('store_shop_stores'),existing?1:0);
    if(existing)assert.equal(f.sql.prepare('SELECT name,version FROM store_shop_stores').get().name,'原咖啡店');
  }finally{f.close();}}
});
test('actual per-actor quota is atomic, bounded and cache does not consume another attempt',async t=>{
  const f=createListingFixture();t.after(f.close);
  const review=(name)=>requireListingReview({value:store({name}),scope:'store:'+OWNER,uid:OWNER,env:f.env,fetcher:f.fetcher});
  await review('咖啡一');await review('咖啡一');assert.equal(f.state.providerCalls,1);
  await assert.rejects(review('咖啡二'),e=>e instanceof ListingReviewError&&e.status===429);
  for(let n=1;n<60;n++){f.sql.exec('UPDATE store_listing_review_usage SET next_allowed_at=0;');await review('咖啡'+n);}
  f.sql.exec('UPDATE store_listing_review_usage SET next_allowed_at=0;');await assert.rejects(review('達上限'),e=>e.code==='LISTING_REVIEW_LIMIT');assert.equal(f.state.providerCalls,60);
});
test('normalizer refuses partial category coverage, missing images and contradictory results',()=>{
  const p=prepareListingContent(store());
  for(const value of [{...allowListing(),decision:'reject'},{...allowListing(),image_count:1},{...allowListing(),checked_categories:[...listingCategories.slice(1),'fraud']},blocked('fraud','image','not inspected')])assert.throws(()=>normalizeListingReview(value,p,0),ListingReviewError);
});
test('uses existing server model/key choices, never client overrides',async t=>{
  const f=createListingFixture();t.after(f.close);f.env.OPENAI_VISION_MODEL='configured-server-vision';f.env.OPENAI_MODEL='configured-server-text';
  assert.equal((await f.call('/store',store({model:'client-model',clientOpenAIKey:'client-key',OPENAI_API_KEY:'client-key'}))).http,200);
  assert.equal(f.state.requests.find(r=>r.input).model,'configured-server-vision');
});
