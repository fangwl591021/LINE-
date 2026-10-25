import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { defaultCheckinDashboardConfig, normalizeCheckinDashboardConfig, buildCheckinDashboardMessage } from '../worker/checkin-chat-dashboard-render.mjs';
import { handleCheckinChatDashboard, readCheckinDashboardSnapshots } from '../worker/checkin-chat-dashboard.mjs';
import { readPublicDashboardProduct, productDisplay } from '../worker/checkin-dashboard-products.mjs';
import { supplementCheckinMallCards } from '../worker/checkin-mall-card.mjs';
const ADMIN='U'+'f'.repeat(32),MEMBER='U'+'e'.repeat(32), NOW=Date.parse('2026-10-25T05:00:00Z');
const shopId=i=>'00000000-0000-0000-0000-'+String(i).padStart(12,'0');
const productPage=(id='p1',shop=shopId(1),pageId='selected')=>({id:pageId,kind:'product',shopId:shop,productId:id});
const config=()=>({...defaultCheckinDashboardConfig(),pages:[defaultCheckinDashboardConfig().pages[0],productPage()]});
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT '');CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);CREATE TABLE protected_points(balance INTEGER);INSERT INTO protected_points VALUES(999);");
 for(const file of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0064_store_product_shipping.sql','0063_checkin_mall_cards.sql','0071_checkin_chat_dashboard.sql','0072_checkin_dashboard_products.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 for(const [uid,role] of [[ADMIN,'admin'],[MEMBER,'user']])sql.prepare('INSERT INTO users(row_id,line_id,role) VALUES(?,?,?)').run(uid,uid,role);
 for(const [i,role,status] of [[1,'store','active'],[2,'reward','active'],[3,'store','draft'],[4,'staff','active']]){
  const uid='U'+String(i).padStart(32,'0');sql.prepare('INSERT INTO users(row_id,line_id,role) VALUES(?,?,?)').run(uid,uid,role);
  sql.prepare('INSERT INTO store_shop_stores(id,owner_uid,name,status,updated_at) VALUES(?,?,?,?,?)').run(shopId(i),uid,'公開店家'+i,status,'now');
 }
 const put=(id='p1',shop=shopId(1),status='active')=>sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,description,image_url,price_cents,purchase_mode,redeem_type,redeem_value,status,updated_at,request_key) VALUES(?,?,?,'公開服務介紹','https://images.test/a.png',1180000,'online','percent',50,?,'now',?)").run(id,shop,'公開商品 '+id,status,'key-'+id);
 put();put('display',shopId(2));put('draft',shopId(1),'draft');put('hidden',shopId(3));put('ineligible',shopId(4));
 const queries=[],writes=[],pushes=[];let pointReads=0,mainAttempts=0,races=0,failChild=false,writeHook=null;
 const prepare=(query,args=[])=>({bind(...values){return prepare(query,values);},async first(){queries.push(query);return sql.prepare(query).get(...args)||null;},async all(){queries.push(query);return{success:true,results:sql.prepare(query).all(...args)};},async run(){
  assert.match(query,/^\s*(UPDATE checkin_chat_dashboard_templates|INSERT INTO checkin_chat_dashboard_snapshots|INSERT INTO checkin_chat_dashboard_product_snapshots|INSERT OR IGNORE INTO checkin_mall_cards|UPDATE checkin_mall_cards)/);
  if(query.startsWith('UPDATE checkin_chat_dashboard_templates')&&writeHook){const hook=writeHook;writeHook=null;hook();}
  if(query.startsWith('INSERT INTO checkin_chat_dashboard_snapshots')){mainAttempts++;if(races>0&&query.includes('p.version=?')){races--;sql.prepare("UPDATE store_shop_products SET version=version+1,price_cents=price_cents+100 WHERE id='p1'").run();}}
  if(failChild&&query.startsWith('INSERT INTO checkin_chat_dashboard_product_snapshots'))throw Error('child table unavailable');
  writes.push(query);const result=sql.prepare(query).run(...args);return{success:true,meta:{changes:Number(result.changes)}};
 }});
 const db={prepare,withSession(){return this;},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sql.exec('COMMIT');return out;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const env={ACTMASTER_DB:db,CHECKIN_MALL_CARD_ENABLED:'true',LINE_CHANNEL_ACCESS_TOKEN:'fake-no-real-send'};
 const fetcher=async(url,options)=>{if(url==='https://api.line.me/v2/profile'){const uid=options.headers.Authorization.slice(7);return /^U[0-9a-f]{32}$/i.test(uid)?Response.json({userId:uid}):Response.json({},{status:401});}assert.equal(url,'https://api.line.me/v2/bot/message/push');pushes.push(JSON.parse(options.body));return Response.json({});};
 const call=async(path='',body,uid=ADMIN)=>{const request=new Request('https://worker.test/v1/checkin-chat-dashboard'+path,{method:body?'POST':'GET',headers:{...(uid?{Authorization:'Bearer '+uid}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const response=await handleCheckinChatDashboard(request,env,row=>({role:row.role}),fetcher,NOW);return{status:response.status,...await response.json()};};
 const save=(value=config(),revision=0)=>call('/draft',{expectedDraftRevision:revision,config:value,requestKey:crypto.randomUUID()});
 const publish=(revision=1,published=0)=>call('/publish',{expectedDraftRevision:revision,expectedPublishedRevision:published,requestKey:crypto.randomUUID()});
 const send=(uid=MEMBER)=>supplementCheckinMallCards([{type:'message',source:{type:'user',userId:uid},timestamp:NOW,webhookEventId:crypto.randomUUID(),message:{type:'text',text:'會員打卡'}}],env,{success:true},{async read(userId){pointReads++;return{identity:userId,balance:12867};}},fetcher,NOW);
 return{sql,db,env,put,queries,writes,pushes,call,save,publish,send,get pointReads(){return pointReads;},get mainAttempts(){return mainAttempts;},setRaces(value){races=value;},setFailChild(value){failChild=value;},setWriteHook(value){writeHook=value;}};
}
test('product-page config is a reference-only additive union with unique products and protected wallet',()=>{
 assert.deepEqual(normalizeCheckinDashboardConfig(config()).pages[1],productPage());
 for(const mutate of [c=>c.pages.reverse(),c=>c.pages[1].title='偽造商品',c=>c.pages[1].priceCents=1,c=>c.pages[1].active=true,c=>c.pages[1].heroImageUrl='https://private.test',c=>c.pages[1].shopId='private',c=>c.pages[1].productId='../bad',c=>c.pages.push(productPage('p1',shopId(1),'duplicate'))]){const c=config();mutate(c);assert.throws(()=>normalizeCheckinDashboardConfig(c));}
});
test('admin catalog follows public visibility and exposes no owner, bank, customer or mutation authority',async t=>{
 const f=fixture(t),before=f.sql.prepare('SELECT total_changes() n').get().n;
 const shops=await f.call('/catalog?view=shops');assert.equal(shops.status,200);assert.deepEqual(shops.shops.map(shop=>shop.id),[shopId(1),shopId(2)]);
 const products=await f.call('/catalog?view=products');assert.deepEqual(products.products.map(product=>product.productId),['display','p1']);
 for(const product of products.products){assert.deepEqual(Object.keys(product).sort(),['shopId','productId','title','shopName','imageUrl','priceCents','purchaseMode','merchantEnabled','redeemType','redeemValue','version','shopVersion','display'].sort());assert(!JSON.stringify(product).includes('owner_uid'));}
 assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);assert.equal(f.writes.length,0);assert.equal(f.pointReads,0);assert.equal(f.pushes.length,0);
 for(const uid of ['',MEMBER])assert([401,403].includes((await f.call('/catalog?view=products',undefined,uid)).status));
});
test('catalog shop filter is server-side, pages are complete and query attacks cannot expand scope',async t=>{
 const f=fixture(t);for(let i=0;i<82;i++)f.put('page-'+String(i).padStart(3,'0'));
 const ids=[];let after='';do{const result=await f.call('/catalog?view=products&shop='+shopId(1)+'&q=page-&after='+after);assert.equal(result.status,200);assert(result.products.length<=40);ids.push(...result.products.map(product=>product.productId));after=result.next;}while(after);
 assert.equal(ids.length,82);assert.equal(new Set(ids).size,82);
 assert.deepEqual((await f.call('/catalog?view=products&shop='+shopId(2))).products.map(product=>product.productId),['display']);
 assert(f.queries.filter(query=>query.includes('FROM store_shop_products p')&&query.includes('LIMIT 41')).every(query=>query.includes("(?='' OR s.id=?)")));
 for(const query of ['view=products&role=admin','view=products&view=shops','view=unknown','view=products&shop=bad','view=products&q='+'x'.repeat(81),'view=products&after=../bad'])assert.equal((await f.call('/catalog?'+query)).status,400);
 assert.equal((await f.call('/catalog?view=products&q='+encodeURIComponent("' OR 1=1 --"))).products.length,0);
});
test('display-only owners cannot acquire online/points claims and invalid long image URLs are safely omitted',async t=>{
 const f=fixture(t),display=await readPublicDashboardProduct(f.db,shopId(2),'display');assert.equal(display.merchantEnabled,false);assert.equal(display.redeemValue,50);
 assert.match(display.display.body,/店面展示，未開放交易/);assert.doesNotMatch(display.display.body,/50%|網購|可折抵|預設最高/);
 f.sql.prepare("UPDATE store_shop_products SET image_url=? WHERE id='p1'").run('https://images.test/'+'a'.repeat(2050));const product=await readPublicDashboardProduct(f.db,shopId(1),'p1');assert(product);assert.equal(product.imageUrl,'');
 assert.equal(await readPublicDashboardProduct(f.db,shopId(1),'hidden'),null);assert.equal(await readPublicDashboardProduct(f.db,shopId(1),'draft'),null);
});
test('draft retains unavailable references, preview is neutral and publish rejects without changing product status',async t=>{
 const f=fixture(t);assert.equal((await f.save()).status,200);f.sql.prepare("UPDATE store_shop_products SET status='draft' WHERE id='p1'").run();
 const loaded=await f.call();assert.equal(loaded.status,200);assert.deepEqual(loaded.template.draftConfig.pages[1],productPage());assert.equal(loaded.unavailableProducts[0].reason,'not_public');
 assert.equal((await f.save(config(),1)).status,200);const preview=await f.call('/preview',{config:config()});assert.equal(preview.status,200);assert.match(JSON.stringify(preview.message),/商品資訊暫時無法顯示/);assert(!JSON.stringify(preview.message).includes('公開商品 p1'));
 const published=await f.publish(2);assert.equal(published.status,409);assert.equal(published.code,'PRODUCT_UNAVAILABLE');assert.equal(f.sql.prepare('SELECT published_revision FROM checkin_chat_dashboard_templates').get().published_revision,0);assert.equal(f.sql.prepare("SELECT status FROM store_shop_products WHERE id='p1'").get().status,'draft');assert.equal(f.pointReads,0);assert.equal(f.pushes.length,0);
});
test('publish atomically rejects product changes after the public read',async t=>{
 const f=fixture(t);await f.save();f.setWriteHook(()=>f.sql.prepare("UPDATE store_shop_products SET status='draft',version=version+1 WHERE id='p1'").run());
 const response=await f.publish();assert.equal(response.status,409);assert.equal(response.code,'PRODUCT_CHANGED');assert.equal(f.sql.prepare('SELECT published_revision FROM checkin_chat_dashboard_templates').get().published_revision,0);
});
test('selected products render a fixed page-scoped CTA and immutable values in one message',async t=>{
 const f=fixture(t);await f.save();await f.publish();await f.send();assert.equal(f.pushes.length,1);assert.equal(f.pushes[0].messages.length,1);assert.equal(f.pointReads,1);
 const message=f.pushes[0].messages[0],page=message.contents.contents[1],cta=page.footer.contents.find(node=>node.type==='button').action,url=new URL(cta.uri);
 assert.equal(cta.label,'查看商品');assert.deepEqual([...url.searchParams.keys()],['shopSection','checkinCard','checkinAction','checkinPage']);assert.equal(url.searchParams.get('checkinAction'),'product');assert.equal(url.searchParams.get('checkinPage'),'selected');assert(!url.href.includes(shopId(1)));assert(!url.href.includes('p1'));assert(!url.href.includes(MEMBER));
 const main=f.sql.prepare('SELECT * FROM checkin_chat_dashboard_snapshots').get(),target=f.sql.prepare('SELECT * FROM checkin_chat_dashboard_product_snapshots').get();assert.deepEqual(JSON.parse(main.message_json),message);assert.equal(target.available,1);assert.equal(JSON.parse(target.product_json).priceCents,1180000);
 f.sql.prepare("UPDATE store_shop_products SET title='後來的名稱',price_cents=1,status='draft',version=version+1 WHERE id='p1'").run();
 const read=(await readCheckinDashboardSnapshots(f.db,[main.card_id])).get(main.card_id);assert.equal(read.productSnapshots[0].product.title,'公開商品 p1');assert.equal(read.productSnapshots[0].product.priceCents,1180000);assert.equal(read.productSnapshots[0].createdAt,NOW);
 assert.equal(f.sql.prepare('SELECT balance FROM protected_points').get().balance,999);
});
for(const count of [1,2])test('sender version race '+count+' preserves the wallet and resolves at most once before neutral fallback',async t=>{
 const f=fixture(t);await f.save();await f.publish();f.setRaces(count);await f.send();assert.equal(f.pushes.length,1);assert.equal(f.pointReads,1);assert.equal(f.mainAttempts,count+1);
 const target=f.sql.prepare('SELECT * FROM checkin_chat_dashboard_product_snapshots').get(),raw=JSON.stringify(f.pushes[0]);assert.match(raw,/12,867 元/);
 if(count===1){assert.equal(target.available,1);assert.equal(JSON.parse(target.product_json).priceCents,1180100);}else{assert.equal(target.available,0);assert.equal(target.product_json,null);assert.match(raw,/商品資訊暫時無法顯示/);assert(!raw.includes('公開商品 p1'));}
 await f.send();assert.equal(f.pushes.length,1);assert.equal(f.pointReads,1);
});
test('unpublished products keep their original page position as neutral without revealing stored fields',async t=>{
 const f=fixture(t);await f.save();await f.publish();f.sql.prepare("UPDATE store_shop_products SET status='draft',title='PRIVATE-DRAFT-NAME' WHERE id='p1'").run();await f.send();
 const raw=JSON.stringify(f.pushes[0]);assert.match(raw,/商品資訊暫時無法顯示/);assert(!raw.includes('PRIVATE-DRAFT-NAME'));assert(!raw.includes('公開商品 p1'));assert.equal(f.pushes[0].messages[0].contents.contents.length,2);
 const target=f.sql.prepare('SELECT * FROM checkin_chat_dashboard_product_snapshots').get();assert.equal(target.available,0);assert.equal(target.product_json,null);assert.equal(productDisplay(null).heroImageUrl,'');
});
test('child snapshot write failure rolls back the main snapshot and sends nothing',async t=>{
 const f=fixture(t);await f.save();await f.publish();f.setFailChild(true);await f.send();assert.equal(f.pushes.length,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM checkin_chat_dashboard_snapshots').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM checkin_chat_dashboard_product_snapshots').get().n,0);assert.equal(f.sql.prepare('SELECT state FROM checkin_mall_cards').get().state,'preparing');
 f.setFailChild(false);await f.send();assert.equal(f.pointReads,1);assert.equal(f.pushes.length,0);
});
