import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {handleStoreShop} from '../worker/store-shop.mjs';
import {adminPartnerShops,publicPartnerShops} from '../worker/store-partner-catalog.mjs';
import {parseCard} from '../tools/collect-aiwe-partners.mjs';
import {partnerHandle,prepareImport} from '../tools/prepare-aiwe-import.mjs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const id=handle=>handle.slice(8).replace(/^(........)(....)(....)(....)(............)$/,'$1-$2-$3-$4-$5');
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT);');
 for(const file of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql']){
   sql.exec(read('migrations/'+file));
 }
 return {sql,db:{prepare(query){let args=[];return {bind(...values){args=values;return this;},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async first(){return sql.prepare(query).get(...args)||null;}};},async batch(statements){return Promise.all(statements.map(s=>s.all()));}}};
}
function setup(){const f=fixture();f.sql.exec(read('migrations/0019_point_redemption_partner_directory.sql'));return f;}
const candidate=(n=1,extra={})=>({source_id:String(n),source_url:`https://aiwe.cc/index.php/linecard_13/${n}/?share=1`,name:'店家'+n,description:'提供日常生活用品與專業服務，歡迎來電預約洽詢。',image_url:'https://images.test/shop.jpg',phone:'0911'+String(n).padStart(6,'0'),line_url:'',website_url:'',maps_url:'',address:'',hours:'',region:'北部地區',reasons:[],...extra});
const add=(sql,n,extra={})=>{const plan=prepareImport([candidate(n,extra)],[]);sql.exec(plan.sql);return id(partnerHandle(n));};
const call=(db,path='')=>handleStoreShop(new Request('https://test/v1/store-shop'+path),{ACTMASTER_DB:db});

