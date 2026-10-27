import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {shopKeyword,buildShopKeywordMessage,readMallSummary,consumeShopKeywords,signRemainingShopEvents} from '../worker/store-line-keywords.mjs';
import {consumeIslandVideoKeywords} from '../worker/island-video-card.mjs';
import {personalShareLink} from '../worker/island-entry.mjs';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32),D='U'+'d'.repeat(32);
const event=(message='儀錶板',uid=A,extra={})=>({type:'message',mode:'active',source:{type:'user',userId:uid},message:{type:'text',text:message},replyToken:'reply-'+uid,...extra});
const bubbles=message=>message.contents?.type==='carousel'?message.contents.contents:[message.contents];
const actions=message=>bubbles(message).flatMap(bubble=>bubble.footer?.contents.map(node=>node.action)||[]);
function assertCarousel(message,count){
 assert.equal(message.type,'flex');assert.equal(message.contents.type,'carousel');assert.equal(message.contents.contents.length,count);
 assert(message.contents.contents.every(bubble=>bubble.type==='bubble'&&bubble.size==='giga'));
 assert(Buffer.byteLength(JSON.stringify(message.contents))<50000);
 assert(!actions(message).some(action=>action.label==='店家操作'||action.text==='店家專區'));
}
function assertAdminEditorFirst(message){
 const first=bubbles(message)[0];assert.equal(first.header.contents[0].text,'會員打卡設定');
 const editor=first.footer.contents.map(node=>node.action).find(action=>action.label==='編輯會員打卡');assert(editor);assert.equal(editor.type,'uri');
 assert.equal(editor.uri,'https://fangwl591021.github.io/LINE-/admin.html?tab=checkin-chat-dashboard');
 const url=new URL(editor.uri);assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');assert.deepEqual([...url.searchParams.keys()],['tab']);
 for(const uid of [A,B,C,D])assert(!editor.uri.includes(uid));assert(!/access.?token|user.?id|role=/i.test(editor.uri));
 return editor;
}
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec('CREATE TABLE users(line_id TEXT,role TEXT)');
 for(const [id,role] of [[A,'store'],[B,'admin'],[C,'redeem']])sql.prepare('INSERT INTO users VALUES(?,?)').run(id,role);
 for(const file of ['0029_store_shop_catalog.sql','0030_store_cashier_requests.sql','0034_store_commerce.sql','0035_store_product_purchase_mode.sql','0064_store_product_shipping.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 for(const [id,owner] of [['s-a',A],['s-b',B]]){
  sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,status,updated_at) VALUES(?,?,?,'active','now')").run(id,owner,id);
  sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,status,updated_at,request_key) VALUES(?,?,?,10000,'active','now',?)").run('p-'+id,id,'商品',id);
  sql.prepare("INSERT INTO store_commerce_orders(id,shop_id,buyer_uid,request_key,request_hash,snapshot_json,total_cents,payment_status,received_cents,created_at,updated_at) VALUES(?,?,?,?,?,'{}',10000,'paid',10000,'now','now')").run('o-'+id,id,C,id,'hash');
  sql.prepare("INSERT INTO store_cashier_requests(actor_id,request_id,customer_id,fingerprint,status,updated_at) VALUES(?,?,?,?,'succeeded','2026-09-10 16:00:00')").run(owner,id,C,JSON.stringify({mode:'redeem',productId:'p-'+id,amount:1000,deductPoints:100}));
 }
 const queries=[];
 const db={prepare(query){queries.push(query);assert.match(query.trim(),/^(SELECT|WITH)\b/);return {bind(...args){return {async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};}}}}}};
 return {sql,db,queries,env:{ACTMASTER_DB:db,LINE_CHANNEL_ACCESS_TOKEN:'fake',LINE_CHANNEL_SECRET:'test-secret'}};
}
test('only exact child keywords match; other mother keywords stay untouched',()=>{
 for(const value of ['店家專區',' 儀錶板 ','儀表板'])assert(shopKeyword(event(value)));
 for(const value of ['我要店家專區','儀表板活動','會員分享','推薦好友','我的名片','店 家專區'])assert.equal(shopKeyword(event(value)),'');
 assert.equal(shopKeyword(event('儀錶板',A,{type:'postback'})),'');
});
test('admin global summary and store-owned summary do not mix stores or receipts',async t=>{
 const f=fixture(t),now=new Date('2026-09-11T01:00:00Z');
 const own=await readMallSummary(f.db,A,false,now),global=await readMallSummary(f.db,B,true,now);
 assert.equal(own.shops.total,1);assert.equal(own.orders.received,10000);assert.equal(own.redemptions.total,1);
 assert.equal(global.shops.total,2);assert.equal(global.orders.unfulfilled,2);assert.equal(global.orders.received,20000);assert.equal(global.redemptions.total,2);
 assert.equal(own.today,'2026-09-11');
 const card=await buildShopKeywordMessage(event('儀表板',B),f.env,now);
 assertCarousel(card,3);assertAdminEditorFirst(card);
 assert.equal(card.altText,'全商城營運儀錶板');assert(!JSON.stringify(card).includes(C));assert(JSON.stringify(card).includes('非銀行實收'));
});
test('ledger summary excludes malformed, unconfirmed, other-actor and outside-Taipei-day rows',async t=>{
 const f=fixture(t);
 for(const [id,actor,status,time,fingerprint] of [
  ['bad',A,'succeeded','2026-09-10 17:00:00','{'],
  ['wait',A,'sending','2026-09-10 17:00:00',JSON.stringify({mode:'redeem',productId:'p-s-a',amount:9000,deductPoints:100})],
  ['old',A,'succeeded','2026-09-10 15:59:59',JSON.stringify({mode:'redeem',productId:'p-s-a',amount:9000,deductPoints:100})],
  ['wrong',B,'succeeded','2026-09-10 17:00:00',JSON.stringify({mode:'redeem',productId:'p-s-a',amount:9000,deductPoints:100})]
 ])f.sql.prepare('INSERT INTO store_cashier_requests(actor_id,request_id,customer_id,fingerprint,status,updated_at) VALUES(?,?,?,?,?,?)').run(actor,id,id,fingerprint,status,time);
 const s=await readMallSummary(f.db,A,false,new Date('2026-09-11T01:00:00Z'));assert.equal(s.redemptions.amount,1000);assert.equal(s.redemptions.points,100);
});
test('redeem menu exposes one-product merchant operations without granting platform administration',async t=>{
 const f=fixture(t),p=await buildShopKeywordMessage(event('店家專區',C),f.env);
 assertCarousel(p,2);
 assert(JSON.stringify(p).includes('最多 1 項商品'));assert(JSON.stringify(p).includes('折抵店家'));
 const commands=actions(p).filter(action=>action.type==='message').map(action=>action.text);
 for(const keyword of ['商城商品','商城業績','商城訂單','儀錶板'])assert(commands.includes(keyword));
 assert(!JSON.stringify(p).includes('checkin-chat-dashboard'));
 const d=await buildShopKeywordMessage(event('儀錶板',C),f.env);assertCarousel(d,2);assert.equal(d.altText,'我的店家儀錶板');
 assert(!JSON.stringify(d).includes('s-a'));assert(!JSON.stringify(d).includes('s-b'));
});

