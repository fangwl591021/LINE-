// Local projection and in-memory authenticated routes only. No live accounts or writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {storeInviteProfileView,getContractAdminNotificationIds,getContractAdminNotificationNames} from '../workerbackup.js';
import {createListingFixture,OWNER,ADMIN,SHOP,PRODUCT} from './fixtures/store-listing-catalog.mjs';

const allowed=['redeem','扣點用戶','store','店長','admin','總管','REDEEM','STORE','ADMIN','ReDeEm','StOrE','AdMiN'];
const denied=['user','用戶','member','會員','reward','贈點用戶','REWARD','tenant','租戶','TENANT','staff','manager','administrator','總管理員','unknown','',' store','store ','ADMIN ',null,undefined,0,false];
const view=role=>storeInviteProfileView({line_id:OWNER,name:'合成資格測試',role});
const requestKey='55555555-1111-4111-8111-111111111111';

for(const role of allowed)test('retail eligibility allows only approved raw role '+role,()=>{
  const profile=view(role);assert.equal(profile.retailSellerEligible,true);assert.equal(typeof profile.retailSellerEligible,'boolean');
});
for(const role of denied)test('retail eligibility rejects non-seller raw role '+String(role),()=>{
  const profile=view(role);assert.equal(profile.retailSellerEligible,false);assert.equal(typeof profile.retailSellerEligible,'boolean');
});

test('missing raw role produces a boolean false without publishing the raw role',()=>{
  const profile=storeInviteProfileView({line_id:OWNER,name:'合成缺角色會員'});
  assert.equal(profile.retailSellerEligible,false);assert.equal(typeof profile.retailSellerEligible,'boolean');
  for(const key of ['rawRole','raw_role','databaseRole','database_role'])assert.equal(Object.hasOwn(profile,key),false);
});

test('legacy tenant projection stays compatible while retail eligibility remains false',()=>{
  for(const role of ['tenant','租戶','TENANT']){
    const profile=view(role);assert.equal(profile.role,'store');assert.equal(profile.roleLabel,'店長');assert.equal(profile.retailSellerEligible,false);
    for(const key of ['rawRole','raw_role'])assert.equal(Object.hasOwn(profile,key),false);
  }
});

test('protected administrator role projection does not turn a raw user into a retail seller',()=>{
  let protectedUser=null;
  for(const line_id of getContractAdminNotificationIds()){
    for(const name of getContractAdminNotificationNames()){
      const row={line_id,name,role:'user'},profile=storeInviteProfileView(row);
      if(profile?.role==='admin'){protectedUser={row,profile};break;}
    }
    if(protectedUser)break;
  }
  assert.ok(protectedUser,'fixture must exercise an existing protected administrator identity');
  assert.equal(protectedUser.profile.role,'admin');assert.equal(protectedUser.profile.retailSellerEligible,false);
  assert.equal(storeInviteProfileView({...protectedUser.row,role:'admin'}).retailSellerEligible,true);
});

for(const role of allowed)test('projection agrees with the fresh server role gate for '+role,async t=>{
  const f=createListingFixture({existing:true});t.after(()=>f.close());
  f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role,OWNER);
  const changes=f.sql.prepare('SELECT total_changes() n').get().n;
  assert.equal(view(role).retailSellerEligible,true);
  assert.equal((await f.call('/manage',undefined,OWNER)).http,200);
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,changes,'a qualification read cannot modify the catalog');
});

for(const role of ['user','用戶','member','reward','贈點用戶','REWARD','tenant','租戶','TENANT','staff','',null])test('blocked raw role cannot write through own, AI or administrator product routes: '+String(role),async t=>{
  const f=createListingFixture({existing:true});t.after(()=>f.close());
  f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role,OWNER);
  const snapshot=()=>JSON.stringify({stores:f.sql.prepare('SELECT * FROM store_shop_stores ORDER BY id').all(),products:f.sql.prepare('SELECT * FROM store_shop_products ORDER BY id').all()});
  const before=snapshot(),changes=f.sql.prepare('SELECT total_changes() n').get().n;
  const product={title:'不應建立的合成商品',description:'',image_url:'',price_cents:10000,category:'購',status:'active',redeem_type:'percent',redeem_value:10,purchase_mode:'in_store',request_key:requestKey,role:'admin',owner_uid:ADMIN};
  assert.equal(view(role).retailSellerEligible,false);
  assert.equal((await f.call('/manage',undefined,OWNER)).http,403);
  for(const [path,data]of [
    ['/store',{name:'不應建立的店面',status:'draft',version:0,role:'admin',owner_uid:ADMIN}],
    ['/product',product],
    ['/product',{...product,id:PRODUCT,version:1}],
    ['/product-ocr',{role:'admin',owner_uid:ADMIN}],
    ['/store-ai-draft',{name:'不應送AI的店面',role:'admin',owner_uid:ADMIN}]
  ])assert.equal((await f.call(path,data,OWNER)).http,403,path);
  assert.equal((await f.call('/admin/products',{shop_id:SHOP,shop_version:1,...product,role:undefined,owner_uid:undefined},ADMIN)).http,403,'administrator cannot grant the target product rights');
  const edit={type:'product',id:PRODUCT,shop_id:SHOP,version:1,shop_version:1,request_key:requestKey,changes:{status:'active'}};
  assert.equal((await f.call('/admin/catalog',edit,ADMIN)).http,403,'administrator editing still requires target seller eligibility');
  assert.equal((await f.call('/admin/catalog/review',edit,ADMIN)).http,403,'review-only does not bypass target seller eligibility');
  assert.equal(snapshot(),before,'existing catalog records must remain unchanged');
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,changes,'rejected routes must make no database writes');
  assert.equal(f.count('store_admin_product_audit'),0);assert.equal(f.count('store_catalog_admin_audit'),0);assert.equal(f.count('store_listing_reviews'),0);assert.equal(f.state.providerCalls,0);
});
