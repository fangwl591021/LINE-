import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {shopKeyword,buildShopKeywordMessage,readMallSummary,consumeShopKeywords,signRemainingShopEvents} from '../worker/store-line-keywords.mjs';
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32),D='U'+'d'.repeat(32);
const event=(message='儀錶板',uid=A,extra={})=>({type:'message',mode:'active',source:{type:'user',userId:uid},message:{type:'text',text:message},replyToken:'reply-'+uid,...extra});
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec('CREATE TABLE users(line_id TEXT,role TEXT)');
 for(const [id,role] of [[A,'store'],[B,'admin'],[C,'user']])sql.prepare('INSERT INTO users VALUES(?,?)').run(id,role);
 for(const file of ['0029_store_shop_catalog.sql','0030_store_cashier_requests.sql','0034_store_commerce.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
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
test('ordinary member menu preserves one-product rights but denies dashboard and transaction buttons',async t=>{
 const f=fixture(t),p=await buildShopKeywordMessage(event('店家專區',C),f.env);
 assert(JSON.stringify(p).includes('1 個商品'));assert(!JSON.stringify(p).includes('shopSection=sales'));assert(!JSON.stringify(p).includes('shopSection=online-manage'));
 const d=await buildShopKeywordMessage(event('儀錶板',C),f.env);assert.match(d.text,/僅開放/);
 assert(f.queries.every(q=>q.startsWith('SELECT role')));
});
test('groups, unknown and ambiguous identity never expose dashboard; links carry no UID/token',async t=>{
 const f=fixture(t);
 const g=await buildShopKeywordMessage(event('儀錶板',A,{source:{type:'group',userId:A,groupId:'group'}}),f.env);assert.match(g.text,/一對一/);assert.equal(f.queries.length,0);
 const missing=await buildShopKeywordMessage(event('儀錶板',D),f.env);assert.match(missing.altText,/註冊/);
 f.sql.prepare('INSERT INTO users VALUES(?,?)').run(A,'admin');
 const ambiguous=await buildShopKeywordMessage(event(),f.env);assert.match(ambiguous.altText,/註冊/);
 const portal=await buildShopKeywordMessage(event('店家專區',B),f.env);
 for(const b of portal.contents.footer.contents.filter(b=>b.action.type==='uri')){
  const url=new URL(b.action.uri);assert.equal(url.host,'liff.line.me');assert.deepEqual([...url.searchParams.keys()],['shopSection']);
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
function webhookHarness(f){
 const replies=[],forward=[],gas=[],saved=[];
 const noop={reply:async()=>false},scope={Response,JSON,console,consumeShopKeywords,signRemainingShopEvents,LineOAMyVideoKeywordModule:noop,LineOACardCoolKeywordModule:noop,ReferralFriendKeywordModule:noop,LineOAStoreSearchKeywordModule:noop,LineOAKeywordRuleModule:{replyPayload:async()=>null}};
 const method=legacy.slice(legacy.indexOf('  async handleWebhook(request, env, ctx) {'),legacy.indexOf('  async isAiPaused(env, threadId) {'));
 const handler=vm.runInNewContext('({'+method+'})',scope);
 Object.assign(handler,{text:v=>String(v||'').trim(),ensure:async()=>{},verifySignature:async(raw,sig,env)=>sig===await signRemainingShopEvents(raw,env.LINE_CHANNEL_SECRET),saveEvent:async(e,event)=>saved.push(event),followPointOnboardingJob:async()=>{},replyLine:async p=>{replies.push(p);return{success:true};},forwardToSecondSystem:async(raw,sig)=>{forward.push({raw,sig});return{success:true};},replySimpleMyCard:async()=>false,filterAutoReplyPayload:async raw=>raw,forwardToGas:async raw=>{gas.push(raw);return{success:true};},normalizeReplyPayload:()=>null});
 return{handler,replies,forward,gas,saved};
}
test('signed mixed batch replies once and forwards only unclaimed events with valid new signature',async t=>{
 const f=fixture(t),h=webhookHarness(f),body=JSON.stringify({destination:'channel',events:[event('店家專區'),event('會員分享',C)]});
 const sig=await signRemainingShopEvents(body,f.env.LINE_CHANNEL_SECRET),jobs=[];
 const res=await h.handler.handleWebhook(new Request('https://test/line-webhook',{method:'POST',headers:{'x-line-signature':sig},body}),f.env,{waitUntil:p=>jobs.push(p)});
 await Promise.all(jobs);assert.equal(res.status,200);assert.equal(h.replies.length,1);assert.equal(h.saved.length,2);
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
 assert.equal(h.replies.length,1);assert.equal(h.forward.length,0);assert.equal(h.gas.length,0);
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
 assert.match(auth,/\['list','mine','manage','sales','online-manage'\]\.includes\(shopSection\)/);
 assert.match(ui,/if\(!canTransact\(\)\)throw new Error\('業績與收款操作/);
});