test('groups, unknown and ambiguous identity never expose dashboard; links carry no UID/token',async t=>{
 const f=fixture(t);
 const g=await buildShopKeywordMessage(event('儀錶板',A,{source:{type:'group',userId:A,groupId:'group'}}),f.env);assert.match(g.text,/一對一/);assert.equal(f.queries.length,0);
 const missing=await buildShopKeywordMessage(event('儀錶板',D),f.env);assert.match(missing.altText,/註冊/);
 assert.equal(missing.contents.size,'giga');
 f.sql.prepare('INSERT INTO users VALUES(?,?)').run(A,'admin');
 const ambiguous=await buildShopKeywordMessage(event(),f.env);assert.match(ambiguous.altText,/註冊/);
 const portal=await buildShopKeywordMessage(event('店家專區',B),f.env);
 assertCarousel(portal,3);const editor=assertAdminEditorFirst(portal);
 for(const action of actions(portal).filter(action=>action.type==='uri'&&action!==editor)){
  const url=new URL(action.uri);assert.equal(url.host,'liff.line.me');assert.deepEqual([...url.searchParams.keys()],['shopSection']);
 }
});
test('role changes, unknown roles and database failures fail closed',async t=>{
 const f=fixture(t);
 for(const role of ['tenant','staff','','manager']){
  f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role,A);
  assert.match((await buildShopKeywordMessage(event(),f.env)).text,/未開放/);
 }
 const replies=[];f.env.ACTMASTER_DB={prepare(){throw Error('private SQL details');}};
 const rest=await consumeShopKeywords([event()],f.env,async p=>{replies.push(p);return{success:true};});
 assert.equal(rest.length,0);assert.match(replies[0].messages[0].text,/暫時/);assert(!JSON.stringify(replies).includes('private SQL'));
});
const legacy=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');