test('active complete partners are public without accounts and expose no financial authority',async()=>{
 const {sql,db}=setup();try{
  const key=add(sql,1);const res=await (await call(db,'?shop='+key)).json();
  assert.equal(res.success,true);assert.equal(res.shop.listing_only,1);assert.equal(res.shop.merchant_enabled,0);assert.deepEqual(res.products,[]);
  assert.equal('owner_uid'in res.shop,false);assert.equal('partner_id'in res.shop,false);
  assert.equal(sql.prepare('SELECT count(*) n FROM users').get().n,0);
  assert.equal(sql.prepare('SELECT count(*) n FROM store_shop_stores').get().n,0);
  assert.equal(sql.prepare('SELECT count(*) n FROM point_redemption_partner_policies').get().n,0);
  assert.equal((await call(db,'/manage')).status,401);
 }finally{sql.close();}
});
test('hidden, suspended, archived, draft and incomplete listings are excluded in list and direct links',async()=>{
 const {sql,db}=setup();try{
  const key=add(sql,1);
  for(const status of ['hidden','suspended','archived','draft']){
   sql.prepare('UPDATE point_redemption_partners SET status=?').run(status);
   assert.equal((await call(db,'?shop='+key)).status,404);assert.equal((await publicPartnerShops(db)).length,0);
  }
  sql.exec("UPDATE point_redemption_partners SET status='active',description='請填寫公司介紹';");
  assert.equal((await publicPartnerShops(db)).length,0);
  sql.exec("UPDATE point_redemption_partners SET description='提供日常生活用品與專業服務，歡迎來電預約洽詢。',cover_image_url='javascript:bad';");
  assert.equal((await publicPartnerShops(db)).length,0);
 }finally{sql.close();}
});
test('mixed catalog cursor pages have no missing or duplicate shops; search is parameterized',async()=>{
 const {sql,db}=setup();try{
  for(let n=1;n<=85;n++)add(sql,n);
  sql.exec("INSERT INTO users VALUES ('owner','store'); INSERT INTO store_shop_stores(id,owner_uid,name,status,updated_at) VALUES ('77777777-7777-4777-8777-777777777777','owner','原店面','active','2026-09-19');");
  let after='',all=[];
  do{const r=await (await call(db,'?after='+after)).json();assert.ok(r.shops.length<=40);all.push(...r.shops);after=r.next;}while(after);
  assert.equal(all.length,86);assert.equal(new Set(all.map(s=>s.id)).size,86);
  assert.equal((await publicPartnerShops(db,{q:"' OR 1=1 --"})).length,0);
  assert.equal((await publicPartnerShops(db,{q:'店家85'})).length,1);
  sql.exec("UPDATE point_redemption_partners SET category='食' WHERE name='店家85'");
  assert.equal((await publicPartnerShops(db,{category:'食'})).length,1);
 }finally{sql.close();}
});
test('admin directory counts and lists ownerless records, including hidden and incomplete ones',async()=>{
 const {sql,db}=setup();try{
  for(let n=1;n<=25;n++)add(sql,n);
  sql.exec("UPDATE point_redemption_partners SET status='draft' WHERE name='店家1'; UPDATE point_redemption_partners SET status='suspended' WHERE name='店家2';");
  const r=await adminPartnerShops(db,{});assert.deepEqual({...r.summary},{total:25,active:23,draft:1});assert.equal(r.shops.length,21);
  const draft=await adminPartnerShops(db,{status:'draft'});assert.equal(draft.total,1);assert.equal(draft.shops[0].public_visible,0);assert.equal(draft.shops[0].owner_uid,'');
  assert.match(draft.shops[0].owner_name,/未綁定/);
 }finally{sql.close();}
});
test('missing legacy partner schema is optional but other database errors are not swallowed',async()=>{
 const {sql,db}=fixture();try{assert.deepEqual(await publicPartnerShops(db),[]);assert.equal((await adminPartnerShops(db,{})).total,0);}finally{sql.close();}
 await assert.rejects(publicPartnerShops({prepare(){throw Error('DB unavailable');}}),/DB unavailable/);
});
test('public-source parser uses header cover, rejects boilerplate and strips OAuth/default links',()=>{
 const html='<script>var flex={"header":{"url":"https://img.test/cover.jpg"},"body":{"text":"測試商店","items":[{"text":"提供專業居家清潔與日常生活服務，歡迎預約。"}]},"footer":{"uri":"tel:0911222333","items":[{"uri":"https://google.com/"},{"uri":"https://access.line.me/oauth2/v2.1/authorize"}]}};</script>';
 const c=parseCard(html,42,'北部地區');assert.equal(c.image_url,'https://img.test/cover.jpg');assert.equal(c.website_url,'');assert.deepEqual(c.reasons,[]);
 assert.ok(parseCard(html.replace('提供專業居家清潔與日常生活服務，歡迎預約。','請填寫公司/店家特色'),42,'北部地區').reasons.length);
});
test('import is idempotent, preserves edits/status, and skips duplicates and incomplete sources',()=>{
 const {sql}=setup();try{
  const plan=prepareImport([candidate(1,{name:"O'店家"}),candidate(2,{reasons:['缺圖片']}),candidate(3,{phone:'0911000001'})],[]);
  assert.equal(plan.approved.length,1);assert.equal(plan.skipped.length,2);sql.exec(plan.sql);
  sql.exec("UPDATE point_redemption_partners SET name='已編輯',status='hidden'");sql.exec(plan.sql);
  assert.equal(sql.prepare('SELECT count(*) n FROM point_redemption_partners').get().n,1);
  assert.deepEqual({...sql.prepare('SELECT name,status FROM point_redemption_partners').get()},{name:'已編輯',status:'hidden'});
  assert.equal(sql.prepare('SELECT count(*) n FROM point_redemption_partner_locations').get().n,1);
  assert.doesNotMatch(plan.sql,/UPDATE|DELETE|users|ledger|INSERT INTO point_redemption_partner_policies/);
 }finally{sql.close();}
});
test('display-only view renders escaped contact/description, no product or checkout controls',async()=>{
 const source=read('js/modules/store-shop.js');const code=source.slice(source.indexOf('    async function view(id)'),source.indexOf('    function input('));
 const content={innerHTML:''},notice={hidden:false};const context={content,root:{querySelector:()=>notice},epoch:0,alert:{},pageKind(){},api:async()=>({shop:{id:'x',listing_only:1,name:'<bad>',description:'測試',phone:'0911222333',line_url:'javascript:alert(1)',website_url:'https://example.com',maps_url:'https://user:pass@example.com'},products:[]}),esc:v=>String(v||'').replaceAll('<','&lt;').replaceAll('>','&gt;'),photo:()=>'',URL};
 await vm.runInNewContext(code+';view("x")',context);
 assert.match(content.innerHTML,/&lt;bad&gt;/);assert.match(content.innerHTML,/tel:0911222333/);assert.match(content.innerHTML,/https:\/\/example.com/);
 assert.doesNotMatch(content.innerHTML,/javascript:|user:pass|data-do="online-buy"|member-qr|尚未上架商品/);
 assert.equal(notice.hidden,true);
});
