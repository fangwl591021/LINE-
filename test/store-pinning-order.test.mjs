// Public catalog reads over disposable SQLite; no accounts, network or writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreShop} from '../worker/store-shop.mjs';
import {adminPartnerShops} from '../worker/store-partner-catalog.mjs';

const seeds=['0123456789abcdef','fedcba9876543210',''];
const uuid=(kind,n)=>`${kind}${String(n).padStart(7,'0')}-1111-4111-8111-111111111111`;
const handle=id=>'partner_'+id.replaceAll('-','');
function fixture(t,{pins=true}={}){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT);');
  const migrations=['0019_point_redemption_partner_directory.sql','0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0064_store_product_shipping.sql','0084_store_publication_order.sql'];
  if(pins)migrations.push('0085_store_catalog_pins.sql');
  for(const name of migrations)sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const reads=[];let dbFailure=false;
  const db={prepare(query){
    const statement=(args=[])=>({bind(...values){return statement(values);},async all(){
      if(dbFailure)throw Error('synthetic database unavailable');
      const results=sql.prepare(query).all(...args);reads.push({query,count:results.length});return {success:true,results};
    },async first(){
      if(dbFailure)throw Error('synthetic database unavailable');
      const result=sql.prepare(query).get(...args)||null;reads.push({query,count:Number(!!result)});return result;
    }});return statement();
  },async batch(statements){return Promise.all(statements.map(statement=>statement.all()));}};
  const shop=(n,extra={})=>{
    const id=uuid('1',n),owner='synthetic-owner-'+n;
    sql.prepare('INSERT INTO users VALUES(?,?)').run(owner,extra.role||'store');
    sql.prepare('INSERT INTO store_shop_stores(id,owner_uid,name,description,category,address,status,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,owner,extra.name||'合成店家'+n,'提供日常生活用品與專業服務，歡迎來電預約洽詢。',extra.category||'食',extra.address||'板橋合成路',extra.status||'active',extra.updated_at||'2026-11-01T00:00:00Z');
    return id;
  };
  const partner=(n,extra={})=>{
    const id=uuid('8',n);
    sql.prepare('INSERT INTO point_redemption_partners(partner_handle,name,description,category,phone,cover_image_url,status,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(extra.handle||handle(id),extra.name||'合成合作店'+n,extra.description??'提供日常生活用品與專業服務，歡迎來電預約洽詢。',extra.category||'食','0912345678','https://images.test/shop.jpg',extra.status||'active',extra.updated_at||'2026-11-01T00:00:00Z');
    return id;
  };
  const pin=(source,id,pinned=1)=>sql.prepare('INSERT INTO store_catalog_pins(source,entity_id,pinned,version,updated_by,updated_at,request_key) VALUES(?,?,?,?,?,?,?) ON CONFLICT(source,entity_id) DO UPDATE SET pinned=excluded.pinned,version=version+1').run(source,source==='partner'?handle(id):id,pinned,7,'private-synthetic-actor','2026-11-11T00:00:00Z',source+id);
  const call=async(params={},enabled=true)=>{
    const response=await handleStoreShop(new Request('https://catalog.invalid/v1/store-shop?'+new URLSearchParams(params)),{ACTMASTER_DB:db,...(enabled===undefined?{}:{STORE_DIRECTORY_PINNING_ENABLED:enabled})},()=>{throw Error('External calls forbidden');});
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    return {status:response.status,...await response.json()};
  };
  const walk=async(params={},enabled=true)=>{
    const rows=[],pages=[];let after='';
    do{
      const page=await call({...params,after},enabled);assert.equal(page.status,200,JSON.stringify(page));assert.ok(page.shops.length<=40);
      rows.push(...page.shops);pages.push(page);after=page.next;assert.ok(pages.length<10,'cursor must terminate');
    }while(after);
    return {rows,pages};
  };
  return {sql,db,reads,shop,partner,pin,call,walk,fail:()=>{dbFailure=true;}};
}
const safePublic=rows=>{
  for(const row of rows){
    assert.equal(typeof row.pinned,'boolean');
    for(const key of ['owner_uid','catalog_rank','updated_by','actor_uid','pin_version','pin_source','request_key'])assert.equal(key in row,false,key+' must not be public');
  }
};

test('pin priority precedes both source reads and remains complete across every mixed-source page',async t=>{
  const f=fixture(t),pins=new Set();
  for(let n=1;n<=65;n++)for(const source of ['shop','partner']){
    const id=f[source](n);if(n>20){f.pin(source,id);pins.add(id);}
  }
  const changes=f.sql.prepare('SELECT total_changes() n').get().n;
  const orders=[];
  for(const seed of seeds){
    const original=await f.walk(seed?{seed}:{},false);f.reads.length=0;
    const {rows,pages}=await f.walk(seed?{seed}:{});
    const expected=[...original.rows.filter(row=>pins.has(row.id)),...original.rows.filter(row=>!pins.has(row.id))].map(row=>row.id);
    assert.deepEqual(rows.map(row=>row.id),expected);assert.equal(rows.length,130);assert.equal(new Set(rows.map(row=>row.id)).size,130);
    assert.deepEqual(rows.map(row=>row.pinned),[...Array(90).fill(true),...Array(40).fill(false)]);
    assert.ok(pages[0].shops.every(row=>row.pinned)&&pages[1].shops.every(row=>row.pinned),'>40 pins span pages');
    assert.ok(pages.every(page=>!page.next||page.next.startsWith('r2.'+(seed||'-')+'.')));safePublic(rows);
    assert.equal(f.reads.length,pages.length*2,'one bounded read per source, no per-shop pin reads');
    assert.ok(f.reads.every(read=>read.count<=41&&!/\bOFFSET\b|random\(/i.test(read.query)));
    orders.push(rows.map(row=>row.id));
  }
  assert.notDeepEqual(orders[0],orders[1],'visit seeds still change order within pin tiers');
  assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,changes,'public reads never write');
});

test('search and category filters constrain pins before pagination',async t=>{
  const f=fixture(t);
  for(let n=1;n<=50;n++)for(const source of ['shop','partner']){
    const id=f[source](n,{category:n%2?'食':'購',name:(n%3?'合成':'板橋專區')+source+n});
    if(n%2===0)f.pin(source,id);
  }
  for(const params of [{category:'食'},{category:'購'},{q:'板橋專區'},{category:'購',q:'板橋專區'}]){
    const original=await f.walk({...params,seed:seeds[0]},false),result=await f.walk({...params,seed:seeds[0]});
    assert.deepEqual(new Set(result.rows.map(row=>row.id)),new Set(original.rows.map(row=>row.id)));
    const tiers=result.rows.map(row=>Number(row.pinned));assert.deepEqual(tiers,[...tiers].sort((a,b)=>b-a));
    if(params.category)assert.ok(result.rows.every(row=>row.category===params.category));
    if(params.q)assert.ok(result.rows.every(row=>row.name.includes(params.q)));
  }
  assert.deepEqual((await f.call({q:"' OR 1=1 --"})).shops,[]);
});

test('pinned metadata cannot expose hidden, incomplete, malformed or role-ineligible shops',async t=>{
  const f=fixture(t),hidden=[];
  hidden.push(f.shop(1,{status:'draft'}),f.shop(2,{role:'user'}),f.shop(3,{role:'reward'}),f.shop(4,{role:'tenant'}));
  for(const status of ['draft','hidden','suspended','archived'])hidden.push(f.partner(10+hidden.length,{status}));
  hidden.push(f.partner(30,{description:'太短'}),f.partner(31,{handle:'partner_invalid'}));
  for(const id of hidden)f.pin(id.startsWith('1')?'shop':'partner',id);
  const visible=[f.shop(100),f.partner(100)];for(const id of visible)f.pin(id.startsWith('1')?'shop':'partner',id);
  assert.deepEqual(new Set((await f.walk()).rows.map(row=>row.id)),new Set(visible));
  for(const id of hidden)assert.equal((await f.call({shop:id})).status,404);
  for(const id of visible){const result=await f.call({shop:id});assert.equal(result.status,200);assert.equal(result.shop.pinned,true);safePublic([result.shop]);}
  const unpinned=f.shop(101);assert.equal((await f.call({shop:unpinned})).shop.pinned,false);
});

test('r2 cursors bind pin tier, seed mode and rank, rejecting legacy or malformed positions',async t=>{
  const f=fixture(t);for(let n=1;n<=50;n++){const id=f.shop(n);if(n>10)f.pin('shop',id);}
  const legacy=(await f.call({seed:seeds[0]},false)).next,seeded=(await f.call({seed:seeds[0]})).next,plain=(await f.call()).next;
  assert.ok(seeded&&plain&&legacy);
  for(const params of [{after:uuid('1',40)},{seed:seeds[0],after:legacy},{after:seeded},{seed:seeds[0],after:plain},{seed:seeds[1],after:seeded},{seed:seeds[0],after:seeded.replace(/\.([01])\./,'.2.')},{seed:seeds[0],after:seeded.split('.').map((value,index)=>index===3?'zzzzzzz':value).join('.')},{seed:'bad'},{after:'r2.-.1.0.'+"' OR 1=1"}]){
    const result=await f.call(params);assert.equal(result.status,400,JSON.stringify(params));assert.match(result.error,/重新開啟/);
  }
  assert.equal((await f.call({seed:seeds[0],after:seeded})).status,200);
  assert.equal((await f.call({after:plain})).status,200);
});

test('disabled rollout preserves old cursors and shape without requiring the pin schema',async t=>{
  const f=fixture(t,{pins:false});for(let n=1;n<=45;n++){f.shop(n);f.partner(n);}
  for(const enabled of [false,'false',undefined])for(const seed of seeds){
    // Omit the switch entirely for the undefined case.
    const env=enabled===undefined?{ACTMASTER_DB:f.db}:{ACTMASTER_DB:f.db,STORE_DIRECTORY_PINNING_ENABLED:enabled};
    const response=await handleStoreShop(new Request('https://catalog.invalid/v1/store-shop?'+new URLSearchParams(seed?{seed}:{})),env);
    const first=await response.json();assert.equal(response.status,200);assert.ok(first.shops.every(row=>!('pinned'in row)));
    assert.match(first.next,seed?/^r1\./:/^[0-9a-f-]{36}$/);
    const next=await handleStoreShop(new Request('https://catalog.invalid/v1/store-shop?'+new URLSearchParams({...seed?{seed}:{},after:first.next})),env);
    assert.equal(next.status,200);
  }
  assert.ok(f.reads.every(read=>!read.query.includes('store_catalog_pins')));
  assert.equal((await f.call({},true)).status,503);assert.equal((await f.call({shop:uuid('1',1)},'true')).status,503);
});

test('enabled pin reads fail closed on actual database failures',async t=>{
  const f=fixture(t);f.shop(1);f.fail();assert.equal((await f.call()).status,503);assert.equal((await f.call({shop:uuid('1',1)})).status,503);
});

test('newest remains publication-time only when pin state changes',async t=>{
  const f=fixture(t),older=f.shop(1,{updated_at:'2026-11-01T00:00:00Z'}),middle=f.partner(2,{updated_at:'2026-11-02T00:00:00Z'}),newer=f.shop(3,{updated_at:'2026-11-03T00:00:00Z'}),latest=f.partner(4,{updated_at:'2026-11-04T00:00:00Z'});
  const before=await f.call({discovery:'newest'});assert.deepEqual(before.shops.map(row=>row.id),[latest,newer,middle]);
  f.pin('shop',older);f.pin('partner',middle);f.pin('partner',latest,0);
  const publications=JSON.stringify(f.sql.prepare('SELECT * FROM store_publication_order').all());f.reads.length=0;
  assert.deepEqual(await f.call({discovery:'newest'}),before);
  assert.ok(f.reads.every(read=>!read.query.includes('store_catalog_pins')));
  assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM store_publication_order').all()),publications);
});

test('admin partner pin projection remains id-paged and exposes no pin actor or request key',async t=>{
  const f=fixture(t);for(let n=1;n<=25;n++){const id=f.partner(n);if(n>=20)f.pin('partner',id);}
  const legacy=await adminPartnerShops(f.db,{}),first=await adminPartnerShops(f.db,{},true);
  assert.deepEqual(first.shops.map(row=>row.id),legacy.shops.map(row=>row.id));assert.equal(first.shops.length,21);
  assert.ok(legacy.shops.every(row=>!('pinned'in row)));
  for(const row of first.shops){assert.equal(row.pin_source,'partner');assert.equal(row.pin_version,row.pinned?7:0);assert.equal('updated_by'in row,false);assert.equal('request_key'in row,false);}
  const next=await adminPartnerShops(f.db,{after:first.shops[19].id},true);assert.equal(next.shops.length,5);
});