test('store typography never changes electronic card payloads in shared LINE senders',async()=>{
 const sent=[],scope={console,fetch:async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:true,status:200,text:async()=>'',json:async()=>({})};}};
 const chat=vm.runInNewContext('({'+legacy.slice(legacy.indexOf('  async replyLine(replyPayload, env, options = {}) {'),legacy.indexOf('  decodeBase64DataUrl(value = '))+'})',scope);
 chat.text=value=>String(value||'').trim();
 const cool=legacy.slice(legacy.indexOf('const LineOACardCoolKeywordModule ='));
 const scanner=vm.runInNewContext('({'+cool.slice(cool.indexOf('  async pushLine(userId, messages, env) {'),cool.indexOf('  buildReviewUrl(jobId, env, cardId = '))+'})',scope);
 const card={type:'flex',altText:'我的電子名片',contents:{type:'bubble',size:'mega',body:{type:'box',layout:'vertical',contents:[{type:'text',text:'名片姓名',size:'sm'}]},footer:{type:'box',layout:'vertical',contents:[{type:'button',action:{type:'uri',label:'聯絡',uri:'tel:0912345678'}}]}}};
 const before=JSON.stringify(card),env={LINE_CHANNEL_ACCESS_TOKEN:'fake'};
 assert.equal((await chat.replyLine({replyToken:'test',messages:[card]},env)).success,true);
 assert.equal((await chat.pushLineMessages(A,[card],env)).success,true);
 assert.equal((await scanner.pushLine(A,[card],env)).success,true);
 assert.equal(sent.length,3);
 for(const payload of sent)assert.deepEqual(payload.messages[0],card);
 assert.equal(JSON.stringify(card),before);
});
test('portal shows own product data and routes all data queries back to chat',async t=>{
 const f=fixture(t),p=await buildShopKeywordMessage(event('店家專區'),f.env),body=JSON.stringify(p);
 assertCarousel(p,2);
 assert(body.includes('s-a'));assert(body.includes('商品'));assert(!body.includes('s-b'));
 const operations=bubbles(p)[1].footer.contents.map(b=>b.action);
 for(const keyword of ['商城商品','商城業績','商城訂單','儀錶板'])assert(operations.some(a=>a.type==='message'&&a.text===keyword));
 assert(operations.filter(a=>a.type==='uri').every(a=>a.uri.endsWith('shopSection=manage')));
});

test('all store cards use giga and large text while preserving every action and wrapping long labels',async t=>{
 const f=fixture(t);
 const title='長商品名稱'.repeat(16);
 f.sql.prepare("UPDATE store_shop_products SET title=? WHERE id='p-s-a'").run(title);
 const p=await buildShopKeywordMessage(event('店家專區'),f.env);assertCarousel(p,2);
 for(const bubble of bubbles(p)){
  assert.equal(bubble.size,'giga');assert.equal(bubble.header.contents[0].size,'xl');
  for(const node of bubble.body.contents){assert.equal(node.size,'lg');assert.equal(node.wrap,true);assert.equal(node.maxLines,undefined);assert.equal(node.lineSpacing,'4px');}
 }
 assert(bubbles(p)[0].body.contents.some(node=>node.text.startsWith(title+'\n')));
 const operations=bubbles(p)[1].footer.contents.map(node=>node.action);
 assert.deepEqual(operations.slice(0,4),[
  {type:'message',label:'我的商品',text:'商城商品'},
  {type:'message',label:'我的業績',text:'商城業績'},
  {type:'message',label:'我的網購訂單',text:'商城訂單'},
  {type:'message',label:'商城儀錶板',text:'儀錶板'}
 ]);
 assert.deepEqual(operations[4],{type:'uri',label:'新增／編輯商品（網頁）',uri:'https://liff.line.me/1660923784-vViMTZ1y?shopSection=manage'});
 for(const node of bubbles(p).flatMap(bubble=>bubble.footer.contents)){
  assert.equal(node.type,'box');assert.equal(node.paddingAll,'12px');assert.equal(node.height,undefined);
  assert.equal(node.contents[0].text,node.action.label);assert.equal(node.contents[0].size,'lg');assert.equal(node.contents[0].wrap,true);assert.equal(node.contents[0].maxLines,undefined);
 }
 for(const keyword of ['商城商品','商城訂單','商城業績','儀錶板']){
  const message=await buildShopKeywordMessage(event(keyword),f.env);
  if(keyword==='儀錶板')assertCarousel(message,2);else assert.equal(message.contents.type,'bubble');
  for(const other of bubbles(message)){
   assert.equal(other.size,'giga');assert.equal(other.header.contents[0].size,'xl');
   assert(other.body.contents.every(node=>node.size==='lg'));
   assert(other.footer.contents.every(node=>node.type==='box'&&node.contents[0].size==='lg'));
  }
 }
 const member=await buildShopKeywordMessage(event('店家專區',C),f.env);assertCarousel(member,2);
 assert(bubbles(member).every(bubble=>bubble.body.contents.every(node=>node.size==='lg')));
 assert.deepEqual(bubbles(member)[1].footer.contents.map(node=>node.action.label),['我的商品','我的業績','我的網購訂單','商城儀錶板','新增／編輯商品（網頁）']);
});

test('product pagination stays owner scoped and has stable bounded pages',async t=>{
 const f=fixture(t);
 for(let i=1;i<=11;i++)f.sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,status,updated_at,request_key) VALUES(?,'s-a',?,12345,'draft','2026-09-11',?)").run('extra-'+String(i).padStart(2,'0'),'商品序號'+i,'extra-'+i);
 f.sql.prepare("UPDATE store_shop_products SET status='archived' WHERE id='p-s-a'").run();
 f.sql.prepare("UPDATE store_shop_products SET title='其他店家秘密商品' WHERE shop_id='s-b'").run();
 const pages=[];
 for(let page=1;page<=3;page++){
  const p=await buildShopKeywordMessage(event('商城商品 '+page),f.env);pages.push(p);
  assert.equal(p.contents.size,'giga');
  assert(!JSON.stringify(p).includes('其他店家秘密'));assert(JSON.stringify(p).includes('123.45'));
 }
 const titles=pages.flatMap(p=>p.contents.body.contents.map(c=>c.text).filter(s=>s.startsWith('商品序號')).map(s=>s.split('\n')[0]));
 assert.equal(titles.length,11);assert.equal(new Set(titles).size,11);
 assert(pages[0].contents.footer.contents.some(b=>b.action.text==='商城商品 2'));
 assert(!pages[0].contents.footer.contents.some(b=>b.action.label==='上一頁'));
 assert(!pages[2].contents.footer.contents.some(b=>b.action.label==='下一頁'));
 assert(f.queries.filter(q=>q.includes('FROM store_shop_products')).every(q=>q.includes("shop_id=?")&&q.includes('LIMIT 6 OFFSET ?')));
});

test('pickup chat status uses fulfillment language without leaking pickup contacts',async t=>{
 const f=fixture(t),snapshot={items:[{title:'自取商品',quantity:1}],customer:{carrier:'PICKUP',pickup_address:'PRIVATE-PICKUP-ADDRESS',pickup_phone:'0912345678'},bank:{account:'PRIVATEBANK'}};
 f.sql.prepare("UPDATE store_commerce_orders SET snapshot_json=?,payment_status='paid',fulfillment_status='shipped' WHERE shop_id='s-a'").run(JSON.stringify(snapshot));
 const message=await buildShopKeywordMessage(event('商城訂單'),f.env),body=JSON.stringify(message);
 assert.match(body,/待取貨/);assert.doesNotMatch(body,/已出貨|PRIVATE-PICKUP-ADDRESS|PRIVATEBANK|0912345678/);
 f.sql.prepare("UPDATE store_commerce_orders SET fulfillment_status='completed' WHERE shop_id='s-a'").run();
 assert.match(JSON.stringify(await buildShopKeywordMessage(event('商城訂單'),f.env)),/已取貨/);
});

test('orders show status and product snapshots without customer or bank data',async t=>{
 const f=fixture(t),snapshot={items:[{title:'快照茶',quantity:2},{title:'第二商品'}],buyer:{name:'私人姓名',phone:'0912345678'},customer:{address:'私人地址'},bank:{account:'PRIVATEBANK'}};
 f.sql.prepare("UPDATE store_commerce_orders SET snapshot_json=?,created_at='2026-09-10T16:01:00.000Z',payment_status='reported' WHERE shop_id='s-a'").run(JSON.stringify(snapshot));
 const p=await buildShopKeywordMessage(event('商城訂單'),f.env),body=JSON.stringify(p);
 assert.equal(p.contents.size,'giga');
 assert(body.includes('o-s-a'));assert(!body.includes('o-s-b'));assert(body.includes('快照茶 等 2 項商品'));assert(body.includes('待核帳'));assert(body.includes('2026/9/11'));
 for(const secret of ['PRIVATEBANK','私人姓名','0912345678','私人地址',C])assert(!body.includes(secret));
 const projections=f.queries.filter(q=>q.includes('FROM store_commerce_orders'));
 assert(projections.every(q=>!q.includes('SELECT *')&&!q.includes('buyer_uid')&&!q.includes('bank')));
});

test('merchant detail queries stay own scope even for admins, global dashboard is explicit',async t=>{
 const f=fixture(t);
 for(const keyword of ['商城商品','商城訂單']){
  const body=JSON.stringify(await buildShopKeywordMessage(event(keyword,B),f.env));
  assert(body.includes('s-b'));assert(!body.includes('s-a'));
 }
 const own=await buildShopKeywordMessage(event('商城業績',B),f.env,new Date('2026-09-11T01:00:00Z'));
 assert.equal(own.contents.size,'giga');
 assert.equal(own.altText,'我的店家業績');assert(JSON.stringify(own).includes('共 1 筆'));
 const all=await buildShopKeywordMessage(event('儀錶板',B),f.env,new Date('2026-09-11T01:00:00Z'));
 assert(JSON.stringify(all).includes('共 2 筆'));
});

test('admin dashboard and portal put the check-in editor first while operational data stays owner scoped',async t=>{
 const f=fixture(t);
 f.sql.prepare("UPDATE store_shop_products SET title='OWNER-A-ONLY' WHERE shop_id='s-a'").run();
 f.sql.prepare("UPDATE store_shop_products SET title='OWNER-B-ONLY' WHERE shop_id='s-b'").run();
 for(const keyword of ['儀錶板','儀表板','店家專區']){
  const message=await buildShopKeywordMessage(event(keyword,B),f.env,new Date('2026-09-11T01:00:00Z'));
  assertCarousel(message,3);assertAdminEditorFirst(message);
  assert.equal(message.altText,keyword==='店家專區'?'店家專區':'全商城營運儀錶板');
  const second=JSON.stringify(bubbles(message)[1]),operations=bubbles(message)[2];
  if(keyword==='店家專區'){
   assert(second.includes('OWNER-B-ONLY'));assert(!second.includes('OWNER-A-ONLY'));
   assert(!JSON.stringify(operations.body).includes('OWNER-B-ONLY'));
  }else{
   assert(second.includes('共 2 筆'));assert(JSON.stringify(operations.body).includes('OWNER-B-ONLY'));assert(!JSON.stringify(operations.body).includes('OWNER-A-ONLY'));
  }
  for(const command of ['商城商品','商城業績','商城訂單'])assert(operations.footer.contents.some(node=>node.action.type==='message'&&node.action.text===command));
  assert(operations.footer.contents.some(node=>node.action.type==='uri'&&node.action.uri.endsWith('shopSection=manage')));
  assert.equal(actions(message).filter(action=>action.label==='編輯會員打卡').length,1);
 }
});

test('merchant carousels never acquire admin editor while nonmerchant plans get no retail menu',async t=>{
 const f=fixture(t);
 f.sql.prepare("UPDATE store_shop_products SET title='OTHER-OWNER-SECRET' WHERE shop_id='s-b'").run();
 for(const role of ['store','店長']){
  f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role,A);
  for(const keyword of ['儀錶板','店家專區']){
   const message=await buildShopKeywordMessage(event(keyword,A),f.env);assertCarousel(message,2);
   assert(!JSON.stringify(message).includes('OTHER-OWNER-SECRET'));assert(!actions(message).some(action=>action.label==='編輯會員打卡'||action.uri?.includes('checkin-chat-dashboard')));
   if(keyword==='儀錶板'){assert.equal(message.altText,'我的店家儀錶板');assert(JSON.stringify(bubbles(message)[0]).includes('共 1 筆'));}
  }
 }
 for(const role of ['user','用戶','reward','贈點用戶']){
  f.sql.prepare('UPDATE users SET role=? WHERE line_id=?').run(role,C);
  const before=f.queries.length;
  for(const keyword of ['店家專區','商城商品','商城訂單','商城業績','儀錶板']){
   const message=await buildShopKeywordMessage(event(keyword,C),f.env);assert.equal(message.type,'text');assert.match(message.text,/未開放/);
   assert(!JSON.stringify(message).includes('checkin-chat-dashboard'));assert(!JSON.stringify(message).includes('OTHER-OWNER-SECRET'));
  }
  assert(f.queries.slice(before).every(q=>q.startsWith('SELECT role')),'denied plans do not read store, order or ledger data');
 }
 f.sql.prepare("UPDATE users SET role='總管' WHERE line_id=?").run(B);assertAdminEditorFirst(await buildShopKeywordMessage(event('儀表板',B),f.env));
});

test('multiple pages still send one Flex message per claimed event without an operations intermediary',async t=>{
 const f=fixture(t),sent=[];
 const events=[event('儀錶板',B),event('店家專區',B),event('儀表板',A),event('店家專區',C)].map((value,index)=>({...value,replyToken:'single-carousel-'+index}));
 assert.deepEqual(await consumeShopKeywords(events,f.env,async payload=>{sent.push(payload);return{success:true};}),[]);
 assert.equal(sent.length,4);
 for(let index=0;index<sent.length;index++){
  assert.equal(sent[index].replyToken,'single-carousel-'+index);assert.equal(sent[index].messages.length,1);assertCarousel(sent[index].messages[0],index<2?3:2);
  if(index<2)assertAdminEditorFirst(sent[index].messages[0]);
 }
 assert(f.queries.every(query=>/^(SELECT|WITH)\b/.test(query.trim())));
});

test('new chat commands recheck roles, reject groups and validate page bounds',async t=>{
 const f=fixture(t);
 for(const keyword of ['商城商品','商城訂單','商城業績']){
  const group=await buildShopKeywordMessage(event(keyword,A,{source:{type:'group',userId:A}}),f.env);assert.match(group.text,/一對一/);
 }
 assert.equal(f.queries.length,0);
 f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(C);
 for(const keyword of ['商城訂單','商城業績'])assert.match((await buildShopKeywordMessage(event(keyword,C),f.env)).text,/未開放/);
 const queriesBefore=f.queries.length;
 for(const keyword of ['商城商品 0','商城訂單 -1','商城商品 1001','商城商品 1 OR 1=1','商城訂單 2 '+B]){
  assert(shopKeyword(event(keyword)));const result=await buildShopKeywordMessage(event(keyword),f.env);assert.match(result.text,/翻頁/);
 }
 assert(f.queries.slice(queriesBefore).every(q=>q.startsWith('SELECT role')));
 for(const keyword of ['我的商城商品','商城商品查詢','想看商城訂單','商城業績分析'])assert.equal(shopKeyword(event(keyword)),'');
 f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(A);
 assert.match((await buildShopKeywordMessage(event('商城訂單'),f.env)).text,/未開放/);
});

test('no store and no results are explicit, and read failure never becomes an empty success',async t=>{
 const f=fixture(t);
 assert(JSON.stringify(await buildShopKeywordMessage(event('商城商品',C),f.env)).includes('尚未建立'));
 assert(JSON.stringify(await buildShopKeywordMessage(event('商城訂單 999'),f.env)).includes('此頁沒有資料'));
 f.sql.prepare("DELETE FROM store_commerce_orders WHERE shop_id='s-a'").run();
 assert(JSON.stringify(await buildShopKeywordMessage(event('商城訂單'),f.env)).includes('目前沒有網購訂單'));
 const original=f.db.prepare.bind(f.db);f.db.prepare=query=>query.includes('FROM store_commerce_orders')?{bind:()=>({all:async()=>{throw Error('private details');}})}:original(query);
 const replies=[];assert.equal((await consumeShopKeywords([event('商城訂單')],f.env,async p=>replies.push(p))).length,0);
 assert.match(replies[0].messages[0].text,/暫時/);assert(!JSON.stringify(replies).includes('private details'));
});

test('new chat data commands retain single reply ownership in mixed webhooks',async t=>{
 const f=fixture(t),h=webhookHarness(f);
 const body=JSON.stringify({events:[event('商城商品 2',A),event('商城訂單',B),event('商城業績',C),event('會員分享',D)]});
 const sig=await signRemainingShopEvents(body,f.env.LINE_CHANNEL_SECRET);
 await h.handler.handleWebhook(new Request('https://test/line-webhook',{method:'POST',headers:{'x-line-signature':sig},body}),f.env,{waitUntil(){}});
 assert.equal(h.replies.length,3);assert.equal(JSON.parse(h.forward[0].raw).events.length,1);
 assert.equal(JSON.parse(h.forward[0].raw).events[0].message.text,'會員分享');
 for(const reply of h.replies){assert.equal(reply.messages.length,1);assert(Buffer.byteLength(JSON.stringify(reply.messages[0]))<30000);}
});
function webhookHarness(f){
 const replies=[],forward=[],gas=[],saved=[];
 const noop={reply:async()=>false},scope={Response,JSON,console,consumeShopKeywords,signRemainingShopEvents,consumeIslandVideoKeywords,personalShareLink,LineOAMyVideoKeywordModule:noop,LineOACardCoolKeywordModule:noop,ReferralFriendKeywordModule:noop,LineOAStoreSearchKeywordModule:noop,LineOAKeywordRuleModule:{replyPayload:async()=>null}};
 const method=legacy.slice(legacy.indexOf('  async handleWebhook(request, env, ctx) {'),legacy.indexOf('  async isAiPaused(env, threadId) {'));
 const handler=vm.runInNewContext('({'+method+'})',scope);
 handler.consumeMyCardEvents=async events=>events;
 Object.assign(handler,{text:v=>String(v||'').trim(),ensure:async()=>{},verifySignature:async(raw,sig,env)=>sig===await signRemainingShopEvents(raw,env.LINE_CHANNEL_SECRET),saveEvent:async(e,event)=>saved.push(event),followPointOnboardingJob:async()=>{},replyLine:async p=>{replies.push(p);return{success:true};},forwardToSecondSystem:async(raw,sig)=>{forward.push({raw,sig});return{success:true};},replySimpleMyCard:async()=>false,filterAutoReplyPayload:async raw=>raw,forwardToGas:async raw=>{gas.push(raw);return{success:true};},normalizeReplyPayload:()=>null});
 return{handler,replies,forward,gas,saved};
}
test('signed mixed batch replies once and forwards only unclaimed events with valid new signature',async t=>{
 const f=fixture(t),h=webhookHarness(f),body=JSON.stringify({destination:'channel',events:[event('店家專區'),event('會員分享',C)]});
 const sig=await signRemainingShopEvents(body,f.env.LINE_CHANNEL_SECRET),jobs=[];
 const res=await h.handler.handleWebhook(new Request('https://test/line-webhook',{method:'POST',headers:{'x-line-signature':sig},body}),f.env,{waitUntil:p=>jobs.push(p)});
 await Promise.all(jobs);assert.equal(res.status,200);assert.equal(h.replies.length,1);assert.equal(h.replies[0].messages.length,1);assertCarousel(h.replies[0].messages[0],2);assert.equal(h.saved.length,2);
 assert.equal(JSON.parse(h.forward[0].raw).events.length,1);assert.equal(JSON.parse(h.gas[0]).events[0].message.text,'會員分享');
 assert.equal(h.forward[0].sig,await signRemainingShopEvents(h.forward[0].raw,f.env.LINE_CHANNEL_SECRET));
 assert(!h.forward[0].raw.includes('reply-'+A));
});
test('child-only batch never reaches forwarding; invalid signature performs no work',async t=>{
 const f=fixture(t),h=webhookHarness(f),body=JSON.stringify({events:[event()]});
 const bad=await h.handler.handleWebhook(new Request('https://test/line-webhook',{method:'POST',headers:{'x-line-signature':'bad'},body}),f.env,{waitUntil(){}});
 assert.equal(bad.status,401);assert.equal(h.replies.length,0);assert.equal(f.queries.length,0);
 const sig=await signRemainingShopEvents(body,f.env.LINE_CHANNEL_SECRET);
 await h.handler.handleWebhook(new Request('https://test/line-webhook',{method:'POST',headers:{'x-line-signature':sig},body}),f.env,{waitUntil(){}});
 assert.equal(h.replies.length,1);assert.equal(h.replies[0].messages.length,1);assertCarousel(h.replies[0].messages[0],2);assert.equal(h.forward.length,0);assert.equal(h.gas.length,0);
});
test('standby, duplicate tokens and reply failures never fall through to mother',async t=>{
 const f=fixture(t);let calls=0;
 assert.equal((await consumeShopKeywords([event('店家專區',A,{mode:'standby'}),event(),event()],f.env,async()=>{calls++;throw Error('reply failed');})).length,0);
 assert.equal(calls,1);
});
test('unclaimed webhook preserves original bytes, signature and mother reply path',async t=>{
 const f=fixture(t),h=webhookHarness(f),body=JSON.stringify({destination:'channel',events:[event('會員分享',C)]},null,2);
 const sig=await signRemainingShopEvents(body,f.env.LINE_CHANNEL_SECRET);
 await h.handler.handleWebhook(new Request('https://test/line-webhook',{method:'POST',headers:{'x-line-signature':sig},body}),f.env,{waitUntil(){}});
 assert.equal(h.replies.length,0);assert.equal(h.forward[0].raw,body);assert.equal(h.forward[0].sig,sig);assert.equal(h.gas[0],body);assert.equal(f.queries.length,0);
});
test('entry links are allowlisted after registered identity; legacy routes retain priority',()=>{
 const auth=readFileSync(new URL('../js/auth.js',import.meta.url),'utf8'),ui=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');
 assert(auth.indexOf("const shopSection = urlParams.get('shopSection')")>auth.indexOf('window.applyRegisteredUserSession(checkRes.info)'));
 assert.match(auth,/\['list','mine','manage','sales','online-manage','cashier'\]\.includes\(shopSection\)/);
 assert.match(ui,/if\(!canTransact\(\)\)throw new Error\('業績與收款操作/);
});
